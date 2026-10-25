// Login: username + password (scrypt-hashed), then a signed cookie that keeps the phone signed in
// until someone taps "Sign out". Bumping users.session_version signs that user out everywhere.
import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { ensureSchema, getSql } from './db.js'

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>

const COOKIE = 'ol_session'
const TEN_YEARS = 10 * 365 * 24 * 60 * 60

export interface User {
  id: string
  username: string
  displayName: string
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await scrypt(password, salt, 64)
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, hashB64] = stored.split('$')
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false
  const expected = Buffer.from(hashB64, 'base64')
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length)
  return timingSafeEqual(actual, expected)
}

function secret(): string {
  const s = process.env.SESSION_SECRET
  if (!s || s.length < 32) throw new Error('SESSION_SECRET must be set (at least 32 characters)')
  return s
}

const sign = (payload: string) => createHmac('sha256', secret()).update(payload).digest('base64url')

/** Cookie value: "<userId>.<sessionVersion>.<signature>". */
export function sessionCookie(userId: string, version: number): string {
  const payload = `${userId}.${version}`
  const value = `${payload}.${sign(payload)}`
  return `${COOKIE}=${value}; Path=/; Max-Age=${TEN_YEARS}; HttpOnly; Secure; SameSite=Lax`
}

export const clearedCookie = `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`

function readCookie(req: Request): string | null {
  const header = req.headers.get('cookie') ?? ''
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === COOKIE) return v.join('=')
  }
  return null
}

/** The logged-in user, or null if the cookie is missing, forged, or signed out. */
export async function currentUser(req: Request): Promise<User | null> {
  const value = readCookie(req)
  if (!value) return null
  const [id, version, sig] = value.split('.')
  if (!id || !version || !sig) return null
  const expected = Buffer.from(sign(`${id}.${version}`))
  const given = Buffer.from(sig)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  await ensureSchema()
  const rows = await getSql()`SELECT id, username, display_name, session_version FROM users WHERE id = ${id}`
  const u = rows[0]
  if (!u || String(u.session_version) !== version) return null
  return { id: u.id, username: u.username, displayName: u.display_name }
}

export const json = (data: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...init.headers },
  })

export const unauthorized = () => json({ error: 'unauthorized' }, { status: 401 })

// GET  /api/auth                      → the logged-in user, or 401
// POST /api/auth {action:'login', username, password} → sets the session cookie
// POST /api/auth {action:'logout'}    → clears the cookie on this phone
import { clearedCookie, currentUser, json, sessionCookie, unauthorized, verifyPassword } from './_lib/auth.js'
import { ensureSchema, getSql } from './_lib/db.js'

const MAX_FAILURES = 5
const LOCK_MINUTES = 15

export async function GET(req: Request) {
  const user = await currentUser(req)
  return user ? json({ user }) : unauthorized()
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { action?: string; username?: string; password?: string }

  if (body.action === 'logout') return json({ ok: true }, { headers: { 'set-cookie': clearedCookie } })
  if (body.action !== 'login') return json({ error: 'bad_request' }, { status: 400 })

  const username = (body.username ?? '').trim().toLowerCase()
  const password = body.password ?? ''
  if (!username || !password) return json({ error: 'invalid' }, { status: 400 })

  await ensureSchema()
  const sql = getSql()
  const [u] = await sql`SELECT * FROM users WHERE username = ${username}`
  // Same answer for unknown user and wrong password, so usernames can't be probed.
  const invalid = () => json({ error: 'invalid' }, { status: 401 })
  if (!u) return invalid()
  if (u.locked_until && new Date(u.locked_until) > new Date()) return json({ error: 'locked' }, { status: 429 })

  if (!(await verifyPassword(password, u.password_hash))) {
    const failures = u.failed_logins + 1
    if (failures >= MAX_FAILURES) {
      await sql`UPDATE users SET failed_logins = 0, locked_until = now() + make_interval(mins => ${LOCK_MINUTES}) WHERE id = ${u.id}`
    } else {
      await sql`UPDATE users SET failed_logins = ${failures} WHERE id = ${u.id}`
    }
    return invalid()
  }

  await sql`UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ${u.id}`
  return json(
    { user: { id: u.id, username: u.username, displayName: u.display_name } },
    { headers: { 'set-cookie': sessionCookie(u.id, u.session_version) } },
  )
}

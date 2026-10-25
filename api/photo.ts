// POST /api/photo (body: JPEG bytes)  → stores it in the private Blob store, returns { pathname }
// GET  /api/photo?p=photos/<id>.jpg   → streams it back, only to logged-in users
// Photos are compressed on the phone first (~300 KB), well under the 4.5 MB request limit.
import { randomUUID } from 'node:crypto'
import { get, put } from '@vercel/blob'
import { currentUser, json, unauthorized } from './_lib/auth.js'

const MAX_BYTES = 4 * 1024 * 1024
const PATH = /^photos\/[0-9a-f-]{36}\.jpg$/

export async function POST(req: Request) {
  if (!(await currentUser(req))) return unauthorized()
  if (req.headers.get('content-type') !== 'image/jpeg') return json({ error: 'jpeg_only' }, { status: 415 })
  const body = await req.arrayBuffer()
  if (body.byteLength === 0 || body.byteLength > MAX_BYTES) return json({ error: 'too_large' }, { status: 413 })
  const pathname = `photos/${randomUUID()}.jpg`
  await put(pathname, body, { access: 'private', contentType: 'image/jpeg', addRandomSuffix: false })
  return json({ pathname })
}

export async function GET(req: Request) {
  if (!(await currentUser(req))) return unauthorized()
  const pathname = new URL(req.url).searchParams.get('p') ?? ''
  if (!PATH.test(pathname)) return json({ error: 'not_found' }, { status: 404 })
  const blob = await get(pathname, { access: 'private', ifNoneMatch: req.headers.get('if-none-match') ?? undefined })
  if (!blob) return json({ error: 'not_found' }, { status: 404 })
  // A pathname never changes content (new photo = new name), so the phone can keep it forever.
  const headers = { 'cache-control': 'private, max-age=31536000, immutable', etag: blob.blob.etag }
  if (blob.statusCode === 304) return new Response(null, { status: 304, headers })
  return new Response(blob.stream, { headers: { ...headers, 'content-type': blob.blob.contentType } })
}

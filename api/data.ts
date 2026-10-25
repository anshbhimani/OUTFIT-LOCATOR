// GET  /api/data[?embeddings=1] → all places and sarees for the family (photo-AI fingerprints on request)
// POST /api/data {op, ...}       → one change (see OPS below)
// Every request requires a logged-in user.
import { randomUUID } from 'node:crypto'
import { del } from '@vercel/blob'
import { currentUser, json, unauthorized, type User } from './_lib/auth.js'
import { getSql } from './_lib/db.js'

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

/** Only photos uploaded through /api/photo can be attached or deleted. */
const PHOTO_PATH = /^photos\/[0-9a-f-]{36}\.jpg$/
const KINDS = new Set(['room', 'unit', 'spot', 'away'])

const toLocation = (r: Row) => ({ id: r.id, name: r.name, parentId: r.parent_id, kind: r.kind })

function toSaree(r: Row, photos: Row[], withEmbeddings: boolean) {
  return {
    id: r.id,
    title: r.title ?? undefined,
    titleEn: r.title_en ?? undefined,
    colors: r.colors ?? [],
    fabric: r.fabric ?? undefined,
    pattern: r.pattern ?? undefined,
    occasion: r.occasion ?? undefined,
    notes: r.notes ?? undefined,
    locationId: r.location_id,
    lastWorn: r.last_worn ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    photos: photos.map((p) => ({
      id: p.id,
      pathname: p.pathname,
      ...(withEmbeddings && p.embedding ? { embedding: encodeEmbedding(p.embedding) } : {}),
      hasEmbedding: !!p.embedding,
    })),
  }
}

// Fingerprints travel as base64 Float32 (~2.7 KB each) instead of JSON number arrays (~8 KB).
const encodeEmbedding = (v: number[]) => Buffer.from(new Float32Array(v).buffer).toString('base64')
function decodeEmbedding(b64: string): number[] {
  const buf = Buffer.from(b64, 'base64')
  return Array.from(new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4))
}

async function loadSaree(id: string, withEmbeddings = false) {
  const sql = getSql()
  const [r] = await sql`SELECT * FROM sarees WHERE id = ${id}`
  if (!r) return null
  const photos = await sql`SELECT * FROM photos WHERE saree_id = ${id} ORDER BY position`
  return toSaree(r, photos, withEmbeddings)
}

export async function GET(req: Request) {
  const user = await currentUser(req)
  if (!user) return unauthorized()
  const withEmbeddings = new URL(req.url).searchParams.get('embeddings') === '1'
  const sql = getSql()
  const [locations, sarees, photos] = await Promise.all([
    sql`SELECT * FROM locations ORDER BY created_at`,
    sql`SELECT * FROM sarees ORDER BY updated_at DESC`,
    withEmbeddings
      ? sql`SELECT id, saree_id, pathname, position, embedding FROM photos ORDER BY position`
      : sql`SELECT id, saree_id, pathname, position, (embedding IS NOT NULL) AS has FROM photos ORDER BY position`,
  ])
  const bySaree = new Map<string, Row[]>()
  for (const p of photos) {
    if (!withEmbeddings && p.has) p.embedding = [] // marks "learned" without sending it
    bySaree.set(p.saree_id, [...(bySaree.get(p.saree_id) ?? []), p])
  }
  return json({
    user,
    locations: locations.map(toLocation),
    sarees: sarees.map((s) => toSaree(s, bySaree.get(s.id) ?? [], withEmbeddings)),
  })
}

interface SareeFields {
  id?: string
  title?: string // Gujarati name
  titleEn?: string // English name
  colors?: string[]
  fabric?: string
  pattern?: string
  occasion?: string
  notes?: string
  locationId: string
  photos: string[] // blob pathnames, in display order
}

const OPS: Record<string, (b: Row, user: User) => Promise<Response>> = {
  async addLocation(b) {
    if (!b.name?.trim() || !KINDS.has(b.kind)) return json({ error: 'bad_request' }, { status: 400 })
    const id = typeof b.id === 'string' ? b.id : randomUUID()
    const [r] = await getSql()`
      INSERT INTO locations (id, name, parent_id, kind) VALUES (${id}, ${b.name.trim()}, ${b.parentId ?? null}, ${b.kind})
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name RETURNING *`
    return json({ location: toLocation(r) })
  },

  async renameLocation(b) {
    const [r] = await getSql()`UPDATE locations SET name = ${String(b.name).trim()} WHERE id = ${b.id} RETURNING *`
    return r ? json({ location: toLocation(r) }) : json({ error: 'not_found' }, { status: 404 })
  },

  async deleteLocation(b) {
    const sql = getSql()
    const [{ n }] = await sql`
      SELECT (SELECT count(*) FROM locations WHERE parent_id = ${b.id}) + (SELECT count(*) FROM sarees WHERE location_id = ${b.id}) AS n`
    if (Number(n) > 0) return json({ ok: false, reason: 'not_empty' })
    await sql`DELETE FROM locations WHERE id = ${b.id}`
    return json({ ok: true })
  },

  /** Create (no id / unknown id) or update a saree, including its photo list. */
  async saveSaree(b, user) {
    const f = b as unknown as SareeFields
    if (!f.locationId || !Array.isArray(f.photos) || f.photos.some((p) => typeof p !== 'string' || !PHOTO_PATH.test(p)))
      return json({ error: 'bad_request' }, { status: 400 })
    const sql = getSql()
    const id = f.id ?? randomUUID()
    const [existing] = await sql`SELECT location_id FROM sarees WHERE id = ${id}`
    const oldPhotos = existing ? await sql`SELECT id, pathname FROM photos WHERE saree_id = ${id}` : []
    const keep = new Set(f.photos)
    const removed = oldPhotos.filter((p) => !keep.has(p.pathname))
    const known = new Map(oldPhotos.map((p) => [p.pathname, p.id]))

    const queries = [
      existing
        ? sql`UPDATE sarees SET title = ${f.title?.trim() || null}, title_en = ${f.titleEn?.trim() || null}, colors = ${f.colors ?? []}, fabric = ${f.fabric ?? null},
                pattern = ${f.pattern ?? null}, occasion = ${f.occasion ?? null}, notes = ${f.notes ?? null},
                location_id = ${f.locationId}, updated_at = now() WHERE id = ${id}`
        : sql`INSERT INTO sarees (id, title, title_en, colors, fabric, pattern, occasion, notes, location_id, created_by)
              VALUES (${id}, ${f.title?.trim() || null}, ${f.titleEn?.trim() || null}, ${f.colors ?? []}, ${f.fabric ?? null}, ${f.pattern ?? null},
                      ${f.occasion ?? null}, ${f.notes ?? null}, ${f.locationId}, ${user.id})`,
      ...removed.map((p) => sql`DELETE FROM photos WHERE id = ${p.id}`),
      // Kept photos keep their AI fingerprint; only their order is updated.
      ...f.photos.map((pathname, i) =>
        known.has(pathname)
          ? sql`UPDATE photos SET position = ${i} WHERE id = ${known.get(pathname)}`
          : sql`INSERT INTO photos (id, saree_id, pathname, position) VALUES (${randomUUID()}, ${id}, ${pathname}, ${i})`,
      ),
    ]
    if (!existing || existing.location_id !== f.locationId) {
      queries.push(
        sql`INSERT INTO history (id, saree_id, from_location_id, to_location_id, by_user)
            VALUES (${randomUUID()}, ${id}, ${existing?.location_id ?? null}, ${f.locationId}, ${user.id})`,
      )
    }
    try {
      await sql.transaction(queries)
    } catch (e) {
      if ((e as { code?: string }).code === '23505') return json({ error: 'duplicate_name' }, { status: 409 })
      throw e
    }
    if (removed.length) await del(removed.map((p) => p.pathname)).catch(() => undefined)
    return json({ saree: await loadSaree(id) })
  },

  async moveSaree(b, user) {
    const sql = getSql()
    const [s] = await sql`SELECT location_id FROM sarees WHERE id = ${b.id}`
    if (!s) return json({ error: 'not_found' }, { status: 404 })
    if (s.location_id !== b.toLocationId) {
      await sql.transaction([
        sql`UPDATE sarees SET location_id = ${b.toLocationId}, updated_at = now() WHERE id = ${b.id}`,
        sql`INSERT INTO history (id, saree_id, from_location_id, to_location_id, note, by_user)
            VALUES (${randomUUID()}, ${b.id}, ${s.location_id}, ${b.toLocationId}, ${b.note ?? null}, ${user.id})`,
      ])
    }
    return json({ saree: await loadSaree(b.id) })
  },

  async markWorn(b) {
    await getSql()`UPDATE sarees SET last_worn = now() WHERE id = ${b.id}`
    return json({ saree: await loadSaree(b.id) })
  },

  async deleteSaree(b) {
    const sql = getSql()
    const photos = await sql`SELECT pathname FROM photos WHERE saree_id = ${b.id}`
    await sql`DELETE FROM sarees WHERE id = ${b.id}`
    if (photos.length) await del(photos.map((p) => p.pathname)).catch(() => undefined)
    return json({ ok: true })
  },

  async history(b) {
    const rows = await getSql()`SELECT * FROM history WHERE saree_id = ${b.id} ORDER BY at DESC`
    return json({
      history: rows.map((h) => ({ id: h.id, fromLocationId: h.from_location_id, toLocationId: h.to_location_id, at: h.at })),
    })
  },

  /** Photos uploaded and then removed before the saree was saved. Never deletes a photo still in use. */
  async discardPhotos(b) {
    const paths: string[] = (Array.isArray(b.pathnames) ? b.pathnames : []).filter((p: unknown) => typeof p === 'string' && PHOTO_PATH.test(p))
    if (!paths.length) return json({ ok: true })
    const used = new Set((await getSql()`SELECT pathname FROM photos WHERE pathname = ANY(${paths})`).map((r) => r.pathname))
    const unused = paths.filter((p) => !used.has(p))
    if (unused.length) await del(unused).catch(() => undefined)
    return json({ ok: true })
  },

  async setEmbedding(b) {
    await getSql()`UPDATE photos SET embedding = ${decodeEmbedding(b.embedding)} WHERE id = ${b.photoId}`
    return json({ ok: true })
  },
}

export async function POST(req: Request) {
  const user = await currentUser(req)
  if (!user) return unauthorized()
  const body = (await req.json().catch(() => null)) as Row | null
  const op = body && OPS[body.op]
  if (!op) return json({ error: 'unknown_op' }, { status: 400 })
  return op(body, user)
}

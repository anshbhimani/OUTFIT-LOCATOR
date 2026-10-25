// Bulk-import a folder of saree photos (one photo = one saree) into one place.
//   npm run import-photos -- <folder> "<Room › Unit › Spot>" <username> [--dry-run]
// Each photo is auto-rotated, shrunk to the app's size (JPEG, ≤1280px), uploaded to the private
// Blob store, and saved as an untagged saree. Already-imported files are remembered in
// <folder>/.imported.json, so re-running never creates duplicates.
import { randomUUID } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { put } from '@vercel/blob'
import sharp from 'sharp'
import { ensureSchema, getSql } from '../api/_lib/db.js'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const [folder, placePath, username] = args.filter((a) => a !== '--dry-run')
if (!folder || !placePath || !username) {
  console.error('Usage: npm run import-photos -- <folder> "<Room › Unit › Spot>" <username> [--dry-run]')
  process.exit(1)
}

const MAX_EDGE = 1280 // same as the app (src/photos.ts)
const QUALITY = 85
const PARALLEL = 3

await ensureSchema()
const sql = getSql()

// Resolve "Room › Unit › Spot" to a location id.
const locations = await sql`SELECT id, name, parent_id FROM locations`
const names = placePath.split('›').map((s) => s.trim().toLowerCase())
let parent: string | null = null
let locationId: string | null = null
for (const name of names) {
  const match = locations.find((l) => l.name.trim().toLowerCase() === name && l.parent_id === parent)
  if (!match) {
    console.error(`Place not found: "${placePath}" (stuck at "${name}")`)
    process.exit(1)
  }
  locationId = parent = match.id
}

const [user] = await sql`SELECT id FROM users WHERE username = ${username.toLowerCase()}`
if (!user) {
  console.error(`User not found: ${username}`)
  process.exit(1)
}

const manifestPath = join(folder, '.imported.json')
const manifest: Record<string, string> = JSON.parse(await readFile(manifestPath, 'utf8').catch(() => '{}'))
const files = (await readdir(folder)).filter((f) => /\.(jpe?g|png|webp|heic)$/i.test(f)).sort()
const todo = files.filter((f) => !manifest[f])
console.log(`${files.length} photos, ${files.length - todo.length} already imported, ${todo.length} to import → "${placePath}"`)

/** Samsung names photos YYYYMMDD_HHMMSS.jpg; use that as the saree's date so order is kept. */
function takenAt(file: string): Date {
  const m = file.match(/(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/)
  return m ? new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+05:30`) : new Date()
}

let done = 0
let bytesIn = 0
let bytesOut = 0
async function importOne(file: string) {
  const original = await readFile(join(folder, file))
  const jpeg = await sharp(original)
    .rotate() // apply the phone's EXIF orientation
    .resize(MAX_EDGE, MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: QUALITY, mozjpeg: true })
    .toBuffer()
  bytesIn += original.length
  bytesOut += jpeg.length
  if (dryRun) {
    console.log(`  [dry run] ${file}: ${(original.length / 1e6).toFixed(1)} MB → ${(jpeg.length / 1e3).toFixed(0)} KB`)
    return
  }
  const pathname = `photos/${randomUUID()}.jpg`
  await put(pathname, jpeg, { access: 'private', contentType: 'image/jpeg', addRandomSuffix: false })
  const sareeId = randomUUID()
  const at = takenAt(file)
  await sql.transaction([
    sql`INSERT INTO sarees (id, colors, location_id, created_by, created_at, updated_at)
        VALUES (${sareeId}, '{}', ${locationId}, ${user.id}, ${at}, ${at})`,
    sql`INSERT INTO photos (id, saree_id, pathname, position) VALUES (${randomUUID()}, ${sareeId}, ${pathname}, 0)`,
    sql`INSERT INTO history (id, saree_id, from_location_id, to_location_id, at, by_user)
        VALUES (${randomUUID()}, ${sareeId}, NULL, ${locationId}, ${at}, ${user.id})`,
  ])
  manifest[file] = sareeId
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2))
  console.log(`  ✓ ${++done}/${todo.length} ${file} (${(jpeg.length / 1e3).toFixed(0)} KB)`)
}

const queue = [...todo]
await Promise.all(
  Array.from({ length: PARALLEL }, async () => {
    for (let f = queue.shift(); f; f = queue.shift()) {
      try {
        await importOne(f)
      } catch (e) {
        console.error(`  ✗ ${f}: ${(e as Error).message} (re-run to retry)`)
      }
    }
  }),
)
console.log(
  `${dryRun ? 'Dry run' : 'Done'}: ${(bytesIn / 1e6).toFixed(0)} MB of originals → ${(bytesOut / 1e6).toFixed(1)} MB uploaded` +
    (dryRun ? ' (nothing was uploaded or saved)' : ''),
)

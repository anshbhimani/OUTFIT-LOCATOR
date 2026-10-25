// Manual zip backup/restore: the Phase 1 safety net (D5). Phase 3 automates this to Google Drive.
import { strToU8, strFromU8, unzipSync, zipSync } from 'fflate'
import { db, type History, type Location, type Saree } from './db'

const FORMAT_VERSION = 1
const LAST_BACKUP_KEY = 'lastBackupAt'

type SareeRecord = Omit<Saree, 'photos' | 'textEmbedding' | 'imageEmbeddings'> & { photos: string[] }
interface BackupFile {
  version: number
  exportedAt: string
  sarees: SareeRecord[]
  locations: Location[]
  history: History[]
}

const extFor = (type: string) => (type === 'image/webp' ? 'webp' : type === 'image/png' ? 'png' : 'jpg')
const typeFor = (name: string) =>
  name.endsWith('.webp') ? 'image/webp' : name.endsWith('.png') ? 'image/png' : 'image/jpeg'

export async function createBackup(): Promise<File> {
  const [sarees, locations, history] = await Promise.all([
    db.sarees.toArray(),
    db.locations.toArray(),
    db.history.toArray(),
  ])
  const files: Record<string, Uint8Array> = {}

  const records: SareeRecord[] = []
  for (const { photos, textEmbedding: _t, imageEmbeddings: _i, ...rest } of sarees) {
    const names: string[] = []
    for (const [i, photo] of photos.entries()) {
      const name = `photos/${rest.id}-${i}.${extFor(photo.type)}`
      files[name] = new Uint8Array(await photo.arrayBuffer())
      names.push(name)
    }
    records.push({ ...rest, photos: names })
  }

  const data: BackupFile = { version: FORMAT_VERSION, exportedAt: new Date().toISOString(), sarees: records, locations, history }
  files['data.json'] = strToU8(JSON.stringify(data))

  // Photos are already compressed, so storing (level 0) is as small as deflating and much faster.
  const zip = zipSync(files, { level: 0 })
  const date = new Date().toISOString().slice(0, 10)
  return new File([zip as BlobPart], `outfit-backup-${date}.zip`, { type: 'application/zip' })
}

/** Share sheet on Android (WhatsApp, Drive…), plain download elsewhere. */
export async function saveBackup(file: File): Promise<void> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name })
      markBackedUp()
      return
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      // share failed for another reason: fall back to download
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  markBackedUp()
}

const reviveDate = (v: unknown) => (typeof v === 'string' ? new Date(v) : undefined)

/** Replaces all data with the backup's contents. Returns the number of sarees restored. */
export async function restoreBackup(file: File): Promise<number> {
  const entries = unzipSync(new Uint8Array(await file.arrayBuffer()))
  if (!entries['data.json']) throw new Error('Missing data.json')
  const data = JSON.parse(strFromU8(entries['data.json'])) as BackupFile
  if (data.version !== FORMAT_VERSION || !Array.isArray(data.sarees)) throw new Error('Unknown backup format')

  const sarees: Saree[] = data.sarees.map((s) => ({
    ...s,
    photos: s.photos.filter((n) => entries[n]).map((n) => new Blob([entries[n] as BlobPart], { type: typeFor(n) })),
    createdAt: reviveDate(s.createdAt)!,
    updatedAt: reviveDate(s.updatedAt)!,
    lastWorn: reviveDate(s.lastWorn),
  }))
  const history: History[] = data.history.map((h) => ({ ...h, at: reviveDate(h.at)! }))

  await db.transaction('rw', db.sarees, db.locations, db.history, async () => {
    await Promise.all([db.sarees.clear(), db.locations.clear(), db.history.clear()])
    await db.locations.bulkAdd(data.locations)
    await db.sarees.bulkAdd(sarees)
    await db.history.bulkAdd(history)
  })
  return sarees.length
}

function markBackedUp() {
  try {
    localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString())
  } catch {
    // not critical
  }
}

export function lastBackupAt(): Date | null {
  try {
    const v = localStorage.getItem(LAST_BACKUP_KEY)
    return v ? new Date(v) : null
  } catch {
    return null
  }
}

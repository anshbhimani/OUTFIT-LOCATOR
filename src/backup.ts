// Backup file (zip: data.json + photos/). The cloud is the main copy now (D24); this is an extra
// copy she can keep, and the way to bring sarees over from the old on-phone app (same format).
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { addLocation, startUpload, updateSaree } from './data'
import { compressPhoto } from './photos'
import { getState } from './store'
import { photoUrl, type Location } from './types'

const FORMAT_VERSION = 1
const LAST_BACKUP_KEY = 'lastBackupAt'

interface SareeRecord {
  id: string
  photos: string[] // file names inside the zip
  title?: string
  titleEn?: string
  colors: string[]
  fabric?: string
  pattern?: string
  occasion?: string
  notes?: string
  locationId: string
  lastWorn?: string
  createdAt: string
  updatedAt: string
}
interface BackupFile {
  version: number
  exportedAt: string
  sarees: SareeRecord[]
  locations: Location[]
}

export async function createBackup(): Promise<File> {
  const { sarees, locations } = getState()
  const files: Record<string, Uint8Array> = {}
  const records: SareeRecord[] = []
  for (const s of sarees) {
    const names: string[] = []
    for (const [i, photo] of s.photos.entries()) {
      const res = await fetch(photoUrl(photo.pathname), { credentials: 'same-origin' })
      if (!res.ok) continue
      const name = `photos/${s.id}-${i}.jpg`
      files[name] = new Uint8Array(await res.arrayBuffer())
      names.push(name)
    }
    records.push({
      id: s.id,
      photos: names,
      title: s.title,
      titleEn: s.titleEn,
      colors: s.colors,
      fabric: s.fabric,
      pattern: s.pattern,
      occasion: s.occasion,
      notes: s.notes,
      locationId: s.locationId,
      lastWorn: s.lastWorn?.toISOString(),
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    })
  }
  const data: BackupFile = { version: FORMAT_VERSION, exportedAt: new Date().toISOString(), sarees: records, locations }
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

/** Parents before children, so every place's parent exists when it's added. */
function parentsFirst(locations: Location[]): Location[] {
  const out: Location[] = []
  const done = new Set<string>()
  let pending = [...locations]
  while (pending.length) {
    const ready = pending.filter((l) => !l.parentId || done.has(l.parentId) || !locations.some((x) => x.id === l.parentId))
    if (!ready.length) break
    for (const l of ready) {
      out.push(l)
      done.add(l.id)
    }
    pending = pending.filter((l) => !done.has(l.id))
  }
  return out
}

/**
 * Adds the backup's places and sarees to the cloud. Ids are kept, so restoring the same file
 * twice updates instead of duplicating; nothing is deleted. Accepts backups from the old
 * on-phone app too (its WebP photos are converted to JPEG).
 */
export async function restoreBackup(file: File, onProgress: (done: number, total: number) => void): Promise<number> {
  const entries = unzipSync(new Uint8Array(await file.arrayBuffer()))
  if (!entries['data.json']) throw new Error('Missing data.json')
  const data = JSON.parse(strFromU8(entries['data.json'])) as BackupFile
  if (data.version !== FORMAT_VERSION || !Array.isArray(data.sarees)) throw new Error('Unknown backup format')

  for (const l of parentsFirst(data.locations)) await addLocation(l.name, l.kind, l.parentId, l.id)

  let done = 0
  onProgress(done, data.sarees.length)
  for (const s of data.sarees) {
    const photos: Blob[] = []
    for (const name of s.photos) {
      const bytes = entries[name]
      if (!bytes) continue
      const raw = new Blob([bytes as BlobPart], { type: name.endsWith('.webp') ? 'image/webp' : 'image/jpeg' })
      const jpeg = raw.type === 'image/jpeg' ? raw : await compressPhoto(new File([raw], name, { type: raw.type }))
      photos.push(jpeg)
      void startUpload(jpeg).catch(() => undefined)
    }
    // updateSaree creates the saree under this id if it doesn't exist yet.
    await updateSaree(s.id, {
      photos,
      title: s.title,
      titleEn: s.titleEn,
      colors: s.colors ?? [],
      fabric: s.fabric,
      pattern: s.pattern,
      occasion: s.occasion,
      notes: s.notes,
      locationId: s.locationId,
    })
    onProgress(++done, data.sarees.length)
  }
  return done
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

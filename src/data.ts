// All changes go through here: call the API, then patch the in-memory copy in store.ts.
// Photos are uploaded as soon as they're prepared (startUpload), so Save only waits for the
// small JSON call in the common case.
import {
  api,
  parseSaree,
  removeLocation,
  removeSaree,
  setPhotoEmbeddingLocal,
  upsertLocation,
  upsertSaree,
  type RawSaree,
} from './store'
import type { HistoryEntry, Location, LocationKind, StoredPhoto } from './types'

export interface SareeInput {
  /** New photos are Blobs (not uploaded yet, or uploading); existing ones are StoredPhotos. */
  photos: (Blob | StoredPhoto)[]
  title?: string // Gujarati name
  titleEn?: string // English name
  colors: string[]
  fabric?: string
  pattern?: string
  occasion?: string
  notes?: string
  locationId: string
}

export const CHILD_KIND: Record<LocationKind, LocationKind | null> = {
  room: 'unit',
  unit: 'spot',
  spot: null,
  away: null,
}

// ---------- photos ----------

const uploads = new WeakMap<Blob, Promise<string>>()

/** Begin uploading a prepared photo now; saving reuses the same upload. */
export function startUpload(blob: Blob): Promise<string> {
  let p = uploads.get(blob)
  if (!p) {
    p = fetch('/api/photo', { method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: blob, credentials: 'same-origin' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`upload failed (${res.status})`)
        return ((await res.json()) as { pathname: string }).pathname
      })
    p.catch(() => uploads.delete(blob)) // a failed upload is retried on save
    uploads.set(blob, p)
  }
  return p
}

/** A photo was removed before saving: delete its upload so it doesn't use storage. */
export function discardUpload(blob: Blob) {
  const p = uploads.get(blob)
  if (!p) return
  uploads.delete(blob)
  p.then((pathname) => api('/api/data', { op: 'discardPhotos', pathnames: [pathname] })).catch(() => undefined)
}

// ---------- sarees ----------

async function saveSaree(input: SareeInput, id?: string): Promise<string> {
  const photos = await Promise.all(input.photos.map((p) => (p instanceof Blob ? startUpload(p) : p.pathname)))
  const { saree } = await api<{ saree: RawSaree }>('/api/data', { op: 'saveSaree', ...input, id, photos })
  upsertSaree(parseSaree(saree))
  return saree.id
}

export const addSaree = (input: SareeInput) => saveSaree(input)
export const updateSaree = (id: string, input: SareeInput) => saveSaree(input, id).then(() => undefined)

/** The only place a saree's location changes (CLAUDE.md convention); the server writes history. */
export async function moveSaree(id: string, toLocationId: string, note?: string): Promise<void> {
  const { saree } = await api<{ saree: RawSaree }>('/api/data', { op: 'moveSaree', id, toLocationId, note })
  upsertSaree(parseSaree(saree))
}

export async function markWorn(id: string): Promise<void> {
  const { saree } = await api<{ saree: RawSaree }>('/api/data', { op: 'markWorn', id })
  upsertSaree(parseSaree(saree))
}

export async function deleteSaree(id: string): Promise<void> {
  await api('/api/data', { op: 'deleteSaree', id })
  removeSaree(id)
}

export async function getHistory(id: string): Promise<HistoryEntry[]> {
  const { history } = await api<{ history: (Omit<HistoryEntry, 'at'> & { at: string })[] }>('/api/data', { op: 'history', id })
  return history.map((h) => ({ ...h, at: new Date(h.at) }))
}

export async function setPhotoEmbedding(sareeId: string, photoId: string, embedding: Float32Array): Promise<void> {
  const bytes = new Uint8Array(embedding.buffer, embedding.byteOffset, embedding.byteLength)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  await api('/api/data', { op: 'setEmbedding', photoId, embedding: btoa(bin) })
  setPhotoEmbeddingLocal(sareeId, photoId, embedding)
}

// ---------- places ----------

export async function addLocation(name: string, kind: LocationKind, parentId: string | null, id?: string): Promise<string> {
  const { location } = await api<{ location: Location }>('/api/data', { op: 'addLocation', name: name.trim(), kind, parentId, id })
  upsertLocation(location)
  return location.id
}

export async function renameLocation(id: string, name: string): Promise<void> {
  const { location } = await api<{ location: Location }>('/api/data', { op: 'renameLocation', id, name: name.trim() })
  upsertLocation(location)
}

/** Returns false (and deletes nothing) if the place still contains shelves or sarees. */
export async function deleteLocation(id: string): Promise<boolean> {
  const { ok } = await api<{ ok: boolean }>('/api/data', { op: 'deleteLocation', id })
  if (ok) removeLocation(id)
  return ok
}

// ---- pure helpers over an in-memory location list ----

export function subtreeIds(rootId: string, locations: Location[]): Set<string> {
  const ids = new Set([rootId])
  let grew = true
  while (grew) {
    grew = false
    for (const l of locations) {
      if (l.parentId && ids.has(l.parentId) && !ids.has(l.id)) {
        ids.add(l.id)
        grew = true
      }
    }
  }
  return ids
}

export function locationPath(id: string | null | undefined, byId: Map<string, Location>): Location[] {
  const path: Location[] = []
  let cur = id ? byId.get(id) : undefined
  while (cur && path.length < 10) {
    path.unshift(cur)
    cur = cur.parentId ? byId.get(cur.parentId) : undefined
  }
  return path
}

export function pathText(id: string | null | undefined, byId: Map<string, Location>): string {
  return locationPath(id, byId)
    .map((l) => l.name)
    .join(' › ')
}

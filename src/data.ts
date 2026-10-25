// All writes go through here so history and embedding invalidation are never forgotten.
import { db, newId, type Location, type LocationKind, type Saree } from './db'

export type SareeInput = Pick<
  Saree,
  'photos' | 'title' | 'colors' | 'fabric' | 'pattern' | 'occasion' | 'notes' | 'locationId'
>

export const CHILD_KIND: Record<LocationKind, LocationKind | null> = {
  room: 'unit',
  unit: 'spot',
  spot: null,
  away: null,
}

export async function addSaree(input: SareeInput): Promise<string> {
  const id = newId()
  const now = new Date()
  await db.transaction('rw', db.sarees, db.history, async () => {
    await db.sarees.add({ ...input, id, createdAt: now, updatedAt: now })
    await db.history.add({ id: newId(), sareeId: id, fromLocationId: null, toLocationId: input.locationId, at: now })
  })
  return id
}

export async function updateSaree(id: string, input: SareeInput): Promise<void> {
  const { locationId, ...fields } = input
  await db.transaction('rw', db.sarees, db.history, async () => {
    // Setting an embedding to undefined removes it, so the photo AI re-learns this saree.
    await db.sarees.update(id, { ...fields, updatedAt: new Date(), textEmbedding: undefined, imageEmbeddings: undefined })
    await moveSaree(id, locationId)
  })
}

/** The only place a saree's location changes (CLAUDE.md convention). */
export async function moveSaree(id: string, toLocationId: string, note?: string): Promise<void> {
  await db.transaction('rw', db.sarees, db.history, async () => {
    const saree = await db.sarees.get(id)
    if (!saree || saree.locationId === toLocationId) return
    const now = new Date()
    await db.sarees.update(id, { locationId: toLocationId, updatedAt: now, textEmbedding: undefined })
    await db.history.add({ id: newId(), sareeId: id, fromLocationId: saree.locationId, toLocationId, at: now, note })
  })
}

export async function markWorn(id: string): Promise<void> {
  await db.sarees.update(id, { lastWorn: new Date() })
}

export async function deleteSaree(id: string): Promise<void> {
  await db.transaction('rw', db.sarees, db.history, async () => {
    await db.sarees.delete(id)
    await db.history.where('sareeId').equals(id).delete()
  })
}

export async function addLocation(name: string, kind: LocationKind, parentId: string | null): Promise<string> {
  const id = newId()
  await db.locations.add({ id, name: name.trim(), kind, parentId })
  return id
}

export async function renameLocation(id: string, name: string): Promise<void> {
  await db.transaction('rw', db.locations, db.sarees, async () => {
    await db.locations.update(id, { name: name.trim() })
    // The location path is part of every contained saree's search text.
    const all = await db.locations.toArray()
    const ids = subtreeIds(id, all)
    await db.sarees.where('locationId').anyOf([...ids]).modify((s) => {
      delete s.textEmbedding
    })
  })
}

/** Returns false (and deletes nothing) if the place still contains shelves or sarees. */
export async function deleteLocation(id: string): Promise<boolean> {
  return db.transaction('rw', db.locations, db.sarees, async () => {
    const children = await db.locations.where('parentId').equals(id).count()
    const sarees = await db.sarees.where('locationId').equals(id).count()
    if (children > 0 || sarees > 0) return false
    await db.locations.delete(id)
    return true
  })
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

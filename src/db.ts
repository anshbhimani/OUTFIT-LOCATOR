import Dexie, { type EntityTable } from 'dexie'

export type LocationKind = 'room' | 'unit' | 'spot' | 'away'

export interface Location {
  id: string
  name: string
  parentId: string | null // Room → Unit → Spot tree; 'away' locations have no parent
  kind: LocationKind
  qrCode?: string
}

export interface Saree {
  id: string
  photos: Blob[] // 1–4 compressed WebP; first is the cover
  title?: string
  colors: string[]
  fabric?: string
  pattern?: string
  occasion?: string
  notes?: string
  locationId: string
  lastWorn?: Date
  createdAt: Date
  updatedAt: Date
  textEmbedding?: Float32Array
  imageEmbedding?: Float32Array
}

export interface History {
  id: string
  sareeId: string
  fromLocationId: string | null
  toLocationId: string
  at: Date
  note?: string
}

// The DB name keeps the original project name on purpose: renaming it would orphan existing data.
export const db = new Dexie('saree-locator') as Dexie & {
  sarees: EntityTable<Saree, 'id'>
  locations: EntityTable<Location, 'id'>
  history: EntityTable<History, 'id'>
}

// Only indexed fields are listed; other fields are stored but not indexed.
// Never edit a published version: add db.version(2) with an upgrade instead.
db.version(1).stores({
  sarees: 'id, locationId, *colors, fabric, updatedAt, lastWorn',
  locations: 'id, parentId, kind',
  history: 'id, sareeId, at',
})

export const newId = () => crypto.randomUUID()

/** Ask the browser not to evict our data under storage pressure. */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  if (await navigator.storage.persisted()) return true
  return navigator.storage.persist()
}

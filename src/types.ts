// Shapes shared by the whole app. The data itself lives in the cloud (Neon + Vercel Blob, D24);
// src/store.ts keeps the loaded copy in memory.

export type LocationKind = 'room' | 'unit' | 'spot' | 'away'

export interface Location {
  id: string
  name: string
  parentId: string | null // Room → Unit → Spot tree; 'away' locations have no parent
  kind: LocationKind
}

export interface StoredPhoto {
  id: string
  /** Private blob path ("photos/<uuid>.jpg"); shown through /api/photo. */
  pathname: string
  /** Whether the photo AI has learned this photo (stored server-side, shared by the family). */
  hasEmbedding: boolean
  /** Only loaded once the photo AI is turned on on this phone. */
  embedding?: Float32Array
}

export interface Saree {
  id: string
  photos: StoredPhoto[] // first is the cover
  /** Gujarati name. */
  title?: string
  /** English name. The app shows the one matching the chosen language (falls back to the other). */
  titleEn?: string
  colors: string[]
  fabric?: string
  pattern?: string
  occasion?: string
  notes?: string
  locationId: string
  lastWorn?: Date
  createdAt: Date
  updatedAt: Date
}

export interface HistoryEntry {
  id: string
  fromLocationId: string | null
  toLocationId: string
  at: Date
}

export interface User {
  id: string
  username: string
  displayName: string
}

export const photoUrl = (pathname: string) => `/api/photo?p=${encodeURIComponent(pathname)}`

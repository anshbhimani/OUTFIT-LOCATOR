import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo } from 'react'
import { db, type Location, type Saree } from './db'

/** All sarees and locations, kept live. Fine for the ~1,000 sarees we design for. */
export function useData() {
  const sarees = useLiveQuery(() => db.sarees.orderBy('updatedAt').reverse().toArray(), [])
  const locations = useLiveQuery(() => db.locations.toArray(), [])
  const byId = useMemo(() => new Map((locations ?? []).map((l) => [l.id, l])), [locations])
  return {
    loading: sarees === undefined || locations === undefined,
    sarees: sarees ?? ([] as Saree[]),
    locations: locations ?? ([] as Location[]),
    byId,
  }
}

// Every live query returns fresh Blob objects, so keying object URLs by Blob would recreate
// (and re-decode) every photo on every DB change. Instead URLs are cached by a stable key,
// reference-counted by mounted <Photo>s, and revoked a while after the last one unmounts.
const urlCache = new Map<Blob | string, { url: string; refs: number; timer?: number }>()
const REVOKE_AFTER_MS = 60_000

function urlFor(key: Blob | string, blob: Blob): string {
  let entry = urlCache.get(key)
  if (!entry) {
    entry = { url: URL.createObjectURL(blob), refs: 0 }
    urlCache.set(key, entry)
  }
  return entry.url
}

/** `key` should identify the photo's content (e.g. sareeId/index/updatedAt); defaults to the Blob itself. */
export function useObjectUrl(blob: Blob | undefined, key?: string): string | undefined {
  const cacheKey = key ?? blob
  const url = useMemo(() => (blob && cacheKey ? urlFor(cacheKey, blob) : undefined), [blob, cacheKey])

  useEffect(() => {
    if (!cacheKey) return
    const entry = urlCache.get(cacheKey)
    if (!entry) return
    entry.refs++
    window.clearTimeout(entry.timer)
    return () => {
      entry.refs--
      if (entry.refs > 0) return
      entry.timer = window.setTimeout(() => {
        if (entry.refs > 0) return
        URL.revokeObjectURL(entry.url)
        urlCache.delete(cacheKey)
      }, REVOKE_AFTER_MS)
    }
  }, [cacheKey])

  return url
}

/** Stable cache key for a stored saree photo. */
export const photoKey = (s: Saree, index: number) => `${s.id}/${index}/${s.updatedAt.getTime()}`

const LAST_LOCATION_KEY = 'lastLocationId'

export function getLastLocation(): string | null {
  try {
    return localStorage.getItem(LAST_LOCATION_KEY)
  } catch {
    return null
  }
}

export function setLastLocation(id: string) {
  try {
    localStorage.setItem(LAST_LOCATION_KEY, id)
  } catch {
    // only a convenience for batch entry
  }
}

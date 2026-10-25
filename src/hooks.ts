import { useEffect, useMemo } from 'react'
import { useStore } from './store'

/** Just the places, with a lookup by id. */
export function useLocations() {
  const { status, locations } = useStore()
  const byId = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations])
  return { loading: status !== 'ready', byId }
}

/** All sarees (newest change first) and places. Fine for the ~1,000 sarees we design for. */
export function useData() {
  const { status, sarees, locations } = useStore()
  const byId = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations])
  return { loading: status !== 'ready', sarees, locations, byId }
}

// Previews of photos not yet saved (Blobs) get an object URL, shared by every <Photo> showing the
// same Blob and revoked a while after the last one unmounts.
const urlCache = new Map<Blob, { url: string; refs: number; timer?: number }>()
const REVOKE_AFTER_MS = 60_000

function urlFor(blob: Blob): string {
  let entry = urlCache.get(blob)
  if (!entry) {
    entry = { url: URL.createObjectURL(blob), refs: 0 }
    urlCache.set(blob, entry)
  }
  return entry.url
}

export function useObjectUrl(blob: Blob | undefined): string | undefined {
  const url = useMemo(() => (blob ? urlFor(blob) : undefined), [blob])

  useEffect(() => {
    if (!blob) return
    const entry = urlCache.get(blob)
    if (!entry) return
    entry.refs++
    window.clearTimeout(entry.timer)
    return () => {
      entry.refs--
      if (entry.refs > 0) return
      entry.timer = window.setTimeout(() => {
        if (entry.refs > 0) return
        URL.revokeObjectURL(entry.url)
        urlCache.delete(blob)
      }, REVOKE_AFTER_MS)
    }
  }, [blob])

  return url
}

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

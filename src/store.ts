// The family's places and sarees, loaded from the API and kept in memory. Screens read it with
// useStore(); src/data.ts changes it (API call first, then patch the copy here).
import { useSyncExternalStore } from 'react'
import type { Location, Saree, StoredPhoto, User } from './types'

export type Status = 'loading' | 'signedOut' | 'ready' | 'offline'

export interface State {
  status: Status
  user: User | null
  sarees: Saree[] // newest change first
  locations: Location[]
  /** Photo-AI fingerprints have been fetched (only after the AI is turned on). */
  embeddingsLoaded: boolean
}

let state: State = { status: 'loading', user: null, sarees: [], locations: [], embeddingsLoaded: false }
const listeners = new Set<() => void>()

export function getState(): State {
  return state
}

export function setState(patch: Partial<State>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function useStore(): State {
  return useSyncExternalStore(subscribe, getState)
}

// ---------- API ----------

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string) {
    super(code)
    this.status = status
    this.code = code
  }
}

/** JSON call to our API. A 401 anywhere means the session ended: show the login screen. */
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  })
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  if (res.status === 401 && path !== '/api/auth') setState({ status: 'signedOut', user: null })
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'error')
  return data as T
}

// ---------- parsing ----------

/** A saree as the API sends it (dates as strings, fingerprints as base64). */
export interface RawSaree {
  id: string
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
  photos: { id: string; pathname: string; hasEmbedding: boolean; embedding?: string }[]
}

function decodeEmbedding(b64: string): Float32Array {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  return new Float32Array(bytes.buffer)
}

export function parseSaree(raw: RawSaree): Saree {
  const previous = state.sarees.find((s) => s.id === raw.id)
  return {
    ...raw,
    lastWorn: raw.lastWorn ? new Date(raw.lastWorn) : undefined,
    createdAt: new Date(raw.createdAt),
    updatedAt: new Date(raw.updatedAt),
    photos: raw.photos.map((p): StoredPhoto => ({
      id: p.id,
      pathname: p.pathname,
      hasEmbedding: p.hasEmbedding,
      // Keep a fingerprint we already hold; the server only sends them on request.
      embedding: p.embedding ? decodeEmbedding(p.embedding) : previous?.photos.find((q) => q.id === p.id)?.embedding,
    })),
  }
}

// ---------- loading ----------

interface DataResponse {
  user: User
  locations: Location[]
  sarees: RawSaree[]
}

export async function loadAll(withEmbeddings = state.embeddingsLoaded): Promise<void> {
  try {
    const data = await api<DataResponse>(`/api/data${withEmbeddings ? '?embeddings=1' : ''}`)
    setState({
      status: 'ready',
      user: data.user,
      locations: data.locations,
      sarees: data.sarees.map(parseSaree),
      embeddingsLoaded: withEmbeddings,
    })
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return // already showing the login screen
    setState({ status: 'offline' })
  }
}

export async function login(username: string, password: string): Promise<void> {
  await api('/api/auth', { action: 'login', username, password })
  setState({ status: 'loading' })
  await loadAll()
}

export async function logout(): Promise<void> {
  await api('/api/auth', { action: 'logout' }).catch(() => undefined)
  setState({ status: 'signedOut', user: null, sarees: [], locations: [], embeddingsLoaded: false })
}

// ---------- local patches after a successful API call ----------

const byUpdated = (a: Saree, b: Saree) => b.updatedAt.getTime() - a.updatedAt.getTime()

export function upsertSaree(s: Saree) {
  setState({ sarees: [s, ...state.sarees.filter((x) => x.id !== s.id)].sort(byUpdated) })
}

export function removeSaree(id: string) {
  setState({ sarees: state.sarees.filter((x) => x.id !== id) })
}

export function upsertLocation(l: Location) {
  const exists = state.locations.some((x) => x.id === l.id)
  setState({ locations: exists ? state.locations.map((x) => (x.id === l.id ? l : x)) : [...state.locations, l] })
}

export function removeLocation(id: string) {
  setState({ locations: state.locations.filter((x) => x.id !== id) })
}

export function setPhotoEmbeddingLocal(sareeId: string, photoId: string, embedding: Float32Array) {
  setState({
    sarees: state.sarees.map((s) =>
      s.id !== sareeId
        ? s
        : { ...s, photos: s.photos.map((p) => (p.id === photoId ? { ...p, embedding, hasEmbedding: true } : p)) },
    ),
  })
}

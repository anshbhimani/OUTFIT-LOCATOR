// Photo-AI manager: opt-in download, background "learning" of every saree photo, and text
// queries. One instance for the whole app; React reads it through usePhotoAi().
import { useSyncExternalStore } from 'react'
import { setPhotoEmbedding } from '../data'
import { getState as getData, loadAll, subscribe as subscribeData } from '../store'
import { photoUrl, type Saree } from '../types'
import type { WorkerRequest, WorkerResponse } from './worker'

export type AiStatus = 'off' | 'loading' | 'ready' | 'error'

export interface AiState {
  status: AiStatus
  /** Download progress 0–100 while loading. */
  progress: number
  /** Sarees whose photos the AI has learned (by any family phone), out of all sarees with photos. */
  learned: number
  total: number
}

const FLAG = 'photoAi'
/** Shown to the user before downloading; keep in sync with the model files in worker.ts. */
export const DOWNLOAD_MB = 90

let state: AiState = { status: 'off', progress: 0, learned: 0, total: 0 }
const listeners = new Set<() => void>()
const setState = (patch: Partial<AiState>) => {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, { resolve: (v?: Float32Array) => void; reject: (e: Error) => void }>()
let unwatch: (() => void) | null = null
let indexing = false
const textCache = new Map<string, Float32Array>()

// Omit over each member of the union (plain Omit would merge the request shapes).
type Request = WorkerRequest extends infer R ? (R extends unknown ? Omit<R, 'id'> : never) : never

function call(req: Request): Promise<Float32Array | undefined> {
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    worker!.postMessage({ ...req, id })
  })
}

function startWorker() {
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
    const msg = e.data
    if ('type' in msg) {
      if (state.status === 'loading') setState({ progress: Math.min(99, Math.round((msg.loaded / msg.total) * 100)) })
      return
    }
    const p = pending.get(msg.id)
    if (!p) return
    pending.delete(msg.id)
    if (msg.ok) p.resolve(msg.vec)
    else p.reject(new Error(msg.error))
  }
}

async function start() {
  if (state.status === 'loading' || state.status === 'ready') return
  setState({ status: 'loading', progress: 0 })
  if (!worker) startWorker()
  try {
    await call({ type: 'load' })
    setState({ status: 'ready', progress: 100 })
    await watchIndex()
  } catch {
    setState({ status: 'error' })
  }
}

const unlearned = (s: Saree) => s.photos.some((p) => !p.hasEmbedding && !failed.has(p.id))

/** Learn whenever sarees without fingerprints appear (new, edited, or restored from backup). */
async function watchIndex() {
  // Fingerprints are stored in the cloud; fetch them once so search can compare against them.
  if (!getData().embeddingsLoaded) await loadAll(true)
  const update = () => {
    const withPhotos = getData().sarees.filter((s) => s.photos.length > 0)
    const todo = withPhotos.filter(unlearned).length
    setState({ total: withPhotos.length, learned: withPhotos.length - todo })
    if (todo) void learn()
  }
  unwatch?.()
  unwatch = subscribeData(update)
  update()
}

/** Photos that couldn't be processed this session (skipped instead of retried forever). */
const failed = new Set<string>()

/** Learning pauses until this time, so it doesn't compete with Mom adding sarees (D23). */
let quietUntil = 0
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Learns sarees one at a time until none are left, including ones added while it runs. */
async function learn() {
  if (indexing) return
  indexing = true
  try {
    while (state.status === 'ready') {
      while (Date.now() < quietUntil) await sleep(quietUntil - Date.now())
      const saree = getData().sarees.find(unlearned)
      if (!saree) break
      const photo = saree.photos.find((p) => !p.hasEmbedding && !failed.has(p.id))!
      try {
        const res = await fetch(photoUrl(photo.pathname), { credentials: 'same-origin' })
        if (!res.ok) throw new Error(`photo ${res.status}`)
        const vec = (await call({ type: 'image', blob: await res.blob() }))!
        // Saved per photo (photos never change content), shared with the whole family.
        await setPhotoEmbedding(saree.id, photo.id, vec)
      } catch {
        failed.add(photo.id)
      }
    }
  } finally {
    indexing = false
  }
}

export const photoAi = {
  /** Postpone background learning while Mom is busy (adding photos, saving). */
  holdOff(ms: number) {
    quietUntil = Math.max(quietUntil, Date.now() + ms)
  },

  enable() {
    try {
      localStorage.setItem(FLAG, 'on')
    } catch {
      // still works for this session
    }
    void start()
  },

  /** Called on app start: reloads the model from the browser cache (offline OK) if it was turned on. */
  resume() {
    try {
      if (localStorage.getItem(FLAG) === 'on') void start()
    } catch {
      // storage blocked: stays off
    }
  },

  async disable() {
    try {
      localStorage.removeItem(FLAG)
    } catch {
      // ignore
    }
    unwatch?.()
    unwatch = null
    worker?.terminate()
    worker = null
    pending.clear()
    textCache.clear()
    setState({ status: 'off', progress: 0 })
    await caches.delete('transformers-cache').catch(() => undefined)
  },

  async embedText(text: string): Promise<Float32Array | null> {
    if (state.status !== 'ready') return null
    const cached = textCache.get(text)
    if (cached) return cached
    const vec = await call({ type: 'text', text }).catch(() => undefined)
    if (!vec) return null
    textCache.set(text, vec)
    return vec
  },
}

export function usePhotoAi(): AiState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

/** Best photo similarity per saree (cosine; vectors are pre-normalised). */
export function photoSimilarities(query: Float32Array, sarees: Saree[]): Map<string, number> {
  const sims = new Map<string, number>()
  for (const s of sarees) {
    let best = -2
    for (const p of s.photos) {
      const v = p.embedding
      if (!v) continue
      let d = 0
      for (let i = 0; i < v.length; i++) d += v[i] * query[i]
      best = Math.max(best, d)
    }
    if (best > -2) sims.set(s.id, best)
  }
  return sims
}

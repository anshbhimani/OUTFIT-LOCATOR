// Photo-AI manager: opt-in download, background "learning" of every saree photo, and text
// queries. One instance for the whole app; React reads it through usePhotoAi().
import { liveQuery } from 'dexie'
import { useSyncExternalStore } from 'react'
import { db } from '../db'
import type { WorkerRequest, WorkerResponse } from './worker'

export type AiStatus = 'off' | 'loading' | 'ready' | 'error'

export interface AiState {
  status: AiStatus
  /** Download progress 0–100 while loading. */
  progress: number
  /** Sarees with photos that the AI has learned, out of all sarees with photos. */
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
let indexSub: { unsubscribe(): void } | null = null
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
    watchIndex()
  } catch {
    setState({ status: 'error' })
  }
}

/** Re-learn whenever sarees without fingerprints appear (new, edited, or restored from backup). */
function watchIndex() {
  indexSub?.unsubscribe()
  indexSub = liveQuery(async () => {
    const withPhotos = await db.sarees.filter((s) => s.photos.length > 0).toArray()
    return {
      total: withPhotos.length,
      todo: withPhotos.filter((s) => !s.imageEmbeddings).map((s) => s.id),
    }
  }).subscribe(({ total, todo }) => {
    setState({ total, learned: total - todo.length })
    if (todo.length) void learn()
  })
}

/** Sarees whose photos couldn't be processed this session (skipped instead of retried forever). */
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
      const saree = await db.sarees
        .filter((s) => s.photos.length > 0 && !s.imageEmbeddings && !failed.has(s.id))
        .first()
      if (!saree) break
      try {
        const vecs: Float32Array[] = []
        for (const photo of saree.photos) vecs.push((await call({ type: 'image', blob: photo }))!)
        // Only save if the saree wasn't edited while we were working on it.
        await db.transaction('rw', db.sarees, async () => {
          const now = await db.sarees.get(saree.id)
          if (now && now.updatedAt.getTime() === saree.updatedAt.getTime()) {
            await db.sarees.update(saree.id, { imageEmbeddings: vecs })
          }
        })
      } catch {
        failed.add(saree.id)
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
    indexSub?.unsubscribe()
    indexSub = null
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
export function photoSimilarities(
  query: Float32Array,
  sarees: { id: string; imageEmbeddings?: Float32Array[] }[],
): Map<string, number> {
  const sims = new Map<string, number>()
  for (const s of sarees) {
    if (!s.imageEmbeddings?.length) continue
    let best = -1
    for (const v of s.imageEmbeddings) {
      let d = 0
      for (let i = 0; i < v.length; i++) d += v[i] * query[i]
      best = Math.max(best, d)
    }
    sims.set(s.id, best)
  }
  return sims
}

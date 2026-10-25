// Runs the photo-AI model (MobileCLIP-S0) off the main thread so the UI never freezes.
// Files are downloaded once from Hugging Face and kept in the browser cache (works offline after).
import {
  AutoProcessor,
  AutoTokenizer,
  CLIPTextModelWithProjection,
  CLIPVisionModelWithProjection,
  env,
  RawImage,
  type PreTrainedModel,
  type PreTrainedTokenizer,
  type Processor,
} from '@huggingface/transformers'

env.allowLocalModels = false

const MODEL = 'Xenova/mobileclip_s0'
// Measured on labelled saree photos (CLAUDE.md D22): the 8-bit vision model is near-random,
// the full-precision one finds the right saree in the top 3 for 13/16 queries.
const VISION_DTYPE = 'fp32'
const TEXT_DTYPE = 'q8'

export type WorkerRequest =
  | { id: number; type: 'load' }
  | { id: number; type: 'image'; blob: Blob }
  | { id: number; type: 'text'; text: string }

export type WorkerResponse =
  | { id: number; ok: true; vec?: Float32Array }
  | { id: number; ok: false; error: string }
  | { type: 'progress'; loaded: number; total: number }

interface Models {
  tokenizer: PreTrainedTokenizer
  processor: Processor
  text: PreTrainedModel
  vision: PreTrainedModel
}

let models: Promise<Models> | null = null
const fileProgress = new Map<string, { loaded: number; total: number }>()

const post = (msg: WorkerResponse) => (self as unknown as Worker).postMessage(msg)

function onProgress(p: { status: string; file?: string; loaded?: number; total?: number }) {
  if (p.status !== 'progress' || !p.file || !p.total) return
  fileProgress.set(p.file, { loaded: p.loaded ?? 0, total: p.total })
  let loaded = 0
  let total = 0
  for (const f of fileProgress.values()) {
    loaded += f.loaded
    total += f.total
  }
  post({ type: 'progress', loaded, total })
}

function load(): Promise<Models> {
  models ??= (async () => {
    const opts = { progress_callback: onProgress }
    const [tokenizer, processor, text, vision] = await Promise.all([
      AutoTokenizer.from_pretrained(MODEL, opts),
      AutoProcessor.from_pretrained(MODEL, opts),
      CLIPTextModelWithProjection.from_pretrained(MODEL, { ...opts, dtype: TEXT_DTYPE }),
      CLIPVisionModelWithProjection.from_pretrained(MODEL, { ...opts, dtype: VISION_DTYPE }),
    ])
    return { tokenizer, processor, text, vision }
  })().catch((e) => {
    models = null // allow a retry after a failed download
    throw e
  })
  return models
}

function normalized(data: ArrayLike<number>): Float32Array {
  const v = Float32Array.from(data)
  const n = Math.hypot(...v) || 1
  for (let i = 0; i < v.length; i++) v[i] /= n
  return v
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data
  try {
    const m = await load()
    if (req.type === 'load') return post({ id: req.id, ok: true })
    if (req.type === 'image') {
      const image = await RawImage.fromBlob(req.blob)
      const { image_embeds } = await m.vision(await m.processor(image))
      return post({ id: req.id, ok: true, vec: normalized(image_embeds.data) })
    }
    const inputs = m.tokenizer([req.text], { padding: 'max_length', truncation: true })
    const { text_embeds } = await m.text(inputs)
    post({ id: req.id, ok: true, vec: normalized(text_embeds.data) })
  } catch (err) {
    post({ id: req.id, ok: false, error: String(err) })
  }
}

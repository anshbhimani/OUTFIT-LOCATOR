// AI-tag sarees from their photo: colours + design (and fabric when it's visually distinctive),
// so untagged sarees get recognisable bilingual names and become searchable by word.
// It also stores each photo's fingerprint, so smart photo search works without phone-side learning.
//   npm run ai-tag -- [--dry-run] [--all]
//   (default: only sarees with no tags and no name; --all re-tags every saree)
// Uses the same model as the app (MobileCLIP-S0: text q8, vision fp32), so fingerprints match.
import { get } from '@vercel/blob'
import {
  AutoProcessor,
  AutoTokenizer,
  CLIPTextModelWithProjection,
  CLIPVisionModelWithProjection,
  RawImage,
} from '@huggingface/transformers'
import { pathToFileURL } from 'node:url'
import { ensureSchema, getSql } from '../api/_lib/db.js'

const MODEL = 'Xenova/mobileclip_s0'

// Keys must match src/vocab.ts. Prompts describe what CLIP can actually see.
const COLORS: Record<string, string> = {
  red: 'red', maroon: 'maroon', pink: 'pink', orange: 'orange', yellow: 'yellow', green: 'green',
  blue: 'blue', purple: 'purple', black: 'black', white: 'white', cream: 'cream', gold: 'golden',
  silver: 'silver', brown: 'brown', grey: 'grey',
}
// One combined list of looks. Measured on labelled saree photos: design guesses are only reliable
// when the model is confident (≥ 0.55: 4/4 correct; below that, mostly wrong), so most sarees
// get no design tag. 'butti' and 'brocade' aren't app tags; they exist so those looks don't get
// forced into a wrong tag.
const LOOKS: Record<string, { prompt: string; tag?: { pattern?: string; fabric?: string } }> = {
  zari: { prompt: 'a saree with a wide shiny gold border', tag: { pattern: 'zari-border' } },
  floral: { prompt: 'a saree with a flower border', tag: { pattern: 'floral' } },
  print: { prompt: 'a saree with an all-over printed pattern', tag: { pattern: 'print' } },
  checks: { prompt: 'a saree with a checkered grid pattern', tag: { pattern: 'checks' } },
  stripes: { prompt: 'a saree with stripes', tag: { pattern: 'stripes' } },
  peacock: { prompt: 'a saree with peacock designs', tag: { pattern: 'peacock' } },
  plain: { prompt: 'a plain single colour saree', tag: { pattern: 'plain' } },
  bandhani: { prompt: 'a bandhani saree covered in tiny tie-dye dots', tag: { fabric: 'bandhani' } },
  patola: { prompt: 'a patola saree with a geometric ikat pattern of elephants and birds', tag: { fabric: 'patola' } },
  butti: { prompt: 'a saree with small gold motifs scattered all over' },
  brocade: { prompt: 'a heavy gold brocade saree' },
}

// Decision thresholds, calibrated on labelled saree photos (see CLAUDE.md D25).
const SECOND_COLOR_MIN = 0.25 // second colour shown if its probability is at least this
const LOOK_MIN = 0.55

export interface Tags {
  colors: string[]
  pattern?: string
  fabric?: string
  embedding: Float32Array
}

const normalized = (data: ArrayLike<number>) => {
  const v = Float32Array.from(data)
  const n = Math.hypot(...v) || 1
  return v.map((x) => x / n)
}
const dot = (a: Float32Array, b: Float32Array) => a.reduce((s, x, i) => s + x * b[i], 0)
function softmax(sims: number[], scale = 100) {
  const m = Math.max(...sims)
  const e = sims.map((s) => Math.exp((s - m) * scale))
  const sum = e.reduce((a, b) => a + b, 0)
  return e.map((x) => x / sum)
}

export async function loadTagger() {
  const [tokenizer, processor, text, vision] = await Promise.all([
    AutoTokenizer.from_pretrained(MODEL),
    AutoProcessor.from_pretrained(MODEL),
    CLIPTextModelWithProjection.from_pretrained(MODEL, { dtype: 'q8' }),
    CLIPVisionModelWithProjection.from_pretrained(MODEL, { dtype: 'fp32' }),
  ])
  const embedText = async (prompts: string[]) => {
    const { text_embeds } = await text(tokenizer(prompts, { padding: 'max_length', truncation: true }))
    const dim = text_embeds.dims[1]
    return prompts.map((_, i) => normalized(text_embeds.data.slice(i * dim, (i + 1) * dim)))
  }
  const colorKeys = Object.keys(COLORS)
  const lookKeys = Object.keys(LOOKS)
  const colorVecs = await embedText(colorKeys.map((k) => `a photo of a ${COLORS[k]} saree`))
  const lookVecs = await embedText(lookKeys.map((k) => LOOKS[k].prompt))

  return async function tag(image: Blob): Promise<Tags> {
    const { image_embeds } = await vision(await processor(await RawImage.fromBlob(image)))
    const v = normalized(image_embeds.data)
    const cp = softmax(colorVecs.map((t) => dot(v, t)))
    const order = cp.map((p, i) => [p, i]).sort((a, b) => b[0] - a[0])
    const colors = [colorKeys[order[0][1]]]
    if (order[1][0] >= SECOND_COLOR_MIN) colors.push(colorKeys[order[1][1]])
    const lp = softmax(lookVecs.map((t) => dot(v, t)))
    const li = lp.indexOf(Math.max(...lp))
    const look = lp[li] >= LOOK_MIN ? LOOKS[lookKeys[li]].tag : undefined
    return { colors, pattern: look?.pattern, fabric: look?.fabric, embedding: v }
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const all = process.argv.includes('--all')
  await ensureSchema()
  const sql = getSql()
  const rows = await sql`
    SELECT s.id, s.title, s.colors, s.fabric, s.pattern, p.id AS photo_id, p.pathname
    FROM sarees s JOIN photos p ON p.saree_id = s.id AND p.position = 0
    ORDER BY s.created_at`
  const todo = all ? rows : rows.filter((r) => !r.title && r.colors.length === 0 && !r.fabric && !r.pattern)
  console.log(`${rows.length} sarees with photos, ${todo.length} to tag${dryRun ? ' (dry run: nothing saved)' : ''}`)
  const tag = await loadTagger()
  let n = 0
  for (const r of todo) {
    const blob = await get(r.pathname, { access: 'private' })
    if (!blob || blob.statusCode !== 200) {
      console.error(`  ✗ photo missing for ${r.id}`)
      continue
    }
    const t = await tag(new Blob([await new Response(blob.stream).arrayBuffer()], { type: 'image/jpeg' }))
    const label = [t.colors.join(' & '), t.pattern, t.fabric].filter(Boolean).join(' · ')
    if (!dryRun) {
      await sql.transaction([
        sql`UPDATE sarees SET colors = ${t.colors}, pattern = ${t.pattern ?? null}, fabric = ${t.fabric ?? null} WHERE id = ${r.id}`,
        sql`UPDATE photos SET embedding = ${Array.from(t.embedding)} WHERE id = ${r.photo_id}`,
      ])
    }
    console.log(`  ${++n}/${todo.length} ${label}`)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main()

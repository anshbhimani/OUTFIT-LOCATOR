// On-device saree search: synonyms (EN / GU / Latin-typed GU), spelling tolerance, Gujarati↔Latin
// matching, related colours, and place names. Pure functions, so it can be unit-tested in Node.
import { COLORS, FABRICS, OCCASIONS, PATTERNS, type Term } from '../vocab'
import { ALIASES, GU_SUFFIXES, NEIGHBOURS, PHOTO_WORDS, PHRASES, STOP_WORDS, WORD_GROUPS, type Facet } from './lexicon'
import { hasGujarati, phonetic, skeleton } from './translit'

export interface SearchItem {
  id: string
  title?: string
  notes?: string
  colors: string[]
  fabric?: string
  pattern?: string
  occasion?: string
  placeNames: string[]
  updatedAt: number
}

export interface Understood {
  facet: Facet
  key: string
}

export interface SearchResult {
  /** Every search word matched well. */
  best: string[]
  /** Some words matched, or matched only loosely (e.g. a related colour). */
  more: string[]
  /** Tags recognised in the query, shown back to the user as "searching for…". */
  understood: Understood[]
}

// ---------- weights ----------
const W_FACET = 3
const W_NEIGHBOUR = 1.2
const W_TITLE = 2.5
const W_PLACE = 2
const W_LABEL = 2
const W_NOTES = 1.5
/** A word counts as a strong match at or above this score. */
const STRONG = 1.5

// ---------- vocabulary lookup ----------
const FACET_TERMS: Record<Facet, Term[]> = { color: COLORS, fabric: FABRICS, pattern: PATTERNS, occasion: OCCASIONS }
const exactAlias = new Map<string, Understood>()
const phoneticAlias = new Map<string, Understood>()

for (const facet of Object.keys(FACET_TERMS) as Facet[]) {
  for (const term of FACET_TERMS[facet]) {
    const u = { facet, key: term.key }
    const spellings = [term.key, term.en, term.gu, ...(ALIASES[facet][term.key] ?? [])]
    for (const s of spellings) {
      const n = normalize(s)
      if (n.includes(' ')) continue // multi-word labels are handled by PHRASES
      exactAlias.set(n, u)
      const p = phonetic(n)
      if (p.length >= 3 && !phoneticAlias.has(p)) phoneticAlias.set(p, u)
    }
  }
}

const groupOf = new Map<string, string[]>()
for (const group of WORD_GROUPS) {
  for (const w of group) groupOf.set(phonetic(normalize(w)), group)
}

function lookupAlias(word: string): Understood | undefined {
  const exact = exactAlias.get(word)
  if (exact) return exact
  const p = phonetic(word)
  if (p.length < 3) return undefined
  const byPhonetic = phoneticAlias.get(p)
  if (byPhonetic) return byPhonetic
  if (p.length < 5) return undefined
  // Typos in longer words: "kanjivram" → kanjivaram.
  for (const [alias, u] of phoneticAlias) if (alias.length >= 5 && levenshtein(p, alias, 1) <= 1) return u
  return undefined
}

// ---------- text processing ----------
function normalize(s: string): string {
  return s.normalize('NFC').toLowerCase().trim()
}

/** `keepParts`: also emit the parts of a joined key, so a saree labelled "Zari border" matches "border". */
function words(text: string, keepParts = false): string[] {
  let s = ` ${normalize(text)} `
  for (const [phrase, key] of PHRASES) s = s.replaceAll(` ${phrase} `, ` ${key} `)
  return s
    .split(/[^\p{L}\p{M}\p{N}-]+/u)
    .flatMap((w) => {
      if (!w.includes('-')) return [w]
      if (!exactAlias.has(w)) return w.split('-')
      return keepParts ? [w, ...w.split('-')] : [w]
    })
    .filter(Boolean)
}

/** The word itself plus, for Gujarati, the form without a glued-on postposition. */
function variants(word: string): string[] {
  if (!hasGujarati(word)) return [word]
  for (const suffix of GU_SUFFIXES) {
    if (word.endsWith(suffix) && [...word].length - [...suffix].length >= 2) return [word, word.slice(0, -suffix.length)]
  }
  return [word]
}

interface Word {
  raw: string
  key: string
  skel: string
  stem: string
}

/**
 * Gujarati endings change with gender and case: માળિયું → માળિયા-માં, પીળો / પીળી / પીળું.
 * Dropping the final vowel (and nasal) from the phonetic key lets these forms meet.
 */
const stemOf = (key: string) => key.replace(/[aeiou]+n?$/, '')

function toWord(raw: string): Word {
  const key = phonetic(raw)
  return { raw, key, skel: skeleton(key), stem: stemOf(key) }
}

function toWords(text: string | undefined): Word[] {
  if (!text) return []
  return words(text, true)
    .filter((w) => !STOP_WORDS.has(w))
    .flatMap(variants)
    .map(toWord)
}

// ---------- index ----------
interface Doc {
  item: SearchItem
  facets: Record<Facet, Set<string>>
  /** Tags implied by words in the notes or name ("lal bandhani from Mami"). */
  impliedFacets: Set<string>
  title: Word[]
  place: Word[]
  labels: Word[]
  notes: Word[]
}

export type SearchIndex = Doc[]

export function buildIndex(items: SearchItem[]): SearchIndex {
  return items.map((item) => {
    const tagKeys = [...item.colors, item.fabric, item.pattern, item.occasion].filter((k): k is string => !!k)
    const labelText = tagKeys
      .flatMap((k) => Object.values(FACET_TERMS).flat().filter((t) => t.key === k))
      .map((t) => `${t.en} ${t.gu}`)
      .join(' ')
    const notes = toWords(item.notes)
    const title = toWords(item.title)
    const impliedFacets = new Set<string>()
    for (const w of [...notes, ...title]) {
      const u = lookupAlias(w.raw)
      if (u) impliedFacets.add(u.key)
    }
    return {
      item,
      facets: {
        color: new Set(item.colors),
        fabric: new Set(item.fabric ? [item.fabric] : []),
        pattern: new Set(item.pattern ? [item.pattern] : []),
        occasion: new Set(item.occasion ? [item.occasion] : []),
      },
      impliedFacets,
      title,
      place: toWords(item.placeNames.join(' ')),
      labels: toWords(labelText),
      notes,
    }
  })
}

// ---------- matching ----------
interface QueryWord {
  variants: Word[]
  facet?: Understood
}

function parseQuery(query: string): QueryWord[] {
  return words(query)
    .filter((w) => !STOP_WORDS.has(w))
    .map((w) => {
      const vs = variants(w)
      let facet: Understood | undefined
      for (const v of vs) facet ??= lookupAlias(v)
      const group = vs.map((v) => groupOf.get(phonetic(v))).find(Boolean) ?? []
      return {
        facet,
        variants: [...new Set([...vs, ...group.map(normalize)])].map(toWord),
      }
    })
}

/** 1 = same word, 0.75 = prefix or same stem, 0.6 = same consonants or one typo, 0 = no match. */
function wordMatch(q: Word, w: Word): number {
  if (q.raw === w.raw || q.key === w.key) return 1
  if (q.stem.length >= 3 && q.stem === w.stem) return 0.75
  if (q.raw.length >= 3 && (w.raw.startsWith(q.raw) || (q.key.length >= 3 && w.key.startsWith(q.key)))) return 0.75
  if (q.skel.length >= 3 && q.skel === w.skel) return 0.6
  if (q.key.length >= 5 && levenshtein(q.key, w.key, 2) <= (q.key.length >= 8 ? 2 : 1)) return 0.6
  return 0
}

function fieldScore(q: QueryWord, field: Word[], weight: number): number {
  let best = 0
  for (const v of q.variants) for (const w of field) best = Math.max(best, wordMatch(v, w))
  return best * weight
}

function scoreWord(q: QueryWord, d: Doc): number {
  let best = 0
  if (q.facet) {
    const { facet, key } = q.facet
    if (d.facets[facet].has(key)) best = W_FACET
    else if (d.impliedFacets.has(key)) best = W_NOTES
    else if (facet === 'color' && NEIGHBOURS[key]?.some((n) => d.facets.color.has(n))) best = W_NEIGHBOUR
  }
  return Math.max(
    best,
    fieldScore(q, d.title, W_TITLE),
    fieldScore(q, d.place, W_PLACE),
    fieldScore(q, d.labels, W_LABEL),
    fieldScore(q, d.notes, W_NOTES),
  )
}

export function search(index: SearchIndex, query: string): SearchResult {
  const qWords = parseQuery(query)
  const understood = dedupe(qWords.flatMap((q) => (q.facet ? [q.facet] : [])))
  const byRecent = (a: Doc, b: Doc) => b.item.updatedAt - a.item.updatedAt

  if (qWords.length === 0) return { best: [...index].sort(byRecent).map((d) => d.item.id), more: [], understood }

  const scored = index
    .map((d) => {
      const perWord = qWords.map((q) => scoreWord(q, d))
      return {
        d,
        score: perWord.reduce((a, b) => a + b, 0),
        strong: perWord.filter((s) => s >= STRONG).length,
        matched: perWord.filter((s) => s > 0).length,
      }
    })
    .filter((r) => r.matched > 0)
    .sort((a, b) => b.strong - a.strong || b.matched - a.matched || b.score - a.score || byRecent(a.d, b.d))

  const best = scored.filter((r) => r.strong === qWords.length).map((r) => r.d.item.id)
  const more = scored.filter((r) => r.strong < qWords.length).map((r) => r.d.item.id)
  return { best, more, understood }
}

// ---------- photo AI ----------
const photoWord = new Map(Object.entries(PHOTO_WORDS).map(([k, v]) => [phonetic(normalize(k)), v]))
const englishLabel = (u: Understood) => FACET_TERMS[u.facet].find((t) => t.key === u.key)?.en ?? u.key

/**
 * The English phrase to send to the photo model, or null if nothing in the query describes
 * how a saree looks. Tags and motif words are translated; place, relation and other
 * Gujarati words are dropped (CLIP only understands English, and places aren't visible).
 */
export function photoPrompt(index: SearchIndex, query: string): string | null {
  const placeKeys = new Set(index.flatMap((d) => d.place.map((w) => w.key)))
  const parts: string[] = []
  for (const q of parseQuery(query)) {
    if (q.facet) {
      parts.push(englishLabel(q.facet).toLowerCase())
      continue
    }
    const raw = q.variants[0].raw
    const motif = q.variants.map((v) => photoWord.get(v.key)).find(Boolean)
    if (motif) parts.push(motif)
    else if (!hasGujarati(raw) && !groupOf.has(q.variants[0].key) && !placeKeys.has(q.variants[0].key)) parts.push(raw)
  }
  return parts.length ? parts.join(' ') : null
}

/** Photo-similarity rules, calibrated on labelled saree photos (see CLAUDE.md D22). */
const PHOTO_MIN_Z = 1.2
const PHOTO_NEAR_TOP = 1.0
const PHOTO_MAX = 4
const PHOTO_MIN_SAREES = 5

export interface SearchResultWithPhotos extends SearchResult {
  /** Not found by words, but whose photo clearly matches the description. */
  photo: string[]
}

/**
 * Adds photo-AI matches to a word-search result. `sims` holds each saree's best photo
 * similarity to the query (sarees without photo embeddings are simply absent).
 */
export function withPhotoMatches(result: SearchResult, sims: Map<string, number> | null): SearchResultWithPhotos {
  if (!sims || sims.size < PHOTO_MIN_SAREES) return { ...result, photo: [] }
  const values = [...sims.values()]
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length) || 1
  const z = (id: string) => ((sims.get(id) ?? mean) - mean) / sd
  const ranked = [...sims.keys()].sort((a, b) => z(b) - z(a))
  const topZ = z(ranked[0])
  const strong = ranked.filter((id) => z(id) >= PHOTO_MIN_Z && z(id) >= topZ - PHOTO_NEAR_TOP).slice(0, PHOTO_MAX)
  const inBest = new Set(result.best)
  const photo = strong.filter((id) => !inBest.has(id))
  const photoSet = new Set(photo)
  // Within the word matches, the photo decides the order ("red saree with gold border": the
  // red one that visibly has a gold border comes first).
  const best = [...result.best].sort((a, b) => z(b) - z(a))
  return { ...result, best, photo, more: result.more.filter((id) => !photoSet.has(id)) }
}

// ---------- helpers ----------
function dedupe(list: Understood[]): Understood[] {
  const seen = new Set<string>()
  return list.filter((u) => !seen.has(u.key) && seen.add(u.key))
}

/** Levenshtein distance, giving up early once it exceeds `max`. */
function levenshtein(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      rowMin = Math.min(rowMin, cur[j])
    }
    if (rowMin > max) return max + 1
    prev = cur
  }
  return prev[b.length]
}

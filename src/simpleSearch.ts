// Interim Phase 1 search: every word of the query must appear somewhere in the saree's text.
// Phase 2 replaces this with hybrid keyword + semantic search (PLAN.md §5).
import type { Location, Saree } from './db'
import { pathText } from './data'
import { termAllLabels } from './vocab'

const STOP_WORDS = new Set(['saree', 'sari', 'sarees', 'saris', 'the', 'a', 'an', 'with', 'in', 'my', 'one', 'સાડી', 'સાડીઓ', 'વાળી'])

const normalize = (s: string) => s.normalize('NFC').toLowerCase()

export function sareeText(s: Saree, byId: Map<string, Location>): string {
  return [
    s.title,
    s.notes,
    ...s.colors.map(termAllLabels),
    termAllLabels(s.fabric),
    termAllLabels(s.pattern),
    termAllLabels(s.occasion),
    pathText(s.locationId, byId),
  ]
    .filter(Boolean)
    .join(' ')
}

export function simpleSearch(query: string, sarees: Saree[], byId: Map<string, Location>): Saree[] {
  const words = normalize(query)
    .split(/[\s,.]+/)
    .filter((w) => w && !STOP_WORDS.has(w))
  if (words.length === 0) return sarees
  return sarees.filter((s) => {
    const hay = normalize(sareeText(s, byId))
    return words.every((w) => hay.includes(w))
  })
}

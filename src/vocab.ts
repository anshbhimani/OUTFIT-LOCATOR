// Tag vocabulary. Sarees store the English `key`; labels are shown in the current language.
// Phase 2's synonym dictionary will extend these terms (Gujarati in English letters, etc.).
import type { Saree } from './types'
import type { Lang } from './strings'

export interface Term {
  key: string
  en: string
  gu: string
  swatch?: string
}

export const COLORS: Term[] = [
  { key: 'red', en: 'Red', gu: 'લાલ', swatch: '#c62828' },
  { key: 'maroon', en: 'Maroon', gu: 'મરૂન', swatch: '#6d1b2c' },
  { key: 'pink', en: 'Pink', gu: 'ગુલાબી', swatch: '#e86a9c' },
  { key: 'orange', en: 'Orange', gu: 'કેસરી', swatch: '#ef7d1a' },
  { key: 'yellow', en: 'Yellow', gu: 'પીળો', swatch: '#f2c618' },
  { key: 'green', en: 'Green', gu: 'લીલો', swatch: '#2e7d32' },
  { key: 'blue', en: 'Blue', gu: 'વાદળી', swatch: '#1e5bb8' },
  { key: 'purple', en: 'Purple', gu: 'જાંબલી', swatch: '#6a2c91' },
  { key: 'black', en: 'Black', gu: 'કાળો', swatch: '#111111' },
  { key: 'white', en: 'White', gu: 'સફેદ', swatch: '#ffffff' },
  { key: 'cream', en: 'Cream', gu: 'ક્રીમ', swatch: '#f3e5c0' },
  { key: 'gold', en: 'Gold', gu: 'સોનેરી', swatch: '#d4a017' },
  { key: 'silver', en: 'Silver', gu: 'ચાંદી', swatch: '#b8bcc2' },
  { key: 'brown', en: 'Brown', gu: 'કથ્થઈ', swatch: '#7b4a2a' },
  { key: 'grey', en: 'Grey', gu: 'રાખોડી', swatch: '#808080' },
  { key: 'multicolor', en: 'Multicolour', gu: 'રંગબેરંગી', swatch: 'conic-gradient(red, yellow, green, blue, purple, red)' },
]

export const FABRICS: Term[] = [
  { key: 'silk', en: 'Silk', gu: 'સિલ્ક' },
  { key: 'cotton', en: 'Cotton', gu: 'કોટન' },
  { key: 'georgette', en: 'Georgette', gu: 'જ્યોર્જેટ' },
  { key: 'chiffon', en: 'Chiffon', gu: 'શિફોન' },
  { key: 'banarasi', en: 'Banarasi', gu: 'બનારસી' },
  { key: 'patola', en: 'Patola', gu: 'પટોળા' },
  { key: 'bandhani', en: 'Bandhani', gu: 'બાંધણી' },
  { key: 'kanjivaram', en: 'Kanjivaram', gu: 'કાંજીવરમ' },
  { key: 'linen', en: 'Linen', gu: 'લિનન' },
  { key: 'net', en: 'Net', gu: 'નેટ' },
  { key: 'crepe', en: 'Crepe', gu: 'ક્રેપ' },
  { key: 'synthetic', en: 'Synthetic', gu: 'સિન્થેટિક' },
]

export const PATTERNS: Term[] = [
  { key: 'plain', en: 'Plain', gu: 'સાદી' },
  { key: 'zari-border', en: 'Zari border', gu: 'ઝરી બોર્ડર' },
  { key: 'floral', en: 'Floral', gu: 'ફૂલવાળી' },
  { key: 'print', en: 'Printed', gu: 'પ્રિન્ટ' },
  { key: 'embroidery', en: 'Embroidery', gu: 'ભરતકામ' },
  { key: 'mirror-work', en: 'Mirror work', gu: 'આભલા' },
  { key: 'checks', en: 'Checks', gu: 'ચેક્સ' },
  { key: 'stripes', en: 'Stripes', gu: 'પટ્ટા' },
  { key: 'peacock', en: 'Peacock', gu: 'મોર' },
  { key: 'temple-border', en: 'Temple border', gu: 'ટેમ્પલ બોર્ડર' },
]

export const OCCASIONS: Term[] = [
  { key: 'wedding', en: 'Wedding', gu: 'લગ્ન' },
  { key: 'festive', en: 'Festival', gu: 'તહેવાર' },
  { key: 'party', en: 'Party', gu: 'પાર્ટી' },
  { key: 'daily', en: 'Daily wear', gu: 'રોજિંદી' },
  { key: 'puja', en: 'Puja', gu: 'પૂજા' },
]

const ALL = [...COLORS, ...FABRICS, ...PATTERNS, ...OCCASIONS]
const byKey = new Map(ALL.map((t) => [t.key, t]))

export function termLabel(key: string | undefined, lang: Lang): string {
  if (!key) return ''
  return byKey.get(key)?.[lang] ?? key
}

/** Both-language labels for a key, used by the search haystack. */
export function termAllLabels(key: string | undefined): string {
  if (!key) return ''
  const t = byKey.get(key)
  return t ? `${t.key} ${t.en} ${t.gu}` : key
}

/** Display name: the name in the chosen language, else the other language's, else built from tags. */
export function sareeName(s: Saree, lang: Lang): string {
  const own = lang === 'en' ? s.titleEn : s.title
  const other = lang === 'en' ? s.title : s.titleEn
  if (own || other) return (own || other)!
  const parts = [...s.colors.slice(0, 2).map((c) => termLabel(c, lang)), termLabel(s.fabric, lang)].filter(Boolean)
  return parts.join(' ') || (lang === 'gu' ? 'સાડી' : 'Saree')
}

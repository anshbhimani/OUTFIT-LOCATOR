import { describe, expect, it } from 'vitest'
import { buildIndex, search, type SearchItem } from './engine'
import { phonetic, skeleton, transliterate } from './translit'

// A realistic wardrobe: mixed Gujarati/English place names, as Mom would type them.
const BEDROOM = ['મોટો બેડરૂમ', 'ગોદરેજ કબાટ']
const GUEST = ['Guest room', 'Steel trunk']
const LOFT = ['Kitchen', 'માળિયું']
let t = 0
const s = (id: string, x: Partial<SearchItem> & { placeNames: string[] }): SearchItem => ({
  id,
  colors: [],
  updatedAt: ++t,
  ...x,
})

const SAREES: SearchItem[] = [
  s('s1', { colors: ['red', 'gold'], fabric: 'banarasi', pattern: 'zari-border', occasion: 'wedding', notes: "Wore at Riya's wedding, blouse in same bag", placeNames: [...BEDROOM, 'ઉપરનું ખાનું'] }),
  s('s2', { colors: ['red'], fabric: 'bandhani', occasion: 'festive', title: 'મામીની બાંધણી', placeNames: [...BEDROOM, 'વચ્ચેનું ખાનું'] }),
  s('s3', { colors: ['maroon'], fabric: 'silk', pattern: 'temple-border', placeNames: [...BEDROOM, 'ઉપરનું ખાનું'] }),
  s('s4', { colors: ['green', 'gold'], fabric: 'patola', occasion: 'wedding', title: "Mummy's wedding Patola", placeNames: [...GUEST] }),
  s('s5', { colors: ['yellow'], fabric: 'cotton', pattern: 'floral', occasion: 'daily', placeNames: [...LOFT] }),
  s('s6', { colors: ['pink'], fabric: 'georgette', pattern: 'embroidery', occasion: 'party', placeNames: [...GUEST] }),
  s('s7', { colors: ['blue'], fabric: 'chiffon', pattern: 'print', placeNames: ['Tailor'] }),
  s('s8', { colors: ['white', 'gold'], fabric: 'kanjivaram', pattern: 'zari-border', occasion: 'puja', placeNames: [...BEDROOM, 'નીચેનું ખાનું'] }),
  s('s9', { colors: ['black'], fabric: 'net', pattern: 'mirror-work', occasion: 'party', notes: 'Navratri garba', placeNames: [...LOFT] }),
  s('s10', { colors: ['purple'], fabric: 'crepe', pattern: 'plain', placeNames: ['Dry cleaner'] }),
  s('s11', { colors: ['orange'], fabric: 'cotton', pattern: 'checks', occasion: 'daily', placeNames: [...GUEST] }),
  s('s12', { colors: ['multicolor'], fabric: 'bandhani', occasion: 'festive', notes: 'Kutch trip, ભુજથી લીધી', placeNames: [...BEDROOM, 'વચ્ચેનું ખાનું'] }),
  s('s13', { colors: ['cream', 'gold'], fabric: 'silk', pattern: 'peacock', occasion: 'wedding', placeNames: ['Lent to Bhabhi'] }),
  s('s14', { colors: ['green'], fabric: 'linen', pattern: 'stripes', occasion: 'daily', placeNames: [...LOFT] }),
  s('s15', { colors: ['grey', 'silver'], fabric: 'synthetic', placeNames: ['Suitcase'] }),
  s('s16', { colors: ['brown'], fabric: 'cotton', notes: 'Gift from Nani', placeNames: [...GUEST] }),
  s('s17', { colors: ['blue', 'silver'], fabric: 'silk', pattern: 'zari-border', occasion: 'party', title: 'Anniversary saree', placeNames: [...BEDROOM, 'ઉપરનું ખાનું'] }),
  s('s18', { colors: ['yellow', 'green'], fabric: 'georgette', occasion: 'puja', notes: 'Haldi function', placeNames: ['Tailor'] }),
  s('s19', { colors: [], notes: 'lal bandhani from Jamnagar', placeNames: [...LOFT] }),
  s('s20', { colors: ['red', 'green'], fabric: 'patola', title: 'Nani nu patolu', placeNames: [...BEDROOM, 'નીચેનું ખાનું'] }),
]

const index = buildIndex(SAREES)
const ranked = (q: string) => {
  const r = search(index, q)
  return [...r.best, ...r.more]
}

// [query, ids that are acceptable answers] — pass if any appears in the top 3.
const EVAL: [string, string[]][] = [
  // English
  ['red silk', ['s1', 's3']],
  ['banarasi', ['s1']],
  ['wedding saree', ['s1', 's4', 's13']],
  ['peacock', ['s13']],
  ['mirror work', ['s9']],
  ['saree at the tailor', ['s7', 's18']],
  ['dark red', ['s3']],
  ['off white silk', ['s13']],
  ['riya wedding', ['s1']],
  ['anniversary', ['s17']],
  ['gift from nani', ['s16']],
  // Gujarati script
  ['લાલ બાંધણી', ['s2', 's19']],
  ['પીળી સાડી', ['s5', 's18']],
  ['પટોળું', ['s4', 's20']],
  ['લગ્નની સાડી', ['s1', 's4', 's13']],
  ['બેડરૂમમાં લીલી', ['s20']],
  ['માળિયામાં', ['s5', 's9', 's14', 's19']],
  ['મામીની', ['s2']],
  // Gujarati typed in English letters
  ['lal bandhani', ['s2', 's19']],
  ['pili cotton', ['s5']],
  ['lagan wali', ['s1', 's4', 's13']],
  ['kalo net', ['s9']],
  ['godrej kabat', ['s1', 's2', 's3', 's8', 's12', 's17', 's20']],
  ['bedroom', ['s1', 's2', 's3', 's8', 's12', 's17', 's20']],
  ['upar nu khanu', ['s1', 's3', 's17']],
  ['navratri', ['s9']],
  ['resham', ['s3', 's13', 's17']],
  ['bhabhi', ['s13']],
  // Typos and partial words
  ['banarsi', ['s1']],
  ['bandhni', ['s2', 's12', 's19']],
  ['kanjivram', ['s8']],
  ['jorjet', ['s6', 's18']],
  ['patol', ['s4', 's20']],
  ['anniv', ['s17']],
  // Same meaning across languages (places, relations)
  ['border', ['s1', 's3', 's8', 's17']],
  ['top shelf', ['s1', 's3', 's17']],
  ['loft', ['s5', 's9', 's14', 's19']],
  ['cupboard', ['s1', 's2', 's3', 's8', 's12', 's17', 's20']],
  ['darji', ['s7', 's18']],
  ['ઉધાર', ['s13']],
  ['nani ni bhet', ['s16']],
  // Related colours
  ['maroon silk', ['s3']],
  ['golden zari', ['s1', 's8', 's17']],
]

describe('translit', () => {
  it('maps Gujarati and Latin spellings to the same phonetic key', () => {
    expect(phonetic('લાલ')).toBe(phonetic('laal'))
    expect(phonetic('પીળી')).toBe(phonetic('peeli'))
    expect(skeleton(phonetic('બેડરૂમ'))).toBe(skeleton(phonetic('bedroom')))
    expect(transliterate('કબાટ')).toBe('kabaat')
  })
})

describe('search', () => {
  it('finds the right saree in the top 3 for ≥ 90% of real-style queries', () => {
    const misses = EVAL.filter(([q, want]) => !ranked(q).slice(0, 3).some((id) => want.includes(id)))
    const rate = 1 - misses.length / EVAL.length
    console.log(`top-3 hit rate: ${(rate * 100).toFixed(0)}% (${EVAL.length - misses.length}/${EVAL.length})`)
    for (const [q, want] of misses) console.log(`  miss: "${q}" → got ${ranked(q).slice(0, 3).join(',') || '(none)'}, wanted ${want.join('|')}`)
    expect(rate).toBeGreaterThanOrEqual(0.9)
  })

  it('puts exact matches in "best" and related colours only in "more"', () => {
    const r = search(index, 'maroon')
    expect(r.best).toEqual(['s3'])
    expect(r.more).toEqual(expect.arrayContaining(['s1', 's2']))
  })

  it('does not treat સાડી (saree) as સાદી (plain)', () => {
    expect(search(index, 'સાડી').understood).toEqual([])
    expect(search(index, 'સાદી').understood).toEqual([{ facet: 'pattern', key: 'plain' }])
  })

  it('reports what it understood', () => {
    expect(search(index, 'lal resham lagan').understood.map((u) => u.key)).toEqual(['red', 'silk', 'wedding'])
  })

  it('returns nothing for a colour nobody has, instead of random sarees', () => {
    const r = search(index, 'turquoise')
    expect(r.best).toEqual([])
  })

  it('empty or filler-only queries list everything, newest first', () => {
    expect(search(index, '').best[0]).toBe('s20')
    expect(search(index, 'saree').best).toHaveLength(SAREES.length)
  })

  it('stays fast at 1,000 sarees', () => {
    const big = buildIndex(Array.from({ length: 1000 }, (_, i) => ({ ...SAREES[i % SAREES.length], id: `b${i}` })))
    const start = performance.now()
    for (const [q] of EVAL) search(big, q)
    const perQuery = (performance.now() - start) / EVAL.length
    console.log(`avg query time at 1,000 sarees: ${perQuery.toFixed(1)} ms`)
    expect(perQuery).toBeLessThan(50)
  })
})

// Rough Gujarati → Latin transliteration plus phonetic keys, so "બેડરૂમ" can match "bedroom"
// and "લાલ" can match "laal". Not linguistically exact; built for fuzzy matching only.

const CONSONANTS: Record<string, string> = {
  ક: 'k', ખ: 'kh', ગ: 'g', ઘ: 'gh', ઙ: 'n',
  ચ: 'ch', છ: 'chh', જ: 'j', ઝ: 'jh', ઞ: 'n',
  ટ: 't', ઠ: 'th', ડ: 'd', ઢ: 'dh', ણ: 'n',
  ત: 't', થ: 'th', દ: 'd', ધ: 'dh', ન: 'n',
  પ: 'p', ફ: 'ph', બ: 'b', ભ: 'bh', મ: 'm',
  ય: 'y', ર: 'r', લ: 'l', ળ: 'l', વ: 'v',
  શ: 'sh', ષ: 'sh', સ: 's', હ: 'h',
}
const VOWELS: Record<string, string> = {
  અ: 'a', આ: 'aa', ઇ: 'i', ઈ: 'ii', ઉ: 'u', ઊ: 'uu', ઋ: 'ru',
  એ: 'e', ઐ: 'ai', ઓ: 'o', ઔ: 'au', ઍ: 'e', ઑ: 'o',
}
const MATRAS: Record<string, string> = {
  'ા': 'aa', 'િ': 'i', 'ી': 'ii', 'ુ': 'u', 'ૂ': 'uu', 'ૃ': 'ru',
  'ે': 'e', 'ૈ': 'ai', 'ો': 'o', 'ૌ': 'au', 'ૅ': 'e', 'ૉ': 'o',
}
const VIRAMA = '્'
const SIGNS: Record<string, string> = { 'ં': 'n', 'ઁ': 'n', 'ઃ': 'h', '઼': '' }

const GUJARATI = /[઀-૿]/

export const hasGujarati = (s: string) => GUJARATI.test(s)

export function transliterate(word: string): string {
  let out = ''
  const chars = [...word]
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]
    if (CONSONANTS[c] !== undefined) {
      out += CONSONANTS[c]
      const next = chars[i + 1]
      // Inherent 'a' unless a vowel sign, virama or the end of the word follows (final schwa drops).
      if (next !== undefined && MATRAS[next] === undefined && next !== VIRAMA && SIGNS[next] === undefined) out += 'a'
    } else if (MATRAS[c] !== undefined) out += MATRAS[c]
    else if (VOWELS[c] !== undefined) out += VOWELS[c]
    else if (SIGNS[c] !== undefined) out += SIGNS[c]
    else if (c === VIRAMA) continue
    else if (c >= '૦' && c <= '૯') out += String(c.charCodeAt(0) - 0x0ae6)
    else out += c
  }
  return out
}

/** Spelling-insensitive form: "Laal", "lal" and "લાલ" all become "lal". */
export function phonetic(word: string): string {
  let s = (hasGujarati(word) ? transliterate(word) : word).toLowerCase()
  s = s
    .replace(/ck/g, 'k')
    .replace(/chh|ch/g, 'c')
    .replace(/sh/g, 's')
    .replace(/ph/g, 'f')
    .replace(/([kgjtdb])h/g, '$1')
    .replace(/w/g, 'v')
    .replace(/z/g, 'j')
    .replace(/q/g, 'k')
    .replace(/x/g, 'ks')
    .replace(/ee|ii/g, 'i')
    .replace(/oo|uu/g, 'u')
    .replace(/aa/g, 'a')
    .replace(/(.)\1+/g, '$1')
  // A trailing 'h' after a vowel is usually silent spelling ("almirah", "puja/poojah").
  return s.length > 3 ? s.replace(/([aeiou])h$/, '$1') : s
}

/** Consonant skeleton: "bedroom" and "bedarum" (બેડરૂમ) both become "bdrm". */
export function skeleton(key: string): string {
  return key[0] + key.slice(1).replace(/[aeiouy]/g, '')
}

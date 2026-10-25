// Search vocabulary: synonyms in English, Gujarati script and Gujarati typed in Latin letters.
// Keys are the canonical tag keys from vocab.ts. Vocab labels are added automatically by the
// engine; list only *extra* spellings here. Spelling variants that differ only in vowel length
// or "h" (laal/lal, peela/pila) are already unified by phonetic(), so one spelling is enough.

export type Facet = 'color' | 'fabric' | 'pattern' | 'occasion'

export const ALIASES: Record<Facet, Record<string, string[]>> = {
  color: {
    red: ['lal', 'rato', 'rati', 'રાતો', 'રાતી'],
    maroon: ['marun', 'mehroon', 'wine', 'મરુન'],
    pink: ['gulabi', 'rani'],
    orange: ['kesri', 'kesari', 'kesariya', 'narangi', 'નારંગી', 'saffron'],
    yellow: ['pilo', 'pili', 'pilu', 'pila', 'peela', 'peeli', 'પીળી', 'પીળું', 'haldi'],
    green: ['lilo', 'lili', 'lilu', 'લીલી', 'લીલું', 'hara', 'hari', 'mehendi', 'mehndi', 'parrot'],
    blue: ['vadli', 'vadali', 'nilo', 'nili', 'neela', 'navy', 'aasmani', 'આસમાની', 'firozi'],
    purple: ['jambli', 'jamli', 'jamuni', 'violet', 'lavender', 'ringni', 'રીંગણી'],
    black: ['kalo', 'kali', 'kalu', 'કાળી', 'કાળું'],
    white: ['safed', 'sufed', 'dholo', 'dholi', 'ધોળી', 'ધોળો'],
    cream: ['offwhite', 'beige', 'ivory'],
    gold: ['golden', 'soneri', 'sonari'],
    silver: ['chandi', 'ruperi', 'રૂપેરી'],
    brown: ['kathai', 'badami', 'બદામી', 'coffee', 'chocolate'],
    grey: ['gray', 'rakhodi', 'ash'],
    multicolor: ['multicolour', 'multi', 'rangberangi', 'colourful', 'colorful'],
  },
  fabric: {
    silk: ['resham', 'reshmi', 'રેશમ', 'રેશમી'],
    cotton: ['sutar', 'sutrau', 'સુતરાઉ', 'khadi', 'ખાદી'],
    georgette: ['jorjet', 'georget'],
    chiffon: ['shifon', 'chifon'],
    banarasi: ['banarsi', 'benarasi', 'benarsi', 'varanasi'],
    patola: ['patolu', 'પટોળું', 'પટોળું'],
    bandhani: ['bandhni', 'bandhej', 'bandini', 'bandhini', 'બાંધેજ'],
    kanjivaram: ['kanjeevaram', 'kanchipuram', 'kanchi'],
    linen: [],
    net: [],
    crepe: ['crape', 'krep'],
    synthetic: ['polyester', 'nylon'],
  },
  pattern: {
    plain: [],
    'zari-border': ['zari', 'jari', 'ઝરી', 'જરી'],
    floral: ['flower', 'flowers', 'phool', 'ful', 'phoolwali', 'ફૂલ', 'buti', 'booti'],
    print: ['printed'],
    embroidery: ['embroidered', 'bharat', 'bharatkam', 'ભરત', 'kadhai', 'aari', 'kutchi'],
    'mirror-work': ['mirror', 'mirrorwork', 'abhla', 'sheesha'],
    checks: ['check', 'checked', 'chokdi', 'ચોકડી'],
    stripes: ['striped', 'lines', 'patta', 'pattavali'],
    peacock: ['mor'],
    'temple-border': ['temple', 'mandir'],
  },
  occasion: {
    wedding: ['marriage', 'lagan', 'lagna', 'lagn', 'લગન', 'shaadi', 'shadi', 'vivah', 'bridal', 'reception'],
    festive: ['festival', 'tehvar', 'tahevar', 'navratri', 'નવરાત્રી', 'diwali', 'દિવાળી', 'garba'],
    party: ['function'],
    daily: ['everyday', 'roj', 'rojindi', 'રોજ', 'office'],
    puja: ['pooja', 'katha'],
  },
}

/** Multi-word phrases rewritten to a single key before tokenising. */
export const PHRASES: [string, string][] = [
  ['dark red', 'maroon'],
  ['wine red', 'maroon'],
  ['off white', 'cream'],
  ['sky blue', 'blue'],
  ['parrot green', 'green'],
  ['rani pink', 'pink'],
  ['rang berangi', 'multicolor'],
  ['રંગ બેરંગી', 'multicolor'],
  ['zari border', 'zari-border'],
  ['jari border', 'zari-border'],
  ['ઝરી બોર્ડર', 'zari-border'],
  ['temple border', 'temple-border'],
  ['ટેમ્પલ બોર્ડર', 'temple-border'],
  ['mirror work', 'mirror-work'],
  ['pure silk', 'silk'],
]

/** Colours close enough to show as weaker matches ("maroon" also finds red sarees). */
export const NEIGHBOURS: Record<string, string[]> = {
  red: ['maroon', 'pink', 'orange'],
  maroon: ['red', 'purple', 'brown'],
  pink: ['red', 'purple'],
  orange: ['yellow', 'red'],
  yellow: ['gold', 'orange', 'cream'],
  blue: ['purple'],
  purple: ['blue', 'pink', 'maroon'],
  black: ['grey'],
  white: ['cream', 'silver'],
  cream: ['white', 'yellow', 'gold'],
  gold: ['yellow', 'cream'],
  silver: ['grey', 'white'],
  brown: ['maroon'],
  grey: ['silver', 'black'],
}

/**
 * Words ignored in queries, matched on the exact typed form (not phonetically), because
 * "સાડી" (saree) and "સાદી" (plain) sound the same but mean different things.
 */
export const STOP_WORDS = new Set([
  // English and Latin-typed Gujarati/Hindi
  'saree', 'sarees', 'sari', 'saris', 'sadi', 'saadi', 'sadee', 'the', 'a', 'an', 'with', 'in', 'on', 'at',
  'of', 'for', 'to', 'my', 'mine', 'one', 'ones', 'find', 'show', 'me', 'where', 'is', 'are', 'was', 'kept',
  'which', 'that', 'this', 'i', 'and', 'or', 'all', 'some', 'wore', 'worn', 'wear', 'colour', 'color',
  'wali', 'wala', 'vali', 'vala', 'valu', 'nu', 'ni', 'no', 'na', 'ma', 'mein', 'che', 'chhe', 'kya', 'kyan',
  'kai', 'koi', 'mari', 'maru', 'maro', 'pahereli', 'paheri', 'rang',
  // Gujarati script
  'સાડી', 'સાડીઓ', 'વાળી', 'વાળો', 'વાળું', 'વાળા', 'નું', 'ની', 'નો', 'ના', 'માં', 'છે', 'ક્યાં', 'કઈ',
  'મારી', 'મારું', 'મારો', 'અને', 'એ', 'તે', 'આ', 'જે', 'પહેરેલી', 'પહેરી', 'રંગ', 'રંગની', 'કલર',
])

/** Gujarati postpositions glued to words ("બેડરૂમમાં" = "in the bedroom"). Longest first. */
export const GU_SUFFIXES = ['માંથી', 'વાળી', 'વાળો', 'વાળું', 'વાળા', 'માં', 'નું', 'ની', 'નો', 'ના', 'થી', 'ને', 'ઓ']

/**
 * Everyday words that mean the same thing across languages, mostly for places
 * ("shelf" should find a place Mom named "ઉપરનું ખાનું"). A query word from a group
 * also matches every other word in that group.
 */
export const WORD_GROUPS: string[][] = [
  ['shelf', 'khanu', 'khana', 'ખાનું', 'drawer', 'rack'],
  ['cupboard', 'almirah', 'almari', 'wardrobe', 'kabat', 'કબાટ', 'અલમારી', 'godrej'],
  ['box', 'peti', 'પેટી', 'dabba', 'ડબ્બો'],
  ['trunk', 'patara', 'પટારો'],
  ['loft', 'maliyu', 'માળિયું', 'attic'],
  ['bedroom', 'bed', 'બેડરૂમ'],
  ['kitchen', 'rasodu', 'રસોડું'],
  ['suitcase', 'bag', 'બેગ'],
  ['top', 'upar', 'uparnu', 'ઉપર', 'ઉપરનું', 'upper'],
  ['bottom', 'niche', 'nichenu', 'નીચે', 'નીચેનું', 'lower'],
  ['middle', 'vachche', 'vacche', 'વચ્ચે', 'વચ્ચેનું'],
  ['tailor', 'darji', 'દરજી'],
  ['cleaner', 'drycleaner', 'dhobi', 'ધોબી', 'laundry'],
  ['lent', 'udhar', 'ઉધાર', 'borrowed'],
  ['gift', 'bhet', 'ભેટ', 'gifted'],
  ['mummy', 'mumma', 'mom', 'mother', 'mammi', 'મમ્મી', 'maa', 'બા'],
  ['nani', 'નાની'],
  ['mami', 'મામી'],
  ['bhabhi', 'ભાભી'],
]

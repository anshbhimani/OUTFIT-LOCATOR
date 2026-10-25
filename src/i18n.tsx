import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { strings, type Lang, type Strings } from './strings'

const STORAGE_KEY = 'lang'

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'gu' || saved === 'en') return saved
  } catch {
    // storage unavailable; fall through to the default
  }
  return 'gu'
}

const LangContext = createContext<{ lang: Lang; t: Strings; toggle: () => void } | null>(null)

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(initialLang)

  useEffect(() => {
    document.documentElement.lang = lang
    try {
      localStorage.setItem(STORAGE_KEY, lang)
    } catch {
      // ignore: language just won't be remembered
    }
  }, [lang])

  const toggle = () => setLang((l) => (l === 'gu' ? 'en' : 'gu'))
  return <LangContext.Provider value={{ lang, t: strings[lang], toggle }}>{children}</LangContext.Provider>
}

// eslint-disable-next-line react/only-export-components
export function useLang() {
  const ctx = useContext(LangContext)
  if (!ctx) throw new Error('useLang must be used inside LangProvider')
  return ctx
}

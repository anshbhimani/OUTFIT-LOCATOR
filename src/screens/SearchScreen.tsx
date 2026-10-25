import { Mic, Plus, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { BrandMark } from '../components/icons'
import { SareeGrid } from '../components/SareeCard'
import { locationPath } from '../data'
import { useData } from '../hooks'
import { useLang } from '../i18n'
import type { Nav } from '../nav'
import { buildIndex, search } from '../search/engine'
import { useSpeech, type SpeechError } from '../speech'
import type { Strings } from '../strings'
import { termLabel } from '../vocab'

const speechMessage = (t: Strings, e: SpeechError) =>
  ({ denied: t.micDenied, network: t.voiceNeedsNet, 'no-speech': t.didntHear, other: t.voiceFailed })[e]

export function SearchScreen({ nav, onAdd }: { nav: Nav; onAdd: () => void }) {
  const { t, lang } = useLang()
  const { sarees, byId, loading } = useData()
  const [query, setQuery] = useState('')
  const speech = useSpeech(lang, setQuery)

  const index = useMemo(
    () =>
      buildIndex(
        sarees.map((s) => ({
          id: s.id,
          title: s.title,
          notes: s.notes,
          colors: s.colors,
          fabric: s.fabric,
          pattern: s.pattern,
          occasion: s.occasion,
          placeNames: locationPath(s.locationId, byId).map((l) => l.name),
          updatedAt: s.updatedAt.getTime(),
        })),
      ),
    [sarees, byId],
  )
  const result = useMemo(() => search(index, query), [index, query])
  const byIdSaree = useMemo(() => new Map(sarees.map((s) => [s.id, s])), [sarees])
  const best = result.best.map((id) => byIdSaree.get(id)!).filter(Boolean)
  const more = result.more.map((id) => byIdSaree.get(id)!).filter(Boolean)
  const open = (id: string) => nav.push({ name: 'saree', id })

  if (loading) return null

  if (sarees.length === 0)
    return (
      <section className="empty-state">
        <BrandMark size={88} />
        <p>{t.noSarees}</p>
        <button className="btn btn-primary" onClick={onAdd}>
          <Plus size={22} aria-hidden />
          {t.addFirst}
        </button>
      </section>
    )

  const total = best.length + more.length

  return (
    <section>
      <h1 className="screen-title">{t.findTitle}</h1>
      <div className={speech.listening ? 'search-box listening' : 'search-box'}>
        <Search size={24} aria-hidden />
        <input
          type="search"
          placeholder={speech.listening ? t.listening : t.searchPlaceholder}
          aria-label={t.findTitle}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && !speech.listening && (
          <button className="search-clear" onClick={() => setQuery('')} aria-label={t.cancel}>
            <X size={20} aria-hidden />
          </button>
        )}
        {speech.supported && (
          <button
            className={speech.listening ? 'mic-btn on' : 'mic-btn'}
            onClick={speech.listening ? speech.stop : speech.start}
            aria-label={t.voiceSearch}
            aria-pressed={speech.listening}
          >
            <Mic size={24} aria-hidden />
          </button>
        )}
      </div>
      {speech.error && <p className="voice-error">{speechMessage(t, speech.error)}</p>}

      {result.understood.length > 0 && (
        <div className="understood">
          <span>{t.lookingFor}:</span>
          {result.understood.map((u) => (
            <span className="chip static" key={u.key}>
              {termLabel(u.key, lang)}
            </span>
          ))}
        </div>
      )}

      <p className="count">{query ? t.resultCount(total) : t.sareeCount(sarees.length)}</p>

      {total === 0 ? (
        <div className="empty">
          <p>{t.noResults}</p>
          <p className="hint">{t.noResultsHint}</p>
        </div>
      ) : (
        <>
          {query && more.length > 0 && best.length > 0 && <h2 className="section-title">{t.bestMatches}</h2>}
          <SareeGrid sarees={best} byId={byId} onOpen={open} />
          {more.length > 0 && (
            <>
              <h2 className="section-title">{t.moreMatches}</h2>
              <SareeGrid sarees={more} byId={byId} onOpen={open} />
            </>
          )}
        </>
      )}
    </section>
  )
}

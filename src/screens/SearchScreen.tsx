import { Mic, Plus, Search, Sparkles, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { photoAi, photoSimilarities, usePhotoAi } from '../ai/photoAi'
import { AiCard } from '../components/AiCard'
import { BrandMark } from '../components/icons'
import { SareeGrid } from '../components/SareeCard'
import { locationPath } from '../data'
import { useData } from '../hooks'
import { useLang } from '../i18n'
import type { Nav } from '../nav'
import { buildIndex, photoPrompt, search, withPhotoMatches } from '../search/engine'
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
          title: [s.title, s.titleEn].filter(Boolean).join(' '),
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
  const words = useMemo(() => search(index, query), [index, query])

  // Photo AI: once she pauses typing, turn the query into English and compare it with every photo.
  const ai = usePhotoAi()
  const prompt = useMemo(() => (ai.status === 'ready' ? photoPrompt(index, query) : null), [ai.status, index, query])
  const [queryVec, setQueryVec] = useState<{ prompt: string; vec: Float32Array } | null>(null)
  useEffect(() => {
    if (!prompt) return
    let cancelled = false
    const timer = setTimeout(() => {
      photoAi.embedText(prompt).then((vec) => {
        if (!cancelled && vec) setQueryVec({ prompt, vec })
      })
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [prompt])
  const sims = useMemo(
    () => (queryVec && queryVec.prompt === prompt ? photoSimilarities(queryVec.vec, sarees) : null),
    [queryVec, prompt, sarees],
  )
  const result = useMemo(() => withPhotoMatches(words, sims), [words, sims])

  const byIdSaree = useMemo(() => new Map(sarees.map((s) => [s.id, s])), [sarees])
  const toSarees = (ids: string[]) => ids.map((id) => byIdSaree.get(id)!).filter(Boolean)
  const best = toSarees(result.best)
  const photo = toSarees(result.photo)
  const more = toSarees(result.more)
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

  const total = best.length + photo.length + more.length

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
      {!query && <AiCard />}

      {total === 0 ? (
        <div className="empty">
          <p>{t.noResults}</p>
          <p className="hint">{t.noResultsHint}</p>
        </div>
      ) : (
        <>
          {query && best.length > 0 && photo.length + more.length > 0 && (
            <h2 className="section-title">{t.bestMatches}</h2>
          )}
          <SareeGrid sarees={best} byId={byId} onOpen={open} />
          {photo.length > 0 && (
            <>
              <h2 className="section-title">
                <Sparkles size={18} aria-hidden /> {t.foundByPhoto}
              </h2>
              <SareeGrid sarees={photo} byId={byId} onOpen={open} />
            </>
          )}
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

import { Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { BrandMark } from '../components/icons'
import { SareeGrid } from '../components/SareeCard'
import { useData } from '../hooks'
import { useLang } from '../i18n'
import type { Nav } from '../nav'
import { simpleSearch } from '../simpleSearch'

export function SearchScreen({ nav, onAdd }: { nav: Nav; onAdd: () => void }) {
  const { t } = useLang()
  const { sarees, byId, loading } = useData()
  const [query, setQuery] = useState('')
  const results = useMemo(() => simpleSearch(query, sarees, byId), [query, sarees, byId])

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

  return (
    <section>
      <h1 className="screen-title">{t.findTitle}</h1>
      <label className="search-box">
        <Search size={24} aria-hidden />
        <input
          type="search"
          placeholder={t.searchPlaceholder}
          aria-label={t.findTitle}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <p className="count">{query ? t.resultCount(results.length) : t.sareeCount(sarees.length)}</p>
      {results.length === 0 ? (
        <p className="empty">{t.noResults}</p>
      ) : (
        <SareeGrid sarees={results} byId={byId} onOpen={(id) => nav.push({ name: 'saree', id })} />
      )}
    </section>
  )
}

import { ChevronLeft, House, Plus, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { photoAi } from './ai/photoAi'
import { BrandMark } from './components/icons'
import { requestPersistentStorage } from './db'
import { useLang } from './i18n'
import type { Nav, Screen } from './nav'
import { PlacesScreen } from './screens/PlacesScreen'
import { SareeDetail } from './screens/SareeDetail'
import { SareeForm } from './screens/SareeForm'
import { SearchScreen } from './screens/SearchScreen'

type Tab = 'search' | 'add' | 'places'
const TAB_ROOT: Record<Tab, Screen> = {
  search: { name: 'search' },
  add: { name: 'add' },
  places: { name: 'places', locationId: null },
}

export default function App() {
  const { t, lang, toggle } = useLang()
  const [stack, setStack] = useState<Screen[]>([TAB_ROOT.search])
  const [persisted, setPersisted] = useState<boolean | null>(null)

  useEffect(() => {
    requestPersistentStorage().then(setPersisted)
    photoAi.resume() // reloads the photo AI from the browser cache if Mom turned it on
  }, [])

  // Each pushed screen gets a browser history entry so Android's back button goes back one screen.
  useEffect(() => {
    const onPop = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const push = useCallback((screen: Screen) => {
    window.history.pushState(null, '')
    setStack((s) => [...s, screen])
    window.scrollTo(0, 0)
  }, [])
  const back = useCallback(() => window.history.back(), [])
  const nav: Nav = useMemo(() => ({ push, back }), [push, back])

  const switchTab = (tab: Tab) => {
    // Unwind this tab's history entries so back-button depth stays in sync.
    if (stack.length > 1) window.history.go(-(stack.length - 1))
    setStack([TAB_ROOT[tab]])
    window.scrollTo(0, 0)
  }

  const screen = stack[stack.length - 1]
  const root = stack[0]
  const activeTab: Tab = root.name === 'add' ? 'add' : root.name === 'places' ? 'places' : 'search'

  return (
    <div className="app">
      <header className="topbar">
        {stack.length > 1 ? (
          <button className="back-btn" onClick={back}>
            <ChevronLeft size={26} aria-hidden />
            {t.back}
          </button>
        ) : (
          <div className="wordmark">
            <BrandMark size={34} />
            <span>{t.appName}</span>
          </div>
        )}
        <div className="lang-switch" role="group" aria-label="Language">
          <button aria-pressed={lang === 'gu'} onClick={lang === 'gu' ? undefined : toggle}>
            ગુ
          </button>
          <button aria-pressed={lang === 'en'} onClick={lang === 'en' ? undefined : toggle}>
            EN
          </button>
        </div>
      </header>

      <main className="content">
        {persisted === false && stack.length === 1 && root.name === 'search' && (
          <p className="banner">{t.storageAtRisk}</p>
        )}
        {screen.name === 'search' && <SearchScreen nav={nav} onAdd={() => switchTab('add')} />}
        {screen.name === 'add' && <SareeForm nav={nav} />}
        {screen.name === 'edit' && <SareeForm key={screen.id} id={screen.id} nav={nav} />}
        {screen.name === 'saree' && <SareeDetail key={screen.id} id={screen.id} nav={nav} />}
        {screen.name === 'places' && <PlacesScreen key={screen.locationId} locationId={screen.locationId} nav={nav} />}
      </main>

      <nav className="tabbar">
        <button className={activeTab === 'search' ? 'active' : ''} onClick={() => switchTab('search')}>
          <Search size={26} aria-hidden />
          {t.tabSearch}
        </button>
        <button className={activeTab === 'add' ? 'tab-add active' : 'tab-add'} onClick={() => switchTab('add')}>
          <span className="tab-add-circle">
            <Plus size={30} strokeWidth={2.5} aria-hidden />
          </span>
          {t.tabAdd}
        </button>
        <button className={activeTab === 'places' ? 'active' : ''} onClick={() => switchTab('places')}>
          <House size={26} aria-hidden />
          {t.tabPlaces}
        </button>
      </nav>
    </div>
  )
}

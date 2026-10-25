import { Check, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useState } from 'react'
import type { Location } from '../types'
import { CHILD_KIND, locationPath } from '../data'
import { useData } from '../hooks'
import { useLang } from '../i18n'
import { useDialog } from './Dialog'
import { KIND_ICON } from './icons'
import { addLabel, promptAddPlace } from './places'

/**
 * Full-screen drill-down: Room → Unit → Spot. Places that can contain others open when
 * tapped; leaf places (shelves, outside places) are picked directly.
 */
export function LocationPicker({ onPick, onClose }: { onPick: (id: string) => void; onClose: () => void }) {
  const { t } = useLang()
  const dialog = useDialog()
  const { locations, byId } = useData()
  const [folderId, setFolderId] = useState<string | null>(null)
  const folder = folderId ? byId.get(folderId) : undefined

  const byName = (a: Location, b: Location) => a.name.localeCompare(b.name)
  const children = locations.filter((l) => l.parentId === folderId && l.kind !== 'away').sort(byName)
  const away = folderId === null ? locations.filter((l) => l.kind === 'away').sort(byName) : []

  const open = (l: Location) => (CHILD_KIND[l.kind] ? setFolderId(l.id) : onPick(l.id))
  const add = async (kind: Location['kind']) => {
    const id = await promptAddPlace(t, dialog, kind, kind === 'away' ? null : folderId)
    if (!id) return
    if (CHILD_KIND[kind]) setFolderId(id)
    else onPick(id)
  }

  const childKind = folder ? CHILD_KIND[folder.kind] : 'room'
  const row = (l: Location, pick: boolean) => {
    const Icon = KIND_ICON[l.kind]
    return (
      <li key={l.id}>
        <button className="row" onClick={() => (pick ? onPick(l.id) : open(l))}>
          <span className="row-icon">
            <Icon size={22} aria-hidden />
          </span>
          <span className="row-name">{l.name}</span>
          {CHILD_KIND[l.kind] && !pick ? (
            <ChevronRight size={22} className="row-chevron" aria-hidden />
          ) : (
            <Check size={22} className="row-chevron" aria-hidden />
          )}
        </button>
      </li>
    )
  }

  return (
    <div className="overlay" role="dialog" aria-modal>
      <header className="overlay-head">
        <button className="back-btn" onClick={folderId ? () => setFolderId(folder?.parentId ?? null) : onClose}>
          <ChevronLeft size={26} aria-hidden />
          {folderId ? t.back : t.cancel}
        </button>
      </header>
      <div className="overlay-body">
        <h1 className="screen-title">{folder ? folder.name : t.chooseLocation}</h1>
        {folder && (
          <p className="crumbs">
            {locationPath(folder.id, byId)
              .slice(0, -1)
              .map((l) => l.name)
              .join(' › ')}
          </p>
        )}
        {folder && (
          <button className="btn btn-primary wide" onClick={() => onPick(folder.id)}>
            <Check size={22} aria-hidden />
            {t.chooseHere}
          </button>
        )}

        <ul className="rows">{children.map((l) => row(l, false))}</ul>
        {childKind && (
          <button className="btn btn-dashed wide" onClick={() => add(childKind)}>
            <Plus size={22} aria-hidden />
            {addLabel(t, childKind)}
          </button>
        )}

        {folderId === null && (
          <>
            <h2 className="section-title">{t.awayPlaces}</h2>
            <ul className="rows">{away.map((l) => row(l, true))}</ul>
            <button className="btn btn-dashed wide" onClick={() => add('away')}>
              <Plus size={22} aria-hidden />
              {t.addAway}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRightLeft, CalendarCheck, History, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useDialog } from '../components/Dialog'
import { LocationPicker } from '../components/LocationPicker'
import { PlaceSteps } from '../components/PlaceSteps'
import { Photo } from '../components/SareeCard'
import { db } from '../db'
import { deleteSaree, markWorn, moveSaree, pathText } from '../data'
import { photoKey, useLocations } from '../hooks'
import { useLang } from '../i18n'
import type { Nav } from '../nav'
import { sareeName, termLabel } from '../vocab'

export function SareeDetail({ id, nav }: { id: string; nav: Nav }) {
  const { t, lang } = useLang()
  const dialog = useDialog()
  const { byId } = useLocations()
  const saree = useLiveQuery(() => db.sarees.get(id), [id])
  const history = useLiveQuery(() => db.history.where('sareeId').equals(id).reverse().sortBy('at'), [id])
  const [moving, setMoving] = useState(false)
  const [photoIndex, setPhotoIndex] = useState(0)

  if (!saree) return null
  const fmt = (d: Date) =>
    d.toLocaleDateString(lang === 'gu' ? 'gu-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  const tags = [
    ...saree.colors.map((c) => termLabel(c, lang)),
    termLabel(saree.fabric, lang),
    termLabel(saree.pattern, lang),
    termLabel(saree.occasion, lang),
  ].filter(Boolean)

  const remove = async () => {
    if (!(await dialog.confirm(t.deleteSareeConfirm, { confirmLabel: t.delete, danger: true }))) return
    await deleteSaree(id)
    nav.back()
  }

  return (
    <section className="detail">
      <div
        className="photo-carousel"
        onScroll={(e) => {
          const el = e.currentTarget
          setPhotoIndex(Math.round(el.scrollLeft / el.clientWidth))
        }}
      >
        {saree.photos.length === 0 && <Photo alt="" className="carousel-photo" />}
        {saree.photos.map((p, i) => (
          <Photo key={i} blob={p} cacheKey={photoKey(saree, i)} alt={sareeName(saree, lang)} className="carousel-photo" />
        ))}
      </div>
      {saree.photos.length > 1 && (
        <div className="dots" aria-hidden>
          {saree.photos.map((_, i) => (
            <span key={i} className={i === photoIndex ? 'on' : ''} />
          ))}
        </div>
      )}

      <h1 className="screen-title detail-title">{sareeName(saree, lang)}</h1>

      <div className="card place-card">
        <h2 className="card-title">{t.keptAt}</h2>
        <PlaceSteps locationId={saree.locationId} byId={byId} />
        <div className="btn-pair">
          <button className="btn btn-primary" onClick={() => setMoving(true)}>
            <ArrowRightLeft size={20} aria-hidden />
            {t.move}
          </button>
          <button className="btn btn-quiet" onClick={() => nav.push({ name: 'edit', id })}>
            <Pencil size={20} aria-hidden />
            {t.edit}
          </button>
        </div>
      </div>

      {(tags.length > 0 || saree.notes) && (
        <div className="card">
          {tags.length > 0 && (
            <div className="chips">
              {tags.map((tag) => (
                <span className="chip static" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
          )}
          {saree.notes && <p className="notes">{saree.notes}</p>}
        </div>
      )}

      <div className="card worn">
        <span className="worn-text">
          <CalendarCheck size={22} aria-hidden />
          <span>
            {t.lastWorn}
            <strong>{saree.lastWorn ? fmt(saree.lastWorn) : t.never}</strong>
          </span>
        </span>
        <button
          className="btn btn-quiet"
          onClick={async () => {
            await markWorn(id)
            dialog.toast(t.markedWorn)
          }}
        >
          {t.woreToday}
        </button>
      </div>

      {history && history.length > 0 && (
        <div className="card">
          <h2 className="card-title">
            <History size={18} aria-hidden /> {t.history}
          </h2>
          <ol className="timeline">
            {history.map((h) => (
              <li key={h.id}>
                <span className="timeline-date">{fmt(h.at)}</span>
                <span>
                  {h.fromLocationId === null
                    ? `${t.added}: ${pathText(h.toLocationId, byId) || '—'}`
                    : `${pathText(h.fromLocationId, byId) || '—'} → ${pathText(h.toLocationId, byId) || '—'}`}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <button className="btn btn-text-danger wide" onClick={remove}>
        <Trash2 size={20} aria-hidden />
        {t.deleteSaree}
      </button>

      {moving && (
        <LocationPicker
          onClose={() => setMoving(false)}
          onPick={async (to) => {
            await moveSaree(id, to)
            setMoving(false)
            dialog.toast(t.moved)
          }}
        />
      )}
    </section>
  )
}

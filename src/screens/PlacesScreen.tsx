import { ChevronRight, Download, Pencil, Plus, ShieldAlert, ShieldCheck, Trash2, Upload } from 'lucide-react'
import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { createBackup, lastBackupAt, restoreBackup, saveBackup } from '../backup'
import { AiSettings } from '../components/AiCard'
import { useDialog } from '../components/Dialog'
import { KIND_ICON } from '../components/icons'
import { addLabel, promptAddPlace } from '../components/places'
import { SareeGrid } from '../components/SareeCard'
import type { Location } from '../db'
import { CHILD_KIND, deleteLocation, locationPath, renameLocation, subtreeIds } from '../data'
import { useData } from '../hooks'
import { useLang } from '../i18n'
import type { Nav } from '../nav'

/** `locationId` null = top level (rooms, outside places, backup). Otherwise one place and what's inside it. */
export function PlacesScreen({ locationId, nav }: { locationId: string | null; nav: Nav }) {
  const { t } = useLang()
  const dialog = useDialog()
  const { sarees, locations, byId, loading } = useData()

  // Sarees in each place including everything nested inside it.
  const countIn = useMemo(() => {
    const direct = new Map<string, number>()
    for (const s of sarees) direct.set(s.locationId, (direct.get(s.locationId) ?? 0) + 1)
    return (id: string) => [...subtreeIds(id, locations)].reduce((n, x) => n + (direct.get(x) ?? 0), 0)
  }, [sarees, locations])

  if (loading) return null
  const byName = (a: Location, b: Location) => a.name.localeCompare(b.name)
  const open = (id: string) => nav.push({ name: 'places', locationId: id })

  const rows = (list: Location[]) => (
    <ul className="rows">
      {list.sort(byName).map((l) => {
        const Icon = KIND_ICON[l.kind]
        return (
          <li key={l.id}>
            <button className="row" onClick={() => open(l.id)}>
              <span className="row-icon">
                <Icon size={22} aria-hidden />
              </span>
              <span className="row-name">{l.name}</span>
              <span className="badge">{countIn(l.id)}</span>
              <ChevronRight size={22} className="row-chevron" aria-hidden />
            </button>
          </li>
        )
      })}
    </ul>
  )

  const addButton = (kind: Location['kind'], parentId: string | null) => (
    <button className="btn btn-dashed wide" onClick={() => promptAddPlace(t, dialog, kind, parentId)}>
      <Plus size={22} aria-hidden />
      {addLabel(t, kind)}
    </button>
  )

  if (locationId === null) {
    return (
      <section>
        <h1 className="screen-title">{t.placesTitle}</h1>
        <p className="lede">{t.placesHint}</p>

        <h2 className="section-title">{t.rooms}</h2>
        {rows(locations.filter((l) => l.kind === 'room'))}
        {addButton('room', null)}

        <h2 className="section-title">{t.awayPlaces}</h2>
        {rows(locations.filter((l) => l.kind === 'away'))}
        {addButton('away', null)}

        <BackupSection />
        <AiSettings />
      </section>
    )
  }

  const place = byId.get(locationId)
  if (!place) return <p className="empty">{t.emptyPlace}</p>
  const childKind = CHILD_KIND[place.kind]
  const children = locations.filter((l) => l.parentId === place.id)
  const inside = subtreeIds(place.id, locations)
  const here = sarees.filter((s) => inside.has(s.locationId))
  const parents = locationPath(place.id, byId).slice(0, -1)

  const rename = async () => {
    const name = await dialog.prompt(t.rename, { initial: place.name })
    if (name) await renameLocation(place.id, name)
  }
  const remove = async () => {
    if (!(await dialog.confirm(t.confirmDeleteLocation, { confirmLabel: t.delete, danger: true }))) return
    if (await deleteLocation(place.id)) nav.back()
    else await dialog.alert(t.cantDeleteLocation)
  }

  return (
    <section>
      {parents.length > 0 && <p className="crumbs">{parents.map((l) => l.name).join(' › ')}</p>}
      <div className="title-row">
        <h1 className="screen-title">{place.name}</h1>
        <div className="icon-actions">
          <button className="icon-btn" onClick={rename} aria-label={t.rename}>
            <Pencil size={22} />
          </button>
          <button className="icon-btn danger" onClick={remove} aria-label={t.delete}>
            <Trash2 size={22} />
          </button>
        </div>
      </div>

      {childKind && (
        <>
          {rows(children)}
          {addButton(childKind, place.id)}
        </>
      )}

      <h2 className="section-title">
        {t.sareesHere} <span className="badge">{here.length}</span>
      </h2>
      {here.length === 0 ? (
        <p className="empty">{t.emptyPlace}</p>
      ) : (
        <SareeGrid sarees={here} byId={byId} onOpen={(id) => nav.push({ name: 'saree', id })} />
      )}
    </section>
  )
}

function BackupSection() {
  const { t, lang } = useLang()
  const dialog = useDialog()
  const [busy, setBusy] = useState(false)
  const [last, setLast] = useState(lastBackupAt)
  const fileRef = useRef<HTMLInputElement>(null)

  const exportNow = async () => {
    setBusy(true)
    try {
      await saveBackup(await createBackup())
      setLast(lastBackupAt())
    } finally {
      setBusy(false)
    }
  }

  const onRestore = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !(await dialog.confirm(t.importBackup, { message: t.importConfirm, danger: true }))) return
    setBusy(true)
    try {
      await dialog.alert(t.importDone(await restoreBackup(file)))
    } catch {
      await dialog.alert(t.importFailed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card backup">
      <h2 className="card-title">{t.backup}</h2>
      <p className={last ? 'backup-status ok' : 'backup-status warn'}>
        {last ? <ShieldCheck size={22} aria-hidden /> : <ShieldAlert size={22} aria-hidden />}
        {last ? t.lastBackup(last.toLocaleDateString(lang === 'gu' ? 'gu-IN' : 'en-IN')) : t.neverBackedUp}
      </p>
      <p className="hint">{t.backupHint}</p>
      <button className="btn btn-primary wide" onClick={exportNow} disabled={busy}>
        <Download size={22} aria-hidden />
        {t.exportBackup}
      </button>
      <button className="btn btn-quiet wide" onClick={() => fileRef.current?.click()} disabled={busy}>
        <Upload size={22} aria-hidden />
        {t.importBackup}
      </button>
      <input ref={fileRef} type="file" accept=".zip,application/zip" hidden onChange={onRestore} />
    </div>
  )
}

import { Camera, ChevronRight, Images, MapPin, X } from 'lucide-react'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Chips } from '../components/Chips'
import { useDialog } from '../components/Dialog'
import { LocationPicker } from '../components/LocationPicker'
import { PlaceSteps } from '../components/PlaceSteps'
import { Photo } from '../components/SareeCard'
import { db } from '../db'
import { addSaree, updateSaree, type SareeInput } from '../data'
import { getLastLocation, setLastLocation, useData } from '../hooks'
import { useLang } from '../i18n'
import type { Nav } from '../nav'
import { compressPhoto } from '../photos'
import { COLORS, FABRICS, OCCASIONS, PATTERNS } from '../vocab'

const MAX_PHOTOS = 4

const empty = (locationId: string): SareeInput => ({
  photos: [],
  title: '',
  colors: [],
  fabric: undefined,
  pattern: undefined,
  occasion: undefined,
  notes: '',
  locationId,
})

/** Add (no `id`) or edit a saree. After adding, the form resets but keeps the place for batch entry. */
export function SareeForm({ id, nav }: { id?: string; nav: Nav }) {
  const { t } = useLang()
  const dialog = useDialog()
  const { byId, loading } = useData()
  const [form, setForm] = useState<SareeInput | null>(id ? null : empty(getLastLocation() ?? ''))
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [placeMissing, setPlaceMissing] = useState(false)
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const placeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!id) return
    db.sarees.get(id).then((s) => {
      if (s) setForm({ ...s })
    })
  }, [id])

  if (!form || loading) return null
  // A remembered place may have been deleted since.
  const locationId = byId.has(form.locationId) ? form.locationId : ''
  const set = (patch: Partial<SareeInput>) => setForm({ ...form, ...patch })

  const onFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])].slice(0, MAX_PHOTOS - form.photos.length)
    e.target.value = ''
    if (!files.length) return
    setBusy(true)
    try {
      const blobs = await Promise.all(files.map(compressPhoto))
      setForm((f) => (f ? { ...f, photos: [...f.photos, ...blobs] } : f))
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    if (!locationId) {
      setPlaceMissing(true)
      placeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setBusy(true)
    try {
      const input: SareeInput = {
        ...form,
        locationId,
        title: form.title?.trim() || undefined,
        notes: form.notes?.trim() || undefined,
      }
      setLastLocation(locationId)
      if (id) {
        await updateSaree(id, input)
        nav.back()
      } else {
        await addSaree(input)
        setForm(empty(locationId))
        dialog.toast(t.saved)
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    } finally {
      setBusy(false)
    }
  }

  const canAddPhoto = form.photos.length < MAX_PHOTOS

  return (
    <section className="form">
      <h1 className="screen-title">{id ? t.editTitle : t.addTitle}</h1>

      <div className="card">
        <h2 className="card-title">{t.photos}</h2>
        {form.photos.length === 0 ? (
          <>
            <button type="button" className="photo-cta" onClick={() => cameraRef.current?.click()} disabled={busy}>
              <span className="photo-cta-icon">
                <Camera size={34} aria-hidden />
              </span>
              <span>{busy ? t.processingPhoto : t.takePhoto}</span>
            </button>
            <button type="button" className="btn btn-quiet wide" onClick={() => galleryRef.current?.click()} disabled={busy}>
              <Images size={22} aria-hidden />
              {t.fromGallery}
            </button>
          </>
        ) : (
          <>
            <div className="photo-strip">
              {form.photos.map((p, i) => (
                <div className="photo-thumb" key={i}>
                  <Photo blob={p} alt="" />
                  <button
                    type="button"
                    className="photo-remove"
                    aria-label={t.removePhoto}
                    onClick={() => set({ photos: form.photos.filter((_, j) => j !== i) })}
                  >
                    <X size={20} strokeWidth={3} aria-hidden />
                  </button>
                </div>
              ))}
              {canAddPhoto && (
                <div className="photo-add">
                  <button type="button" onClick={() => cameraRef.current?.click()} disabled={busy} aria-label={t.takePhoto}>
                    <Camera size={26} aria-hidden />
                  </button>
                  <button type="button" onClick={() => galleryRef.current?.click()} disabled={busy} aria-label={t.fromGallery}>
                    <Images size={26} aria-hidden />
                  </button>
                </div>
              )}
            </div>
            <p className="hint">{busy ? t.processingPhoto : t.photoHint}</p>
          </>
        )}
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={onFiles} />
        <input ref={galleryRef} type="file" accept="image/*" multiple hidden onChange={onFiles} />
      </div>

      <div className={placeMissing && !locationId ? 'card card-error' : 'card'} ref={placeRef}>
        <h2 className="card-title">{t.location}</h2>
        {locationId ? (
          <button type="button" className="place-picked" onClick={() => setPicking(true)}>
            <PlaceSteps locationId={locationId} byId={byId} />
            <span className="link">{t.changeLocation}</span>
          </button>
        ) : (
          <button type="button" className="row row-accent" onClick={() => setPicking(true)}>
            <span className="row-icon">
              <MapPin size={22} aria-hidden />
            </span>
            <span className="row-name">{t.chooseLocation}</span>
            <ChevronRight size={22} className="row-chevron" aria-hidden />
          </button>
        )}
        {placeMissing && !locationId && <p className="error-text">{t.needLocation}</p>}
      </div>

      <div className="card">
        <h2 className="card-title">{t.details}</h2>
        <h3 className="field-label">{t.colors}</h3>
        <Chips options={COLORS} selected={form.colors} onChange={(colors) => set({ colors })} multi />

        <h3 className="field-label">{t.fabric}</h3>
        <Chips options={FABRICS} selected={form.fabric ? [form.fabric] : []} onChange={([fabric]) => set({ fabric })} />

        <h3 className="field-label">{t.pattern}</h3>
        <Chips options={PATTERNS} selected={form.pattern ? [form.pattern] : []} onChange={([pattern]) => set({ pattern })} />

        <h3 className="field-label">{t.occasion}</h3>
        <Chips
          options={OCCASIONS}
          selected={form.occasion ? [form.occasion] : []}
          onChange={([occasion]) => set({ occasion })}
        />

        <label className="field">
          <span className="field-label">{t.title}</span>
          <input
            className="input"
            value={form.title ?? ''}
            placeholder={t.titleHint}
            onChange={(e) => set({ title: e.target.value })}
          />
        </label>
        <label className="field">
          <span className="field-label">{t.notes}</span>
          <textarea
            className="input"
            rows={3}
            value={form.notes ?? ''}
            placeholder={t.notesHint}
            onChange={(e) => set({ notes: e.target.value })}
          />
        </label>
      </div>

      <div className="save-bar">
        {id && (
          <button type="button" className="btn btn-quiet" onClick={nav.back}>
            {t.cancel}
          </button>
        )}
        <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
          {t.save}
        </button>
      </div>

      {picking && (
        <LocationPicker
          onClose={() => setPicking(false)}
          onPick={(locationId) => {
            set({ locationId })
            setPicking(false)
          }}
        />
      )}
    </section>
  )
}

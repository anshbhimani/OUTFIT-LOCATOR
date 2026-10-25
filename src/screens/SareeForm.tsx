import { Camera, ChevronRight, Images, LoaderCircle, MapPin, X } from 'lucide-react'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { photoAi } from '../ai/photoAi'
import { Chips } from '../components/Chips'
import { useDialog } from '../components/Dialog'
import { LocationPicker } from '../components/LocationPicker'
import { PlaceSteps } from '../components/PlaceSteps'
import { Photo } from '../components/SareeCard'
import { addSaree, discardUpload, startUpload, updateSaree, type SareeInput } from '../data'
import { getLastLocation, setLastLocation, useLocations } from '../hooks'
import { ApiError, getState } from '../store'
import { useLang } from '../i18n'
import type { Nav } from '../nav'
import { compressPhoto } from '../photos'
import { COLORS, FABRICS, OCCASIONS, PATTERNS } from '../vocab'

const MAX_PHOTOS = 4
/** Keep the photo AI's background learning paused while Mom is adding sarees. */
const AI_QUIET_MS = 20_000

const empty = (locationId: string): SareeInput => ({
  photos: [],
  title: '',
  titleEn: '',
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
  const { byId, loading } = useLocations()
  const [form, setFormState] = useState<SareeInput | null>(() => {
    if (!id) return empty(getLastLocation() ?? '')
    const s = getState().sarees.find((x) => x.id === id)
    return s ? { ...s } : null
  })
  // Mirrors `form` synchronously, so a save waiting on photo preparation sees the finished photos.
  const formRef = useRef(form)
  const setForm = (next: SareeInput | null | ((f: SareeInput | null) => SareeInput | null)) => {
    formRef.current = typeof next === 'function' ? next(formRef.current) : next
    setFormState(formRef.current)
  }
  const [picking, setPicking] = useState(false)
  const [preparing, setPreparing] = useState(0)
  const pendingRef = useRef(new Set<Promise<unknown>>())
  const [saving, setSaving] = useState(false)
  const [placeMissing, setPlaceMissing] = useState(false)
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const placeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    photoAi.holdOff(AI_QUIET_MS)
  }, [])

  if (!form || loading) return null
  // A remembered place may have been deleted since.
  const locationId = byId.has(form.locationId) ? form.locationId : ''
  const set = (patch: Partial<SareeInput>) => setForm((f) => (f ? { ...f, ...patch } : f))

  // Each photo is prepared in the background; she can keep filling the form or tap Save meanwhile.
  const onFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])].slice(0, MAX_PHOTOS - form.photos.length - preparing)
    e.target.value = ''
    photoAi.holdOff(AI_QUIET_MS)
    for (const file of files) {
      setPreparing((n) => n + 1)
      const job = compressPhoto(file)
        .then((blob) => {
          void startUpload(blob).catch(() => undefined) // upload now; Save retries if this fails
          setForm((f) => (f ? { ...f, photos: [...f.photos, blob] } : f))
        })
        .catch(() => undefined)
        .finally(() => {
          pendingRef.current.delete(job)
          setPreparing((n) => n - 1)
        })
      pendingRef.current.add(job)
    }
  }

  const save = async () => {
    if (!locationId) {
      setPlaceMissing(true)
      placeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    photoAi.holdOff(AI_QUIET_MS)
    setSaving(true)
    try {
      await Promise.all(pendingRef.current) // finish any photo still being prepared
      const current = formRef.current!
      const input: SareeInput = {
        ...current,
        locationId,
        title: current.title?.trim() || undefined,
        titleEn: current.titleEn?.trim() || undefined,
        notes: current.notes?.trim() || undefined,
      }
      setLastLocation(locationId)
      try {
        if (id) {
          await updateSaree(id, input)
          nav.back()
        } else {
          await addSaree(input)
          setForm(empty(locationId))
          dialog.toast(t.saved)
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }
      } catch (e) {
        // Nothing is lost: the form keeps everything, so she can fix it and tap Save again.
        await dialog.alert(e instanceof ApiError && e.code === 'duplicate_name' ? t.nameTaken : t.saveFailed)
      }
    } finally {
      setSaving(false)
    }
  }

  const photoCount = form.photos.length + preparing
  const canAddPhoto = photoCount < MAX_PHOTOS

  return (
    <section className="form">
      <h1 className="screen-title">{id ? t.editTitle : t.addTitle}</h1>

      <div className="card">
        <h2 className="card-title">{t.photos}</h2>
        {photoCount === 0 ? (
          <>
            <button type="button" className="photo-cta" onClick={() => cameraRef.current?.click()}>
              <span className="photo-cta-icon">
                <Camera size={34} aria-hidden />
              </span>
              <span>{t.takePhoto}</span>
            </button>
            <button type="button" className="btn btn-quiet wide" onClick={() => galleryRef.current?.click()}>
              <Images size={22} aria-hidden />
              {t.fromGallery}
            </button>
          </>
        ) : (
          <>
            <div className="photo-strip">
              {form.photos.map((p, i) => (
                <div className="photo-thumb" key={p instanceof Blob ? `new${i}` : p.id}>
                  <Photo photo={p} alt="" />
                  <button
                    type="button"
                    className="photo-remove"
                    aria-label={t.removePhoto}
                    onClick={() => {
                      if (p instanceof Blob) discardUpload(p)
                      set({ photos: form.photos.filter((_, j) => j !== i) })
                    }}
                  >
                    <X size={20} strokeWidth={3} aria-hidden />
                  </button>
                </div>
              ))}
              {Array.from({ length: preparing }, (_, i) => (
                <div className="photo-thumb photo-preparing" key={`p${i}`} aria-label={t.processingPhoto}>
                  <LoaderCircle size={28} className="spin" aria-hidden />
                </div>
              ))}
              {canAddPhoto && (
                <div className="photo-add">
                  <button type="button" onClick={() => cameraRef.current?.click()} aria-label={t.takePhoto}>
                    <Camera size={26} aria-hidden />
                  </button>
                  <button type="button" onClick={() => galleryRef.current?.click()} aria-label={t.fromGallery}>
                    <Images size={26} aria-hidden />
                  </button>
                </div>
              )}
            </div>
            <p className="hint">{preparing ? t.processingPhoto : t.photoHint}</p>
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
          <span className="field-label">{t.titleGu}</span>
          <input
            className="input"
            lang="gu"
            value={form.title ?? ''}
            placeholder={t.titleGuHint}
            onChange={(e) => set({ title: e.target.value })}
          />
        </label>
        <label className="field">
          <span className="field-label">{t.titleEn}</span>
          <input
            className="input"
            lang="en"
            value={form.titleEn ?? ''}
            placeholder={t.titleEnHint}
            onChange={(e) => set({ titleEn: e.target.value })}
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
          <button type="button" className="btn btn-quiet" onClick={nav.back} disabled={saving}>
            {t.cancel}
          </button>
        )}
        <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
          {saving && <LoaderCircle size={22} className="spin" aria-hidden />}
          {saving ? t.saving : t.save}
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

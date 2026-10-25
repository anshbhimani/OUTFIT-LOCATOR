import { ImageOff, MapPin } from 'lucide-react'
import type { Location, Saree } from '../db'
import { locationPath } from '../data'
import { photoKey, useObjectUrl } from '../hooks'
import { useLang } from '../i18n'
import { sareeName } from '../vocab'

export function Photo({
  blob,
  cacheKey,
  alt,
  className,
}: {
  blob?: Blob
  cacheKey?: string
  alt: string
  className?: string
}) {
  const url = useObjectUrl(blob, cacheKey)
  if (!url)
    return (
      <div className={`photo-placeholder ${className ?? ''}`}>
        <ImageOff size={32} aria-hidden />
      </div>
    )
  return <img src={url} alt={alt} className={className} loading="lazy" />
}

export function SareeGrid({
  sarees,
  byId,
  onOpen,
}: {
  sarees: Saree[]
  byId: Map<string, Location>
  onOpen: (id: string) => void
}) {
  const { lang } = useLang()
  return (
    <ul className="saree-grid">
      {sarees.map((s) => {
        const name = sareeName(s, lang)
        // Cards show the two most specific levels; the full path is on the detail screen.
        const place = locationPath(s.locationId, byId)
          .slice(-2)
          .map((l) => l.name)
          .join(' › ')
        return (
          <li key={s.id}>
            <button className="saree-card" onClick={() => onOpen(s.id)}>
              <Photo blob={s.photos[0]} cacheKey={photoKey(s, 0)} alt={name} className="saree-card-photo" />
              <span className="saree-card-body">
                <span className="saree-card-name">{name}</span>
                <span className="saree-card-place">
                  <MapPin size={16} aria-hidden />
                  {place || '—'}
                </span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

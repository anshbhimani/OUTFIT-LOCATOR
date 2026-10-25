import { Archive, DoorOpen, Layers, MapPinned, type LucideIcon } from 'lucide-react'
import type { LocationKind } from '../types'

// eslint-disable-next-line react/only-export-components
export const KIND_ICON: Record<LocationKind, LucideIcon> = {
  room: DoorOpen,
  unit: Archive,
  spot: Layers,
  away: MapPinned,
}

/** The app mark: a folded saree with zari borders. Same artwork as public/icon.svg. */
export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden>
      <rect width="512" height="512" rx="120" fill="#1e6b45" />
      <path d="M136 120h240v40H136z" fill="#e0bf5a" />
      <path d="M136 160h240v232H136z" fill="#2f8a5e" />
      <path d="M136 352h240v40H136z" fill="#e0bf5a" />
      <circle cx="256" cy="256" r="44" fill="none" stroke="#e0bf5a" strokeWidth="14" />
      <circle cx="256" cy="256" r="12" fill="#e0bf5a" />
    </svg>
  )
}

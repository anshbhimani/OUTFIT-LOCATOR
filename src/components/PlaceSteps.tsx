import type { Location } from '../types'
import { locationPath } from '../data'
import { KIND_ICON } from './icons'

/** A saree's place as stacked steps (Room → Cupboard → Shelf): easier to scan than one long line. */
export function PlaceSteps({ locationId, byId }: { locationId: string; byId: Map<string, Location> }) {
  const path = locationPath(locationId, byId)
  if (path.length === 0) return <p className="muted">—</p>
  return (
    <ol className="place-steps">
      {path.map((l) => {
        const Icon = KIND_ICON[l.kind]
        return (
          <li key={l.id}>
            <span className="place-step-icon">
              <Icon size={20} aria-hidden />
            </span>
            <span>{l.name}</span>
          </li>
        )
      })}
    </ol>
  )
}

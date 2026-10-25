import type { LocationKind } from '../db'
import { addLocation } from '../data'
import type { Strings } from '../strings'
import type { DialogApi } from './Dialog'

export function addLabel(t: Strings, kind: LocationKind): string {
  return { room: t.addRoom, unit: t.addUnit, spot: t.addSpot, away: t.addAway }[kind]
}

/** Asks for a name in a bottom sheet and creates the place. */
export async function promptAddPlace(
  t: Strings,
  dialog: DialogApi,
  kind: LocationKind,
  parentId: string | null,
): Promise<string | null> {
  const placeholder = { room: t.roomExample, unit: t.unitExample, spot: t.spotExample, away: t.awayExample }[kind]
  const name = await dialog.prompt(addLabel(t, kind), { placeholder })
  if (!name) return null
  return addLocation(name, kind, parentId)
}

export type Screen =
  | { name: 'search' }
  | { name: 'add' }
  | { name: 'places'; locationId: string | null }
  | { name: 'saree'; id: string }
  | { name: 'edit'; id: string }

export interface Nav {
  push(screen: Screen): void
  back(): void
}

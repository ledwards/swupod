/**
 * Cards suspended from constructed play, with the date each suspension took
 * effect. This is the only list of its kind: constructed validation reads it,
 * and a new ban is added here and nowhere else.
 *
 * Sources: Cad Banned (2026-08-24), Meta Update from the Team (2025-11), and the
 * Eternal Format Update (2026-04-15). Limited formats are exempt.
 */
export interface Suspension {
  /** Engine card id (SET_NNN). */
  id: string
  /** First day the card is illegal, UTC. */
  from: string
}

export const PREMIER_SUSPENSIONS: readonly Suspension[] = [
  { id: 'SOR_015', from: '2024-11-08' },
  { id: 'TWI_016', from: '2025-04-11' },
  { id: 'SHD_194', from: '2025-04-11' },
  { id: 'SHD_213', from: '2025-04-11' },
  { id: 'SOR_167', from: '2025-09-22' },
  { id: 'ASH_011', from: '2026-08-31' },
]

/** Eternal suspensions lift once Homeworlds is released. */
export const ETERNAL_SUSPENSIONS: readonly (Suspension & { untilHomeworlds: true })[] = [
  { id: 'JTL_170', from: '2026-04-24', untilHomeworlds: true },
  { id: 'JTL_140', from: '2026-04-24', untilHomeworlds: true },
]

export function suspendedIds(format: 'premier' | 'eternal', now = new Date(), homeworldsReleased = false): string[] {
  const active = (list: readonly Suspension[]) => list.filter(s => now >= new Date(`${s.from}T00:00:00Z`)).map(s => s.id)
  if (format === 'eternal') return homeworldsReleased ? [] : active(ETERNAL_SUSPENSIONS)
  return active(PREMIER_SUSPENSIONS)
}

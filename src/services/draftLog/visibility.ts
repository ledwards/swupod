/**
 * Who may see which seats of a finished draft (Draft Log and its review slideshow).
 *
 * The pod's host makes the whole thing public or private (`pods.is_log_public`);
 * there is no per-player setting.
 *   - Public:  anyone with the link sees every seat.
 *   - Private: the host sees every seat, each drafter sees only their own, and
 *              everyone else sees nothing.
 */
export interface VisibilitySeat { seatNumber: number; userId: string | null }

export function podViewableSeats({ isPublic, hostId, viewerId, seats }: {
  isPublic: boolean
  hostId: string | null
  viewerId: string | null
  seats: VisibilitySeat[]
}): number[] {
  const all = seats.map(s => s.seatNumber)
  if (isPublic) return all
  if (viewerId && viewerId === hostId) return all
  if (!viewerId) return []
  return seats.filter(s => s.userId === viewerId).map(s => s.seatNumber)
}

/**
 * Seat assignment for draft pods.
 *
 * Bots fill seats from the TOP down (max_players → 1) so they appear clockwise
 * from the host's perspective in the player circle (see
 * app/api/draft/[shareId]/dev/add-bots). The host holds seat 1. So a lobby of
 * host + N bots leaves a LOW-numbered GAP (e.g. with a host + 6 bots in an
 * 8-seat pod, seats 1 and 3–8 are taken and seat 2 is free).
 *
 * A human joining must take the lowest UNoccupied seat. The previous join logic
 * computed `seatNumber = players.length + 1`, which counts rows instead of
 * finding a free seat: with the gap above it pointed at seat 8 (already a bot),
 * producing a DUPLICATE seat_number. The lobby render keys each seat by its
 * number (`key={`seat-${seatNumber}`}` in PlayerCircle), so two rows on the same
 * seat became two React children with the same key — one was silently omitted,
 * making the joining human invisible to the host (and everyone) even though the
 * row existed. There is no unique constraint on (pod_id, seat_number), so the
 * bad insert succeeded silently.
 */
export function findNextAvailableSeat(
  takenSeatNumbers: readonly number[],
  maxPlayers: number,
): number | null {
  const taken = new Set(takenSeatNumbers)
  for (let seat = 1; seat <= maxPlayers; seat++) {
    if (!taken.has(seat)) return seat
  }
  return null
}

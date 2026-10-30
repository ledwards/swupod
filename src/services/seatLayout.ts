/**
 * Seat angles around the draft table, in PlayerCircle's convention: 0° is the
 * bottom (the viewer), increasing clockwise.
 *
 * Seats sit on an ellipse the size of the table. Equal angles only space them
 * evenly when the table is square; on a wide, short table they bunch at the
 * left and right ends and their names collide. Spacing seats by equal distance
 * along the ellipse keeps every neighbour the same distance apart.
 */
export function seatAngles(count: number, width: number, height: number): number[] {
  const equal = Array.from({ length: count }, (_, i) => (i * 360) / count)
  if (count < 2 || !(width > 0) || !(height > 0)) return equal

  const STEPS = 1440
  const lengths = [0]
  const at = (i: number) => lengths[i] ?? 0
  let prevX = 0
  let prevY = height
  for (let i = 1; i <= STEPS; i++) {
    const t = (i / STEPS) * 2 * Math.PI
    const x = width * Math.sin(t)
    const y = height * Math.cos(t)
    lengths.push(at(i - 1) + Math.hypot(x - prevX, y - prevY))
    prevX = x
    prevY = y
  }

  const perimeter = at(STEPS)
  let step = 0
  return equal.map((_, seat) => {
    const target = (seat * perimeter) / count
    while (step < STEPS - 1 && at(step + 1) < target) step++
    const span = at(step + 1) - at(step)
    const fraction = span > 0 ? (target - at(step)) / span : 0
    return ((step + fraction) / STEPS) * 360
  })
}

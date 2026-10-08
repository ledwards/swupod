/**
 * pickRandomWindow — deal a consecutive window of pack indices from a sealed box.
 *
 * Real sealed pools are consecutive cuts of a physical box (Set 7+ boxes are
 * collated; see plans/ASH_COLLATION_FINDINGS.md). "Randomize Packs" must
 * therefore re-deal a consecutive window, never a scatter of arbitrary
 * indices — scattered picks cross collation windows and produce measurably
 * clumpier pools (9.95 duplicate-pairs/pool vs 6.4 for consecutive cuts,
 * 11-box calibration, 2026-07-12).
 *
 * @param count - packs in the window (e.g. 6 for sealed)
 * @param boxSize - packs in the box (e.g. 24)
 * @param excludeStart - optional current window start to avoid re-dealing,
 *   ignored when it is the only valid window
 * @returns ascending consecutive indices [start … start+count-1]
 */
export function pickRandomWindow(count: number, boxSize: number, excludeStart?: number): number[] {
  if (count > boxSize) {
    throw new Error(`Cannot cut a ${count}-pack window from a ${boxSize}-pack box`)
  }
  const maxStart = boxSize - count
  let starts = Array.from({ length: maxStart + 1 }, (_, i) => i)
  if (excludeStart != null && starts.length > 1) {
    starts = starts.filter(s => s !== excludeStart)
  }
  const start = starts[Math.floor(Math.random() * starts.length)]!
  return Array.from({ length: count }, (_, i) => start + i)
}

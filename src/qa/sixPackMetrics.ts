/**
 * Six duplicate metrics for a six-pack cut from a 24-pack box.
 *
 * Same printing: two copies of one style. The sheet prints the second copy a
 * few packs later, at distances measured on the opened Ashes boxes. Packs are
 * stacked into two columns; a player opens six packs from one column. An even
 * distance keeps both copies in that column. This count is how often both
 * copies then fall inside the six.
 *
 * Different printing: a hyperspace, foil, or showcase copy of a name that is
 * also in the six as another style. Each such copy hits with probability
 * (distinct normals of its category in the six) / (category size).
 */

export const BOX_PACKS = 24
export const SIXES_PER_BOX = 4

/** Line index (0-based, within a box) → box position (1-based). */
export function boxPosition(lineIndex: number): number {
  const k = lineIndex + 1
  const half = BOX_PACKS / 2
  return k % 2 === 1 ? half - (k - 1) / 2 : BOX_PACKS - (k - 2) / 2
}

function sameSix(lineA: number, lineB: number): boolean {
  if (lineA < 0 || lineB < 0 || lineA >= BOX_PACKS || lineB >= BOX_PACKS) return false
  const a = boxPosition(lineA)
  const b = boxPosition(lineB)
  return Math.floor((a - 1) / 6) === Math.floor((b - 1) / 6)
}

type Weights = Array<[number, number]>

/**
 * Fraction of pairs that land in one six. The first copy is equally likely
 * to sit on any pack of the sheet. `windowStarts` are the line indexes where
 * a box's first pack can fall.
 */
function hitRate(weights: Weights, sheetPacks: number, windowStarts: number[]): number {
  const totalW = weights.reduce((sum, [, w]) => sum + w, 0)
  let acc = 0
  for (const [dist, w] of weights) {
    let good = 0
    let trials = 0
    for (const start of windowStarts) {
      for (let s = 0; s < sheetPacks; s++) {
        trials++
        if (sameSix(s - start, s - start + dist)) good++
      }
    }
    acc += (w / totalW) * (good / trials)
  }
  return acc
}

/** Same, for repeats already known to sit inside one box. */
function hitRateInsideBox(weights: Weights): number {
  let num = 0
  let den = 0
  for (const [dist, w] of weights) {
    const starts: number[] = []
    for (let s = 0; s < BOX_PACKS; s++) if (s + dist < BOX_PACKS) starts.push(s)
    if (starts.length === 0) continue
    const good = starts.filter(s => sameSix(s, s + dist)).length
    num += w * (good / starts.length)
    den += w
  }
  return den === 0 ? 0 : num / den
}

// Commons, six number-verified boxes, line order. 50 cards × 2 on each of
// two lanes, 4 cards a pack → a 25-pack sheet. A box takes the first 24.
const COMMON_GAPS: Weights = [[1, 153], [3, 107], [5, 82], [7, 55], [9, 37], [6, 5], [8, 3], [10, 6]]
const COMMON_PAIRS_PER_BOX_SHEET = 100
const COMMON_SHEET_PACKS = 25

// Uncommons, same six boxes: 40 repeats, about 6.7 of them visible in a box.
const UNCOMMON_GAPS: Weights = [
  [1, 4], [5, 6], [7, 5], [9, 4], [4, 1], [6, 2], [8, 3],
  [11, 4], [13, 1], [15, 3], [17, 4], [19, 1], [21, 1], [23, 1],
]
const UNCOMMON_REPEATS_PER_BOX = 6.7

// Leaders, boxes 1–7. Eight commons × three pairs on a 56-pack sheet.
// A box starts on a 14-pack cell boundary.
const LEADER_GAPS: Weights = [[1, 4], [3, 7], [4, 1], [5, 10], [6, 1], [7, 8], [9, 3]]
const LEADER_PAIRS = 24
const LEADER_SHEET_PACKS = 56
const LEADER_WINDOWS = [0, 14, 28, 42]

// Bases, boxes 1–7. Ashes prints 8 bases twice on a 16-pack sheet, then
// starts the next sheet; a box holds one sheet plus 8 packs of the next.
const BASE_GAPS: Weights = [[1, 11], [3, 19], [4, 4], [5, 8], [6, 1], [7, 8], [8, 2], [9, 3]]
const ASH_BASE_PAIRS = 8
const BASE_SHEET_PACKS = 16

// Rares: about 3 copies on the 400-slot rare stream are pulled a few slots
// closer (6% of 50). A box reads ~19 rare slots of that stream.
const RARE_GAPS: Weights = [[2, 1], [4, 1], [6, 1], [8, 1], [10, 1], [12, 1], [15, 1], [18, 1]]
const RARE_CLOSE_PAIRS = 3
const RARE_STREAM = 400
const RARE_SLOTS_PER_BOX = 19

function perSix(pairs: number, rate: number): number {
  return (pairs * rate) / SIXES_PER_BOX
}

export function commonSamePrinting(): number {
  return perSix(COMMON_PAIRS_PER_BOX_SHEET, hitRate(COMMON_GAPS, COMMON_SHEET_PACKS, [0]))
}

export function uncommonSamePrinting(): number {
  return perSix(UNCOMMON_REPEATS_PER_BOX, hitRateInsideBox(UNCOMMON_GAPS))
}

export function leaderSamePrinting(): number {
  return perSix(LEADER_PAIRS, hitRate(LEADER_GAPS, LEADER_SHEET_PACKS, LEADER_WINDOWS))
}

export function baseSamePrinting(): number {
  const first = perSix(ASH_BASE_PAIRS, hitRate(BASE_GAPS, BASE_SHEET_PACKS, [0]))
  const totalW = BASE_GAPS.reduce((sum, [, w]) => sum + w, 0)
  let rate = 0
  for (const [dist, w] of BASE_GAPS) {
    let good = 0
    for (let s = 0; s < BASE_SHEET_PACKS; s++) {
      if (sameSix(16 + s, 16 + s + dist)) good++
    }
    rate += (w / totalW) * (good / BASE_SHEET_PACKS)
  }
  return first + perSix(ASH_BASE_PAIRS, rate)
}

export function rareSamePrinting(): number {
  return perSix(RARE_CLOSE_PAIRS * (RARE_SLOTS_PER_BOX / RARE_STREAM), hitRateInsideBox(RARE_GAPS))
}

/** Deck, leader, and base same-printing per six packs. */
export function samePrintingTheory(): { deck: number; leader: number; base: number } {
  return {
    deck: commonSamePrinting() + uncommonSamePrinting() + rareSamePrinting(),
    leader: leaderSamePrinting(),
    base: baseSamePrinting(),
  }
}

export function differentPrinting(variantCards: number, normalsInSix: number, poolSize: number): number {
  if (poolSize <= 0) return 0
  return variantCards * (normalsInSix / poolSize)
}

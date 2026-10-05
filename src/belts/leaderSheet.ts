import type { RawCard } from '../utils/cardData'

export const LEADER_COMMON_PRINTS_PER_BOOT = 6
export const LEADER_RARE_PRINTS_PER_BOOT = 1
export const LEADER_DEDUP_WINDOW = 24

type RaritySlot = 'Common' | 'Rare'

interface BuildLeaderBootOptions {
  commonLeaders: RawCard[]
  rareLeaders: RawCard[]
  commonPrintsPerLeader?: number
  rarePrintsPerLeader?: number
  priorCards?: RawCard[]
  equalWeight?: boolean
  // Upper bound on the per-card minimum dedup gap. Sets 1-6 leave this unset
  // and keep LEADER_DEDUP_WINDOW. Line-stacking sets do not place with this
  // cap; they use the measured distance table below.
  dedupWindowCap?: number
  // Set 7+: print each common leader's copies as pairs at the distances
  // measured on the opened ASH boxes, in line order.
  wovenSheet?: boolean
  // Hyperspace leaders are pulled only on an upgraded pack, about one pack in
  // six. Reading the pair sheet in pack order made that leader a neighbor of
  // the normals in the same six. On ASH boxes 1–7 the match rate equals a
  // random normal from the whole box, so successive pulls step this far apart
  // on the sheet.
  hopperStride?: number
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = arr[i]
    arr[i] = arr[j]!
    arr[j] = temp!
  }
  return arr
}

export function leaderIdentityKey(card: RawCard): string {
  return [card.name, card.subtitle || '', card.type || 'Leader'].join('|')
}

function primaryAspect(card: RawCard | undefined): string | null {
  if (!card?.aspects || card.aspects.length === 0) return null
  return card.aspects[0] || null
}

function buildPrintQueue(cards: RawCard[], copiesPerCard: number): RawCard[] {
  const queue: RawCard[] = []
  for (let copy = 0; copy < copiesPerCard; copy++) {
    queue.push(...shuffle([...cards]))
  }
  return queue
}

function buildPrintCycles(cards: RawCard[], copiesPerCard: number): RawCard[][] {
  const cycles: RawCard[][] = []
  for (let copy = 0; copy < copiesPerCard; copy++) {
    cycles.push(shuffle([...cards]))
  }
  return cycles
}

function buildCopyCounts(cards: RawCard[], copiesPerCard: number, counts = new Map<string, number>()): Map<string, number> {
  for (const card of cards) {
    counts.set(leaderIdentityKey(card), copiesPerCard)
  }
  return counts
}

function duplicateDistance(sequence: RawCard[], candidate: RawCard): number | null {
  const key = leaderIdentityKey(candidate)
  for (let i = sequence.length - 1; i >= 0; i--) {
    if (leaderIdentityKey(sequence[i]!) === key) {
      return sequence.length - i
    }
  }
  return null
}

function minDuplicateGap(
  candidate: RawCard,
  totalPrints: number,
  copyCounts: Map<string, number>,
  dedupWindowCap: number,
): number {
  const copies = copyCounts.get(leaderIdentityKey(candidate)) || 1
  if (copies > 1) {
    // Multi-print (common) leaders: Set 7+ caps this gap (real ASH box 001:
    // common-leader repeats at line gaps 3-5).
    let keysWithSamePrintCount = 0
    for (const count of copyCounts.values()) {
      if (count === copies) keysWithSamePrintCount++
    }
    return Math.min(dedupWindowCap, Math.max(1, keysWithSamePrintCount))
  }
  // Single-print (rare) leaders always keep the full window — they repeat only
  // across boot seams, and no close rare-leader repeat exists in real data
  // (box 001: all rare leader pulls distinct on the normal belt).
  return Math.min(LEADER_DEDUP_WINDOW, Math.max(1, Math.floor(totalPrints / copies)))
}

function candidateScore(
  candidate: RawCard,
  sequence: RawCard[],
  totalPrints: number,
  copyCounts: Map<string, number>,
  dedupWindowCap: number,
): number {
  const distance = duplicateDistance(sequence, candidate)
  const minGap = minDuplicateGap(candidate, totalPrints, copyCounts, dedupWindowCap)
  const duplicatePenalty = distance !== null && distance < minGap
    ? (minGap - distance) * 1000
    : 0

  const prevAspect = primaryAspect(sequence[sequence.length - 1])
  const nextAspect = primaryAspect(candidate)
  const aspectPenalty = prevAspect && nextAspect && prevAspect === nextAspect ? 100 : 0

  return duplicatePenalty + aspectPenalty
}

function takeBestCandidate(
  queue: RawCard[],
  sequence: RawCard[],
  totalPrints: number,
  copyCounts: Map<string, number>,
  dedupWindowCap: number,
): RawCard | null {
  if (queue.length === 0) return null

  let bestIndex = 0
  let bestScore = Number.POSITIVE_INFINITY

  for (let i = 0; i < queue.length; i++) {
    const score = candidateScore(queue[i]!, sequence, totalPrints, copyCounts, dedupWindowCap) + Math.random() * 0.001
    if (score < bestScore) {
      bestIndex = i
      bestScore = score
    }
  }

  return queue.splice(bestIndex, 1)[0] || null
}

function buildRarityPattern(commonCount: number, rareCount: number): RaritySlot[] {
  const total = commonCount + rareCount
  const pattern: RaritySlot[] = []
  let commonUsed = 0
  let rareUsed = 0
  let rareAccumulator = Math.random()

  for (let position = 0; position < total; position++) {
    const positionsLeft = total - position
    const commonLeft = commonCount - commonUsed
    const rareLeft = rareCount - rareUsed

    if (rareLeft === positionsLeft) {
      pattern.push('Rare')
      rareUsed++
      continue
    }

    if (commonLeft === positionsLeft) {
      pattern.push('Common')
      commonUsed++
      continue
    }

    rareAccumulator += rareCount / total
    if (rareAccumulator >= 1 && rareLeft > 0) {
      pattern.push('Rare')
      rareUsed++
      rareAccumulator -= 1
    } else {
      pattern.push('Common')
      commonUsed++
    }
  }

  return pattern
}

function rareTooClose(card: RawCard, index: number, priorCards: RawCard[]): boolean {
  if (card.rarity !== 'Rare') return false
  const key = leaderIdentityKey(card)
  for (let i = priorCards.length - 1; i >= 0; i--) {
    const distanceBack = priorCards.length - i
    if (distanceBack > LEADER_DEDUP_WINDOW) break
    if (leaderIdentityKey(priorCards[i]!) === key && distanceBack + index < LEADER_DEDUP_WINDOW) {
      return true
    }
  }
  return false
}

// Same-printing leader distances of 1–9 packs, in line order, from ASH boxes
// 1–7. The table is the sheet. It includes the even distances (4 and 6).
const LEADER_CLOSE_GAPS: number[] = []
for (const [gap, weight] of [
  [1, 4], [3, 7], [4, 1], [5, 10], [6, 1], [7, 8], [9, 3],
] as Array<[number, number]>) {
  for (let i = 0; i < weight; i++) LEADER_CLOSE_GAPS.push(gap)
}

function sampleLeaderCloseGap(): number {
  return LEADER_CLOSE_GAPS[Math.floor(Math.random() * LEADER_CLOSE_GAPS.length)]!
}

/** Six pairs in twelve consecutive packs. Gaps are drawn from LEADER_CLOSE_GAPS. */
function packLeaderPairs(): Array<[number, number]> | null {
  for (let attempt = 0; attempt < 200; attempt++) {
    const gaps = Array.from({ length: 6 }, () => sampleLeaderCloseGap()).sort((a, b) => b - a)
    const used: boolean[] = Array(12).fill(false)
    const placed: Array<[number, number]> = []
    let ok = true
    for (const gap of gaps) {
      const starts: number[] = []
      for (let i = 0; i + gap < 12; i++) {
        if (!used[i] && !used[i + gap]) starts.push(i)
      }
      if (starts.length === 0) {
        ok = false
        break
      }
      const start = starts[Math.floor(Math.random() * starts.length)]!
      used[start] = true
      used[start + gap] = true
      placed.push([start, start + gap])
    }
    if (ok) return placed
  }
  return null
}

/**
 * Line-stacking leader sheet. Each common leader is printed 6 times: three
 * pairs, each pair a distance drawn from the opened-box table, the pairs
 * spread along the sheet. Each rare leader is printed once. The sheet is
 * rotated by a whole cell so no leader is parked at the head.
 */
function buildWovenLeaderBoot(options: BuildLeaderBootOptions): RawCard[] | null {
  const commonPrints = options.commonPrintsPerLeader ?? LEADER_COMMON_PRINTS_PER_BOOT
  const rarePrints = options.rarePrintsPerLeader ?? LEADER_RARE_PRINTS_PER_BOOT
  const commons = options.commonLeaders
  const rares = options.rareLeaders
  if (commons.length !== 8 || rares.length !== 8 || commonPrints !== 6 || rarePrints !== 1) {
    return null
  }

  const priorCards = (options.priorCards || []).slice(-LEADER_DEDUP_WINDOW)
  const cell = 14
  const cells = 4
  const line: Array<RawCard | null> = new Array(cells * cell).fill(null)

  for (let block = 0; block < cells; block++) {
    const pairs = packLeaderPairs()
    if (!pairs) return null
    const inCell = shuffle(commons.filter((_, index) => index % cells !== block))
    const base = block * cell
    pairs.forEach((pair, pairIndex) => {
      const card = inCell[pairIndex]
      if (!card) return
      line[base + pair[0]] = card
      line[base + pair[1]] = card
    })
  }

  const rot = Math.floor(Math.random() * cells) * cell
  const rotated = line.slice(rot).concat(line.slice(0, rot))
  const holes: number[] = []
  for (let i = 0; i < rotated.length; i++) if (rotated[i] === null) holes.push(i)
  if (holes.length !== rares.length) return null

  const remaining = shuffle([...rares])
  for (const hole of holes) {
    let pick = remaining.findIndex(card => !rareTooClose(card, hole, priorCards))
    if (pick < 0) pick = 0
    const card = remaining.splice(pick, 1)[0]
    if (!card) return null
    rotated[hole] = card
  }

  if (rotated.some(card => card === null)) return null
  const sheet = rotated as RawCard[]
  return options.hopperStride && options.hopperStride > 1
    ? strideHopper(sheet, options.hopperStride)
    : sheet
}

/** Every card once, successive pulls `stride` positions apart on the sheet. */
function strideHopper(sheet: RawCard[], stride: number): RawCard[] {
  const used: boolean[] = new Array(sheet.length).fill(false)
  const out: RawCard[] = []
  for (let start = 0; start < sheet.length; start++) {
    if (used[start]) continue
    let pos = start
    while (!used[pos]) {
      used[pos] = true
      out.push(sheet[pos]!)
      pos = (pos + stride) % sheet.length
    }
  }
  return out
}

export function buildLeaderSheetBoot(options: BuildLeaderBootOptions): RawCard[] {
  if (options.wovenSheet && !options.equalWeight) {
    const woven = buildWovenLeaderBoot(options)
    if (woven) return woven
    console.warn('Leader sheet: measured-distance placement failed, using the spacing solver')
  }

  const commonPrintsPerLeader = options.commonPrintsPerLeader ?? LEADER_COMMON_PRINTS_PER_BOOT
  const rarePrintsPerLeader = options.rarePrintsPerLeader ?? LEADER_RARE_PRINTS_PER_BOOT
  const priorCards = (options.priorCards || []).slice(-LEADER_DEDUP_WINDOW)
  const dedupWindowCap = options.dedupWindowCap ?? LEADER_DEDUP_WINDOW
  const sequence = [...priorCards]
  const boot: RawCard[] = []

  if (options.equalWeight) {
    const allLeaders = [...options.commonLeaders, ...options.rareLeaders]
    const queue = shuffle([...allLeaders])
    const copyCounts = buildCopyCounts(allLeaders, 1)
    const totalPrints = queue.length

    while (queue.length > 0) {
      const next = takeBestCandidate(queue, sequence, totalPrints, copyCounts, dedupWindowCap)
      if (!next) break
      boot.push(next)
      sequence.push(next)
    }

    return boot
  }

  const commonCycles = buildPrintCycles(options.commonLeaders, commonPrintsPerLeader)
  const rareQueue = buildPrintQueue(options.rareLeaders, rarePrintsPerLeader)
  const commonPrintCount = options.commonLeaders.length * commonPrintsPerLeader
  const totalPrints = commonPrintCount + rareQueue.length
  const copyCounts = buildCopyCounts(options.commonLeaders, commonPrintsPerLeader)
  buildCopyCounts(options.rareLeaders, rarePrintsPerLeader, copyCounts)

  const rarityPattern = buildRarityPattern(commonPrintCount, rareQueue.length)
  for (const slot of rarityPattern) {
    while (commonCycles.length > 0 && commonCycles[0]!.length === 0) {
      commonCycles.shift()
    }

    const commonQueue = commonCycles[0] || []
    const preferredQueue = slot === 'Rare' ? rareQueue : commonQueue
    const fallbackQueue = slot === 'Rare' ? commonQueue : rareQueue
    const next =
      takeBestCandidate(preferredQueue, sequence, totalPrints, copyCounts, dedupWindowCap) ||
      takeBestCandidate(fallbackQueue, sequence, totalPrints, copyCounts, dedupWindowCap)

    if (!next) break
    boot.push(next)
    sequence.push(next)
  }

  return boot
}

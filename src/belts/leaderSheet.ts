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
  // Upper bound on the per-card minimum dedup gap. Set 7+ (LAW/ASH) pass 3 so
  // common-leader repeats can occur at line gap 3 (real ASH box 001: gaps 3,4,5).
  // Undefined keeps the default LEADER_DEDUP_WINDOW cap (Sets 1-6 unchanged).
  dedupWindowCap?: number
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

export function buildLeaderSheetBoot(options: BuildLeaderBootOptions): RawCard[] {
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

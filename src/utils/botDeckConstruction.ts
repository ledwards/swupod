// @ts-nocheck
/** Existing draft-bot deck construction, without persistence, broadcasts or Discord. */
import { createStrategy } from '../bots/behaviors/index'
import { ALL_MIXINS } from '../bots/behaviors/mixins'
import { getCardsBySet } from './cardData'
import { jsonParse } from './json'
const DECK_SIZE = 30
export const BOT_DECK_BUILDER_VERSION = 'limited-pool-v1'

export function constructBotDeck(bot: Record<string, unknown>, setCode: string) {
  const draftedLeaders = structuredClone(jsonParse(bot.drafted_leaders, []))
  const draftedCards = structuredClone(jsonParse(bot.drafted_cards, []))
  if (!Array.isArray(draftedLeaders) || !Array.isArray(draftedCards) || !draftedLeaders.length) return null
  // 1. Select best leader using the SAME strategy used during the draft
  // Look up persisted mixin by name, fall back to random if not found
  const mixinObj = bot.mixin_name
    ? ALL_MIXINS.find(m => m.name === bot.mixin_name) || null
    : null
  const strategy = createStrategy(bot.strategy_name as string || undefined, mixinObj)
  const committedLeader = resolveCommittedLeader(draftedLeaders, bot.committed_leader)
  const selectedLeader = committedLeader || strategy.selectLeader(draftedLeaders, {
    setCode,
    draftedCards,
  })

  if (!selectedLeader) return null

  // 2. Use the draft-time base plan when it exists; older rows fall back gracefully.
  const committedBaseColor = getCommittedBaseColor(bot.committed_base_color)
  const selectedBase = committedBaseColor
    ? selectBaseForColor(draftedCards, selectedLeader, setCode, committedBaseColor)
    : selectBestBase(draftedCards, selectedLeader, setCode)

  // 3. Score and sort all drafted cards using the strategy's scoring
  // Simulate the committed draft state so cards are scored in-lane.
  strategy.committedLeader = selectedLeader
  strategy.committedBaseColor = committedBaseColor || getBaseNewColor(selectedLeader, selectedBase)

  // Filter and score cards for deck building
  const leaderAspects = (selectedLeader.aspects as string[]) || []
  const leaderAlignment = leaderAspects.find(a => a === 'Heroism' || a === 'Villainy')
  const opposingAlignment = leaderAlignment === 'Villainy' ? 'Heroism'
    : leaderAlignment === 'Heroism' ? 'Villainy'
    : null

  const scoredCards = draftedCards
    .filter(c => {
      if (c.isLeader || c.isBase) return false
      return true
    })
    .map(card => ({
      card,
      score: strategy._scoreCard(card, [selectedLeader], draftedCards, 42, null, { setCode }),
      isOpposingAlignment: opposingAlignment ? ((card.aspects as string[]) || []).includes(opposingAlignment) : false,
    }))
    .sort((a, b) => b.score - a.score)

  // 4. Take top DECK_SIZE for deck, rest for sideboard
  // Enforce hard caps:
  // - Max 5 off-aspect cards (LAW splash rule)
  // - Max 1 opposing alignment card (0 preferred, 1 allowed if pool is thin)
  const leaderColors = leaderAspects.filter(a => COLOR_ASPECTS.includes(a))
  const baseAspects = ((selectedBase as Record<string, unknown>).aspects as string[]) || []
  const baseColors = baseAspects.filter(a => COLOR_ASPECTS.includes(a))
  const inAspectColors = [...new Set([...leaderColors, ...baseColors])]
  const MAX_OFF_ASPECT = 5
  const MAX_OPPOSING_ALIGNMENT = 1

  const deckCards: Record<string, unknown>[] = []
  const sideboardCards: Record<string, unknown>[] = []
  let offAspectInDeck = 0
  let opposingInDeck = 0

  for (const { card, isOpposingAlignment } of scoredCards) {
    const cardColors = ((card.aspects as string[]) || []).filter(a => COLOR_ASPECTS.includes(a))
    const isOffAspect = cardColors.length > 0 && !cardColors.some(a => inAspectColors.includes(a))

    if (deckCards.length < DECK_SIZE) {
      if (isOpposingAlignment && opposingInDeck >= MAX_OPPOSING_ALIGNMENT) {
        sideboardCards.push(card)
      } else if (isOffAspect && offAspectInDeck >= MAX_OFF_ASPECT) {
        sideboardCards.push(card)
      } else {
        deckCards.push(card)
        if (isOffAspect) offAspectInDeck++
        if (isOpposingAlignment) opposingInDeck++
      }
    } else {
      sideboardCards.push(card)
    }
  }

  // Backfill: if deck is still under 30 after enforcing caps,
  // pull the best remaining sideboard cards (already sorted by score)
  while (deckCards.length < DECK_SIZE && sideboardCards.length > 0) {
    deckCards.push(sideboardCards.shift()!)
  }

  // 5. Build card positions for deck builder state
  const cardPositions: Record<string, unknown> = {}
  let posIndex = 0

  // Add all leaders
  for (const leader of draftedLeaders) {
    const posId = `pos_${posIndex++}`
    cardPositions[posId] = {
      card: leader,
      section: 'leaders',
      visible: true,
      enabled: true,
    }
  }

  // Track active leader/base position IDs
  let activeLeaderPos: string | null = null
  let activeBasePos: string | null = null

  // Find the active leader position
  for (const [posId, pos] of Object.entries(cardPositions)) {
    const p = pos as Record<string, unknown>
    const card = p.card as Record<string, unknown>
    if (card.isLeader && matchCard(card, selectedLeader)) {
      activeLeaderPos = posId
      break
    }
  }

  // Add selected base
  const basePos = `pos_${posIndex++}`
  cardPositions[basePos] = {
    card: selectedBase,
    section: 'bases',
    visible: true,
    enabled: true,
  }
  activeBasePos = basePos

  // Add deck cards
  for (const card of deckCards) {
    const posId = `pos_${posIndex++}`
    cardPositions[posId] = {
      card,
      section: 'deck',
      visible: true,
      enabled: true,
    }
  }

  // Add sideboard cards
  for (const card of sideboardCards) {
    const posId = `pos_${posIndex++}`
    cardPositions[posId] = {
      card,
      section: 'sideboard',
      visible: true,
      enabled: true,
    }
  }

  const deckBuilderState = {
    cardPositions,
    activeLeader: activeLeaderPos,
    activeBase: activeBasePos,
  }

  return { selectedLeader, selectedBase, deckCards, sideboardCards, deckBuilderState,
    strategyName: strategy.strategyName, mixinName: strategy.mixin?.name || '' }
}

const COLOR_ASPECTS = ['Vigilance', 'Command', 'Aggression', 'Cunning']

/**
 * Get the new color that the base adds beyond the leader's colors.
 * Returns the first base color aspect not present on the leader.
 */
export function getBaseNewColor(leader: Record<string, unknown>, base: Record<string, unknown>): string | null {
  const leaderAspects = (leader.aspects as string[]) || []
  const leaderColors = leaderAspects.filter(a => COLOR_ASPECTS.includes(a))
  const baseAspects = (base.aspects as string[]) || []
  const baseColors = baseAspects.filter(a => COLOR_ASPECTS.includes(a))
  const newColors = baseColors.filter(c => !leaderColors.includes(c))
  return newColors.length > 0 ? newColors[0]! : null
}

/**
 * Score a base for a given leader. Pure function, exported for testing.
 * Common bases have exactly 1 color aspect.
 * The base's color must NOT match any of the leader's colors — it provides a new third color.
 */
export function scoreBaseForLeader(
  leaderAspects: string[],
  baseAspects: string[]
): number {
  const leaderColors = leaderAspects.filter(a => COLOR_ASPECTS.includes(a))
  const baseColors = baseAspects.filter(a => COLOR_ASPECTS.includes(a))

  // Base has 1 color. If it matches a leader color, it's terrible (double-color).
  // If it's a new color, it's good (adds a third color to the deck).
  const isNewColor = baseColors.length > 0 && !baseColors.some(c => leaderColors.includes(c))

  return isNewColor ? 10 : -100
}

/**
 * Select the best common base for the bot's leader.
 * Picks a random base whose color is NOT one of the leader's colors.
 */
export function selectBestBase(
  draftedCards: Record<string, unknown>[],
  selectedLeader: Record<string, unknown>,
  setCode: string
): Record<string, unknown> {
  const allSetCards = getCardsBySet(setCode)
  const commonBases = allSetCards.filter(
    c => c.isBase && c.rarity === 'Common' && c.variantType === 'Normal'
  )

  if (commonBases.length === 0) {
    const anyBase = allSetCards.find(c => c.isBase && c.variantType === 'Normal')
    return anyBase || { id: 'unknown-base', name: 'Unknown Base', isBase: true }
  }

  const leaderAspects = (selectedLeader.aspects as string[]) || []

  // Filter to bases that add a new color (not matching leader colors)
  const validBases = commonBases.filter(base => {
    const baseAspects = (base.aspects || []) as string[]
    return scoreBaseForLeader(leaderAspects, baseAspects) > 0
  })

  const pool = validBases.length > 0 ? validBases : commonBases
  return pickBestBaseForPool(pool, draftedCards, selectedLeader)
}

/**
 * Select the best base for a previously committed base color.
 * Falls back to generic selection if the persisted color is invalid or unavailable.
 */
export function selectBaseForColor(
  draftedCards: Record<string, unknown>[],
  selectedLeader: Record<string, unknown>,
  setCode: string,
  committedBaseColor: string
): Record<string, unknown> {
  const allSetCards = getCardsBySet(setCode)
  const commonBases = allSetCards.filter(
    c => c.isBase && c.rarity === 'Common' && c.variantType === 'Normal'
  )

  const colorMatchedBases = commonBases.filter(base => {
    const baseColors = ((base.aspects || []) as string[]).filter(a => COLOR_ASPECTS.includes(a))
    return baseColors.includes(committedBaseColor)
  })

  const leaderAspects = (selectedLeader.aspects as string[]) || []
  const validBases = colorMatchedBases.filter(base => {
    const baseAspects = (base.aspects || []) as string[]
    return scoreBaseForLeader(leaderAspects, baseAspects) > 0
  })

  const pool = validBases.length > 0 ? validBases : colorMatchedBases
  if (pool.length === 0) {
    return selectBestBase(draftedCards, selectedLeader, setCode)
  }

  return pickBestBaseForPool(pool, draftedCards, selectedLeader)
}

/**
 * Resolve a persisted committed leader back onto the drafted leader objects.
 * Returns null for legacy rows or stale data that doesn't belong to this pool.
 */
export function resolveCommittedLeader(
  draftedLeaders: Record<string, unknown>[],
  committedLeaderValue: unknown
): Record<string, unknown> | null {
  const committedLeader = jsonParse<Record<string, unknown>>(committedLeaderValue as Record<string, unknown> | string | null, null)
  if (!committedLeader) return null
  return draftedLeaders.find(leader => matchCard(leader, committedLeader)) || null
}

function getCommittedBaseColor(committedBaseColorValue: unknown): string | null {
  if (typeof committedBaseColorValue !== 'string') return null
  return COLOR_ASPECTS.includes(committedBaseColorValue) ? committedBaseColorValue : null
}

function pickBestBaseForPool(
  basePool: Record<string, unknown>[],
  draftedCards: Record<string, unknown>[],
  selectedLeader: Record<string, unknown>
): Record<string, unknown> {
  if (basePool.length === 0) {
    return { id: 'unknown-base', name: 'Unknown Base', isBase: true }
  }

  const leaderAspects = (selectedLeader.aspects as string[]) || []
  const leaderAlignment = leaderAspects.find(a => a === 'Heroism' || a === 'Villainy')
  const opposingAlignment = leaderAlignment === 'Villainy'
    ? 'Heroism'
    : leaderAlignment === 'Heroism'
      ? 'Villainy'
      : null

  const scoreBase = (base: Record<string, unknown>): number => {
    const baseColor = getBaseNewColor(selectedLeader, base)
    if (!baseColor) return -Infinity

    let score = 0
    for (const card of draftedCards) {
      if (card.isLeader || card.isBase) continue

      const cardAspects = (card.aspects as string[]) || []
      if (cardAspects.includes(baseColor)) {
        score += cardAspects.includes(leaderAlignment as string) ? 4 : 3
      }

      if (opposingAlignment && cardAspects.includes(opposingAlignment)) {
        score -= 2
      }
    }

    return score
  }

  return [...basePool].sort((a, b) => scoreBase(b) - scoreBase(a))[0] || basePool[0]!
}

/**
 * Check if two card objects represent the same card
 */
function matchCard(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  if (a.instanceId && a.instanceId === b.instanceId) return true
  if (a.id && a.id === b.id) return true
  return false
}

// @ts-nocheck
/**
 * Bot Deck Builder
 *
 * After a draft completes, this module builds decks for bot players.
 * It selects a leader, picks a base, scores cards, and builds a 30-card deck.
 * It then creates the pool, deck builder state, and built deck records.
 */

import { query, queryRow, queryRows } from '@/lib/db'
import { buildDeckFromState } from '@/lib/deckBuilder'
import { createStrategy } from '@/src/bots/behaviors/index'
import { ALL_MIXINS } from '@/src/bots/behaviors/mixins'
import { STRATEGY_DISPLAY_NAMES, STRATEGY_DESCRIPTIONS, MIXIN_DISPLAY_NAMES, MIXIN_DESCRIPTIONS } from '@/src/bots/behaviors/strategyDescriptions'
import { postBotDeckSummaries } from '@/lib/discordLfg'
import { getCardsBySet } from '@/src/utils/cardData'
import { broadcastPodState } from '@/src/lib/socketBroadcast'
import { nanoid } from 'nanoid'

const DECK_SIZE = 30

/**
 * Build decks for all bot players in a completed draft pod.
 * Creates card_pools, deck_builder_state, and built_decks records.
 */
interface BotDeckSummary {
  botName: string
  strategyName: string
  mixinName: string
  poolShareId: string
  leaderName: string
  leaderImageUrl: string
  baseName: string
  baseRarity: string
  baseAspects: string[]
  baseHp: number | null
  deckSize: number
}

export async function buildBotDecks(podId: string, setCode: string, settings: Record<string, unknown> = {}): Promise<void> {
  // Get all bot players in this pod (includes strategy_name, mixin_name)
  const botPlayers = await queryRows(
    `SELECT pp.*, u.username as bot_username
     FROM pod_players pp
     LEFT JOIN users u ON u.id = pp.user_id
     WHERE pp.pod_id = $1 AND pp.is_bot = true`,
    [podId]
  )

  if (!botPlayers || botPlayers.length === 0) return

  // Get the pod for metadata
  const pod = await queryRow(
    'SELECT * FROM pods WHERE id = $1',
    [podId]
  )

  if (!pod) return

  const summaries: BotDeckSummary[] = []

  for (const bot of botPlayers) {
    try {
      const summary = await buildSingleBotDeck(bot, pod, setCode, settings)
      if (summary) summaries.push(summary)
    } catch (err) {
      console.error(`[BOT_DECK] Error building deck for bot ${bot.id}:`, err)
    }
  }

  // Post bot deck summaries to Discord (one message per bot)
  if (summaries.length > 0) {
    const APP_URL = process.env['APP_URL'] || process.env['NEXT_PUBLIC_APP_URL'] || 'http://localhost:3000'
    const podName = (pod.name as string) || `${setCode} Draft`

    // Get host name and all player names for the pod
    const hostUser = await queryRow('SELECT username FROM users WHERE id = $1', [pod.host_id])
    const allPlayers = await queryRows(
      `SELECT u.username FROM pod_players pp JOIN users u ON u.id = pp.user_id WHERE pp.pod_id = $1 ORDER BY pp.seat_number`,
      [podId]
    )
    const hostName = (hostUser?.username as string) || 'Unknown'
    const playerNames = allPlayers.map(p => p.username as string)
    const discordSummaries = summaries.map(s => {
      // For common bases, show aspect(s) + HP. For rare+ bases, show the full name.
      const baseDisplay = s.baseRarity === 'Common'
        ? `${s.baseAspects.filter(a => COLOR_ASPECTS.includes(a)).join('/') || s.baseName}${s.baseHp ? ` (${s.baseHp} HP)` : ''}`
        : s.baseName

      return {
        botName: s.botName,
        strategyDisplayName: STRATEGY_DISPLAY_NAMES[s.strategyName] || s.strategyName || 'Unknown',
        mixinDisplayName: MIXIN_DISPLAY_NAMES[s.mixinName] || s.mixinName || 'None',
        strategyDescription: STRATEGY_DESCRIPTIONS[s.strategyName] || '',
        mixinDescription: MIXIN_DESCRIPTIONS[s.mixinName] || '',
        poolUrl: `${APP_URL}/pool/${s.poolShareId}/deck`,
        poolShareId: s.poolShareId,
        leaderName: s.leaderName,
        leaderImageUrl: s.leaderImageUrl,
        baseDisplay,
        deckSize: s.deckSize,
      }
    })

    postBotDeckSummaries(podName, setCode, discordSummaries, {
      hostName,
      playerNames,
    }).catch(err =>
      console.error('[BOT_DECK] Error posting Discord bot summaries:', err)
    )
  }
}

async function buildSingleBotDeck(
  bot: Record<string, unknown>,
  pod: Record<string, unknown>,
  setCode: string,
  settings: Record<string, unknown>
): Promise<BotDeckSummary | null> {
  // Check if pool already exists for this bot
  const existingPool = await queryRow(
    'SELECT share_id FROM card_pools WHERE pod_id = $1 AND user_id = $2',
    [pod.id, bot.user_id]
  )
  if (existingPool) return null // Already built

  // Parse drafted leaders and cards
  const draftedLeaders = typeof bot.drafted_leaders === 'string'
    ? JSON.parse(bot.drafted_leaders)
    : bot.drafted_leaders || []

  const draftedCards = typeof bot.drafted_cards === 'string'
    ? JSON.parse(bot.drafted_cards)
    : bot.drafted_cards || []

  if (draftedLeaders.length === 0 && draftedCards.length === 0) return null

  // 1. Select best leader using the SAME strategy used during the draft
  // Look up persisted mixin by name, fall back to random if not found
  const mixinObj = bot.mixin_name
    ? ALL_MIXINS.find(m => m.name === bot.mixin_name) || null
    : null
  const strategy = createStrategy(bot.strategy_name as string || undefined, mixinObj)
  const selectedLeader = strategy.selectLeader(draftedLeaders, { setCode })

  if (!selectedLeader) return null

  // 2. Select best common base
  const selectedBase = selectBestBase(draftedLeaders, selectedLeader, setCode)

  // 3. Score and sort all drafted cards using the strategy's scoring
  // Simulate a committed state so cards are scored in-color
  strategy.committedLeader = selectedLeader
  strategy.committedBaseColor = getBaseNewColor(selectedLeader, selectedBase)

  // Hard-filter opposing alignment cards — Heroism never goes in Villainy deck and vice versa
  const leaderAspects = (selectedLeader.aspects as string[]) || []
  const leaderAlignment = leaderAspects.find(a => a === 'Heroism' || a === 'Villainy')
  const opposingAlignment = leaderAlignment === 'Villainy' ? 'Heroism'
    : leaderAlignment === 'Heroism' ? 'Villainy'
    : null

  const scoredCards = draftedCards
    .filter(c => {
      if (c.isLeader || c.isBase) return false
      // Absolute ban on opposing alignment
      if (opposingAlignment && (c.aspects || []).includes(opposingAlignment)) return false
      return true
    })
    .map(card => ({
      card,
      score: strategy._scoreCard(card, [selectedLeader], draftedCards, 42, null, { setCode })
    }))
    .sort((a, b) => b.score - a.score)

  // 4. Take top DECK_SIZE for deck, rest for sideboard
  // Enforce hard cap: max 5 off-aspect cards in deck (LAW splash rule)
  const leaderColors = leaderAspects.filter(a => COLOR_ASPECTS.includes(a))
  const baseAspects = ((selectedBase as Record<string, unknown>).aspects as string[]) || []
  const baseColors = baseAspects.filter(a => COLOR_ASPECTS.includes(a))
  const inAspectColors = [...new Set([...leaderColors, ...baseColors])]
  const MAX_OFF_ASPECT = 5

  const deckCards: Record<string, unknown>[] = []
  const sideboardCards: Record<string, unknown>[] = []
  let offAspectInDeck = 0

  for (const { card } of scoredCards) {
    const cardColors = ((card.aspects as string[]) || []).filter(a => COLOR_ASPECTS.includes(a))
    const isOffAspect = cardColors.length > 0 && !cardColors.some(a => inAspectColors.includes(a))

    if (deckCards.length < DECK_SIZE) {
      if (isOffAspect && offAspectInDeck >= MAX_OFF_ASPECT) {
        // Off-aspect cap reached — send to sideboard
        sideboardCards.push(card)
      } else {
        deckCards.push(card)
        if (isOffAspect) offAspectInDeck++
      }
    } else {
      sideboardCards.push(card)
    }
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

  // 6. Create card_pools record
  const allCards = [...draftedLeaders, ...draftedCards]

  // Group drafted cards by pack number
  const packsByRound: Record<number, unknown[]> = {}
  for (const card of draftedCards) {
    const packNum = card.packNumber || 1
    if (!packsByRound[packNum]) packsByRound[packNum] = []
    packsByRound[packNum].push(card)
  }
  for (const packNum of Object.keys(packsByRound)) {
    packsByRound[Number(packNum)].sort((a, b) => (a.pickNumber || 0) - (b.pickNumber || 0))
  }
  const formattedPacks = Object.keys(packsByRound)
    .sort((a, b) => Number(a) - Number(b))
    .map(packNum => ({ cards: packsByRound[Number(packNum)] }))

  const poolShareId = nanoid(8)
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const year = String(now.getFullYear()).slice(-2)

  const chaosSets = settings.draftMode === 'chaos' && settings.chaosSets
  const poolSetCode = chaosSets ? (chaosSets as string[]).join(',') : setCode
  const setName = pod.set_name || setCode
  const defaultName = `${setCode} Draft ${month}/${day}/${year}`

  const poolResult = await queryRow(
    `INSERT INTO card_pools (
      user_id,
      share_id,
      set_code,
      set_name,
      pool_type,
      name,
      cards,
      packs,
      pod_id,
      deck_builder_state,
      is_public
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING id`,
    [
      bot.user_id,
      poolShareId,
      poolSetCode,
      setName,
      'draft',
      defaultName,
      JSON.stringify(allCards),
      JSON.stringify(formattedPacks),
      pod.id,
      JSON.stringify(deckBuilderState),
      true,
    ]
  )

  // 7. Build the deck record
  try {
    const builtDeck = buildDeckFromState(deckBuilderState, setCode)
    if (poolResult?.id && builtDeck.leader && builtDeck.base && builtDeck.deck.length > 0) {
      await query(
        `INSERT INTO built_decks (card_pool_id, user_id, set_code, pool_type, leader, base, deck, sideboard)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (card_pool_id) DO UPDATE SET
           leader = EXCLUDED.leader,
           base = EXCLUDED.base,
           deck = EXCLUDED.deck,
           sideboard = EXCLUDED.sideboard,
           built_at = NOW()`,
        [
          poolResult.id,
          bot.user_id,
          setCode,
          'draft',
          JSON.stringify(builtDeck.leader),
          JSON.stringify(builtDeck.base),
          JSON.stringify(builtDeck.deck),
          JSON.stringify(builtDeck.sideboard),
        ]
      )
    }
  } catch (err) {
    console.error(`[BOT_DECK] Error creating built_decks record:`, err)
  }

  // 8. Broadcast pod state update so pod page shows bots as "Ready"
  if (pod.share_id) {
    broadcastPodState(pod.share_id as string).catch(() => {})
  }

  // Return summary for Discord posting
  const leader = selectedLeader as Record<string, unknown>
  const base = selectedBase as Record<string, unknown>
  return {
    botName: (bot.bot_username as string) || 'Unknown Bot',
    strategyName: (bot.strategy_name as string) || strategy.strategyName,
    mixinName: (bot.mixin_name as string) || strategy.mixin?.name || '',
    poolShareId,
    leaderName: (leader.name as string) || 'Unknown',
    leaderImageUrl: (leader.imageUrl as string) || '',
    baseName: (base.name as string) || 'Unknown Base',
    baseRarity: (base.rarity as string) || 'Common',
    baseAspects: (base.aspects as string[]) || [],
    baseHp: (base.hp as number) || null,
    deckSize: deckCards.length,
  }
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
function selectBestBase(
  draftedLeaders: Record<string, unknown>[],
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

  // Pick a random valid base, or fall back to any common base
  const pool = validBases.length > 0 ? validBases : commonBases
  return pool[Math.floor(Math.random() * pool.length)]
}

/**
 * Check if two card objects represent the same card
 */
function matchCard(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  if (a.instanceId && a.instanceId === b.instanceId) return true
  if (a.id && a.id === b.id) return true
  return false
}

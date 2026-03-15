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

  // Post bot deck summaries to Discord
  if (summaries.length > 0) {
    const APP_URL = process.env['APP_URL'] || process.env['NEXT_PUBLIC_APP_URL'] || 'http://localhost:3000'
    const podName = (pod.name as string) || `${setCode} Draft`

    const discordSummaries = summaries.map(s => ({
      botName: s.botName,
      strategyDisplayName: STRATEGY_DISPLAY_NAMES[s.strategyName] || s.strategyName || 'Unknown',
      mixinDisplayName: MIXIN_DISPLAY_NAMES[s.mixinName] || s.mixinName || 'None',
      strategyDescription: STRATEGY_DESCRIPTIONS[s.strategyName] || '',
      mixinDescription: MIXIN_DESCRIPTIONS[s.mixinName] || '',
      poolUrl: `${APP_URL}/pool/${s.poolShareId}/deck`,
      leaderName: s.leaderName,
      deckSize: s.deckSize,
    }))

    postBotDeckSummaries(podName, setCode, discordSummaries).catch(err =>
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
  strategy.committedBaseColor = selectBestBaseColor(selectedLeader)

  const scoredCards = draftedCards
    .filter(c => !c.isLeader && !c.isBase)
    .map(card => ({
      card,
      score: strategy._scoreCard(card, [selectedLeader], draftedCards, 42, null, { setCode })
    }))
    .sort((a, b) => b.score - a.score)

  // 4. Take top DECK_SIZE for deck, rest for sideboard
  const deckCards = scoredCards.slice(0, DECK_SIZE).map(s => s.card)
  const sideboardCards = scoredCards.slice(DECK_SIZE).map(s => s.card)

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
      deck_builder_state
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
  return {
    botName: (bot.bot_username as string) || 'Unknown Bot',
    strategyName: (bot.strategy_name as string) || strategy.strategyName,
    mixinName: (bot.mixin_name as string) || strategy.mixin?.name || '',
    poolShareId,
    leaderName: (selectedLeader as Record<string, unknown>).name as string || 'Unknown',
    deckSize: deckCards.length,
  }
}

const COLOR_ASPECTS = ['Vigilance', 'Command', 'Aggression', 'Cunning']

/**
 * Pick the best non-leader color aspect for the base from the leader's aspects.
 * Returns the first non-color aspect found, or a random missing color.
 */
function selectBestBaseColor(leader: Record<string, unknown>): string | null {
  const leaderAspects = (leader.aspects as string[]) || []
  const leaderColors = leaderAspects.filter(a => COLOR_ASPECTS.includes(a))
  const missingColors = COLOR_ASPECTS.filter(c => !leaderColors.includes(c))
  return missingColors.length > 0
    ? missingColors[Math.floor(Math.random() * missingColors.length)]!
    : null
}

/**
 * Select the best common base for the bot's leader.
 * Picks the base whose aspects maximize in-aspect card count.
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
    // Fallback: just use first base available
    const anyBase = allSetCards.find(c => c.isBase && c.variantType === 'Normal')
    return anyBase || { id: 'unknown-base', name: 'Unknown Base', isBase: true }
  }

  const leaderAspects = (selectedLeader.aspects as string[]) || []

  // Score each base by how many of its aspects overlap with leader aspects
  let bestBase = commonBases[0]
  let bestScore = -1

  for (const base of commonBases) {
    const baseAspects = base.aspects || []
    let score = 0

    for (const aspect of baseAspects) {
      if (leaderAspects.includes(aspect)) {
        score += 2 // Matching leader aspect is great
      } else {
        score += 1 // Any aspect adds some value (splash)
      }
    }

    if (score > bestScore) {
      bestScore = score
      bestBase = base
    }
  }

  return bestBase
}

/**
 * Check if two card objects represent the same card
 */
function matchCard(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  if (a.instanceId && a.instanceId === b.instanceId) return true
  if (a.id && a.id === b.id) return true
  return false
}

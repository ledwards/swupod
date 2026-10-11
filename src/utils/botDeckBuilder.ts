// @ts-nocheck
/**
 * Bot Deck Builder
 *
 * After a draft completes, this module builds decks for bot players.
 * It selects a leader, picks a base, scores cards, and builds a 30-card deck.
 * It then creates the pool, deck builder state, and built deck records.
 */

import { query, queryRow, queryRows, withAdvisoryLock } from '@/lib/db'
import { buildDeckFromState, type BuiltDeckData } from '@/lib/deckBuilder'
import { initializeCardCache } from './cardCache'
import { jsonParse } from './json'
import { STRATEGY_DISPLAY_NAMES, STRATEGY_DESCRIPTIONS, MIXIN_DISPLAY_NAMES, MIXIN_DESCRIPTIONS } from '@/src/bots/behaviors/strategyDescriptions'
import { postBotDeckSummaries } from '@/lib/discordLfg'
import { broadcastPodState, broadcastDraftState } from '@/src/lib/socketBroadcast'
import { nanoid } from 'nanoid'

import { constructBotDeck } from './botDeckConstruction'
export { getBaseNewColor, scoreBaseForLeader, selectBestBase, selectBaseForColor, resolveCommittedLeader } from './botDeckConstruction'
const COLOR_ASPECTS = ['Vigilance', 'Command', 'Aggression', 'Cunning']

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
  leaderCardId?: string
  leaderVariantType?: string
  baseName: string
  baseCardId?: string
  baseVariantType?: string
  baseRarity: string
  baseAspects: string[]
  baseHp: number | null
  deckSize: number
  deckCards: Array<{ name: string; cardId?: string; subtitle?: string; variantType?: string }>
}

/** A deck the bot can play: a leader, a base and at least 30 cards. */
export function isPlayableBotDeck(built: BuiltDeckData | null | undefined): built is BuiltDeckData {
  if (!built?.leader?.id || !built.base?.id) return false
  return built.deck.reduce((sum, entry) => sum + entry.count, 0) >= 30
}

/**
 * Build every bot's deck in a pod: at the end of the draft, and lazily for pods
 * that finished without them. Idempotent: a bot with a built deck is skipped,
 * and a bot whose pool exists without a built deck gets one. One builder per
 * pod at a time (a concurrent caller returns 0 and the next load sees the decks).
 * Returns how many decks were built.
 */
export async function buildBotDecks(podId: string, setCode: string, settings: Record<string, unknown> = {}, options: { announce?: boolean } = {}): Promise<number> {
  // Cold card cache resolves printings wrongly (Hyperspace ids); wait for it.
  await initializeCardCache().catch(err => console.error('[BOT_DECK] Card cache unavailable:', err))
  const built = await withAdvisoryLock(`pod-bot-decks:${podId}`, () => buildBotDecksLocked(podId, setCode, settings, options.announce !== false))
  return built ?? 0
}

async function buildBotDecksLocked(podId: string, setCode: string, settings: Record<string, unknown>, announce: boolean): Promise<number> {
  // Get all bot players in this pod (includes strategy_name, mixin_name)
  const botPlayers = await queryRows(
    `SELECT pp.*, u.username as bot_username
     FROM pod_players pp
     LEFT JOIN users u ON u.id = pp.user_id
     WHERE pp.pod_id = $1 AND pp.is_bot = true`,
    [podId]
  )

  if (!botPlayers || botPlayers.length === 0) return 0

  // Make all bot draft logs and pools public
  await query(
    `UPDATE pod_players SET is_log_public = true WHERE pod_id = $1 AND is_bot = true`,
    [podId]
  )

  // Get the pod for metadata
  const pod = await queryRow(
    'SELECT * FROM pods WHERE id = $1',
    [podId]
  )

  if (!pod) return 0

  const summaries: BotDeckSummary[] = []
  let builtCount = 0

  for (const bot of botPlayers) {
    try {
      const result = await buildSingleBotDeck(bot, pod, setCode, settings)
      if (result.built) builtCount++
      if (result.summary) summaries.push(result.summary)
    } catch (err) {
      console.error(`[BOT_DECK] Error building deck for bot ${bot.id}:`, err)
    }
  }

  // Solo AI preparation stays private; group pods retain their existing summaries.
  // A lazy backfill (announce: false) never posts.
  if (announce && summaries.length > 0 && settings.isSolo !== true) {
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
    const podType = (pod.pod_type as string) || 'draft'
    const podShareId_str = pod.share_id as string

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
        poolUrl: podType === 'draft'
          ? `${APP_URL}/draft_pool/${s.poolShareId}`
          : `${APP_URL}/pool/${s.poolShareId}/deck/play`,
        draftLogUrl: podType === 'draft' ? `${APP_URL}/draft/${podShareId_str}/log` : null,
        poolShareId: s.poolShareId,
        leaderName: s.leaderName,
        leaderImageUrl: s.leaderImageUrl,
        leaderCardId: s.leaderCardId,
        leaderVariantType: s.leaderVariantType,
        baseName: s.baseName,
        baseCardId: s.baseCardId,
        baseVariantType: s.baseVariantType,
        baseDisplay,
        deckSize: s.deckSize,
        deckCards: s.deckCards,
      }
    })

    postBotDeckSummaries(podName, setCode, discordSummaries, {
      hostName,
      playerNames,
    }).catch(err =>
      console.error('[BOT_DECK] Error posting Discord bot summaries:', err)
    )
  }
  return builtCount
}

async function saveBuiltDeck(poolId: unknown, userId: unknown, setCode: string, builtDeck: BuiltDeckData) {
  await query(
    `INSERT INTO built_decks (card_pool_id, user_id, set_code, pool_type, leader, base, deck, sideboard)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (card_pool_id) DO UPDATE SET
       leader = EXCLUDED.leader,
       base = EXCLUDED.base,
       deck = EXCLUDED.deck,
       sideboard = EXCLUDED.sideboard,
       built_at = NOW()`,
    [poolId, userId, setCode, 'draft', JSON.stringify(builtDeck.leader), JSON.stringify(builtDeck.base),
      JSON.stringify(builtDeck.deck), JSON.stringify(builtDeck.sideboard)]
  )
}

function broadcastBotReady(pod: Record<string, unknown>) {
  if (!pod.share_id) return
  broadcastPodState(pod.share_id as string).catch(() => {})
  // Competitive (Swiss Practice) pods read the roster from the draft `state`
  // event, so push that too — otherwise a ready bot stays "Building…" there.
  if (pod.competitive === true) broadcastDraftState(pod.share_id as string).catch(() => {})
}

async function buildSingleBotDeck(
  bot: Record<string, unknown>,
  pod: Record<string, unknown>,
  setCode: string,
  settings: Record<string, unknown>
): Promise<{ built: boolean; summary: BotDeckSummary | null }> {
  const existingPool = await queryRow(
    `SELECT cp.id, cp.share_id, cp.deck_builder_state, (b.id IS NOT NULL) AS built
     FROM card_pools cp LEFT JOIN built_decks b ON b.card_pool_id = cp.id
     WHERE cp.pod_id = $1 AND cp.user_id = $2 AND cp.parent_pool_id IS NULL
     ORDER BY cp.created_at LIMIT 1`,
    [pod.id, bot.user_id]
  )
  if (existingPool?.built) return { built: false, summary: null }
  if (existingPool) {
    // The pool exists but its deck was never saved: build it from the pool's own
    // deck builder state, or construct a fresh one when that state is not a deck.
    let state = jsonParse<Record<string, unknown> | null>(existingPool.deck_builder_state as string, null)
    let builtDeck = state ? buildDeckFromState(state, setCode) : null
    if (!isPlayableBotDeck(builtDeck)) {
      const construction = constructBotDeck(bot, setCode)
      if (!construction) return { built: false, summary: null }
      state = construction.deckBuilderState
      builtDeck = buildDeckFromState(state, setCode)
      await query('UPDATE card_pools SET deck_builder_state = $2 WHERE id = $1', [existingPool.id, JSON.stringify(state)])
    }
    if (!isPlayableBotDeck(builtDeck)) return { built: false, summary: null }
    await saveBuiltDeck(existingPool.id, bot.user_id, setCode, builtDeck)
    broadcastBotReady(pod)
    return { built: true, summary: null }
  }

  // Parse drafted leaders and cards
  const draftedLeaders = typeof bot.drafted_leaders === 'string'
    ? JSON.parse(bot.drafted_leaders)
    : bot.drafted_leaders || []

  const draftedCards = typeof bot.drafted_cards === 'string'
    ? JSON.parse(bot.drafted_cards)
    : bot.drafted_cards || []

  if (draftedLeaders.length === 0 && draftedCards.length === 0) return { built: false, summary: null }

  const construction = constructBotDeck(bot, setCode)
  if (!construction) return { built: false, summary: null }
  const { selectedLeader, selectedBase, deckCards, deckBuilderState, strategyName, mixinName } = construction

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
  let built = false
  try {
    const builtDeck = buildDeckFromState(deckBuilderState, setCode)
    if (poolResult?.id && isPlayableBotDeck(builtDeck)) {
      await saveBuiltDeck(poolResult.id, bot.user_id, setCode, builtDeck)
      built = true
    }
  } catch (err) {
    console.error(`[BOT_DECK] Error creating built_decks record:`, err)
  }

  // 8. Broadcast pod state update so pod page shows bots as "Ready"
  broadcastBotReady(pod)

  // Return summary for Discord posting
  const leader = selectedLeader as Record<string, unknown>
  const base = selectedBase as Record<string, unknown>
  return { built, summary: {
    botName: (bot.bot_username as string) || 'Unknown Bot',
    strategyName: (bot.strategy_name as string) || strategyName,
    mixinName: (bot.mixin_name as string) || mixinName,
    poolShareId,
    leaderName: (leader.name as string) || 'Unknown',
    leaderImageUrl: (leader.imageUrl as string) || '',
    leaderCardId: (leader.cardId as string) || undefined,
    leaderVariantType: (leader.variantType as string) || undefined,
    baseName: (base.name as string) || 'Unknown Base',
    baseCardId: (base.cardId as string) || undefined,
    baseVariantType: (base.variantType as string) || undefined,
    baseRarity: (base.rarity as string) || 'Common',
    baseAspects: (base.aspects as string[]) || [],
    baseHp: (base.hp as number) || null,
    deckSize: deckCards.length,
    deckCards: deckCards.map((c: Record<string, unknown>) => ({
      name: (c.name as string) || 'Unknown',
      cardId: (c.cardId as string) || undefined,
      subtitle: (c.subtitle as string) || undefined,
      variantType: (c.variantType as string) || undefined,
    })),
  } }
}

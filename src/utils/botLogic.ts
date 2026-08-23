// @ts-nocheck - Gradual migration
/**
 * Bot Logic for Draft Testing
 *
 * Handles automatic picks for bot players during draft.
 * Uses pluggable behavior system for pick decisions.
 */

import { query, queryRow, queryRows, withAdvisoryLock } from '@/lib/db'
import { processAllStagedPicks } from './draftAdvance'
import { markLastPlayerStartIfNeeded } from './draftSelection'
import { getBehavior, assignStrategies, createStrategy } from '@/src/bots/behaviors/index'
import { ALL_MIXINS } from '@/src/bots/behaviors/mixins'
import { broadcastDraftState } from '@/src/lib/socketBroadcast'
import { jsonParse } from './json'
import { getDraftStats, hasEnoughData } from '@/src/bots/data/draftStats'
import type { RawCard } from './cardData'
import type { SetDraftStats } from '@/src/bots/data/draftStats'
import type { BaseStrategy } from '@/src/bots/behaviors/BaseStrategy'

// Behavior instance type — supports both legacy and new strategies
type BehaviorInstance = ReturnType<typeof getBehavior> | BaseStrategy

interface DraftPod {
  id: string
  share_id: string
  status: string
  draft_state: string | DraftState
  state_version: number
}

interface DraftState {
  phase?: string
  setCode?: string
  leaderRound?: number
  packNumber?: number
  pickInPack?: number
  lastPlayerStartedAt?: string
}

interface BotPlayer {
  id: string
  pod_id: string
  user_id: string | null
  pick_status: string
  selection_confirmed?: boolean
  is_bot: boolean
  strategy_name?: string | null
  mixin_name?: string | null
  committed_leader?: string | RawCard[] | RawCard | null
  committed_base_color?: string | null
  leaders: string | RawCard[]
  drafted_leaders: string | RawCard[]
  drafted_cards: string | RawCard[]
  current_pack: string | RawCard[]
  selected_card_id: string | null
}

// Cache behavior instances per bot to maintain state across picks
const botBehaviors = new Map<string, BehaviorInstance>()

// Cache draft stats per pod to avoid repeated DB queries within a single draft
const podStatsCache = new Map<string, SetDraftStats | null>()

/**
 * Check if any bots need to pick and make picks for them
 * @param podId - Draft pod ID
 * @returns Whether any bot picks were made
 */
export async function triggerBotPicks(podId: string): Promise<boolean> {
  // Exclude all_packs to save memory
  const pod = await queryRow(
    `SELECT id, share_id, status, draft_state, state_version
     FROM pods WHERE id = $1`,
    [podId]
  )
  if (!pod || pod.status !== 'active') {
    return false
  }

  const draftState = jsonParse<DraftState>(pod.draft_state, {}) as DraftState

  // Get all bot players who need to pick
  const botsNeedingPicks = await queryRows(
    `SELECT * FROM pod_players
     WHERE pod_id = $1 AND is_bot = true AND pick_status = 'picking'`,
    [podId]
  )

  if (botsNeedingPicks.length === 0) return false

  // Assign strategies on first bot pick for this pod
  await assignPodStrategies(podId)

  let picksMade = false
  for (const bot of botsNeedingPicks) {
    const made = await makeBotPick(bot.id, draftState)
    if (made) picksMade = true
    // Minimal delay between bot picks (just enough to prevent race conditions)
    await new Promise(resolve => setTimeout(resolve, 10))
  }

  return picksMade
}

/**
 * Make a pick for a single bot
 * @param botId - Bot player ID
 * @param draftState - Current draft state
 * @returns Whether a pick was made
 */
async function makeBotPick(botId: string, draftState: DraftState): Promise<boolean> {
  // Re-fetch the bot with fresh data to avoid race conditions
  const bot = await queryRow(
    `SELECT * FROM pod_players WHERE id = $1 AND pick_status = 'picking'`,
    [botId]
  )

  // Bot may have already picked (race condition) or state changed
  if (!bot) {
    return false
  }

  if (draftState.phase === 'leader_draft') {
    return await makeBotLeaderPick(bot, draftState)
  } else if (draftState.phase === 'pack_draft') {
    return await makeBotCardPick(bot, draftState)
  }
  return false
}

/**
 * Get or create a behavior instance for a bot.
 * If strategies haven't been assigned yet for this pod, assigns them now.
 * @param botId - Bot player ID
 * @param podId - Pod ID (for strategy assignment)
 * @returns Behavior instance
 */
function getBotBehavior(bot: BotPlayer, podId?: string): BehaviorInstance {
  if (!botBehaviors.has(bot.id)) {
    // Check if we need to do bulk strategy assignment
    if (podId && !podStrategyAssigned.has(podId)) {
      // Will be assigned by assignPodStrategies — for now, create a default
      botBehaviors.set(bot.id, createStrategy())
    } else {
      botBehaviors.set(bot.id, buildBehaviorFromBot(bot))
    }
  }
  return botBehaviors.get(bot.id)!
}

/** Track which pods have had strategies assigned */
const podStrategyAssigned = new Set<string>()

/**
 * Assign strategies to all bots in a pod.
 * Called once when first bot pick is triggered for a pod.
 */
async function assignPodStrategies(podId: string): Promise<void> {
  if (podStrategyAssigned.has(podId)) return

  const botPlayers = await queryRows(
    `SELECT id, is_bot, strategy_name, mixin_name, committed_leader, committed_base_color
     FROM pod_players
     WHERE pod_id = $1 AND is_bot = true`,
    [podId]
  )

  if (botPlayers.length === 0) return

  const allBotsAlreadyAssigned = botPlayers.every(b => typeof b.strategy_name === 'string' && b.strategy_name.length > 0)
  if (allBotsAlreadyAssigned) {
    for (const bot of botPlayers as BotPlayer[]) {
      botBehaviors.set(bot.id, buildBehaviorFromBot(bot))
    }
    podStrategyAssigned.add(podId)
    return
  }

  // Determine if solo mode
  const humanPlayers = await queryRows(
    `SELECT id FROM pod_players WHERE pod_id = $1 AND (is_bot = false OR is_bot IS NULL)`,
    [podId]
  )
  const isSolo = humanPlayers.length <= 1

  const botIds = botPlayers.map(b => b.id as string)
  const assignments = assignStrategies(botIds, isSolo)

  for (const [botId, strategy] of assignments) {
    botBehaviors.set(botId, strategy)
    // Persist strategy and mixin to DB so deck builder uses the same strategy
    query(
      `UPDATE pod_players SET strategy_name = $1, mixin_name = $2 WHERE id = $3`,
      [strategy.strategyName, strategy.mixin?.name || null, botId]
    ).catch(err => console.error(`[BOT] Error persisting strategy for bot ${botId}:`, err))
  }

  podStrategyAssigned.add(podId)
}

function buildBehaviorFromBot(bot: BotPlayer): BehaviorInstance {
  const mixinObj = bot.mixin_name
    ? ALL_MIXINS.find(m => m.name === bot.mixin_name) || null
    : null

  const behavior = createStrategy(bot.strategy_name || undefined, mixinObj)
  hydrateBehaviorCommitment(behavior, bot)
  return behavior
}

function hydrateBehaviorCommitment(behavior: BehaviorInstance, bot: BotPlayer): void {
  const committedLeader = jsonParse<RawCard>(bot.committed_leader as RawCard | string | null, null)
  if (committedLeader) {
    behavior.committedLeader = committedLeader
  }

  if (typeof bot.committed_base_color === 'string' && bot.committed_base_color.length > 0) {
    behavior.committedBaseColor = bot.committed_base_color
  }
}

async function persistBehaviorCommitment(botId: string, behavior: BehaviorInstance): Promise<void> {
  await query(
    `UPDATE pod_players
     SET committed_leader = $1,
         committed_base_color = $2
     WHERE id = $3`,
    [
      behavior.committedLeader ? JSON.stringify(behavior.committedLeader) : null,
      behavior.committedBaseColor || null,
      botId,
    ]
  )
}

/**
 * Clear behavior cache (useful when draft ends)
 */
export function clearBotBehaviors(): void {
  botBehaviors.clear()
  podStatsCache.clear()
  podStrategyAssigned.clear()
}

/**
 * Load draft stats for a pod's set code, using per-pod cache.
 * Passes hostUserId for Nemesis strategy per-user queries.
 */
async function loadPodStats(podId: string, setCode: string): Promise<SetDraftStats | null> {
  if (podStatsCache.has(podId)) {
    return podStatsCache.get(podId) || null
  }

  // Get the host user ID for Nemesis strategy queries
  let hostUserId: string | undefined
  const humanPlayers = await queryRows(
    `SELECT user_id FROM pod_players WHERE pod_id = $1 AND (is_bot = false OR is_bot IS NULL) LIMIT 1`,
    [podId]
  )
  if (humanPlayers.length > 0) {
    hostUserId = humanPlayers[0]?.user_id as string | undefined
  }

  const stats = await getDraftStats(setCode, hostUserId)
  const result = hasEnoughData(stats) ? stats : null
  podStatsCache.set(podId, result)
  return result
}

/**
 * Bot selects a leader using behavior system
 * Uses the staged pick system - selection is finalized when all players have selected
 * @returns Whether a selection was made
 */
async function makeBotLeaderPick(bot: BotPlayer, draftState: DraftState): Promise<boolean> {
  const leaders = jsonParse<RawCard[]>(bot.leaders, []) as RawCard[]

  if (leaders.length === 0) {
    console.error('[BOT] Bot', bot.id, 'has no leaders to pick from! leaders:', bot.leaders)
    return false
  }

  // Get bot's drafted leaders for context
  const draftedLeaders = jsonParse<RawCard[]>(bot.drafted_leaders, []) as RawCard[]

  // Use behavior to select leader
  const behavior = getBotBehavior(bot)
  const setCode = draftState.setCode || leaders[0]?.set || 'SOR'
  let draftStats: SetDraftStats | null = null
  try {
    draftStats = await loadPodStats(bot.pod_id, setCode)
  } catch (err) {
    console.error('[BOT] Failed to load draft stats, continuing without:', err)
  }
  const context = {
    draftedLeaders,
    setCode,
    leaderRound: draftState.leaderRound || 1,
    draftStats,
  }

  const pickedLeader = behavior.selectLeader(leaders, context)
  if (!pickedLeader) {
    console.error('[BOT] Bot', bot.id, 'behavior returned no leader!')
    return false
  }

  await persistBehaviorCommitment(bot.id, behavior)

  const cardId = (pickedLeader as RawCard & { instanceId?: string }).instanceId || pickedLeader.id

  // Use staged selection system. Bots stage AND confirm in the same write —
  // the two-step pick exists so a human can change their mind, and a bot that
  // sat unconfirmed would just hang the round.
  await query(
    `UPDATE pod_players
     SET selected_card_id = $1,
         pick_status = 'selected',
         selection_confirmed = true
     WHERE id = $2`,
    [cardId, bot.id]
  )

  // If that left one player picking, start the Last Player timer.
  await markLastPlayerStartIfNeeded(bot.pod_id)

  // Increment state version so clients see the update
  await query(
    `UPDATE pods SET state_version = state_version + 1 WHERE id = $1`,
    [bot.pod_id]
  )

  return true
}

/**
 * Bot selects a card using behavior system
 * Uses the staged pick system - selection is finalized when all players have selected
 * @returns Whether a selection was made
 */
async function makeBotCardPick(bot: BotPlayer, draftState: DraftState): Promise<boolean> {
  const currentPack = jsonParse<RawCard[]>(bot.current_pack, []) as RawCard[]

  if (currentPack.length === 0) {
    console.error('[BOT] Bot', bot.id, 'has no cards to pick from! current_pack:', bot.current_pack)
    return false
  }

  // Get bot's drafted cards and leaders for context
  const draftedCards = jsonParse<RawCard[]>(bot.drafted_cards, []) as RawCard[]
  const draftedLeaders = jsonParse<RawCard[]>(bot.drafted_leaders, []) as RawCard[]

  // Use behavior to select card
  const behavior = getBotBehavior(bot)
  const setCode = draftState.setCode || currentPack[0]?.set || 'SOR'
  let draftStats: SetDraftStats | null = null
  try {
    draftStats = await loadPodStats(bot.pod_id, setCode)
  } catch (err) {
    console.error('[BOT] Failed to load draft stats, continuing without:', err)
  }
  // Lane coordination uses signal reading (already built into BaseStrategy).
  // The bot infers which colors are open from packs it receives — cards still
  // available at mid-late picks indicate nobody upstream is drafting that color.
  // No need to peek at other players' data.
  const context = {
    draftedCards,
    draftedLeaders,
    setCode,
    packNumber: draftState.packNumber || 1,
    pickInPack: draftState.pickInPack || 1,
    draftStats,
  }

  const pickedCard = behavior.selectCard(currentPack, context)
  if (!pickedCard) {
    console.error('[BOT] Bot', bot.id, 'behavior returned no card!')
    return false
  }

  await persistBehaviorCommitment(bot.id, behavior)

  const cardId = (pickedCard as RawCard & { instanceId?: string }).instanceId || pickedCard.id

  // Use staged selection system. Bots stage AND confirm in the same write —
  // the two-step pick exists so a human can change their mind, and a bot that
  // sat unconfirmed would just hang the round.
  await query(
    `UPDATE pod_players
     SET selected_card_id = $1,
         pick_status = 'selected',
         selection_confirmed = true
     WHERE id = $2`,
    [cardId, bot.id]
  )

  // If that left one player picking, start the Last Player timer.
  await markLastPlayerStartIfNeeded(bot.pod_id)

  // Increment state version so clients see the update
  await query(
    `UPDATE pods SET state_version = state_version + 1 WHERE id = $1`,
    [bot.pod_id]
  )

  return true
}

/**
 * Process bot picks and advance state in a loop until human input is needed
 * Call this after a human makes a pick
 *
 * Single-flight per pod via a session-level advisory lock (try-lock — if
 * another process is already running the bot loop for this pod, we skip).
 * The lock lives on a dedicated connection and auto-releases if the process
 * crashes, so there is no stale-timestamp expiry to tune. Pick processing
 * itself (processAllStagedPicks) is independently serialized by the pod's
 * transaction-scoped advisory lock.
 */
export async function processBotTurns(podId: string): Promise<void> {
  const ran = await withAdvisoryLock(`bot-turns:${podId}`, async () => {
    let iterations = 0
    const maxIterations = 100 // Safety limit

    try {
      while (iterations < maxIterations) {
        iterations++

        // Get current state with fresh data (exclude all_packs to save memory)
        const pod = await queryRow(
          `SELECT id, share_id, status, draft_state, state_version
           FROM pods WHERE id = $1`,
          [podId]
        )
        if (!pod || pod.status !== 'active') {
          break
        }

        // Note: We still process bot turns while paused - pause only affects timers, not turn advancement
        // This allows the draft to continue if all players have selected while paused

        // Check if all players have selected (using new staged pick system)
        const players = await queryRows(
          'SELECT pick_status, is_bot, selected_card_id, selection_confirmed FROM pod_players WHERE pod_id = $1',
          [podId]
        )

        const allSelected = players.every(p =>
          p.pick_status === 'selected' && p.selected_card_id && p.selection_confirmed
        )

        if (allSelected) {
          // Process all staged picks and advance (transactional + advisory-locked)
          await processAllStagedPicks(podId)

          // After advancing, trigger bot picks if any bots need to pick
          const botsMadePicks = await triggerBotPicks(podId)
          if (!botsMadePicks) {
            // No bots picked, check if humans need to pick
            const updatedPlayers = await queryRows(
              'SELECT pick_status, is_bot, selection_confirmed FROM pod_players WHERE pod_id = $1',
              [podId]
            )
            // Staged-but-unconfirmed counts as still needing to pick — the
            // human owes the round a confirmation before it can advance.
            const humansNeedToPick = updatedPlayers.some(p => !p.is_bot && (
              p.pick_status === 'picking' ||
              (p.pick_status === 'selected' && !p.selection_confirmed)
            ))
            if (humansNeedToPick) break // Wait for human input
          }
        } else {
          // Not all selected yet - trigger bot picks
          const botsMadePicks = await triggerBotPicks(podId)
          if (!botsMadePicks) break // No bots to pick, wait for humans
        }
      }
    } finally {
      // Always broadcast state update after bot processing
      // This ensures clients get the latest state even if no picks were made
      try {
        const podForBroadcast = await queryRow('SELECT share_id FROM pods WHERE id = $1', [podId])
        if (podForBroadcast?.share_id) {
          await broadcastDraftState(podForBroadcast.share_id)
        }
      } catch (err) {
        console.error('Error broadcasting after bot turns:', err)
      }
    }
    return true
  })

  if (ran === null) {
    // Another process is handling bots - but still broadcast current state
    // in case the other process finished and we missed the broadcast
    const pod = await queryRow('SELECT share_id FROM pods WHERE id = $1', [podId])
    if (pod?.share_id) {
      broadcastDraftState(pod.share_id).catch(err => {
        console.error('Error broadcasting after lock fail:', err)
      })
    }
  }
}

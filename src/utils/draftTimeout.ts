// @ts-nocheck - Gradual migration
/**
 * Draft Timeout Logic
 *
 * Handles forcing picks when timeout is exceeded.
 * Called during state polling to enforce server-side timeouts.
 */

import { query, queryRow, queryRows } from '@/lib/db'
import { processAllStagedPicks } from './draftAdvance'
import { processBotTurns } from './botLogic'
import { createStrategy } from '@/src/bots/behaviors/index'
import type { RawCard } from './cardData'

interface DraftPod {
  id: string
  share_id: string
  status: string
  draft_state: string | Record<string, unknown>
  state_version: number
  timed: boolean
  timer_enabled: boolean
  timer_seconds: number
  pick_timeout_seconds: number
  pick_started_at: string | null
  paused: boolean
  paused_duration_seconds: number
  competitive: boolean
}

interface DraftPlayer {
  id: string
  pod_id: string
  pick_status: string
  leaders: string | RawCard[]
  drafted_leaders: string | RawCard[]
  drafted_cards: string | RawCard[]
  current_pack: string | RawCard[]
}

interface DraftState {
  phase?: string
  lastPlayerStartedAt?: string
  setCode?: string
  packNumber?: number
  pickInPack?: number
  reviewUntil?: string
}

/**
 * Test seams — only assigned by tests (e.g. to land a human selection inside
 * the enforcement race window). No-ops in production.
 */
export const _testSeams: {
  beforeForcePicks?: () => Promise<void> | void
} = {}

/**
 * Check if timeout has been exceeded and force picks if needed
 * Uses atomic locking to prevent concurrent timeout enforcement
 * @param podId - Draft pod ID
 * @returns Whether any picks were forced
 */
export async function checkAndEnforceTimeout(podId: string): Promise<boolean> {
  // Get pod with timeout settings (exclude all_packs to save memory)
  const pod = await queryRow(
    `SELECT id, share_id, status, draft_state, state_version,
            timed, timer_enabled, timer_seconds, pick_timeout_seconds,
            pick_started_at, paused, paused_duration_seconds, competitive
     FROM pods WHERE id = $1`,
    [podId]
  )

  if (!pod) return false

  // Only enforce timeouts on active, non-paused drafts
  if (pod.status !== 'active' || pod.paused === true) {
    return false
  }

  // Check if timeout has passed
  if (!pod.pick_started_at) {
    return false
  }

  // Timer settings - both can be enabled/disabled independently
  const isRoundTimerEnabled = pod.timed !== false
  const isLastPlayerTimerEnabled = pod.timer_enabled !== false
  const roundTimeoutSeconds = pod.pick_timeout_seconds || 120
  const lastPlayerTimeoutSeconds = pod.timer_seconds || 30

  // If neither timer is enabled (and not competitive), nothing to enforce
  if (!pod.competitive && !isRoundTimerEnabled && !isLastPlayerTimerEnabled) {
    return false
  }

  // Get players who haven't selected
  const players = await queryRows(
    `SELECT * FROM pod_players
     WHERE pod_id = $1 AND pick_status = 'picking'
     ORDER BY seat_number`,
    [podId]
  )

  if (players.length === 0) {
    // Everyone has selected, nothing to do
    return false
  }

  const pickStartedAt = new Date(pod.pick_started_at).getTime()
  const now = Date.now()
  // Subtract any accumulated paused time from elapsed calculation
  const pausedDurationMs = (pod.paused_duration_seconds || 0) * 1000

  // Parse draft state early — needed by both competitive and normal timer paths
  const draftState: DraftState = typeof pod.draft_state === 'string'
    ? JSON.parse(pod.draft_state)
    : pod.draft_state || {}

  const phase = draftState.phase

  // Don't enforce timeouts during the inter-pack review period
  if (pod.competitive && draftState.reviewUntil) {
    const reviewUntil = new Date(draftState.reviewUntil).getTime()
    if (Date.now() < reviewUntil) {
      return false  // In review period, no timeout
    }
  }

  if (pod.competitive) {
    // For competitive pods, use Appendix C per-card timers instead of round/last-player timers
    const { getCompetitivePickTimeout, getLeaderPickTimeout } = await import('@/src/services/matchmaking/timers')

    let timeoutSeconds: number
    if (phase === 'leader_draft') {
      const leaders = typeof players[0].leaders === 'string'
        ? JSON.parse(players[0].leaders) : players[0].leaders || []
      timeoutSeconds = getLeaderPickTimeout(leaders.length)
    } else {
      const pack = typeof players[0].current_pack === 'string'
        ? JSON.parse(players[0].current_pack) : players[0].current_pack || []
      timeoutSeconds = getCompetitivePickTimeout(pack.length)
    }

    if (timeoutSeconds > 0) {
      const elapsed = now - pickStartedAt - pausedDurationMs
      if (elapsed < timeoutSeconds * 1000) {
        return false  // Timer hasn't expired yet
      }
    }
    // timeoutSeconds === 0 means auto-pick (1 card remaining) — fall through to force picks
  } else {
    // Normal (non-competitive) timer logic
    const elapsed = now - pickStartedAt - pausedDurationMs

    // Check if either timer has expired
    const isLastPlayer = players.length === 1

    // Round timer uses elapsed time since pick started
    const roundTimerExpired = isRoundTimerEnabled && elapsed >= roundTimeoutSeconds * 1000

    // Last player timer uses the time since they became the last player
    // This is stored in draft_state.lastPlayerStartedAt when bots finish picking
    let lastPlayerTimerExpired = false
    if (isLastPlayerTimerEnabled && isLastPlayer && draftState.lastPlayerStartedAt) {
      const lastPlayerStartedAt = new Date(draftState.lastPlayerStartedAt).getTime()
      const lastPlayerElapsed = now - lastPlayerStartedAt
      lastPlayerTimerExpired = lastPlayerElapsed >= lastPlayerTimeoutSeconds * 1000
    }

    if (!roundTimerExpired && !lastPlayerTimerExpired) {
      // Neither timeout reached yet
      return false
    }
  }

  // Try to acquire lock using atomic update
  // Use state_version for locking instead of pick_started_at to avoid timestamp precision issues
  const lockResult = await query(
    `UPDATE pods
     SET state_version = state_version + 1
     WHERE id = $1
       AND status = 'active'
       AND state_version = $2
     RETURNING id`,
    [podId, pod.state_version]
  )

  if (lockResult.rowCount === 0) {
    // Another process already handled this timeout or state changed
    return false
  }

  await _testSeams.beforeForcePicks?.()

  // Force selections for each player who hasn't selected
  // Uses topPlayer bot strategy for smart picks instead of random.
  // `players` was read before the lock, so a player may have selected since —
  // each force is guarded on pick_status = 'picking' to respect that.
  for (const player of players) {
    if (phase === 'leader_draft') {
      await forceLeaderSelect(player, draftState)
    } else if (phase === 'pack_draft') {
      await forcePackSelect(player, draftState)
    }
  }

  // Process all staged picks (including forced ones) and advance
  // (transactional + advisory-locked; re-reads fresh pod state internally)
  await processAllStagedPicks(podId)

  // Trigger bot turns for the next round
  processBotTurns(podId).catch(err => {
    console.error('[TIMEOUT] Error processing bot turns after timeout:', err)
  })

  return true
}

/**
 * Shortest timer any pod can be running (the Appendix C floor before a pick is
 * auto-taken). Pods younger than this cannot possibly have expired.
 */
const MIN_ENFORCEABLE_TIMER_SECONDS = 5

/** Cap on pods enforced per sweep, so one pass can never run unbounded. */
const SWEEP_POD_LIMIT = 200

/**
 * Enforce expired pick timers across every active draft, independent of client
 * traffic.
 *
 * checkAndEnforceTimeout otherwise runs only when a client happens to hit the
 * draft/state/select routes, and the live draft page is socket-driven rather
 * than polling — so historically the only thing that fired a timeout was a
 * connected client's countdown reaching zero. That fails exactly when it
 * matters: backgrounded tabs get their intervals throttled (mobile Safari
 * suspends JS outright), and the client's one-shot expiry callback never
 * retries if it lands a hair early against the server clock. Either way the
 * round hangs until somebody foregrounds a tab.
 *
 * Called on an interval by server.ts. Each pod is enforced independently so one
 * bad pod cannot stall the sweep.
 *
 * @returns how many pods had picks forced
 */
export async function sweepExpiredDraftTimers(): Promise<number> {
  // Cheap prefilter — checkAndEnforceTimeout re-reads each pod and does the
  // real per-timer math (round vs last-player vs Appendix C).
  const pods = await queryRows(
    `SELECT id FROM pods
     WHERE status = 'active'
       AND COALESCE(paused, false) = false
       AND pick_started_at IS NOT NULL
       AND pick_started_at < NOW() - ($1 || ' seconds')::interval
     ORDER BY pick_started_at
     LIMIT $2`,
    [String(MIN_ENFORCEABLE_TIMER_SECONDS), SWEEP_POD_LIMIT]
  )

  let enforced = 0
  for (const pod of pods) {
    try {
      // Broadcasts on its own via processBotTurns when it forces picks.
      if (await checkAndEnforceTimeout(pod.id as string)) enforced++
    } catch (err) {
      console.error(`[DraftTimers] Enforcement failed for pod ${pod.id}:`, err)
    }
  }

  return enforced
}

/**
 * Force a smart leader selection for a timed-out player.
 * Uses the topPlayer bot strategy to pick the best leader.
 *
 * Every write here is guarded on the player still being 'picking'. The player
 * list was read before the lock was taken, so a human selection can land in
 * between — and their own choice must always beat the forced one. That is the
 * whole point of staging a selection before the timer runs out.
 */
async function forceLeaderSelect(player: DraftPlayer, draftState: DraftState): Promise<void> {
  const leaders: RawCard[] = typeof player.leaders === 'string'
    ? JSON.parse(player.leaders)
    : player.leaders || []

  if (leaders.length === 0) {
    await query(
      `UPDATE pod_players SET pick_status = 'selected', selected_card_id = NULL
       WHERE id = $1 AND pick_status = 'picking'`,
      [player.id]
    )
    return
  }

  // Use bot strategy to pick the best leader
  const draftedLeaders: RawCard[] = typeof player.drafted_leaders === 'string'
    ? JSON.parse(player.drafted_leaders)
    : (player as any).drafted_leaders || []

  const strategy = createStrategy('topPlayer')
  const setCode = draftState.setCode || leaders[0]?.set || 'SOR'
  const picked = strategy.selectLeader(leaders, { draftedLeaders, setCode })
  const selectedLeader = picked || leaders[0]
  const cardId = (selectedLeader as RawCard & { instanceId?: string }).instanceId || selectedLeader.id

  await query(
    `UPDATE pod_players
     SET selected_card_id = $1,
         pick_status = 'selected'
     WHERE id = $2 AND pick_status = 'picking'`,
    [cardId, player.id]
  )
}

/**
 * Force a smart card selection for a timed-out player.
 * Uses the topPlayer bot strategy to pick the best card based on
 * the player's drafted leaders and cards.
 *
 * Guarded on pick_status = 'picking' for the same reason as forceLeaderSelect:
 * a selection the player made in the race window must never be overwritten.
 */
async function forcePackSelect(player: DraftPlayer, draftState: DraftState): Promise<void> {
  const currentPack: RawCard[] = typeof player.current_pack === 'string'
    ? JSON.parse(player.current_pack)
    : player.current_pack || []

  if (currentPack.length === 0) {
    await query(
      `UPDATE pod_players SET pick_status = 'selected', selected_card_id = NULL
       WHERE id = $1 AND pick_status = 'picking'`,
      [player.id]
    )
    return
  }

  // Use bot strategy to pick the best card considering drafted pool
  const draftedCards: RawCard[] = typeof (player as any).drafted_cards === 'string'
    ? JSON.parse((player as any).drafted_cards)
    : (player as any).drafted_cards || []
  const draftedLeaders: RawCard[] = typeof player.drafted_leaders === 'string'
    ? JSON.parse(player.drafted_leaders)
    : (player as any).drafted_leaders || []

  const strategy = createStrategy('topPlayer')
  const setCode = draftState.setCode || currentPack[0]?.set || 'SOR'
  const picked = strategy.selectCard(currentPack, {
    draftedCards,
    draftedLeaders,
    setCode,
    packNumber: draftState.packNumber || 1,
    pickInPack: draftState.pickInPack || 1,
  })
  const selectedCard = picked || currentPack[0]
  const cardId = (selectedCard as RawCard & { instanceId?: string }).instanceId || selectedCard.id

  await query(
    `UPDATE pod_players
     SET selected_card_id = $1,
         pick_status = 'selected'
     WHERE id = $2 AND pick_status = 'picking'`,
    [cardId, player.id]
  )
}

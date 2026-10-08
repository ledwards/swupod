// @ts-nocheck - Gradual migration
/**
 * Draft Advance Logic
 *
 * Handles advancing draft state after picks are made.
 * Extracted to avoid circular imports between pick route and bot logic.
 *
 * Concurrency model (U2, foundations hardening plan):
 * - Every advancement path runs inside a single withTransaction and opens by
 *   taking `pg_advisory_xact_lock(hashtext(podId))`. The lock is transaction-
 *   scoped, so it releases automatically on commit, rollback, or crash —
 *   there is no soft-lock expiry to tune and no double-processing window.
 * - A second concurrent caller blocks on the advisory lock, then re-reads
 *   pick_status under the lock and no-ops (the hasPicksToProcess /
 *   allSelected re-checks).
 * - Crash-mid-advance rolls the whole pod back to the pre-advance state.
 * - Fire-and-forget side effects (attributePickedCard, buildBotDecks) are
 *   collected during the transaction and run only AFTER commit, so they never
 *   hold the transaction open and never fire for a rolled-back advance.
 */

import { withTransaction, type TxClient } from '@/lib/db'
import { captureLimitedServerEvent } from '@/lib/posthog'
import { LimitedAnalyticsEvents } from '@/src/analytics/limitedEvents'
import { getPassDirection, getLeaderPassDirection, getNextSeat } from './draftLogic'
import { INTER_PACK_REVIEW_SECONDS } from '@/src/services/matchmaking/timers'
import { buildBotDecks } from './botDeckBuilder'
import { attributePickedCard } from './trackGeneration'
import type { RawCard } from './cardData'

interface DraftState {
  phase?: string
  leaderRound?: number
  totalPacks?: number
  packNumber?: number
  pickInPack?: number
  setCode?: string
  lastPlayerStartedAt?: string
  reviewUntil?: string
}

interface DraftPod {
  id: string
  share_id: string
  status: string
  draft_state: string | DraftState
  state_version: number
  settings?: string | Record<string, unknown>
  all_packs?: string | unknown[]
  competitive?: boolean
}

interface DraftPlayer {
  id: string
  pod_id: string
  user_id: string | null
  seat_number: number
  pick_status: string
  is_bot: boolean
  leaders: string | RawCard[]
  drafted_leaders: string | RawCard[]
  drafted_cards: string | RawCard[]
  current_pack: string | RawCard[]
  selected_card_id: string | null
  /** True once the player has committed their staged selection (bots: always). */
  selection_confirmed: boolean
}

interface CardWithMetadata extends RawCard {
  instanceId?: string
  pickNumber?: number
  leaderRound?: number
  packNumber?: number
  pickInPack?: number
}

/** Side effects deferred until after the advancement transaction commits. */
type PostCommitEffect = () => void

/**
 * Test seams — only assigned by tests (e.g. to inject a crash mid-advance or
 * an artificial delay while the advisory lock is held). No-ops in production.
 */
export const _testSeams: {
  afterPlayerPickApplied?: (playerIndex: number) => Promise<void> | void
} = {}

function getTotalPacks(draftState: DraftState, pod: DraftPod): number {
  if (typeof draftState.totalPacks === 'number' && draftState.totalPacks > 0) {
    return draftState.totalPacks
  }

  const settings = typeof pod?.settings === 'string'
    ? JSON.parse(pod.settings)
    : pod?.settings || {}
  const chaosSets = settings?.draftMode === 'chaos' && Array.isArray(settings?.chaosSets)
    ? settings.chaosSets
    : null

  return chaosSets?.length || 3
}

export function parseCurrentPack(currentPack: string | RawCard[] | null | undefined): RawCard[] {
  if (Array.isArray(currentPack)) {
    return currentPack
  }
  if (typeof currentPack === 'string') {
    try {
      const parsed = JSON.parse(currentPack)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

export function isPackPickComplete(player: Pick<DraftPlayer, 'pick_status' | 'current_pack'>): boolean {
  if (player.pick_status === 'picked') {
    return true
  }
  if (player.pick_status !== 'picking') {
    return false
  }
  return parseCurrentPack(player.current_pack).length === 0
}

/**
 * A pack round is exhausted only when EVERY player's pack is empty.
 *
 * Uniform packs deplete in lockstep, so for a normal draft this is equivalent
 * to the old single-seat (players[0]) check. But Carbonite packs carry one
 * extra draftable card, so packs can be unequal size — checking only seat 0
 * would declare the round over (and complete the draft) while another seat
 * still holds the Carbonite pack's last card, hanging the final round (#19).
 * Requiring ALL packs empty lets that extra card get drafted and the draft
 * conclude.
 */
export function isPackRoundExhausted(
  players: Pick<DraftPlayer, 'current_pack'>[]
): boolean {
  return players.length > 0 &&
    players.every(p => parseCurrentPack(p.current_pack).length === 0)
}

/**
 * Whether a player has resolved their pick for the current staged round.
 * Resolved = they CONFIRMED a selected card, OR their pack is already empty
 * (nothing left to pick — e.g. a depleted standard pack while a larger
 * Carbonite pack is still being drafted). Empty-pack players must NOT block the
 * round, otherwise an uneven-pack (Carbonite) draft can never finish its final
 * pick (#19).
 *
 * A staged-but-unconfirmed selection is deliberately NOT resolved: that is the
 * window in which a player can still change their mind. Bots stage and confirm
 * in one write, so they never sit in it.
 */
export function isStagedPickResolved(
  player: Pick<DraftPlayer, 'pick_status' | 'selected_card_id' | 'current_pack' | 'selection_confirmed'>
): boolean {
  if (player.pick_status === 'selected' && player.selected_card_id && player.selection_confirmed) {
    return true
  }
  return parseCurrentPack(player.current_pack).length === 0
}

/**
 * Process all staged picks when all players have selected
 * This is the "staged pick" system where:
 * 1. Players select cards (stored in selected_card_id)
 * 2. When all have selected, this function processes all picks at once
 * 3. Then advances the draft
 *
 * The entire pass — per-player pick application, pack passing, pod
 * draft_state/state_version writes — is one transaction guarded by the pod's
 * advisory lock. Returns true if picks were processed, false if there was
 * nothing to do (e.g. a concurrent caller already processed them).
 */
export async function processAllStagedPicks(podId: string): Promise<boolean> {
  const postCommitEffects: PostCommitEffect[] = []

  const processed = await withTransaction(async (tx) => {
    // Serialize all advancement for this pod. Transaction-scoped: auto-released
    // on commit/rollback/crash.
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1::text))', [podId])

    // Re-read pod state under the lock (callers' snapshots may be stale).
    // Exclude all_packs to save memory — fetched separately when needed.
    const pod = await tx.queryRow(
      `SELECT id, share_id, status, draft_state, state_version, settings, competitive, set_code
       FROM pods WHERE id = $1`,
      [podId]
    )
    if (!pod || pod.status !== 'active') {
      return false
    }

    const draftState: DraftState = typeof pod.draft_state === 'string'
      ? JSON.parse(pod.draft_state)
      : (pod.draft_state as DraftState) || {}

    // Lock the player rows for the duration of the transaction.
    const players = await tx.queryRows(
      'SELECT * FROM pod_players WHERE pod_id = $1 ORDER BY seat_number FOR UPDATE',
      [podId]
    )

    // Check if there are actually picks to process (must re-check after acquiring lock)
    const hasPicksToProcess = players.some(p =>
      p.selected_card_id && p.pick_status === 'selected' && p.selection_confirmed
    )
    if (!hasPicksToProcess) {
      // No picks to process - already processed or nothing selected
      return false
    }

    // Double-check ALL players are resolved before processing. A player whose
    // pack is empty (a depleted standard pack while a larger Carbonite pack is
    // still in play) counts as resolved — otherwise an uneven-pack draft can
    // never finish its final pick (#19). This prevents partial processing while
    // still letting the Carbonite holder's last pick go through.
    const allSelected = players.every(isStagedPickResolved)
    if (!allSelected) {
      // Not all players have selected - don't process yet
      return false
    }

    if (draftState.phase === 'leader_draft') {
      // Process leader picks
      for (let playerIndex = 0; playerIndex < players.length; playerIndex++) {
        const player = players[playerIndex]
        const cardId = player.selected_card_id
        if (!cardId) continue

        const leaders: CardWithMetadata[] = typeof player.leaders === 'string'
          ? JSON.parse(player.leaders)
          : player.leaders || []

        const draftedLeaders: CardWithMetadata[] = typeof player.drafted_leaders === 'string'
          ? JSON.parse(player.drafted_leaders)
          : player.drafted_leaders || []

        // Find and pick the leader
        const leaderIndex = leaders.findIndex(l =>
          (l.instanceId && l.instanceId === cardId) || (!l.instanceId && l.id === cardId)
        )

        if (leaderIndex >= 0) {
          const pickedLeader = leaders[leaderIndex]
          const remainingLeaders = leaders.filter((_, i) => i !== leaderIndex)

          // Add pick metadata
          const leaderRound = draftState.leaderRound || 1
          pickedLeader.pickNumber = draftedLeaders.length + 1
          pickedLeader.leaderRound = leaderRound

          draftedLeaders.push(pickedLeader)

          await tx.query(
            `UPDATE pod_players
             SET drafted_leaders = $1,
                 leaders = $2,
                 selected_card_id = NULL,
                 pick_status = 'picked',
                 last_pick_at = NOW()
             WHERE id = $3`,
            [JSON.stringify(draftedLeaders), JSON.stringify(remainingLeaders), player.id]
          )

          // Record in draft_picks for analytics (savepoint-isolated)
          await tx.query('SAVEPOINT draft_pick_insert')
          try {
            await tx.query(
              `INSERT INTO draft_picks (
                pod_id, user_id, card_id, card_name, set_code, rarity,
                card_type, variant_type, is_leader, pack_number, pick_in_pack,
                pick_number, leader_round
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, 0, $9, $10, $11)`,
              [
                podId, player.user_id,
                pickedLeader.id, pickedLeader.name, pickedLeader.set, pickedLeader.rarity,
                pickedLeader.type, pickedLeader.variantType || 'Normal',
                leaderRound, pickedLeader.pickNumber, leaderRound
              ]
            )
            await tx.query('RELEASE SAVEPOINT draft_pick_insert')
          } catch (err) {
            console.error('[DRAFT_PICKS] Error recording leader pick:', err)
            await tx.query('ROLLBACK TO SAVEPOINT draft_pick_insert')
          }

          // Attribute leader to picker in card_generations for the U6 "kept"
          // scope. Fire-and-forget AFTER commit — non-transactional by design.
          const attribution = { podId, cardId: pickedLeader.id, userId: player.user_id }
          postCommitEffects.push(() => {
            attributePickedCard(attribution).catch(() => {})
          })

          await _testSeams.afterPlayerPickApplied?.(playerIndex)
        }
      }

      // Advance leader draft
      await advanceLeaderDraftAfterPicks(tx, podId, draftState, pod as unknown as DraftPod)

    } else if (draftState.phase === 'pack_draft') {
      // Process pack picks
      for (let playerIndex = 0; playerIndex < players.length; playerIndex++) {
        const player = players[playerIndex]
        const cardId = player.selected_card_id
        if (!cardId) continue

        const currentPack: CardWithMetadata[] = parseCurrentPack(player.current_pack)

        const draftedCards: CardWithMetadata[] = typeof player.drafted_cards === 'string'
          ? JSON.parse(player.drafted_cards)
          : player.drafted_cards || []

        // Find and pick the card
        const cardIndex = currentPack.findIndex(c =>
          (c.instanceId && c.instanceId === cardId) || (!c.instanceId && c.id === cardId)
        )

        if (cardIndex >= 0) {
          const pickedCard = currentPack[cardIndex]
          const remainingPack = currentPack.filter((_, i) => i !== cardIndex)

          // Add pick metadata
          const packNumber = draftState.packNumber || 1
          const pickInPack = draftState.pickInPack || 1
          pickedCard.pickNumber = draftedCards.length + 1
          pickedCard.packNumber = packNumber
          pickedCard.pickInPack = pickInPack

          draftedCards.push(pickedCard)

          await tx.query(
            `UPDATE pod_players
             SET drafted_cards = $1,
                 current_pack = $2,
                 selected_card_id = NULL,
                 pick_status = 'picked',
                 last_pick_at = NOW()
             WHERE id = $3`,
            [JSON.stringify(draftedCards), JSON.stringify(remainingPack), player.id]
          )

          // Record in draft_picks for analytics (savepoint-isolated)
          await tx.query('SAVEPOINT draft_pick_insert')
          try {
            await tx.query(
              `INSERT INTO draft_picks (
                pod_id, user_id, card_id, card_name, set_code, rarity,
                card_type, variant_type, is_leader, pack_number, pick_in_pack,
                pick_number, leader_round
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, $9, $10, $11, NULL)`,
              [
                podId, player.user_id,
                pickedCard.id, pickedCard.name, pickedCard.set, pickedCard.rarity,
                pickedCard.type, pickedCard.variantType || 'Normal',
                packNumber, pickInPack, pickedCard.pickNumber
              ]
            )
            await tx.query('RELEASE SAVEPOINT draft_pick_insert')
          } catch (err) {
            console.error('[DRAFT_PICKS] Error recording card pick:', err)
            await tx.query('ROLLBACK TO SAVEPOINT draft_pick_insert')
          }

          // Attribute card to picker in card_generations for the U6 "kept"
          // scope. Fire-and-forget AFTER commit — non-transactional by design.
          const attribution = { podId, cardId: pickedCard.id, userId: player.user_id }
          postCommitEffects.push(() => {
            attributePickedCard(attribution).catch(() => {})
          })

          await _testSeams.afterPlayerPickApplied?.(playerIndex)
        }
      }

      // Advance pack draft
      await advancePackDraftAfterPicks(tx, podId, draftState, pod as unknown as DraftPod, postCommitEffects)
    }

    return true
  })

  for (const effect of postCommitEffects) effect()

  return processed
}

/**
 * Advance leader draft after all picks are processed
 */
async function advanceLeaderDraftAfterPicks(
  tx: TxClient,
  podId: string,
  draftState: DraftState,
  pod: DraftPod
): Promise<void> {
  const currentRound = draftState.leaderRound
  const totalPacks = getTotalPacks(draftState, pod)

  if (currentRound < totalPacks) {
    const direction = getLeaderPassDirection(currentRound)
    const updatedPlayers = await tx.queryRows(
      'SELECT * FROM pod_players WHERE pod_id = $1 ORDER BY seat_number',
      [podId]
    )
    await passLeaders(tx, updatedPlayers, direction)

    draftState.leaderRound = currentRound + 1
    delete draftState.lastPlayerStartedAt // Clear last player timer for new round
    await tx.query(
      `UPDATE pods
       SET draft_state = $1,
           state_version = state_version + 1,
           pick_started_at = NOW(),
           paused_duration_seconds = 0
       WHERE id = $2`,
      [JSON.stringify(draftState), podId]
    )

    await tx.query(
      `UPDATE pod_players SET pick_status = 'picking' WHERE pod_id = $1`,
      [podId]
    )
  } else {
    // Transition to pack draft
    draftState.phase = 'pack_draft'
    draftState.packNumber = 1
    draftState.pickInPack = 1
    delete draftState.lastPlayerStartedAt // Clear last player timer for new phase

    // Fetch all_packs only when transitioning to pack draft
    const podWithPacks = await tx.queryRow(
      'SELECT all_packs FROM pods WHERE id = $1',
      [podId]
    )
    const allPacks: unknown[][] = typeof podWithPacks?.all_packs === 'string'
      ? JSON.parse(podWithPacks.all_packs)
      : podWithPacks?.all_packs as unknown[][]

    const updatedPlayers = await tx.queryRows(
      'SELECT * FROM pod_players WHERE pod_id = $1 ORDER BY seat_number',
      [podId]
    )

    for (let i = 0; i < updatedPlayers.length; i++) {
      const player = updatedPlayers[i]
      const pack = allPacks[i][0] as { cards?: RawCard[] } | RawCard[]
      const packCards = (pack as { cards?: RawCard[] }).cards || pack // Extract cards array from pack object

      await tx.query(
        `UPDATE pod_players
         SET current_pack = $1, pick_status = 'picking'
         WHERE id = $2`,
        [JSON.stringify(packCards), player.id]
      )
    }

    await tx.query(
      `UPDATE pods
       SET draft_state = $1,
           state_version = state_version + 1,
           pick_started_at = NOW(),
           paused_duration_seconds = 0
       WHERE id = $2`,
      [JSON.stringify(draftState), podId]
    )
  }
}

/**
 * Advance pack draft after all picks are processed
 */
async function advancePackDraftAfterPicks(
  tx: TxClient,
  podId: string,
  draftState: DraftState,
  pod: DraftPod,
  postCommitEffects: PostCommitEffect[]
): Promise<void> {
  const players = await tx.queryRows(
    'SELECT * FROM pod_players WHERE pod_id = $1 ORDER BY seat_number',
    [podId]
  )

  const packNumber = draftState.packNumber || 1
  const pickInPack = draftState.pickInPack || 1
  const totalPacks = getTotalPacks(draftState, pod)

  // The pack round is over only when EVERY player's pack is empty. Keying off a
  // single seat breaks on uneven Carbonite packs (#19) — see isPackRoundExhausted.
  if (isPackRoundExhausted(players)) {
    if (packNumber >= totalPacks) {
      // Draft complete
      await tx.query(
        `UPDATE pods
         SET status = 'complete',
             draft_state = $1,
             completed_at = NOW(),
             state_version = state_version + 1
         WHERE id = $2`,
        [JSON.stringify({ ...draftState, phase: 'complete' }), podId]
      )

      const podForBots = await tx.queryRow(
        'SELECT id, share_id, host_id, settings, set_code, competitive, started_at, created_at FROM pods WHERE id = $1',
        [podId]
      )
      const botSettings = typeof podForBots?.settings === 'string' ? JSON.parse(podForBots.settings) : podForBots?.settings || {}
      const botSetCode = podForBots?.set_code || draftState.setCode || ''

      // Build decks for bot players (fire-and-forget, AFTER commit)
      postCommitEffects.push(() => {
        buildBotDecks(podId, botSetCode, botSettings).catch(err =>
          console.error('[BOT_DECK] Error building bot decks:', err)
        )
      })

      // Set deck build deadline for competitive pods
      if (podForBots?.competitive) {
        const deckLockAt = new Date(Date.now() + 20 * 60 * 1000).toISOString()
        await tx.query(
          `UPDATE pods SET deck_lock_at = $2 WHERE id = $1`,
          [podId, deckLockAt]
        )
      }

      const humanCount = players.filter(p => !p.is_bot).length
      const botCount = players.length - humanCount
      const durationSeconds = podForBots?.started_at
        ? Math.max(0, Math.round((Date.now() - new Date(podForBots.started_at).getTime()) / 1000))
        : null
      postCommitEffects.push(() => {
        captureLimitedServerEvent(
          LimitedAnalyticsEvents.LIMITED_POD_COMPLETED,
          podForBots?.host_id,
          {
            format: 'draft',
            mode: botSettings.isSolo === true ? 'solo' : 'group',
            setCode: podForBots?.set_code || draftState.setCode || '',
            duration_seconds: durationSeconds,
            human_players: humanCount,
            bot_players: botCount,
            current_players: players.length,
            podShareId: podForBots?.share_id,
          }
        )
      })

      return
    }

    // Move to next pack
    const newPackNumber = packNumber + 1
    draftState.packNumber = newPackNumber
    draftState.pickInPack = 1
    delete draftState.lastPlayerStartedAt // Clear last player timer for new pack

    // Add review period for competitive pods between packs. The pick clock has
    // to start when the review closes rather than now, or the review burns half
    // of pick 1's Appendix C allowance (60s of timer against 30s of drafting).
    // A future pick_started_at reads as zero elapsed on both sides: server
    // enforcement sees negative elapsed, and the client countdown floors at 0.
    let pickClockStartsAt: string | null = null
    if (pod.competitive && newPackNumber <= totalPacks) {
      draftState.reviewUntil = new Date(Date.now() + INTER_PACK_REVIEW_SECONDS * 1000).toISOString()
      pickClockStartsAt = draftState.reviewUntil
    }

    // Fetch all_packs only when we need to start a new pack
    // (not loaded in most queries to save memory)
    const podWithPacks = await tx.queryRow(
      'SELECT all_packs FROM pods WHERE id = $1',
      [podId]
    )
    const allPacks: unknown[][] = typeof podWithPacks?.all_packs === 'string'
      ? JSON.parse(podWithPacks.all_packs)
      : podWithPacks?.all_packs as unknown[][]

    for (let i = 0; i < players.length; i++) {
      const player = players[i]
      const pack = allPacks[i][packNumber] as { cards?: RawCard[] } | RawCard[]
      const packCards = (pack as { cards?: RawCard[] }).cards || pack // Extract cards array from pack object

      await tx.query(
        `UPDATE pod_players
         SET current_pack = $1, pick_status = 'picking'
         WHERE id = $2`,
        [JSON.stringify(packCards), player.id]
      )
    }

    await tx.query(
      `UPDATE pods
       SET draft_state = $1,
           state_version = state_version + 1,
           pick_started_at = COALESCE($3::timestamptz, NOW()),
           paused_duration_seconds = 0
       WHERE id = $2`,
      [JSON.stringify(draftState), podId, pickClockStartsAt]
    )

  } else {
    // Pass packs and continue
    const direction = getPassDirection(packNumber)
    await passPacks(tx, players, direction)

    draftState.pickInPack = pickInPack + 1
    delete draftState.lastPlayerStartedAt // Clear last player timer for new pick

    await tx.query(
      `UPDATE pods
       SET draft_state = $1,
           state_version = state_version + 1,
           pick_started_at = NOW(),
           paused_duration_seconds = 0
       WHERE id = $2`,
      [JSON.stringify(draftState), podId]
    )

    await tx.query(
      `UPDATE pod_players SET pick_status = 'picking' WHERE pod_id = $1`,
      [podId]
    )
  }
}

/**
 * Check if all players picked and advance leader draft
 *
 * Legacy path (pick route). Runs under the same per-pod advisory lock and
 * transaction as the staged-pick path, so the two cannot interleave.
 */
export async function checkAndAdvanceLeaderDraft(
  podId: string,
  draftState: DraftState,
  pod: DraftPod
): Promise<boolean> {
  return await withTransaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1::text))', [podId])

    const players = await tx.queryRows(
      'SELECT * FROM pod_players WHERE pod_id = $1 ORDER BY seat_number FOR UPDATE',
      [podId]
    )

    const allPicked = players.every(isPackPickComplete)
    if (!allPicked) {
      // Just increment state version
      await tx.query(
        'UPDATE pods SET state_version = state_version + 1 WHERE id = $1',
        [podId]
      )
      return false
    }

    // All players have picked - advance to next round
    const currentRound = draftState.leaderRound
    const totalPacks = getTotalPacks(draftState, pod)

    if (currentRound < totalPacks) {
      const direction = getLeaderPassDirection(currentRound) // 'right'
      await passLeaders(tx, players, direction)

      draftState.leaderRound = currentRound + 1
      delete draftState.lastPlayerStartedAt // Clear last player timer for new round
      await tx.query(
        `UPDATE pods
         SET draft_state = $1,
             state_version = state_version + 1,
             pick_started_at = NOW(),
             paused_duration_seconds = 0
         WHERE id = $2`,
        [JSON.stringify(draftState), podId]
      )

      await tx.query(
        `UPDATE pod_players
         SET pick_status = 'picking'
         WHERE pod_id = $1`,
        [podId]
      )
    } else {
      // Final leader round complete - transition to pack draft phase
      draftState.phase = 'pack_draft'
      draftState.packNumber = 1
      draftState.pickInPack = 1
      delete draftState.lastPlayerStartedAt // Clear last player timer for new phase

      // Fetch all_packs only when transitioning to pack draft
      const podWithPacks = await tx.queryRow(
        'SELECT all_packs FROM pods WHERE id = $1',
        [podId]
      )
      const allPacks: unknown[][] = typeof podWithPacks?.all_packs === 'string'
        ? JSON.parse(podWithPacks.all_packs)
        : podWithPacks?.all_packs as unknown[][]

      // Assign pack 1 to each player (by seat order, 0-indexed)
      for (let i = 0; i < players.length; i++) {
        const player = players[i]
        const pack = allPacks[i][0] as { cards?: RawCard[] } | RawCard[] // Pack 1 for this player
        const packCards = (pack as { cards?: RawCard[] }).cards || pack // Extract cards array from pack object

        await tx.query(
          `UPDATE pod_players
           SET current_pack = $1,
               pick_status = 'picking'
           WHERE id = $2`,
          [JSON.stringify(packCards), player.id]
        )
      }

      await tx.query(
        `UPDATE pods
         SET draft_state = $1,
             state_version = state_version + 1,
             pick_started_at = NOW(),
             paused_duration_seconds = 0
         WHERE id = $2`,
        [JSON.stringify(draftState), podId]
      )
    }

    return true
  })
}

/**
 * Pass leaders between players
 */
async function passLeaders(tx: TxClient, players: DraftPlayer[], direction: 'left' | 'right'): Promise<void> {
  // Collect all remaining leaders
  const leadersByPlayer: { playerId: string; seatNumber: number; leaders: RawCard[] }[] = []
  for (const player of players) {
    const leaders: RawCard[] = typeof player.leaders === 'string'
      ? JSON.parse(player.leaders)
      : player.leaders || []
    leadersByPlayer.push({ playerId: player.id, seatNumber: player.seat_number, leaders })
  }

  // Calculate new assignments
  const totalSeats = players.length
  for (const playerData of leadersByPlayer) {
    const nextSeat = getNextSeat(playerData.seatNumber, direction, totalSeats)
    const nextPlayer = players.find(p => p.seat_number === nextSeat)
    if (nextPlayer) {
      await tx.query(
        'UPDATE pod_players SET leaders = $1 WHERE id = $2',
        [JSON.stringify(playerData.leaders), nextPlayer.id]
      )
    }
  }
}

/**
 * Check if all players picked and advance pack draft
 *
 * Legacy path (pick route). Runs under the same per-pod advisory lock and
 * transaction as the staged-pick path, so the two cannot interleave.
 */
export async function checkAndAdvancePackDraft(
  podId: string,
  draftState: DraftState,
  pod: DraftPod
): Promise<boolean> {
  const postCommitEffects: PostCommitEffect[] = []

  const result = await withTransaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1::text))', [podId])

    const players = await tx.queryRows(
      'SELECT * FROM pod_players WHERE pod_id = $1 ORDER BY seat_number FOR UPDATE',
      [podId]
    )

    // Empty packs count as complete so uneven Carbonite packs don't hang (#19);
    // mirrors the leader path, which already uses isPackPickComplete.
    const allPicked = players.every(isPackPickComplete)
    if (!allPicked) {
      // Just increment state version
      await tx.query(
        'UPDATE pods SET state_version = state_version + 1 WHERE id = $1',
        [podId]
      )
      return false
    }

    // All players have picked — same advancement logic as the staged path
    await advancePackDraftAfterPicks(tx, podId, draftState, pod, postCommitEffects)

    return true
  })

  for (const effect of postCommitEffects) effect()

  return result
}

/**
 * Pass packs between players
 */
async function passPacks(tx: TxClient, players: DraftPlayer[], direction: 'left' | 'right'): Promise<void> {
  // Collect all current packs
  const packsByPlayer: { playerId: string; seatNumber: number; pack: RawCard[] }[] = []
  for (const player of players) {
    const currentPack: RawCard[] = parseCurrentPack(player.current_pack)
    packsByPlayer.push({ playerId: player.id, seatNumber: player.seat_number, pack: currentPack })
  }

  // Calculate new assignments
  const totalSeats = players.length
  for (const playerData of packsByPlayer) {
    const nextSeat = getNextSeat(playerData.seatNumber, direction, totalSeats)
    const nextPlayer = players.find(p => p.seat_number === nextSeat)
    if (nextPlayer) {
      await tx.query(
        'UPDATE pod_players SET current_pack = $1 WHERE id = $2',
        [JSON.stringify(playerData.pack), nextPlayer.id]
      )
    }
  }
}

import { queryRow, queryRows, query, withTransaction, type TxClient } from '@/lib/db'
import { broadcastDraftState } from '@/src/lib/socketBroadcast'
import { pairRound1, pairSwiss, type PairingPlayer } from './pairing'

interface MatchmakingDbClient {
  query: typeof query
  queryRow: typeof queryRow
  queryRows: typeof queryRows
}

export interface RoundAdvanceResult {
  advanced: boolean
  completedEvent: boolean
  nextRoundNumber: number | null
}

const defaultClient: MatchmakingDbClient = { query, queryRow, queryRows }

/**
 * Check if all matches in the active round are confirmed, and if so,
 * advance to the next round or mark the event complete.
 */
export async function checkAndAdvanceRound(podId: string, shareId: string): Promise<void> {
  const result = await checkAndAdvanceRoundWithClient(defaultClient, podId)
  if (result.advanced) {
    await broadcastDraftState(shareId)
  }
}

/**
 * Undo a round's completion after a match in it is unsubmitted. A round only
 * advances once ALL its matches are confirmed, so clearing one match's result
 * means the round is no longer complete and any advancement it triggered must
 * roll back:
 *   - Reopen the round itself (active again).
 *   - If completing it had ended the EVENT (final round, number >= 3), reopen
 *     the event (matchmakingStatus back to active).
 *   - Otherwise, if the freshly-created next round has NO confirmed results of
 *     its own, remove it and its matches so pairings regenerate when the round
 *     re-completes. A next round that already has confirmed results is left
 *     intact (removing it would discard real progress) — the round is still
 *     reopened so the unsubmitted match shows as pending.
 * No-ops when the round is still active (an unsubmit that didn't complete a
 * round needs no rollback — clearing the match result is enough).
 */
export async function revertRoundCompletionIfNeeded(
  podId: string,
  roundId: string,
): Promise<void> {
  const round = await queryRow(
    `SELECT round_number, status FROM practice_rounds WHERE id = $1 AND pod_id = $2`,
    [roundId, podId]
  )
  if (!round || round.status !== 'complete') return

  const roundNumber = round.round_number as number

  await query(
    `UPDATE practice_rounds SET status = 'active', completed_at = NULL WHERE id = $1`,
    [roundId]
  )

  if (roundNumber >= 3) {
    // Final round — completing it had finished the event. Reopen it.
    await query(
      `UPDATE pods SET draft_state = draft_state || $1::jsonb WHERE id = $2`,
      [JSON.stringify({ matchmakingStatus: 'active', currentRound: roundNumber }), podId]
    )
    return
  }

  // A next round was created on advance. Remove it only if nothing has been
  // played in it yet, so we don't discard real progress.
  const nextRound = await queryRow(
    `SELECT id FROM practice_rounds WHERE pod_id = $1 AND round_number = $2`,
    [podId, roundNumber + 1]
  )
  if (!nextRound) return

  const confirmed = await queryRow(
    `SELECT COUNT(*)::int AS count FROM practice_matches WHERE round_id = $1 AND final_confirmed = true AND is_bye = false`,
    [nextRound.id]
  )
  if (((confirmed?.count as number) ?? 0) > 0) return

  await query(`DELETE FROM practice_matches WHERE round_id = $1`, [nextRound.id])
  await query(`DELETE FROM practice_rounds WHERE id = $1`, [nextRound.id])
  await query(
    `UPDATE pods SET draft_state = draft_state || $1::jsonb WHERE id = $2`,
    [JSON.stringify({ currentRound: roundNumber }), podId]
  )
}

export async function checkAndAdvanceRoundInTransaction(
  tx: TxClient,
  podId: string
): Promise<RoundAdvanceResult> {
  return checkAndAdvanceRoundWithClient(tx, podId)
}

async function checkAndAdvanceRoundWithClient(
  db: MatchmakingDbClient,
  podId: string
): Promise<RoundAdvanceResult> {
  const round = await db.queryRow(
    `SELECT id, round_number FROM practice_rounds WHERE pod_id = $1 AND status = 'active' ORDER BY round_number DESC LIMIT 1`,
    [podId]
  )

  if (!round) return { advanced: false, completedEvent: false, nextRoundNumber: null }

  const roundId = round.id as string
  const roundNumber = round.round_number as number

  const countRow = await db.queryRow(
    `SELECT COUNT(*)::int as count FROM practice_matches WHERE round_id = $1 AND final_confirmed = false AND is_bye = false`,
    [roundId]
  )

  const unconfirmedCount = (countRow?.count as number) ?? 0
  if (unconfirmedCount > 0) return { advanced: false, completedEvent: false, nextRoundNumber: null }

  await db.query(
    `UPDATE practice_rounds SET status = 'complete', completed_at = NOW() WHERE id = $1`,
    [roundId]
  )

  if (roundNumber >= 3) {
    await db.query(
      `UPDATE pods SET draft_state = draft_state || $1::jsonb WHERE id = $2`,
      [JSON.stringify({ matchmakingStatus: 'complete' }), podId]
    )
    return { advanced: true, completedEvent: true, nextRoundNumber: null }
  } else {
    await createNextRoundWithClient(db, podId, roundNumber + 1)
    return { advanced: true, completedEvent: false, nextRoundNumber: roundNumber + 1 }
  }
}

/**
 * Create the next Swiss round based on current standings.
 */
export async function createNextRound(podId: string, roundNumber: number): Promise<void> {
  await createNextRoundWithClient(defaultClient, podId, roundNumber)
}

async function createNextRoundWithClient(
  db: MatchmakingDbClient,
  podId: string,
  roundNumber: number
): Promise<void> {
  const playerRows = await db.queryRows(
    `SELECT pp.user_id as id, pp.seat_number, pp.dropped,
      COALESCE(SUM(CASE
        WHEN pm.match_winner = 'player1' AND pm.player1_id = pp.user_id THEN 1
        WHEN pm.match_winner = 'player2' AND pm.player2_id = pp.user_id THEN 1
        WHEN pm.is_bye AND pm.player1_id = pp.user_id THEN 1
        ELSE 0 END), 0)::int as match_wins,
      COALESCE(SUM(CASE
        WHEN pm.match_winner = 'player1' AND pm.player2_id = pp.user_id THEN 1
        WHEN pm.match_winner = 'player2' AND pm.player1_id = pp.user_id THEN 1
        ELSE 0 END), 0)::int as match_losses,
      EXISTS(SELECT 1 FROM practice_matches pm2 WHERE pm2.pod_id = $1 AND pm2.is_bye = true AND pm2.player1_id = pp.user_id) as has_bye
    FROM pod_players pp
    LEFT JOIN practice_matches pm ON pm.pod_id = $1 AND pm.final_confirmed = true
      AND (pm.player1_id = pp.user_id OR pm.player2_id = pp.user_id)
    WHERE pp.pod_id = $1 AND pp.is_bot = false
    GROUP BY pp.user_id, pp.seat_number, pp.dropped`,
    [podId]
  )

  const previousMatchRows = await db.queryRows(
    `SELECT player1_id, player2_id FROM practice_matches WHERE pod_id = $1 AND is_bye = false`,
    [podId]
  )

  const opponentMap = new Map<string, string[]>()
  for (const row of previousMatchRows) {
    const p1 = row.player1_id as string
    const p2 = row.player2_id as string
    if (!opponentMap.has(p1)) opponentMap.set(p1, [])
    if (!opponentMap.has(p2)) opponentMap.set(p2, [])
    opponentMap.get(p1)!.push(p2)
    opponentMap.get(p2)!.push(p1)
  }

  const pairingPlayers: PairingPlayer[] = playerRows.map(row => ({
    id: row.id as string,
    seatNumber: row.seat_number as number,
    matchWins: row.match_wins as number,
    matchLosses: row.match_losses as number,
    hasBye: row.has_bye as boolean,
    dropped: row.dropped as boolean,
    opponents: opponentMap.get(row.id as string) ?? [],
  }))

  const pairings = pairSwiss(pairingPlayers)

  const newRound = await db.queryRow(
    `INSERT INTO practice_rounds (pod_id, round_number, status, created_at) VALUES ($1, $2, 'active', NOW()) RETURNING id`,
    [podId, roundNumber]
  )

  const newRoundId = newRound!.id as string

  for (const pairing of pairings) {
    if (pairing.isBye) {
      await db.query(
        `INSERT INTO practice_matches (round_id, pod_id, player1_id, player2_id, is_bye, final_confirmed, match_winner, created_at)
         VALUES ($1, $2, $3, NULL, true, true, 'player1', NOW())`,
        [newRoundId, podId, pairing.player1Id]
      )
    } else {
      await db.query(
        `INSERT INTO practice_matches (round_id, pod_id, player1_id, player2_id, is_bye, final_confirmed, created_at)
         VALUES ($1, $2, $3, $4, false, false, NOW())`,
        [newRoundId, podId, pairing.player1Id, pairing.player2Id]
      )
    }
  }

  await db.query(
    `UPDATE pods SET draft_state = draft_state || $1::jsonb WHERE id = $2`,
    [JSON.stringify({ currentRound: roundNumber }), podId]
  )
}

/**
 * Create the first round of the matchmaking event.
 */
export async function createRound1(podId: string, shareId: string): Promise<void> {
  const playerRows = await queryRows(
    `SELECT user_id as id, seat_number, dropped FROM pod_players WHERE pod_id = $1 AND is_bot = false ORDER BY seat_number`,
    [podId]
  )

  const pairingPlayers: PairingPlayer[] = playerRows.map(row => ({
    id: row.id as string,
    seatNumber: row.seat_number as number,
    matchWins: 0,
    matchLosses: 0,
    hasBye: false,
    dropped: row.dropped as boolean,
    opponents: [],
  }))

  const pairings = pairRound1(pairingPlayers)

  const newRound = await queryRow(
    `INSERT INTO practice_rounds (pod_id, round_number, status, created_at) VALUES ($1, 1, 'active', NOW()) RETURNING id`,
    [podId]
  )

  const newRoundId = newRound!.id as string

  for (const pairing of pairings) {
    if (pairing.isBye) {
      await query(
        `INSERT INTO practice_matches (round_id, pod_id, player1_id, player2_id, is_bye, final_confirmed, match_winner, created_at)
         VALUES ($1, $2, $3, NULL, true, true, 'player1', NOW())`,
        [newRoundId, podId, pairing.player1Id]
      )
    } else {
      await query(
        `INSERT INTO practice_matches (round_id, pod_id, player1_id, player2_id, is_bye, final_confirmed, created_at)
         VALUES ($1, $2, $3, $4, false, false, NOW())`,
        [newRoundId, podId, pairing.player1Id, pairing.player2Id]
      )
    }
  }

  await query(
    `UPDATE pods SET draft_state = draft_state || $1::jsonb WHERE id = $2`,
    [JSON.stringify({ phase: 'matchmaking', matchmakingStatus: 'active', currentRound: 1 }), podId]
  )

  await broadcastDraftState(shareId)
}

/**
 * Cancel a competitive event entirely. Tears down every round, pairing and game
 * for the pod and returns it to its pre-event deck-building lobby:
 *   - Deletes all practice rounds (matches + games cascade away).
 *   - Resets matchmaking back to 'deck_building' / round 1 so the roster and
 *     "Start Round 1" reappear (the organizer can restart or disband).
 *   - Clears the deck-build deadline and the pod-level unlock override so every
 *     primary deck unfreezes (a cancelled event no longer locks decks).
 *
 * Host-authorization is enforced by the route. This is irreversible — the UI
 * gates it behind a confirm dialog.
 */
export async function cancelEvent(podId: string, shareId: string): Promise<void> {
  await withTransaction(async (tx) => {
    // ON DELETE CASCADE removes matches + games, but delete explicitly so the
    // intent is obvious and the operation is robust to future FK changes.
    await tx.query('DELETE FROM practice_match_games WHERE pod_id = $1', [podId])
    await tx.query('DELETE FROM practice_matches WHERE pod_id = $1', [podId])
    await tx.query('DELETE FROM practice_rounds WHERE pod_id = $1', [podId])
    await tx.query(
      `UPDATE pods
         SET draft_state = draft_state || $1::jsonb,
             deck_lock_at = NULL,
             decks_unlocked = false,
             updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify({ matchmakingStatus: 'deck_building', currentRound: 1 }), podId]
    )
  })

  await broadcastDraftState(shareId)
}

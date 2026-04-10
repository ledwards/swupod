import { queryRow, queryRows, query } from '@/lib/db'
import { broadcastDraftState } from '@/src/lib/socketBroadcast'
import { pairRound1, pairSwiss, type PairingPlayer } from './pairing'

/**
 * Check if all matches in the active round are confirmed, and if so,
 * advance to the next round or mark the event complete.
 */
export async function checkAndAdvanceRound(podId: string, shareId: string): Promise<void> {
  const round = await queryRow(
    `SELECT id, round_number FROM practice_rounds WHERE pod_id = $1 AND status = 'active' ORDER BY round_number DESC LIMIT 1`,
    [podId]
  )

  if (!round) return

  const roundId = round.id as string
  const roundNumber = round.round_number as number

  const countRow = await queryRow(
    `SELECT COUNT(*)::int as count FROM practice_matches WHERE round_id = $1 AND final_confirmed = false AND is_bye = false`,
    [roundId]
  )

  const unconfirmedCount = (countRow?.count as number) ?? 0
  if (unconfirmedCount > 0) return

  await query(
    `UPDATE practice_rounds SET status = 'complete', completed_at = NOW() WHERE id = $1`,
    [roundId]
  )

  if (roundNumber >= 3) {
    await query(
      `UPDATE pods SET draft_state = draft_state || $1::jsonb WHERE id = $2`,
      [JSON.stringify({ matchmakingStatus: 'complete' }), podId]
    )
  } else {
    await createNextRound(podId, roundNumber + 1)
  }

  await broadcastDraftState(shareId)
}

/**
 * Create the next Swiss round based on current standings.
 */
export async function createNextRound(podId: string, roundNumber: number): Promise<void> {
  const playerRows = await queryRows(
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

  const previousMatchRows = await queryRows(
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

  const newRound = await queryRow(
    `INSERT INTO practice_rounds (pod_id, round_number, status, created_at) VALUES ($1, $2, 'active', NOW()) RETURNING id`,
    [podId, roundNumber]
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

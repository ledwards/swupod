// Integration tests for the shared drop core used by host-boot AND player
// self-drop (dropPlayerFromMatchmaking). Exercises the real Postgres path:
// mark dropped → auto-loss the current match → void orphaned live games →
// advance the round. Skips cleanly when no test database is configured.
import { after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const TEST_DB_URL =
  process.env['SWUPOD_TEST_DATABASE_URL'] || 'postgresql://localhost:5432/swupod_test'

process.env['DATABASE_URL'] = TEST_DB_URL
process.env['POSTGRES_URL'] = TEST_DB_URL

const db = await import('@/lib/db')
const { query, queryRow, queryRows, closePool } = db
const { dropPlayerFromMatchmaking } = await import('./drops')

let dbAvailable = false
try {
  dbAvailable = await db.testConnection()
  if (dbAvailable) {
    const table = await queryRow("SELECT to_regclass('public.practice_match_games') AS table_name")
    dbAvailable = Boolean(table?.table_name)
  }
} catch {
  dbAvailable = false
}

if (!dbAvailable) {
  console.warn(
    `drops.test.ts: test database unavailable or missing practice tables at ${TEST_DB_URL} - skipping. ` +
    'Create it with: createdb swupod_test && POSTGRES_URL=postgresql://localhost:5432/swupod_test npx tsx scripts/migrate.ts dev --yes'
  )
}

const seededPods: string[] = []
const seededUsers: string[] = []

after(async () => {
  if (!dbAvailable) return
  for (const podId of seededPods) {
    await query('DELETE FROM practice_match_games WHERE pod_id = $1', [podId])
    await query('DELETE FROM practice_matches WHERE pod_id = $1', [podId])
    await query('DELETE FROM practice_rounds WHERE pod_id = $1', [podId])
    await query('DELETE FROM pod_players WHERE pod_id = $1', [podId])
    await query('DELETE FROM pods WHERE id = $1', [podId])
  }
  for (const userId of seededUsers) {
    await query('DELETE FROM users WHERE id = $1', [userId])
  }
  await closePool()
})

interface SeededPod {
  podId: string
  shareId: string
  userIds: string[]
  roundId: string
  matchIds: string[]
}

interface SeedOptions {
  seats: number
  roundNumber?: number
  /** Round pairings by seat index; player2 = null means a bye for player1. */
  round1: Array<{ p1: number; p2: number | null }>
}

async function seedPod({ seats, roundNumber = 1, round1 }: SeedOptions): Promise<SeededPod> {
  const suffix = randomUUID().slice(0, 8)
  const userIds: string[] = []
  for (let i = 0; i < seats; i++) {
    const user = await queryRow(
      `INSERT INTO users (username, email) VALUES ($1, $2) RETURNING id`,
      [`drop-${suffix}-${i}`, `drop-${suffix}-${i}@example.test`]
    )
    userIds.push(user!.id as string)
    seededUsers.push(user!.id as string)
  }

  const shareId = `drop-${suffix}`
  const pod = await queryRow(
    `INSERT INTO pods (
       share_id, host_id, set_code, status, draft_state, state_version,
       max_players, current_players, competitive
     )
     VALUES ($1, $2, 'TST', 'active', $3::jsonb, 1, $4, $4, true)
     RETURNING id`,
    [
      shareId,
      userIds[0],
      JSON.stringify({ phase: 'matchmaking', matchmakingStatus: 'active', currentRound: roundNumber }),
      seats,
    ]
  )
  const podId = pod!.id as string
  seededPods.push(podId)

  for (let seat = 0; seat < seats; seat++) {
    await query(
      `INSERT INTO pod_players (
         pod_id, user_id, seat_number, pick_status, is_bot,
         leaders, drafted_leaders, drafted_cards, current_pack
       )
       VALUES ($1, $2, $3, 'done', false, '[]', '[]', '[]', '[]')`,
      [podId, userIds[seat], seat + 1]
    )
  }

  const round = await queryRow(
    `INSERT INTO practice_rounds (pod_id, round_number, status, created_at)
     VALUES ($1, $2, 'active', NOW()) RETURNING id`,
    [podId, roundNumber]
  )
  const roundId = round!.id as string

  const matchIds: string[] = []
  for (const pairing of round1) {
    if (pairing.p2 === null) {
      const m = await queryRow(
        `INSERT INTO practice_matches (round_id, pod_id, player1_id, player2_id, is_bye, final_confirmed, match_winner, created_at)
         VALUES ($1, $2, $3, NULL, true, true, 'player1', NOW()) RETURNING id`,
        [roundId, podId, userIds[pairing.p1]]
      )
      matchIds.push(m!.id as string)
    } else {
      const m = await queryRow(
        `INSERT INTO practice_matches (round_id, pod_id, player1_id, player2_id, is_bye, final_confirmed, created_at)
         VALUES ($1, $2, $3, $4, false, false, NOW()) RETURNING id`,
        [roundId, podId, userIds[pairing.p1], userIds[pairing.p2]]
      )
      matchIds.push(m!.id as string)
    }
  }

  return { podId, shareId, userIds, roundId, matchIds }
}

function matchById(podId: string, matchId: string) {
  return queryRow(
    `SELECT player1_id, player2_id, is_bye, final_confirmed, match_winner
     FROM practice_matches WHERE pod_id = $1 AND id = $2`,
    [podId, matchId]
  )
}

describe('dropPlayerFromMatchmaking (shared boot/self-drop core)', { skip: !dbAvailable }, () => {
  it('records the dropper\'s open match as a loss, advances the round, and byes the lone survivor', async () => {
    const pod = await seedPod({ seats: 2, round1: [{ p1: 0, p2: 1 }] })
    const [playerA, playerB] = pod.userIds

    const result = await dropPlayerFromMatchmaking({ podId: pod.podId, userId: playerB!, shareId: pod.shareId })

    assert.equal(result.dropped, true)
    assert.equal(result.matchResolved, true)
    assert.deepEqual(result.advanceResult, { advanced: true, completedEvent: false, nextRoundNumber: 2 })

    // Open match resolved as a loss for the dropper (player2 = B) → A wins.
    const match = await matchById(pod.podId, pod.matchIds[0]!)
    assert.equal(match!.final_confirmed, true)
    assert.equal(match!.match_winner, 'player1')

    // Round 1 complete, round 2 created with a bye for the only active player (A).
    const round1 = await queryRow(`SELECT status FROM practice_rounds WHERE pod_id = $1 AND round_number = 1`, [pod.podId])
    assert.equal(round1!.status, 'complete')
    const round2Bye = await queryRow(
      `SELECT pm.player1_id, pm.is_bye, pm.final_confirmed FROM practice_matches pm
       JOIN practice_rounds pr ON pr.id = pm.round_id
       WHERE pm.pod_id = $1 AND pr.round_number = 2 AND pm.is_bye = true`,
      [pod.podId]
    )
    assert.ok(round2Bye, 'odd active count after a drop must produce a bye in round 2')
    assert.equal(round2Bye!.player1_id, playerA)
    assert.equal(round2Bye!.final_confirmed, true)
  })

  it('completes the event when the dropped match was the last open one in the final round', async () => {
    const pod = await seedPod({ seats: 2, roundNumber: 3, round1: [{ p1: 0, p2: 1 }] })

    const result = await dropPlayerFromMatchmaking({ podId: pod.podId, userId: pod.userIds[1]!, shareId: pod.shareId })

    assert.equal(result.advanceResult?.completedEvent, true)
    assert.equal(result.advanceResult?.nextRoundNumber, null)
    const finalPod = await queryRow(`SELECT draft_state FROM pods WHERE id = $1`, [pod.podId])
    assert.equal((finalPod!.draft_state as any).matchmakingStatus, 'complete')
  })

  it('leaves an existing bye win intact when the bye holder drops, and does not block advancement', async () => {
    // 3 players: A vs B, plus C holds the bye this round.
    const pod = await seedPod({ seats: 3, round1: [{ p1: 0, p2: 1 }, { p1: 2, p2: null }] })
    const [playerA, , playerC] = pod.userIds
    const byeMatchId = pod.matchIds[1]!

    // Bye holder drops: their bye win stays, and the open A/B match keeps the round going.
    const dropBye = await dropPlayerFromMatchmaking({ podId: pod.podId, userId: playerC!, shareId: pod.shareId })
    assert.equal(dropBye.matchResolved, false)
    assert.equal(dropBye.advanceResult?.advanced, false)

    const byeMatch = await matchById(pod.podId, byeMatchId)
    assert.equal(byeMatch!.is_bye, true)
    assert.equal(byeMatch!.final_confirmed, true)
    assert.equal(byeMatch!.match_winner, 'player1', 'dropped bye holder keeps the bye win')

    const cRow = await queryRow(`SELECT dropped FROM pod_players WHERE pod_id = $1 AND user_id = $2`, [pod.podId, playerC])
    assert.equal(cRow!.dropped, true)

    // Now A drops too, resolving the last open match → round advances.
    const dropA = await dropPlayerFromMatchmaking({ podId: pod.podId, userId: playerA!, shareId: pod.shareId })
    assert.equal(dropA.matchResolved, true)
    assert.equal(dropA.advanceResult?.advanced, true)
    assert.equal(dropA.advanceResult?.nextRoundNumber, 2)
  })

  it('handles both players in a match dropping: first drop loses, second is a no-op on the match', async () => {
    const pod = await seedPod({ seats: 4, round1: [{ p1: 0, p2: 1 }, { p1: 2, p2: 3 }] })
    const [playerA, playerB] = pod.userIds
    const matchId = pod.matchIds[0]!

    const first = await dropPlayerFromMatchmaking({ podId: pod.podId, userId: playerA!, shareId: pod.shareId })
    assert.equal(first.matchResolved, true)

    const second = await dropPlayerFromMatchmaking({ podId: pod.podId, userId: playerB!, shareId: pod.shareId })
    assert.equal(second.dropped, true)
    assert.equal(second.matchResolved, false, 'the match is already resolved; the second drop must not re-resolve it')

    const match = await matchById(pod.podId, matchId)
    assert.equal(match!.final_confirmed, true)
    assert.equal(match!.match_winner, 'player2', 'first dropper (player1=A) lost to B')

    const dropped = await queryRows(
      `SELECT user_id FROM pod_players WHERE pod_id = $1 AND dropped = true ORDER BY seat_number`,
      [pod.podId]
    )
    assert.deepEqual(dropped.map(r => r.user_id), [playerA, playerB])

    // The other match is still open → round has not advanced.
    const round1 = await queryRow(`SELECT status FROM practice_rounds WHERE pod_id = $1 AND round_number = 1`, [pod.podId])
    assert.equal(round1!.status, 'active')
  })

  it('is idempotent: a second drop of the same player is a no-op', async () => {
    const pod = await seedPod({ seats: 4, round1: [{ p1: 0, p2: 1 }, { p1: 2, p2: 3 }] })
    const playerB = pod.userIds[1]!

    const first = await dropPlayerFromMatchmaking({ podId: pod.podId, userId: playerB, shareId: pod.shareId })
    assert.equal(first.dropped, true)
    const firstDroppedAt = await queryRow(`SELECT dropped_at FROM pod_players WHERE pod_id = $1 AND user_id = $2`, [pod.podId, playerB])

    const second = await dropPlayerFromMatchmaking({ podId: pod.podId, userId: playerB, shareId: pod.shareId })
    assert.equal(second.dropped, false, 'already-dropped player → no-op')
    assert.equal(second.matchResolved, false)
    const secondDroppedAt = await queryRow(`SELECT dropped_at FROM pod_players WHERE pod_id = $1 AND user_id = $2`, [pod.podId, playerB])
    assert.deepEqual(secondDroppedAt!.dropped_at, firstDroppedAt!.dropped_at, 'dropped_at must not change on a repeat drop')
  })

  it('voids an orphaned in-progress live game without letting it block advancement', async () => {
    const pod = await seedPod({ seats: 2, round1: [{ p1: 0, p2: 1 }] })
    const matchId = pod.matchIds[0]!

    // A live game is mid-flight (e.g. a Wayfinder launch) when the player drops.
    const game = await queryRow(
      `INSERT INTO practice_match_games (match_id, round_id, pod_id, game_number, status)
       VALUES ($1, $2, $3, 1, 'in_progress') RETURNING id`,
      [matchId, pod.roundId, pod.podId]
    )

    const result = await dropPlayerFromMatchmaking({ podId: pod.podId, userId: pod.userIds[1]!, shareId: pod.shareId })

    assert.equal(result.advanceResult?.advanced, true, 'an orphaned live game must not block the round')
    const gameRow = await queryRow(`SELECT status FROM practice_match_games WHERE id = $1`, [game!.id])
    assert.equal(gameRow!.status, 'voided', 'the in-progress game is voided so the confirmed match has no phantom live row')
  })
})

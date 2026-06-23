// Integration test for cancelEvent: tearing down a competitive event and
// returning the pod to its pre-event deck-building lobby. Exercises the real
// Postgres path. Skips cleanly when no test database is configured.
import { after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const TEST_DB_URL =
  process.env['SWUPOD_TEST_DATABASE_URL'] || 'postgresql://localhost:5432/swupod_test'

process.env['DATABASE_URL'] = TEST_DB_URL
process.env['POSTGRES_URL'] = TEST_DB_URL

const db = await import('@/lib/db')
const { query, queryRow, closePool } = db
const { cancelEvent } = await import('./advancement')

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
    `cancelEvent.test.ts: test database unavailable or missing practice tables at ${TEST_DB_URL} - skipping.`
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

async function seedActiveEvent() {
  const suffix = randomUUID().slice(0, 8)
  const userIds: string[] = []
  for (let i = 0; i < 2; i++) {
    const user = await queryRow(
      `INSERT INTO users (username, email) VALUES ($1, $2) RETURNING id`,
      [`cancel-${suffix}-${i}`, `cancel-${suffix}-${i}@example.test`]
    )
    userIds.push(user!.id as string)
    seededUsers.push(user!.id as string)
  }

  const shareId = `cancel-${suffix}`
  const pod = await queryRow(
    `INSERT INTO pods (
       share_id, host_id, set_code, status, draft_state, state_version,
       max_players, current_players, competitive, deck_lock_at, decks_unlocked
     )
     VALUES ($1, $2, 'TST', 'active', $3::jsonb, 1, 2, 2, true, NOW(), true)
     RETURNING id`,
    [
      shareId,
      userIds[0],
      JSON.stringify({ phase: 'matchmaking', matchmakingStatus: 'active', currentRound: 2 }),
    ]
  )
  const podId = pod!.id as string
  seededPods.push(podId)

  const round = await queryRow(
    `INSERT INTO practice_rounds (pod_id, round_number, status, created_at)
     VALUES ($1, 1, 'active', NOW()) RETURNING id`,
    [podId]
  )
  const roundId = round!.id as string
  const match = await queryRow(
    `INSERT INTO practice_matches (round_id, pod_id, player1_id, player2_id, is_bye, final_confirmed, created_at)
     VALUES ($1, $2, $3, $4, false, false, NOW()) RETURNING id`,
    [roundId, podId, userIds[0], userIds[1]]
  )
  await query(
    `INSERT INTO practice_match_games (match_id, round_id, pod_id, game_number, attempt_number, status, created_at, updated_at)
     VALUES ($1, $2, $3, 1, 1, 'creating', NOW(), NOW())`,
    [match!.id, roundId, podId]
  )

  return { podId, shareId }
}

describe('cancelEvent', { skip: !dbAvailable }, () => {
  it('deletes every round/match/game and resets the pod to deck building with decks unfrozen', async () => {
    const { podId, shareId } = await seedActiveEvent()

    await cancelEvent(podId, shareId)

    const counts = await queryRow(
      `SELECT
         (SELECT COUNT(*) FROM practice_rounds WHERE pod_id = $1) AS rounds,
         (SELECT COUNT(*) FROM practice_matches WHERE pod_id = $1) AS matches,
         (SELECT COUNT(*) FROM practice_match_games WHERE pod_id = $1) AS games`,
      [podId]
    )
    assert.equal(Number(counts!.rounds), 0, 'rounds should be gone')
    assert.equal(Number(counts!.matches), 0, 'matches should be gone')
    assert.equal(Number(counts!.games), 0, 'games should be gone')

    const pod = await queryRow(
      `SELECT draft_state, deck_lock_at, decks_unlocked FROM pods WHERE id = $1`,
      [podId]
    )
    const draftState = pod!.draft_state as { matchmakingStatus?: string; currentRound?: number; phase?: string }
    assert.equal(draftState.matchmakingStatus, 'deck_building', 'event returns to deck building')
    assert.equal(draftState.currentRound, 1, 'round counter resets to 1')
    assert.equal(pod!.deck_lock_at, null, 'build deadline cleared so decks unfreeze')
    assert.equal(pod!.decks_unlocked, false, 'unlock override reset')
  })
})

// Tests for the single-query matchmaking rounds fetch (U8, foundations
// hardening) — the replacement for the per-round N+1 loop on the 2 s-polled
// GET /api/draft/[shareId].
//
// DB-backed: runs against the local swupod_test Postgres (see lib/db.test.ts
// for setup). Skips loudly when the test DB is unreachable. The target
// database is deliberately NOT read from DATABASE_URL / POSTGRES_URL so a
// shell pointing at the Railway dev/prod DB can never be written to by tests.
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { randomUUID } from 'node:crypto'

const TEST_DB_URL =
  process.env['SWUPOD_TEST_DATABASE_URL'] || 'postgresql://localhost:5432/swupod_test'

// lib/db.ts reads the connection string at module init — pin it to the test
// DB before the dynamic imports below.
process.env['DATABASE_URL'] = TEST_DB_URL
process.env['POSTGRES_URL'] = TEST_DB_URL

const db = await import('@/lib/db')
const { query, queryRow, queryRows, closePool } = db
const { fetchRoundsWithMatches } = await import('./matchmakingRounds')

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
    `⚠️  matchmakingRounds.test.ts: test database unreachable or missing practice_match_games at ${TEST_DB_URL} — skipping. ` +
    'Create it with: createdb swupod_test && POSTGRES_URL=postgresql://localhost:5432/swupod_test npx tsx scripts/migrate.ts dev --yes'
  )
}

describe('fetchRoundsWithMatches', { skip: !dbAvailable }, () => {
  let podId: string
  const userIds: string[] = []
  const matchIds: string[][] = [] // matchIds[roundIndex] = ids in created order
  const roundStatuses = ['completed', 'completed', 'active', 'active']

  before(async () => {
    const shareId = `mmr-test-${randomUUID().slice(0, 8)}`
    for (let i = 0; i < 4; i++) {
      const user = await queryRow(
        `INSERT INTO users (username, email, avatar_url) VALUES ($1, $2, $3) RETURNING id`,
        [`mmr-user-${shareId}-${i}`, `mmr-${shareId}-${i}@example.test`, i === 0 ? null : `https://cdn.test/a${i}.png`]
      )
      userIds.push(user!.id as string)
    }

    const pod = await queryRow(
      `INSERT INTO pods (share_id, set_code, status, competitive, draft_state, state_version, max_players)
       VALUES ($1, 'TST', 'active', true, $2, 1, 4) RETURNING id`,
      [shareId, JSON.stringify({ phase: 'matchmaking', matchmakingStatus: 'active', currentRound: 3 })]
    )
    podId = pod!.id as string

    // 3 rounds with 2 matches each + 1 empty round (round 4).
    // Insert rounds out of numeric order to prove ORDER BY does the work.
    for (const roundNumber of [2, 4, 1, 3]) {
      const round = await queryRow(
        `INSERT INTO practice_rounds (pod_id, round_number, status) VALUES ($1, $2, $3) RETURNING id`,
        [podId, roundNumber, roundStatuses[roundNumber - 1]]
      )
      const roundId = round!.id as string
      matchIds[roundNumber - 1] = []
      if (roundNumber === 4) continue // the empty round

      // Match A: u0 vs u1, decided. Match B: u2 bye (no player2).
      const matchA = await queryRow(
        `INSERT INTO practice_matches
           (round_id, pod_id, player1_id, player2_id, is_bye,
            game1_result, game2_result, player1_submitted, player2_submitted,
            final_confirmed, match_winner, wayfinder_match_id, created_at)
         VALUES ($1, $2, $3, $4, false, 'player1', 'player1', true, true, true, 'player1', $5, NOW() - INTERVAL '2 minutes')
         RETURNING id`,
        [roundId, podId, userIds[0], userIds[1], roundNumber === 1 ? 'wf-123' : null]
      )
      const matchB = await queryRow(
        `INSERT INTO practice_matches
           (round_id, pod_id, player1_id, player2_id, is_bye, created_at)
         VALUES ($1, $2, $3, NULL, true, NOW() - INTERVAL '1 minute')
         RETURNING id`,
        [roundId, podId, userIds[2]]
      )
      matchIds[roundNumber - 1].push(matchA!.id as string, matchB!.id as string)

      if (roundNumber === 1) {
        await query(
          `INSERT INTO practice_match_games (
             match_id, round_id, pod_id, game_number, attempt_number, status,
             wayfinder_match_id, replay_url, result, completed_at
           )
           VALUES ($1, $2, $3, 1, 1, 'complete', 'wf-123-game-1', 'https://wayfinder.example/replay/wf-123-game-1', 'player1', NOW())`,
          [matchA!.id, roundId, podId]
        )
      }
    }
  })

  after(async () => {
    if (podId) await query('DELETE FROM pods WHERE id = $1', [podId])
    for (const userId of userIds) {
      await query('DELETE FROM users WHERE id = $1', [userId])
    }
    await closePool()
  })

  it('returns the exact pre-U8 payload shape: ordered rounds, ordered matches, empty round preserved', async () => {
    const rounds = await fetchRoundsWithMatches(podId)

    assert.strictEqual(rounds.length, 4, 'all 4 rounds present (including the match-less one)')
    assert.deepStrictEqual(rounds.map(r => r.roundNumber), [1, 2, 3, 4], 'rounds ordered by round_number')
    assert.deepStrictEqual(rounds.map(r => r.status), roundStatuses)
    assert.deepStrictEqual(rounds.map(r => r.matches.length), [2, 2, 2, 0], 'empty round keeps an empty matches array')

    // Matches ordered by created_at within each round
    assert.deepStrictEqual(rounds[0]!.matches.map(m => m.id), matchIds[0])

    // Full shape of a decided match (player1 has a null avatar)
    const decided = rounds[0]!.matches[0]!
    assert.deepStrictEqual(decided, {
      id: matchIds[0]![0],
      player1: { id: userIds[0], username: decided.player1!.username, avatarUrl: null },
      player2: { id: userIds[1], username: decided.player2!.username, avatarUrl: 'https://cdn.test/a1.png' },
      isBye: false,
      game1Result: 'player1',
      game2Result: 'player1',
      game3Result: null,
      player1Submitted: true,
      player2Submitted: true,
      finalConfirmed: true,
      matchWinner: 'player1',
      podOwnerOverride: false,
      wayfinderMatchId: 'wf-123',
      games: decided.games,
      currentGame: decided.currentGame,
    })
    assert.match(String(decided.player1!.username), /^mmr-user-/)
    assert.strictEqual(decided.games.length, 1)
    assert.strictEqual(decided.games[0]!.status, 'complete')
    assert.strictEqual(decided.games[0]!.replayUrl, 'https://wayfinder.example/replay/wf-123-game-1')
    assert.strictEqual(decided.currentGame.status, 'complete')

    // Bye match: player2 is null, wayfinderMatchId normalizes to null
    const bye = rounds[0]!.matches[1]!
    assert.strictEqual(bye.isBye, true)
    assert.strictEqual(bye.player2, null)
    assert.strictEqual(bye.player1!.id, userIds[2])
    assert.strictEqual(bye.wayfinderMatchId, null)
    assert.strictEqual(bye.matchWinner, null)
    assert.deepStrictEqual(bye.games, [])
    assert.strictEqual(bye.currentGame.status, 'complete')
  })

  it('touches the database exactly once regardless of round count', async () => {
    let statements = 0
    const countingQueryRows: typeof queryRows = async (text, params) => {
      statements++
      return queryRows(text, params)
    }
    await fetchRoundsWithMatches(podId, countingQueryRows)
    assert.strictEqual(statements, 1, 'single statement for 4 rounds (was 1 + N)')
  })

  it('returns an empty array for a pod with no rounds', async () => {
    const rounds = await fetchRoundsWithMatches(randomUUID())
    assert.deepStrictEqual(rounds, [])
  })
})

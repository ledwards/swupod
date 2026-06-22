// DB-backed tests for Swiss Practice game claiming. These skip when the local
// test database is unavailable or has not run the latest migrations.
import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const TEST_DB_URL =
  process.env['SWUPOD_TEST_DATABASE_URL'] || 'postgresql://localhost:5432/swupod_test'

process.env['DATABASE_URL'] = TEST_DB_URL
process.env['POSTGRES_URL'] = TEST_DB_URL

const db = await import('@/lib/db')
const { query, queryRow, queryRows, closePool } = db
const {
  claimPracticeMatchGame,
  recordPracticeMatchGameResult,
  recordPracticeMatchGameLifecycle,
  PracticeGameClaimError,
  PracticeGameLifecycleError,
  PracticeGameResultError,
} = await import('./liveGames')

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
    `liveGames.claim.test.ts: test database unavailable or missing practice_match_games at ${TEST_DB_URL} - skipping. ` +
    'Create it with: createdb swupod_test && POSTGRES_URL=postgresql://localhost:5432/swupod_test npx tsx scripts/migrate.ts dev --yes'
  )
}

interface SeededMatch {
  podId: string
  shareId: string
  roundId: string
  matchId: string
  userIds: string[]
  poolShareIds: string[]
}

const seededPods: string[] = []
const seededUsers: string[] = []

after(async () => {
  if (!dbAvailable) return

  for (const podId of seededPods) {
    await query('DELETE FROM pods WHERE id = $1', [podId])
  }
  for (const userId of seededUsers) {
    await query('DELETE FROM users WHERE id = $1', [userId])
  }
  await closePool()
})

async function seedActiveSwissMatch(options: {
  competitive?: boolean
  draftState?: Record<string, unknown>
  roundStatus?: string
  isBye?: boolean
  finalConfirmed?: boolean
} = {}): Promise<SeededMatch> {
  const suffix = randomUUID().slice(0, 8)
  const userIds: string[] = []

  for (let i = 0; i < 3; i++) {
    const user = await queryRow(
      `INSERT INTO users (username, email)
       VALUES ($1, $2)
       RETURNING id`,
      [`live-claim-${suffix}-${i}`, `live-claim-${suffix}-${i}@example.test`]
    )
    userIds.push(user!.id as string)
    seededUsers.push(user!.id as string)
  }

  const shareId = `live-claim-${suffix}`
  const draftState = options.draftState ?? {
    phase: 'matchmaking',
    matchmakingStatus: 'active',
    currentRound: 1,
  }
  const pod = await queryRow(
    `INSERT INTO pods (
       share_id,
       host_id,
       set_code,
       status,
       draft_state,
       state_version,
       max_players,
       current_players,
       competitive
     )
     VALUES ($1, $2, 'TST', 'active', $3, 1, 2, 2, $4)
     RETURNING id`,
    [shareId, userIds[0], JSON.stringify(draftState), options.competitive ?? true]
  )
  const podId = pod!.id as string
  seededPods.push(podId)

  const poolShareIds: string[] = []
  for (let i = 0; i < 2; i++) {
    const poolShareId = `live-pool-${suffix}-${i}`
    await query(
      `INSERT INTO card_pools (user_id, share_id, set_code, cards, pod_id)
       VALUES ($1, $2, 'TST', '[]', $3)`,
      [userIds[i], poolShareId, podId]
    )
    poolShareIds.push(poolShareId)
  }

  for (let seat = 0; seat < 2; seat++) {
    await query(
      `INSERT INTO pod_players (
         pod_id,
         user_id,
         seat_number,
         pick_status,
         is_bot,
         leaders,
         drafted_leaders,
         drafted_cards,
         current_pack
       )
       VALUES ($1, $2, $3, 'done', false, '[]', '[]', '[]', '[]')`,
      [podId, userIds[seat], seat + 1]
    )
  }

  const round = await queryRow(
    `INSERT INTO practice_rounds (pod_id, round_number, status)
     VALUES ($1, 1, $2)
     RETURNING id`,
    [podId, options.roundStatus ?? 'active']
  )
  const roundId = round!.id as string

  const match = await queryRow(
    `INSERT INTO practice_matches (
       round_id,
       pod_id,
       player1_id,
       player2_id,
       is_bye,
       final_confirmed,
       match_winner
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      roundId,
      podId,
      userIds[0],
      options.isBye ? null : userIds[1],
      options.isBye ?? false,
      options.finalConfirmed ?? false,
      options.finalConfirmed ? 'player1' : null,
    ]
  )

  return { podId, shareId, roundId, matchId: match!.id as string, userIds, poolShareIds }
}

async function matchGameRows(matchId: string) {
  return queryRows(
    `SELECT id, game_number, attempt_number, status, created_by_user_id, lobby_url
     FROM practice_match_games
     WHERE match_id = $1
     ORDER BY attempt_number`,
    [matchId]
  )
}

async function matchRow(matchId: string) {
  return queryRow(
    `SELECT game1_result, game2_result, game3_result, final_confirmed, match_winner, wayfinder_match_id, wayfinder_replay_url
     FROM practice_matches
     WHERE id = $1`,
    [matchId]
  )
}

async function poolRecord(shareId: string) {
  return queryRow(
    `SELECT wins, losses, draws, wayfinder_match_ids
     FROM card_pools
     WHERE share_id = $1`,
    [shareId]
  )
}

describe('claimPracticeMatchGame', { skip: !dbAvailable }, () => {
  it('lets the first participant create and the opponent wait on the same official game row', async () => {
    const seeded = await seedActiveSwissMatch()
    const now = new Date('2026-06-19T20:00:00.000Z')

    const creator = await claimPracticeMatchGame({
      shareId: seeded.shareId,
      matchId: seeded.matchId,
      userId: seeded.userIds[0],
      now,
    })
    const opponent = await claimPracticeMatchGame({
      shareId: seeded.shareId,
      matchId: seeded.matchId,
      userId: seeded.userIds[1],
      now,
    })

    assert.equal(creator.action, 'create_lobby')
    assert.equal(creator.isNewlyCreated, true)
    assert.equal(creator.status, 'creating')
    assert.equal(creator.gameNumber, 1)
    assert.equal(opponent.action, 'wait_for_lobby')
    assert.equal(opponent.practiceMatchGameId, creator.practiceMatchGameId)

    const rows = await matchGameRows(seeded.matchId)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].status, 'creating')
    assert.equal(rows[0].created_by_user_id, seeded.userIds[0])
  })

  it('returns join_lobby after Wayfinder has reported a lobby URL', async () => {
    const seeded = await seedActiveSwissMatch()
    const creator = await claimPracticeMatchGame({
      shareId: seeded.shareId,
      matchId: seeded.matchId,
      userId: seeded.userIds[0],
      now: new Date('2026-06-19T20:00:00.000Z'),
    })

    await query(
      `UPDATE practice_match_games
       SET status = 'lobby_ready',
           lobby_url = $2,
           spectate_url = $3,
           lobby_ready_at = $4,
           updated_at = $4
       WHERE id = $1`,
      [
        creator.practiceMatchGameId,
        'https://karabast.example/lobby/private-abc',
        'https://wayfinder.example/watch/private-abc',
        new Date('2026-06-19T20:01:00.000Z'),
      ]
    )

    const join = await claimPracticeMatchGame({
      shareId: seeded.shareId,
      matchId: seeded.matchId,
      userId: seeded.userIds[1],
      now: new Date('2026-06-19T20:02:00.000Z'),
    })

    assert.equal(join.action, 'join_lobby')
    assert.equal(join.practiceMatchGameId, creator.practiceMatchGameId)
    assert.equal(join.lobbyUrl, 'https://karabast.example/lobby/private-abc')
    assert.equal(join.spectateUrl, 'https://wayfinder.example/watch/private-abc')
  })

  it('serializes simultaneous claims so only one official create row exists', async () => {
    const seeded = await seedActiveSwissMatch()
    const now = new Date('2026-06-19T20:00:00.000Z')

    const claims = await Promise.all([
      claimPracticeMatchGame({ shareId: seeded.shareId, matchId: seeded.matchId, userId: seeded.userIds[0], now }),
      claimPracticeMatchGame({ shareId: seeded.shareId, matchId: seeded.matchId, userId: seeded.userIds[1], now }),
    ])

    assert.equal(claims.filter(claim => claim.isNewlyCreated).length, 1)
    assert.equal(claims.filter(claim => claim.action === 'create_lobby').length, 1)
    assert.equal(new Set(claims.map(claim => claim.practiceMatchGameId)).size, 1)

    const rows = await matchGameRows(seeded.matchId)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].status, 'creating')
  })

  it('marks a stale creating row failed before reserving a retry attempt', async () => {
    const seeded = await seedActiveSwissMatch()
    const first = await claimPracticeMatchGame({
      shareId: seeded.shareId,
      matchId: seeded.matchId,
      userId: seeded.userIds[0],
      now: new Date('2026-06-19T20:00:00.000Z'),
      staleAfterMs: 15 * 60 * 1000,
    })

    const retry = await claimPracticeMatchGame({
      shareId: seeded.shareId,
      matchId: seeded.matchId,
      userId: seeded.userIds[1],
      now: new Date('2026-06-19T20:16:00.000Z'),
      staleAfterMs: 15 * 60 * 1000,
    })

    assert.equal(retry.action, 'create_lobby')
    assert.equal(retry.attemptNumber, 2)
    assert.notEqual(retry.practiceMatchGameId, first.practiceMatchGameId)

    const rows = await matchGameRows(seeded.matchId)
    assert.deepEqual(rows.map(row => `${row.attempt_number}:${row.status}`), ['1:failed', '2:creating'])
  })

  it('rejects callers who are not match participants', async () => {
    const seeded = await seedActiveSwissMatch()

    await assert.rejects(
      claimPracticeMatchGame({
        shareId: seeded.shareId,
        matchId: seeded.matchId,
        userId: seeded.userIds[2],
      }),
      (error: unknown) =>
        error instanceof PracticeGameClaimError &&
        error.status === 403 &&
        error.code === 'not_participant'
    )
  })
})

describe('recordPracticeMatchGameLifecycle', { skip: !dbAvailable }, () => {
  it('moves a claimed game to lobby_ready and ignores an exact duplicate callback', async () => {
    const seeded = await seedActiveSwissMatch()
    const claim = await claimPracticeMatchGame({
      shareId: seeded.shareId,
      matchId: seeded.matchId,
      userId: seeded.userIds[0],
      now: new Date('2026-06-19T20:00:00.000Z'),
    })

    const ready = await recordPracticeMatchGameLifecycle({
      practiceMatchGameId: claim.practiceMatchGameId!,
      poolShareId: seeded.poolShareIds[0],
      status: 'lobby_ready',
      lobbyId: 'karabast-lobby-1',
      lobbyUrl: 'https://karabast.example/lobby/private-1',
      spectateUrl: 'https://wayfinder.example/watch/private-1',
      lifecycleIdempotencyKey: 'lobby-ready-1',
      occurredAt: '2026-06-19T20:01:00.000Z',
    })
    const duplicate = await recordPracticeMatchGameLifecycle({
      practiceMatchGameId: claim.practiceMatchGameId!,
      poolShareId: seeded.poolShareIds[0],
      status: 'lobby_ready',
      lobbyId: 'karabast-lobby-1',
      lobbyUrl: 'https://karabast.example/lobby/private-1',
      lifecycleIdempotencyKey: 'lobby-ready-1',
      occurredAt: '2026-06-19T20:02:00.000Z',
    })
    const joined = await recordPracticeMatchGameLifecycle({
      practiceMatchGameId: claim.practiceMatchGameId!,
      poolShareId: seeded.poolShareIds[1],
      status: 'joined',
      lobbyUrl: 'https://karabast.example/lobby/private-1',
      lifecycleIdempotencyKey: 'joined-1',
      occurredAt: '2026-06-19T20:03:00.000Z',
    })

    assert.equal(ready.changed, true)
    assert.equal(ready.status, 'lobby_ready')
    assert.equal(ready.previousStatus, 'creating')
    assert.equal(duplicate.changed, false)
    assert.equal(joined.changed, true)
    assert.equal(joined.status, 'lobby_ready')
    assert.equal(joined.previousStatus, 'lobby_ready')

    const row = await queryRow(
      `SELECT status, lobby_id, lobby_url, spectate_url, lobby_ready_at, joined_at, started_at
       FROM practice_match_games
       WHERE id = $1`,
      [claim.practiceMatchGameId]
    )
    assert.equal(row!.status, 'lobby_ready')
    assert.equal(row!.lobby_id, 'karabast-lobby-1')
    assert.equal(row!.lobby_url, 'https://karabast.example/lobby/private-1')
    assert.equal(row!.spectate_url, 'https://wayfinder.example/watch/private-1')
    assert.ok(row!.lobby_ready_at)
    assert.equal(new Date(row!.joined_at as string | Date).toISOString(), '2026-06-19T20:03:00.000Z')
    assert.equal(row!.started_at, null)
  })

  it('opens a NEW lobby_ready attempt when a lobby is reported after the attempt failed', async () => {
    const seeded = await seedActiveSwissMatch()
    const claim = await claimPracticeMatchGame({
      shareId: seeded.shareId,
      matchId: seeded.matchId,
      userId: seeded.userIds[0],
      now: new Date('2026-06-19T20:00:00.000Z'),
    })

    // Auto-create dies → terminal failed.
    const failed = await recordPracticeMatchGameLifecycle({
      practiceMatchGameId: claim.practiceMatchGameId!,
      poolShareId: seeded.poolShareIds[0],
      status: 'failed',
      failureReason: 'no Copy Invite Link appeared',
      occurredAt: '2026-06-19T20:00:30.000Z',
    })
    assert.equal(failed.status, 'failed')

    // A hand-made lobby is reported against the now-terminal game → recovery
    // opens a new lobby_ready attempt instead of rejecting (failed is terminal).
    const recovered = await recordPracticeMatchGameLifecycle({
      practiceMatchGameId: claim.practiceMatchGameId!,
      poolShareId: seeded.poolShareIds[0],
      status: 'lobby_ready',
      lobbyId: 'karabast-manual-1',
      lobbyUrl: 'https://karabast.example/lobby/manual-1',
      occurredAt: '2026-06-19T20:01:00.000Z',
    })

    assert.equal(recovered.status, 'lobby_ready')
    assert.equal(recovered.previousStatus, 'failed')
    assert.notEqual(recovered.practiceMatchGameId, claim.practiceMatchGameId)

    // Original attempt stays failed with no lobby; the new attempt carries it.
    const oldRow = await queryRow(
      `SELECT status, lobby_url FROM practice_match_games WHERE id = $1`,
      [claim.practiceMatchGameId]
    )
    assert.equal(oldRow!.status, 'failed')
    assert.equal(oldRow!.lobby_url, null)

    const newRow = await queryRow(
      `SELECT status, attempt_number, lobby_url, created_by_user_id FROM practice_match_games WHERE id = $1`,
      [recovered.practiceMatchGameId]
    )
    assert.equal(newRow!.status, 'lobby_ready')
    assert.equal(newRow!.lobby_url, 'https://karabast.example/lobby/manual-1')
    assert.ok((newRow!.attempt_number as number) > 1)
    // Created-by = the reporter (lobby's creator) so the opponent reads
    // "<creator> is in the lobby".
    assert.equal(newRow!.created_by_user_id, seeded.userIds[0])

    // It is the canonical current game (newest lobby_ready wins).
    assert.equal(recovered.changed, true)
  })

  it('rejects a non-Limited (Premier) game so it is not counted in the series', async () => {
    const seeded = await seedActiveSwissMatch()

    // A Premier game the player was playing on the side must NOT be recorded.
    await assert.rejects(
      () => recordPracticeMatchGameResult({
        poolShareId: seeded.poolShareIds[0],
        wayfinderMatchId: 'wf-premier-side-game',
        result: 'win',
        gameNumber: 1,
        format: 'Premier',
      }),
      (err: unknown) => err instanceof PracticeGameResultError && (err as { code?: string }).code === 'not_limited_format'
    )

    // The match has no recorded game 1.
    const match = await queryRow(`SELECT game1_result FROM practice_matches WHERE id = $1`, [seeded.matchId])
    assert.equal(match!.game1_result, null)

    // A Limited game for the same match records fine (fail-open on archetype:
    // the seed has no drafted deck, so the leader check is skipped).
    const ok = await recordPracticeMatchGameResult({
      poolShareId: seeded.poolShareIds[0],
      wayfinderMatchId: 'wf-limited-1',
      result: 'win',
      gameNumber: 1,
      format: 'Limited',
    })
    assert.equal(ok.duplicate ?? false, false)
  })

  it('Bo3 continuation: completing game 1 carries the lobby into an in-progress game 2, then game 2 records by game number', async () => {
    const seeded = await seedActiveSwissMatch()
    const claim = await claimPracticeMatchGame({
      shareId: seeded.shareId,
      matchId: seeded.matchId,
      userId: seeded.userIds[0],
      now: new Date('2026-06-20T10:00:00.000Z'),
    })
    await recordPracticeMatchGameLifecycle({
      practiceMatchGameId: claim.practiceMatchGameId!,
      poolShareId: seeded.poolShareIds[0],
      status: 'lobby_ready',
      lobbyId: 'lobby-bo3',
      lobbyUrl: 'https://karabast.net/lobby?lobbyId=lobby-bo3',
      occurredAt: '2026-06-20T10:00:10.000Z',
    })

    // Game 1 result (player1 wins) — match not decided → carry the lobby forward.
    await recordPracticeMatchGameResult({
      poolShareId: seeded.poolShareIds[0],
      wayfinderMatchId: 'wf-bo3',
      result: 'win',
      gameNumber: 1,
      practiceMatchGameId: claim.practiceMatchGameId,
      format: 'Limited',
    })

    const g2 = await queryRow(
      `SELECT status, lobby_url FROM practice_match_games WHERE match_id = $1 AND game_number = 2 ORDER BY attempt_number DESC LIMIT 1`,
      [seeded.matchId]
    )
    assert.equal(g2!.status, 'in_progress')
    assert.equal(g2!.lobby_url, 'https://karabast.net/lobby?lobbyId=lobby-bo3')

    // Game 2 reported by game number (no practiceMatchGameId, as a continuation
    // game) completes the carried-forward game 2 → 2-0, match decided.
    await recordPracticeMatchGameResult({
      poolShareId: seeded.poolShareIds[0],
      wayfinderMatchId: 'wf-bo3',
      result: 'win',
      gameNumber: 2,
      format: 'Limited',
    })

    const m = await queryRow(`SELECT game1_result, game2_result, match_winner FROM practice_matches WHERE id = $1`, [seeded.matchId])
    assert.equal(m!.game1_result, 'player1')
    assert.equal(m!.game2_result, 'player1')
    assert.equal(m!.match_winner, 'player1')

    // No duplicate game 2 rows were created.
    const g2count = await queryRow(`SELECT count(*)::int AS n FROM practice_match_games WHERE match_id = $1 AND game_number = 2 AND status = 'complete'`, [seeded.matchId])
    assert.equal(g2count!.n, 1)
  })

  it('marks a creating game failed on a failed lifecycle and lets a retry open a new attempt', async () => {
    const seeded = await seedActiveSwissMatch()
    const claim = await claimPracticeMatchGame({
      shareId: seeded.shareId,
      matchId: seeded.matchId,
      userId: seeded.userIds[0],
      now: new Date('2026-06-20T20:00:00.000Z'),
    })

    const failed = await recordPracticeMatchGameLifecycle({
      practiceMatchGameId: claim.practiceMatchGameId!,
      poolShareId: seeded.poolShareIds[0],
      status: 'failed',
      failureReason: 'Karabast lobby creation failed',
      occurredAt: '2026-06-20T20:01:00.000Z',
    })

    // SPEC: a failed lifecycle is a terminal off-ramp (LEGAL_TRANSITIONS allows
    // creating -> failed). It must apply, not be dropped as a rank regression.
    assert.equal(failed.changed, true)
    assert.equal(failed.previousStatus, 'creating')
    assert.equal(failed.status, 'failed')

    const row = await queryRow(
      `SELECT status, failure_reason, failed_at FROM practice_match_games WHERE id = $1`,
      [claim.practiceMatchGameId]
    )
    assert.equal(row!.status, 'failed')
    assert.equal(row!.failure_reason, 'Karabast lobby creation failed')
    assert.ok(row!.failed_at)

    // The failed row is not "active", so a retry opens a fresh attempt for game 1.
    const retry = await claimPracticeMatchGame({
      shareId: seeded.shareId,
      matchId: seeded.matchId,
      userId: seeded.userIds[0],
      now: new Date('2026-06-20T20:02:00.000Z'),
    })
    assert.equal(retry.gameNumber, 1)
    assert.equal(retry.attemptNumber, 2)
    assert.notEqual(retry.practiceMatchGameId, claim.practiceMatchGameId)
  })

  it('moves lobby_ready to in_progress and preserves the original lobby timestamp', async () => {
    const seeded = await seedActiveSwissMatch()
    const claim = await claimPracticeMatchGame({
      shareId: seeded.shareId,
      matchId: seeded.matchId,
      userId: seeded.userIds[0],
      now: new Date('2026-06-19T20:00:00.000Z'),
    })

    await recordPracticeMatchGameLifecycle({
      practiceMatchGameId: claim.practiceMatchGameId!,
      poolShareId: seeded.poolShareIds[0],
      status: 'lobby_ready',
      lobbyUrl: 'https://karabast.example/lobby/private-2',
      occurredAt: '2026-06-19T20:01:00.000Z',
    })
    const started = await recordPracticeMatchGameLifecycle({
      practiceMatchGameId: claim.practiceMatchGameId!,
      poolShareId: seeded.poolShareIds[1],
      status: 'in_progress',
      wayfinderGameId: 'wf-game-2',
      occurredAt: '2026-06-19T20:05:00.000Z',
    })

    assert.equal(started.status, 'in_progress')
    assert.equal(started.previousStatus, 'lobby_ready')

    const row = await queryRow(
      `SELECT status, lobby_ready_at, started_at, wayfinder_game_id
       FROM practice_match_games
       WHERE id = $1`,
      [claim.practiceMatchGameId]
    )
    assert.equal(row!.status, 'in_progress')
    assert.equal(new Date(row!.lobby_ready_at as string | Date).toISOString(), '2026-06-19T20:01:00.000Z')
    assert.equal(new Date(row!.started_at as string | Date).toISOString(), '2026-06-19T20:05:00.000Z')
    assert.equal(row!.wayfinder_game_id, 'wf-game-2')
  })

  it('rejects lifecycle callbacks whose pool is not one of the match participants', async () => {
    const seeded = await seedActiveSwissMatch()
    const claim = await claimPracticeMatchGame({
      shareId: seeded.shareId,
      matchId: seeded.matchId,
      userId: seeded.userIds[0],
    })

    await assert.rejects(
      recordPracticeMatchGameLifecycle({
        practiceMatchGameId: claim.practiceMatchGameId!,
        poolShareId: 'missing-pool-share-id',
        status: 'lobby_ready',
        lobbyUrl: 'https://karabast.example/lobby/private-3',
      }),
      (error: unknown) =>
        error instanceof PracticeGameLifecycleError &&
        error.status === 403 &&
        error.code === 'pool_not_in_match_pod'
    )
  })
})

describe('recordPracticeMatchGameResult', { skip: !dbAvailable }, () => {
  it('records one claimed game row and mirrors the aggregate game pip without finalizing the match', async () => {
    const seeded = await seedActiveSwissMatch()
    const claim = await claimPracticeMatchGame({
      shareId: seeded.shareId,
      matchId: seeded.matchId,
      userId: seeded.userIds[0],
      now: new Date('2026-06-19T20:00:00.000Z'),
    })

    const recorded = await recordPracticeMatchGameResult({
      poolShareId: seeded.poolShareIds[0],
      wayfinderMatchId: 'wf-result-one',
      practiceMatchGameId: claim.practiceMatchGameId,
      result: 'win',
      replayUrl: 'https://wayfinder.example/replay/wf-result-one',
      playerLeader: 'Han Solo',
      opponentLeader: 'Darth Vader',
      occurredAt: '2026-06-19T20:30:00.000Z',
    })

    assert.equal(recorded.changed, true)
    assert.equal(recorded.matchFinalized, false)
    assert.equal(recorded.roundAdvanced, false)
    assert.equal(recorded.practiceMatchGameId, claim.practiceMatchGameId)

    const match = await matchRow(seeded.matchId)
    assert.equal(match!.game1_result, 'player1')
    assert.equal(match!.final_confirmed, false)
    assert.equal(match!.wayfinder_replay_url, 'https://wayfinder.example/replay/wf-result-one')

    const games = await queryRows(
      `SELECT status, result, replay_url, completed_at
       FROM practice_match_games
       WHERE id = $1`,
      [claim.practiceMatchGameId]
    )
    assert.equal(games[0].status, 'complete')
    assert.equal(games[0].result, 'player1')
    assert.equal(games[0].replay_url, 'https://wayfinder.example/replay/wf-result-one')
    assert.ok(games[0].completed_at)
  })

  it('finalizes after two game wins and treats a duplicate result as a no-op for pool records', async () => {
    const seeded = await seedActiveSwissMatch()

    await recordPracticeMatchGameResult({
      poolShareId: seeded.poolShareIds[0],
      wayfinderMatchId: 'wf-final-game-1',
      gameNumber: 1,
      result: 'win',
    })
    const final = await recordPracticeMatchGameResult({
      poolShareId: seeded.poolShareIds[0],
      wayfinderMatchId: 'wf-final-game-2',
      gameNumber: 2,
      result: 'win',
    })
    const duplicate = await recordPracticeMatchGameResult({
      poolShareId: seeded.poolShareIds[0],
      wayfinderMatchId: 'wf-final-game-2',
      gameNumber: 2,
      result: 'win',
    })

    assert.equal(final.matchFinalized, true)
    assert.equal(duplicate.duplicate, true)
    assert.equal(duplicate.changed, false)

    const match = await matchRow(seeded.matchId)
    assert.equal(match!.final_confirmed, true)
    assert.equal(match!.match_winner, 'player1')

    const player1Pool = await poolRecord(seeded.poolShareIds[0])
    const player2Pool = await poolRecord(seeded.poolShareIds[1])
    assert.deepEqual(
      { wins: player1Pool!.wins, losses: player1Pool!.losses, draws: player1Pool!.draws },
      { wins: 1, losses: 0, draws: 0 }
    )
    assert.deepEqual(
      { wins: player2Pool!.wins, losses: player2Pool!.losses, draws: player2Pool!.draws },
      { wins: 0, losses: 1, draws: 0 }
    )
    assert.deepEqual(player1Pool!.wayfinder_match_ids, ['wf-final-game-2'])
    assert.deepEqual(player2Pool!.wayfinder_match_ids, ['wf-final-game-2'])
  })

  it('keeps split games unfinalized until game 3 is reported', async () => {
    const seeded = await seedActiveSwissMatch()

    await recordPracticeMatchGameResult({
      poolShareId: seeded.poolShareIds[0],
      wayfinderMatchId: 'wf-split-game-1',
      gameNumber: 1,
      result: 'win',
    })
    const split = await recordPracticeMatchGameResult({
      poolShareId: seeded.poolShareIds[0],
      wayfinderMatchId: 'wf-split-game-2',
      gameNumber: 2,
      result: 'loss',
    })

    assert.equal(split.matchFinalized, false)

    const match = await matchRow(seeded.matchId)
    assert.equal(match!.game1_result, 'player1')
    assert.equal(match!.game2_result, 'player2')
    assert.equal(match!.final_confirmed, false)

    const player1Pool = await poolRecord(seeded.poolShareIds[0])
    const player2Pool = await poolRecord(seeded.poolShareIds[1])
    assert.deepEqual(
      { wins: player1Pool!.wins, losses: player1Pool!.losses, draws: player1Pool!.draws },
      { wins: 0, losses: 0, draws: 0 }
    )
    assert.deepEqual(
      { wins: player2Pool!.wins, losses: player2Pool!.losses, draws: player2Pool!.draws },
      { wins: 0, losses: 0, draws: 0 }
    )
  })
})

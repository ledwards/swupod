// Regression tests for correlated external games that existed before native retirement.
// Specs: plan U2 + R7/R10/R11/R33/R34/R37. Skips without the test database.
import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const TEST_DB_URL =
  process.env['SWUPOD_TEST_DATABASE_URL'] || 'postgresql://localhost:5432/swupod_test'

process.env['DATABASE_URL'] = TEST_DB_URL
process.env['POSTGRES_URL'] = TEST_DB_URL

const db = await import('@/lib/db')
const { query, queryRow, closePool } = db
const {
  claimOpenGame,
  recordOpenGameLifecycle,
  recordOpenGameResult,
  OpenGameLiveError,
} = await import('./openGameLive')

let dbAvailable = false
try {
  dbAvailable = await db.testConnection()
  if (dbAvailable) {
    const table = await queryRow("SELECT to_regclass('public.open_game_lobby_attempts') AS t")
    dbAvailable = Boolean(table?.t)
  }
} catch {
  dbAvailable = false
}

if (!dbAvailable) {
  console.warn('openGameLive.test.ts: isolated test DB unavailable; use scripts/native-play/verify-local-legacy-tests.ts.')
}

const seededUsers: string[] = []
const seededPools: string[] = []

after(async () => {
  if (dbAvailable) {
    for (const poolId of seededPools) {
      await query('DELETE FROM casual_matches WHERE card_pool_id = $1', [poolId])
      await query('DELETE FROM card_pools WHERE id = $1', [poolId])
    }
    for (const userId of seededUsers) {
      await query('DELETE FROM open_games WHERE player1_id = $1 OR player2_id = $1', [userId])
      await query('DELETE FROM users WHERE id = $1', [userId])
    }
  }
  await closePool()
})

async function seedUser(name = 'ogl-user'): Promise<string> {
  const suffix = randomUUID().slice(0, 8)
  const row = await queryRow(
    `INSERT INTO users (username, discord_id, email) VALUES ($1, $2, $3) RETURNING id`,
    [`${name}-${suffix}`, `test-${randomUUID()}`, `${name}-${suffix}@test.local`]
  )
  seededUsers.push(row.id)
  return row.id
}

async function seedPool(userId: string, setCode: string, format: string): Promise<{ id: string; shareId: string }> {
  const shareId = `ogl-test-${randomUUID().slice(0, 12)}`
  const pool = await queryRow(
    `INSERT INTO card_pools (user_id, share_id, set_code, set_name, pool_type, cards, deck_builder_state)
     VALUES ($1, $2, $3, $4, $5, '[]'::jsonb, $6::jsonb) RETURNING id`,
    [userId, shareId, setCode, `${setCode} Set`, format, '{"activeLeader":"pos-l","activeBase":"pos-b","cardPositions":{"pos-l":{"card":{"name":"Test Leader","isLeader":true}},"pos-b":{"card":{"name":"Test Base","isBase":true,"aspects":[]}},"pos-c1":{"card":{"id":"T_1","name":"Test Card"},"section":"deck","visible":true,"enabled":true}}}']
  )
  seededPools.push(pool.id)
  await query(
    `INSERT INTO built_decks (card_pool_id, user_id, set_code, pool_type, leader, base, deck, sideboard)
     VALUES ($1, $2, $3, $4, $5, $6, '[]'::jsonb, '[]'::jsonb)`,
    [pool.id, userId, setCode, format, JSON.stringify({ id: 'L1' }), JSON.stringify({ id: 'B1' })]
  )
  return { id: pool.id, shareId }
}

/** Standard fixture: posted + joined game between two fresh users. */
async function seedAcceptedGame(setCode = 'SEC', format = 'draft') {
  const poster = await seedUser('ogl-poster')
  const acceptor = await seedUser('ogl-acceptor')
  const posterPool = await seedPool(poster, setCode, format)
  const acceptorPool = await seedPool(acceptor, setCode, format)
  // Historical fixture inserted directly: retired admission is never used to seed it.
  const row = await queryRow(`INSERT INTO open_games(share_id,status,set_code,format,player1_id,player1_pool_id,player2_id,player2_pool_id,accepted_at) VALUES($1,'accepted',$2,$3,$4,$5,$6,$7,NOW()) RETURNING *`,[`existing-${randomUUID()}`,setCode,format,poster,posterPool.id,acceptor,acceptorPool.id])
  const game={id:row.id,shareId:row.share_id,player1Id:poster}
  await query("INSERT INTO open_game_lobby_attempts(open_game_id,status,attempt_number,created_by_user_id) VALUES($1,'creating',1,$2)",[game.id,poster])
  return { poster, acceptor, posterPool, acceptorPool, game }
}

async function gameRow(id: string) {
  return queryRow('SELECT * FROM open_games WHERE id = $1', [id])
}

describe('existing external games after native retirement', { skip: !dbAvailable }, () => {
  it('claim by a non-seat user is rejected 403', async () => {
    const { game } = await seedAcceptedGame()
    const stranger = await seedUser('ogl-stranger')
    await assert.rejects(
      claimOpenGame({ shareId: game.shareId, userId: stranger, companionCapable: true }),
      (e: OpenGameLiveError) => e instanceof OpenGameLiveError && e.status === 403
    )
  })

  it('a session-credentialed lifecycle report (Companion direct fallback) is seat-gated: stranger 403, seat lands', async () => {
    const { game, poster } = await seedAcceptedGame()
    await claimOpenGame({ shareId: game.shareId, userId: poster, companionCapable: true })
    const stranger = await seedUser('ogl-lc-stranger')
    await assert.rejects(
      recordOpenGameLifecycle({
        openGameShareId: game.shareId,
        status: 'lobby_ready',
        actorUserId: stranger,
        lobbyUrl: 'https://karabast.net/lobby?lobbyId=lob-gate',
        lifecycleIdempotencyKey: `k-${randomUUID()}`,
      }),
      (e: OpenGameLiveError) => e instanceof OpenGameLiveError && e.status === 403
    )
    // The seat's own session report lands exactly like a service-key report.
    const res = await recordOpenGameLifecycle({
      openGameShareId: game.shareId,
      status: 'lobby_ready',
      actorUserId: poster,
      lobbyId: 'lob-gate',
      lobbyUrl: 'https://karabast.net/lobby?lobbyId=lob-gate',
      lifecycleIdempotencyKey: `k-${randomUUID()}`,
    })
    assert.equal(res.gameStatus, 'lobby_ready')
  })

  it('lifecycle is idempotent per key and lobby_ready promotes the game status', async () => {
    const { game } = await seedAcceptedGame()
    await claimOpenGame({ shareId: game.shareId, userId: game.player1Id, companionCapable: true })
    const key = `k-${randomUUID()}`
    const first = await recordOpenGameLifecycle({
      openGameShareId: game.shareId,
      status: 'lobby_ready',
      lobbyId: 'lob-2',
      lobbyUrl: 'https://karabast.net/lobby?lobbyId=lob-2',
      lifecycleIdempotencyKey: key,
    })
    const second = await recordOpenGameLifecycle({
      openGameShareId: game.shareId,
      status: 'lobby_ready',
      lobbyId: 'lob-2',
      lobbyUrl: 'https://karabast.net/lobby?lobbyId=lob-2',
      lifecycleIdempotencyKey: key,
    })
    assert.equal(first.duplicate, false)
    assert.equal(second.duplicate, true)
    assert.equal((await gameRow(game.id)).status, 'lobby_ready')
  })

  it('a failed report on a completed game is acknowledged but never reverts it', async () => {
    const { game, posterPool } = await seedAcceptedGame()
    await claimOpenGame({ shareId: game.shareId, userId: game.player1Id, companionCapable: true })
    await recordOpenGameLifecycle({
      openGameShareId: game.shareId,
      status: 'lobby_ready',
      lobbyId: 'lob-done',
      lobbyUrl: 'https://karabast.net/lobby?lobbyId=lob-done',
      lifecycleIdempotencyKey: `k-${randomUUID()}`,
    })
    await recordOpenGameResult({
      openGameShareId: game.shareId,
      reportingPoolShareId: posterPool.shareId,
      result: 'win',
      wayfinderMatchId: `wm-${randomUUID()}`,
    })
    assert.equal((await gameRow(game.id)).status, 'complete')

    const res = await recordOpenGameLifecycle({
      openGameShareId: game.shareId,
      status: 'failed',
      failureReason: 'lobby_abandoned',
      lifecycleIdempotencyKey: `k-${randomUUID()}`,
    })
    assert.equal(res.gameStatus, 'complete', 'terminal games acknowledge but never resurrect')
    assert.equal((await gameRow(game.id)).status, 'complete')
    assert.equal((await gameRow(game.id)).result, 'player1')
  })

  it('result finalize maps the reporting seat, completes the game, and writes the OPPOSITE seat idempotently', async () => {
    const { game, posterPool, acceptorPool, acceptor } = await seedAcceptedGame()
    const matchId = `wf-${randomUUID().slice(0, 8)}`

    // Reporter = seat 1 (poster pool), reports a WIN → result player1.
    const first = await recordOpenGameResult({
      openGameShareId: game.shareId,
      reportingPoolShareId: posterPool.shareId,
      result: 'win',
      wayfinderMatchId: matchId,
      playerLeader: 'Leia Organa',
      opponentLeader: 'Darth Vader',
    })
    assert.equal(first.duplicate, false)
    const row = await gameRow(game.id)
    assert.equal(row.status, 'complete')
    assert.equal(row.result, 'player1')

    // Opposite seat got its casual_matches row with perspective swapped.
    const oppRow = await queryRow(
      `SELECT * FROM casual_matches WHERE user_id = $1 AND card_pool_id = $2 AND wayfinder_match_id = $3`,
      [acceptor, acceptorPool.id, matchId]
    )
    assert.ok(oppRow, 'opposite seat casual_matches row exists')
    assert.equal(oppRow.result, 'loss')
    assert.equal(oppRow.player_leader, 'Darth Vader')
    assert.equal(oppRow.opponent_leader, 'Leia Organa')
    const oppPool = await queryRow('SELECT wins, losses FROM card_pools WHERE id = $1', [acceptorPool.id])
    assert.equal(oppPool.losses, 1)
    assert.equal(oppPool.wins, 0)

    // Opposite-perspective second report (seat 2 says LOSS) → consistent no-op.
    const second = await recordOpenGameResult({
      openGameShareId: game.shareId,
      reportingPoolShareId: acceptorPool.shareId,
      result: 'loss',
      wayfinderMatchId: matchId,
    })
    assert.equal(second.duplicate, true)
    const oppPoolAfter = await queryRow('SELECT wins, losses FROM card_pools WHERE id = $1', [acceptorPool.id])
    assert.equal(oppPoolAfter.losses, 1, 'no double count on mirrored re-report')
    // ing- prefixed re-delivery also converges (canonical id).
    const third = await recordOpenGameResult({
      openGameShareId: game.shareId,
      reportingPoolShareId: posterPool.shareId,
      result: 'win',
      wayfinderMatchId: `ing-${matchId}`,
    })
    assert.equal(third.duplicate, true)
  })

  it('result for a cancelled game is acknowledged but terminal (no resurrection)', async () => {
    const { game, posterPool, poster } = await seedAcceptedGame()
    const { cancelOpenGame } = await import('./openGames')
    await cancelOpenGame({ gameId: game.id, userId: poster })
    const res = await recordOpenGameResult({
      openGameShareId: game.shareId,
      reportingPoolShareId: posterPool.shareId,
      result: 'win',
      wayfinderMatchId: `wf-${randomUUID().slice(0, 8)}`,
    })
    assert.equal(res.terminal, true)
    assert.equal((await gameRow(game.id)).status, 'cancelled')
  })
})

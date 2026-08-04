// DB-backed spec tests for the open-game Companion pipeline (Lobby V1, U2).
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
const { postOpenGame, joinOpenGame } = await import('./openGames')
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
  console.warn(`openGameLive.test.ts: test DB unavailable at ${TEST_DB_URL} - skipping.`)
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
  const listing = await postOpenGame({ userId: poster, poolId: posterPool.id })
  const game = await joinOpenGame({ shareId: listing.shareId, userId: acceptor, poolId: acceptorPool.id })
  return { poster, acceptor, posterPool, acceptorPool, game }
}

async function gameRow(id: string) {
  return queryRow('SELECT * FROM open_games WHERE id = $1', [id])
}

async function attempts(gameId: string) {
  return db.queryRows(
    'SELECT * FROM open_game_lobby_attempts WHERE open_game_id = $1 ORDER BY attempt_number',
    [gameId]
  )
}

describe('openGameLive pipeline (Lobby V1 spec)', { skip: !dbAvailable }, () => {
  it('claim by a non-seat user is rejected 403', async () => {
    const { game } = await seedAcceptedGame()
    const stranger = await seedUser('ogl-stranger')
    await assert.rejects(
      claimOpenGame({ shareId: game.shareId, userId: stranger, companionCapable: true }),
      (e: OpenGameLiveError) => e instanceof OpenGameLiveError && e.status === 403
    )
  })

  it('first capable claim creates an attempt and returns create_lobby with a PTP-marked name', async () => {
    const { game, poster } = await seedAcceptedGame('SEC', 'draft')
    const claim = await claimOpenGame({ shareId: game.shareId, userId: poster, companionCapable: true })
    assert.equal(claim.action, 'create_lobby')
    assert.ok(claim.lobbyName?.includes('protectthepod.com'), 'lobby name carries the PTP marker (R33)')
    assert.ok(claim.lobbyName?.includes('SEC'), 'lobby name carries the set')
    assert.equal(claim.bestOf, 1, 'claim carries the match length (SPEC: default Bo1)')
    const rows = await attempts(game.id)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].status, 'creating')
    assert.equal(rows[0].created_by_user_id, poster)
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

  it('second capable claim before lobby_ready waits; after lobby_ready it joins; incapable seat gets the display link (R37)', async () => {
    const { game, poster, acceptor } = await seedAcceptedGame()
    const first = await claimOpenGame({ shareId: game.shareId, userId: poster, companionCapable: true })
    assert.equal(first.action, 'create_lobby')

    const waiting = await claimOpenGame({ shareId: game.shareId, userId: acceptor, companionCapable: true })
    assert.equal(waiting.action, 'wait_for_lobby')

    await recordOpenGameLifecycle({
      openGameShareId: game.shareId,
      status: 'lobby_ready',
      lobbyId: 'lob-1',
      lobbyUrl: 'https://karabast.net/lobby?lobbyId=lob-1',
      lifecycleIdempotencyKey: `k-${randomUUID()}`,
    })

    const join = await claimOpenGame({ shareId: game.shareId, userId: acceptor, companionCapable: true })
    assert.equal(join.action, 'join_lobby')
    assert.equal(join.lobbyUrl, 'https://karabast.net/lobby?lobbyId=lob-1')

    const link = await claimOpenGame({ shareId: game.shareId, userId: acceptor, companionCapable: false })
    assert.equal(link.action, 'lobby_link')
    assert.equal(link.lobbyUrl, 'https://karabast.net/lobby?lobbyId=lob-1')

    const reopen = await claimOpenGame({ shareId: game.shareId, userId: poster, companionCapable: true })
    assert.equal(reopen.action, 'open_lobby')
  })

  it('a stale URL-less creating attempt (>60s) is superseded by the host\'s next claim', async () => {
    const { game, poster, acceptor } = await seedAcceptedGame()
    await claimOpenGame({ shareId: game.shareId, userId: poster, companionCapable: true })

    // Fresh attempt: everyone waits, including the host.
    const fresh = await claimOpenGame({ shareId: game.shareId, userId: poster, companionCapable: true })
    assert.equal(fresh.action, 'wait_for_lobby')

    await query(
      `UPDATE open_game_lobby_attempts SET created_at = NOW() - INTERVAL '2 minutes' WHERE open_game_id = $1`,
      [game.id]
    )

    // Stale: the joiner still waits (never creates)…
    const joinerWaits = await claimOpenGame({ shareId: game.shareId, userId: acceptor, companionCapable: true })
    assert.equal(joinerWaits.action, 'wait_for_lobby')

    // …but the host's claim supersedes and starts attempt 2.
    const retry = await claimOpenGame({ shareId: game.shareId, userId: poster, companionCapable: true })
    assert.equal(retry.action, 'create_lobby')
    const rows = await attempts(game.id)
    assert.equal(rows.length, 2)
    assert.equal(rows[0].status, 'failed')
    assert.equal(rows[0].failure_reason, 'stale_creating_superseded')
    assert.equal(rows[1].status, 'creating')
  })

  it('the joiner never creates: a capable acceptor claim with no attempt waits for the host', async () => {
    const { game, acceptor } = await seedAcceptedGame()
    const claim = await claimOpenGame({ shareId: game.shareId, userId: acceptor, companionCapable: true })
    assert.equal(claim.action, 'wait_for_lobby')
    assert.equal((await attempts(game.id)).length, 0, 'no attempt row — the host creates')
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

  it('a manual lobby_ready with NO prior claim/attempt creates the attempt row itself (host made the lobby by hand)', async () => {
    // SPEC (manual-lobby binding): the host can ignore the one-click button
    // and create the Karabast lobby by hand — no create_lobby claim ever
    // happens, so no attempt row exists when the Companion reports
    // lobby_ready. The ingest must create the row (attempt_number = max+1),
    // land it in lobby_ready, and attribute it to the HOST (player1) so the
    // host's next claim reopens their own lobby.
    const { game, poster } = await seedAcceptedGame()
    assert.equal((await attempts(game.id)).length, 0, 'precondition: no attempt row exists')

    const res = await recordOpenGameLifecycle({
      openGameShareId: game.shareId,
      status: 'lobby_ready',
      lobbyId: 'lob-manual',
      lobbyUrl: 'https://karabast.net/lobby?lobbyId=lob-manual',
      lifecycleIdempotencyKey: `k-${randomUUID()}`,
    })
    assert.equal(res.duplicate, false)

    const rows = await attempts(game.id)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].attempt_number, 1)
    assert.equal(rows[0].status, 'lobby_ready')
    assert.equal(rows[0].created_by_user_id, poster, 'manual attempt is attributed to the host')
    assert.equal(rows[0].lobby_url, 'https://karabast.net/lobby?lobbyId=lob-manual')
    assert.equal((await gameRow(game.id)).status, 'lobby_ready', 'joiner sees the Join button')

    // Host attribution matters behaviorally: the host's next claim must
    // reopen THEIR lobby (open_lobby), never tell them to join it.
    const reopen = await claimOpenGame({ shareId: game.shareId, userId: poster, companionCapable: true })
    assert.equal(reopen.action, 'open_lobby')
    assert.equal(reopen.lobbyUrl, 'https://karabast.net/lobby?lobbyId=lob-manual')
  })

  it('a manual lobby_ready after a FAILED attempt opens attempt 2 (max+1, not a resurrect)', async () => {
    const { game, poster } = await seedAcceptedGame()
    await claimOpenGame({ shareId: game.shareId, userId: poster, companionCapable: true })
    await recordOpenGameLifecycle({
      openGameShareId: game.shareId,
      status: 'failed',
      failureReason: 'deck fetch failed',
      lifecycleIdempotencyKey: `k-${randomUUID()}`,
    })

    await recordOpenGameLifecycle({
      openGameShareId: game.shareId,
      status: 'lobby_ready',
      lobbyId: 'lob-manual-2',
      lobbyUrl: 'https://karabast.net/lobby?lobbyId=lob-manual-2',
      lifecycleIdempotencyKey: `k-${randomUUID()}`,
    })

    const rows = await attempts(game.id)
    assert.equal(rows.length, 2)
    assert.equal(rows[0].status, 'failed')
    assert.equal(rows[1].attempt_number, 2)
    assert.equal(rows[1].status, 'lobby_ready')
    assert.equal(rows[1].created_by_user_id, poster)
  })

  it('failed creation is escapable: next capable claim starts attempt 2', async () => {
    const { game, poster } = await seedAcceptedGame()
    await claimOpenGame({ shareId: game.shareId, userId: poster, companionCapable: true })
    await recordOpenGameLifecycle({
      openGameShareId: game.shareId,
      status: 'failed',
      failureReason: 'deck fetch failed',
      lifecycleIdempotencyKey: `k-${randomUUID()}`,
    })
    const again = await claimOpenGame({ shareId: game.shareId, userId: poster, companionCapable: true })
    assert.equal(again.action, 'create_lobby')
    const rows = await attempts(game.id)
    assert.equal(rows.length, 2)
    assert.equal(rows[0].status, 'failed')
    assert.equal(rows[1].status, 'creating')
    // A pre-lobby failure never touched the parent: the game stays accepted.
    assert.equal((await gameRow(game.id)).status, 'accepted')
  })

  it('dead lobby pre-game: failed on the active lobby_ready attempt reverts the game to accepted and both seats recover', async () => {
    // SPEC (dead-lobby recovery): the host created the Karabast lobby
    // (lobby_ready) then LEFT it before the game started — Karabast destroyed
    // the lobby, the Companion reports failed('lobby_abandoned'). The attempt
    // must fail AND the game must revert lobby_ready → accepted so the GET
    // stops carrying the dead lobbyUrl (its attempt query excludes failed
    // attempts) and both /g/ pages re-render the create state. The host's
    // next claim starts a FRESH attempt (new attemptId → new client dedup key).
    const { game, poster } = await seedAcceptedGame()
    const first = await claimOpenGame({ shareId: game.shareId, userId: poster, companionCapable: true })
    assert.equal(first.action, 'create_lobby')
    await recordOpenGameLifecycle({
      openGameShareId: game.shareId,
      status: 'lobby_ready',
      lobbyId: 'lob-dead',
      lobbyUrl: 'https://karabast.net/lobby?lobbyId=lob-dead',
      lifecycleIdempotencyKey: `k-${randomUUID()}`,
    })
    assert.equal((await gameRow(game.id)).status, 'lobby_ready', 'precondition: lobby promoted the game')

    const res = await recordOpenGameLifecycle({
      openGameShareId: game.shareId,
      status: 'failed',
      failureReason: 'lobby_abandoned',
      lifecycleIdempotencyKey: `k-${randomUUID()}`,
    })
    assert.equal(res.duplicate, false)
    assert.equal(res.gameStatus, 'accepted', 'the game reverts lobby_ready -> accepted')

    const rows = await attempts(game.id)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].status, 'failed')
    assert.equal(rows[0].failure_reason, 'lobby_abandoned')
    assert.equal((await gameRow(game.id)).status, 'accepted')

    // The failed attempt is escapable: the host can immediately create again,
    // on a NEW attempt row (fresh attemptId, never the dead one).
    const again = await claimOpenGame({ shareId: game.shareId, userId: poster, companionCapable: true })
    assert.equal(again.action, 'create_lobby')
    assert.notEqual(again.attemptId, first.attemptId, 'attempt N+1 gets a fresh id')
    const rows2 = await attempts(game.id)
    assert.equal(rows2.length, 2)
    assert.equal(rows2[1].attempt_number, 2)
    assert.equal(rows2[1].status, 'creating')
  })

  it('dead pre-created lobby on an OPEN listing: failed keeps the listing open (R34) and drops the lobby from the active set', async () => {
    const poster = await seedUser('ogl-dead-open')
    const pool = await seedPool(poster, 'JTL', 'sealed')
    const listing = await postOpenGame({ userId: poster, poolId: pool.id })
    await claimOpenGame({ shareId: listing.shareId, userId: poster, companionCapable: true })
    await recordOpenGameLifecycle({
      openGameShareId: listing.shareId,
      status: 'lobby_ready',
      lobbyId: 'lob-dead-open',
      lobbyUrl: 'https://karabast.net/lobby?lobbyId=lob-dead-open',
      lifecycleIdempotencyKey: `k-${randomUUID()}`,
    })
    assert.equal((await gameRow(listing.id)).status, 'open', 'R34: pre-created lobby keeps the listing open')

    await recordOpenGameLifecycle({
      openGameShareId: listing.shareId,
      status: 'failed',
      failureReason: 'lobby_abandoned',
      lifecycleIdempotencyKey: `k-${randomUUID()}`,
    })
    assert.equal((await gameRow(listing.id)).status, 'open', 'the listing stays on the board')
    const rows = await attempts(listing.id)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].status, 'failed', 'no active attempt keeps the dead lobby URL alive')
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

  it('R34 create-at-post: the poster can claim their own OPEN listing to pre-create the lobby', async () => {
    const poster = await seedUser('ogl-pre')
    const pool = await seedPool(poster, 'JTL', 'sealed')
    const listing = await postOpenGame({ userId: poster, poolId: pool.id })
    const claim = await claimOpenGame({ shareId: listing.shareId, userId: poster, companionCapable: true })
    assert.equal(claim.action, 'create_lobby')
    assert.equal((await gameRow(listing.id)).status, 'open', 'listing stays open while lobby pre-creates')
  })

  it('R37 opponent_joined on an open listing delists it and binds a PTP joiner pool when compatible', async () => {
    const poster = await seedUser('ogl-r37')
    const pool = await seedPool(poster, 'SEC', 'draft')
    const listing = await postOpenGame({ userId: poster, poolId: pool.id })
    await claimOpenGame({ shareId: listing.shareId, userId: poster, companionCapable: true })
    await recordOpenGameLifecycle({
      openGameShareId: listing.shareId,
      status: 'lobby_ready',
      lobbyId: 'lob-r37',
      lobbyUrl: 'https://karabast.net/lobby?lobbyId=lob-r37',
      lifecycleIdempotencyKey: `k-${randomUUID()}`,
    })

    const joiner = await seedUser('ogl-r37-join')
    const joinerPool = await seedPool(joiner, 'SEC', 'draft')
    await recordOpenGameLifecycle({
      openGameShareId: listing.shareId,
      status: 'opponent_joined',
      joinerPoolShareId: joinerPool.shareId,
      lifecycleIdempotencyKey: `k-${randomUUID()}`,
    })

    const row = await gameRow(listing.id)
    assert.equal(row.status, 'in_progress', 'listing delists from the board the moment someone enters')
    assert.equal(row.player2_id, joiner, 'compatible PTP joiner binds seat 2')
    assert.equal(row.player2_external, false)
  })

  it('R37 opponent_joined without a bindable pool marks the seat external', async () => {
    const poster = await seedUser('ogl-ext')
    const pool = await seedPool(poster, 'SEC', 'draft')
    const listing = await postOpenGame({ userId: poster, poolId: pool.id })
    await claimOpenGame({ shareId: listing.shareId, userId: poster, companionCapable: true })
    await recordOpenGameLifecycle({
      openGameShareId: listing.shareId,
      status: 'opponent_joined',
      lifecycleIdempotencyKey: `k-${randomUUID()}`,
    })
    const row = await gameRow(listing.id)
    assert.equal(row.status, 'in_progress')
    assert.equal(row.player2_id, null)
    assert.equal(row.player2_external, true)
  })

  it("R37 route boundary: a raw Companion 'joined' report maps to opponent_joined — stamps the seat arrival and delists the listing", async () => {
    // The Companion emits the Karabast lifecycle name 'joined' verbatim (both
    // via the hub and via its direct-to-PTP fallback); the casual state
    // machine only knows 'opponent_joined'. The mapping lives at the plugin
    // route boundary, so this spec must go through the route — calling the
    // service directly would bypass the exact bug it pins.
    const poster = await seedUser('ogl-raw-joined')
    const pool = await seedPool(poster, 'SEC', 'draft')
    const listing = await postOpenGame({ userId: poster, poolId: pool.id })
    await claimOpenGame({ shareId: listing.shareId, userId: poster, companionCapable: true })
    await recordOpenGameLifecycle({
      openGameShareId: listing.shareId,
      status: 'lobby_ready',
      lobbyId: 'lob-raw-joined',
      lobbyUrl: 'https://karabast.net/lobby?lobbyId=lob-raw-joined',
      lifecycleIdempotencyKey: `k-${randomUUID()}`,
    })
    const joiner = await seedUser('ogl-raw-joined-2')
    const joinerPool = await seedPool(joiner, 'SEC', 'draft')

    const serviceKey = `ogl-route-key-${randomUUID().slice(0, 8)}`
    const priorServiceKey = process.env['PTP_SERVICE_KEY']
    process.env['PTP_SERVICE_KEY'] = serviceKey
    try {
      const { POST } = await import('@/app/api/plugin/v1/practice/match-game/lifecycle/route')
      const idempotencyKey = `k-${randomUUID()}`
      const response = await POST(
        new Request('http://localhost/api/plugin/v1/practice/match-game/lifecycle', {
          method: 'POST',
          headers: { authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            openGameId: listing.shareId,
            status: 'joined',
            joinerPoolShareId: joinerPool.shareId,
            lifecycleIdempotencyKey: idempotencyKey,
          }),
        }) as never
      )
      const envelope = await response.json()
      assert.equal(response.status, 200, `expected 200, got ${response.status}: ${JSON.stringify(envelope)}`)
      assert.equal(envelope.data.boardChanged, true, "a raw 'joined' on an open listing triggers the delist broadcast")
      assert.equal(envelope.data.gameStatus, 'in_progress')

      const row = await gameRow(listing.id)
      assert.equal(row.status, 'in_progress', "raw 'joined' delists the open listing")
      assert.equal(row.player2_id, joiner, 'joiner pool binding fires through the route mapping')
      const [attempt] = await attempts(listing.id)
      assert.ok(attempt.opponent_joined_at, "raw 'joined' stamps opponent_joined_at")
      assert.equal(attempt.lifecycle_idempotency_key, idempotencyKey, 'idempotency key is recorded for the mapped report')
    } finally {
      if (priorServiceKey === undefined) delete process.env['PTP_SERVICE_KEY']
      else process.env['PTP_SERVICE_KEY'] = priorServiceKey
    }
  })

  it('joiner_left_lobby pre-game reverts the seat arrival: parent back to lobby_ready, arrival cleared, player2 STAYS bound, joiner can re-join', async () => {
    // SPEC (joiner-leave recovery): the PTP-paired joiner entered the
    // Karabast lobby (opponent_joined) then LEFT it pre-game. The lobby
    // SURVIVES (the host remains), so this is a seat-arrival revert — the
    // mirror of opponent_joined, never a failure: clear opponent_joined_at,
    // keep the attempt (and its lobby_url) alive, revert the parent's
    // opponent_joined promotion, and NEVER unbind player2 — the joiner's
    // page shows Join again, the host keeps the lobby link.
    const { game, poster, acceptor } = await seedAcceptedGame()
    await claimOpenGame({ shareId: game.shareId, userId: poster, companionCapable: true })
    await recordOpenGameLifecycle({
      openGameShareId: game.shareId,
      status: 'lobby_ready',
      lobbyId: 'lob-jl',
      lobbyUrl: 'https://karabast.net/lobby?lobbyId=lob-jl',
      lifecycleIdempotencyKey: `k-${randomUUID()}`,
    })
    await recordOpenGameLifecycle({
      openGameShareId: game.shareId,
      status: 'opponent_joined',
      lifecycleIdempotencyKey: `k-${randomUUID()}`,
    })
    assert.equal((await gameRow(game.id)).status, 'in_progress', 'precondition: the arrival promoted the game')
    assert.ok((await attempts(game.id))[0].opponent_joined_at, 'precondition: arrival stamped')

    const res = await recordOpenGameLifecycle({
      openGameShareId: game.shareId,
      status: 'joiner_left_lobby',
      actorUserId: acceptor, // the joiner's own session (Companion direct fallback) is seat-gated OK
      lifecycleIdempotencyKey: `k-${randomUUID()}`,
    })
    assert.equal(res.duplicate, false)
    assert.equal(res.gameStatus, 'lobby_ready', 'the game reverts in_progress -> lobby_ready')

    const row = await gameRow(game.id)
    assert.equal(row.status, 'lobby_ready')
    assert.equal(row.player2_id, acceptor, 'the PTP seat pairing STANDS — player2 is never unbound')
    const [attempt] = await attempts(game.id)
    assert.equal(attempt.status, 'lobby_ready', 'the attempt (and its lobby) stays alive')
    assert.equal(attempt.opponent_joined_at, null, 'the arrival marker is cleared')
    assert.equal(attempt.lobby_url, 'https://karabast.net/lobby?lobbyId=lob-jl', 'the lobby link keeps serving')

    // The joiner's page is back in the join state: their next claim gets the
    // SAME lobby to join, and the host's claim reopens it.
    const rejoin = await claimOpenGame({ shareId: game.shareId, userId: acceptor, companionCapable: true })
    assert.equal(rejoin.action, 'join_lobby')
    assert.equal(rejoin.lobbyUrl, 'https://karabast.net/lobby?lobbyId=lob-jl')
    const reopen = await claimOpenGame({ shareId: game.shareId, userId: poster, companionCapable: true })
    assert.equal(reopen.action, 'open_lobby')

    // Idempotent: same key → duplicate; a fresh key with nothing left to
    // revert is acknowledged and non-destructive.
    const dupKey = `k-${randomUUID()}`
    await recordOpenGameLifecycle({ openGameShareId: game.shareId, status: 'joiner_left_lobby', lifecycleIdempotencyKey: dupKey })
    const again = await recordOpenGameLifecycle({
      openGameShareId: game.shareId,
      status: 'joiner_left_lobby',
      lifecycleIdempotencyKey: `k-${randomUUID()}`,
    })
    assert.equal(again.gameStatus, 'lobby_ready', 're-reports find nothing to revert')
    assert.equal((await attempts(game.id))[0].status, 'lobby_ready')
  })

  it('joiner_left_lobby never reverts a started game or a recorded result', async () => {
    const { game, poster, posterPool } = await seedAcceptedGame()
    await claimOpenGame({ shareId: game.shareId, userId: poster, companionCapable: true })
    await recordOpenGameLifecycle({
      openGameShareId: game.shareId,
      status: 'lobby_ready',
      lobbyId: 'lob-jl-started',
      lobbyUrl: 'https://karabast.net/lobby?lobbyId=lob-jl-started',
      lifecycleIdempotencyKey: `k-${randomUUID()}`,
    })
    await recordOpenGameLifecycle({
      openGameShareId: game.shareId,
      status: 'opponent_joined',
      lifecycleIdempotencyKey: `k-${randomUUID()}`,
    })
    await recordOpenGameLifecycle({
      openGameShareId: game.shareId,
      status: 'in_progress',
      wayfinderGameId: 'wg-jl-1',
      lifecycleIdempotencyKey: `k-${randomUUID()}`,
    })

    // Once the game started, a (late/stale) joiner_left_lobby must not revert.
    const late = await recordOpenGameLifecycle({
      openGameShareId: game.shareId,
      status: 'joiner_left_lobby',
      lifecycleIdempotencyKey: `k-${randomUUID()}`,
    })
    assert.equal(late.gameStatus, 'in_progress', 'a started game never reverts')
    const [attempt] = await attempts(game.id)
    assert.equal(attempt.status, 'in_progress')
    assert.ok(attempt.opponent_joined_at, 'the arrival stamp survives')

    // …and never after a result.
    await recordOpenGameResult({
      openGameShareId: game.shareId,
      reportingPoolShareId: posterPool.shareId,
      result: 'win',
      wayfinderMatchId: `wm-${randomUUID()}`,
    })
    const after = await recordOpenGameLifecycle({
      openGameShareId: game.shareId,
      status: 'joiner_left_lobby',
      lifecycleIdempotencyKey: `k-${randomUUID()}`,
    })
    assert.equal(after.gameStatus, 'complete', 'terminal games acknowledge but never resurrect')
    assert.equal((await gameRow(game.id)).result, 'player1')
  })

  it('joiner_left_lobby with no live attempt is acknowledged without minting an attempt row', async () => {
    const { game } = await seedAcceptedGame()
    const res = await recordOpenGameLifecycle({
      openGameShareId: game.shareId,
      status: 'joiner_left_lobby',
      lifecycleIdempotencyKey: `k-${randomUUID()}`,
    })
    assert.equal(res.duplicate, false)
    assert.equal(res.gameStatus, 'accepted')
    assert.equal((await attempts(game.id)).length, 0, 'no attempt row is created for a revert')
  })

  it('joiner_left_lobby for an UNPAIRED external joiner relists the open listing', async () => {
    // R37 mirror: an external Karabast joiner (never bound a PTP seat)
    // delisted the open listing on arrival; their pre-game leave puts the
    // listing back on the board — there is no pairing to preserve.
    const poster = await seedUser('ogl-jl-ext')
    const pool = await seedPool(poster, 'SEC', 'draft')
    const listing = await postOpenGame({ userId: poster, poolId: pool.id })
    await claimOpenGame({ shareId: listing.shareId, userId: poster, companionCapable: true })
    await recordOpenGameLifecycle({
      openGameShareId: listing.shareId,
      status: 'lobby_ready',
      lobbyId: 'lob-jl-ext',
      lobbyUrl: 'https://karabast.net/lobby?lobbyId=lob-jl-ext',
      lifecycleIdempotencyKey: `k-${randomUUID()}`,
    })
    await recordOpenGameLifecycle({
      openGameShareId: listing.shareId,
      status: 'opponent_joined',
      lifecycleIdempotencyKey: `k-${randomUUID()}`,
    })
    const mid = await gameRow(listing.id)
    assert.equal(mid.status, 'in_progress')
    assert.equal(mid.player2_external, true)

    const res = await recordOpenGameLifecycle({
      openGameShareId: listing.shareId,
      status: 'joiner_left_lobby',
      lifecycleIdempotencyKey: `k-${randomUUID()}`,
    })
    assert.equal(res.boardChanged, true, 'the relist pushes a board update')
    const row = await gameRow(listing.id)
    assert.equal(row.status, 'open', 'the unpaired listing returns to the board')
    assert.equal(row.player2_external, false)
    const [attempt] = await attempts(listing.id)
    assert.equal(attempt.status, 'lobby_ready', 'the live lobby keeps serving the relisted game')
  })

  it('PTP-side seat-2 exit keeps a live lobby attempt: the relisted game hands the NEXT joiner the existing lobby (join_lobby)', async () => {
    // SPEC (Exit Lobby × live Karabast lobby): the PTP joiner exiting on PTP
    // vacates the seat and relists the game, but the HOST is still sitting in
    // his Karabast lobby — the attempt (and its URL) must survive so the next
    // joiner's claim goes straight to join_lobby with the existing lobby.
    const { game, poster, acceptor } = await seedAcceptedGame('SEC', 'draft')
    await claimOpenGame({ shareId: game.shareId, userId: poster, companionCapable: true })
    await recordOpenGameLifecycle({
      openGameShareId: game.shareId,
      status: 'lobby_ready',
      lobbyId: 'lob-exit',
      lobbyUrl: 'https://karabast.net/lobby?lobbyId=lob-exit',
      lifecycleIdempotencyKey: `k-${randomUUID()}`,
    })

    const { exitOpenGame } = await import('./openGames')
    const exited = await exitOpenGame({ gameId: game.id, userId: acceptor })
    assert.equal(exited.status, 'open', 'seat-2 exit relists the listing')
    assert.equal(exited.player2Id, null)
    const [attempt] = await attempts(game.id)
    assert.equal(attempt.status, 'lobby_ready', 'the live lobby attempt STAYS — the host is still in it')
    assert.equal(attempt.lobby_url, 'https://karabast.net/lobby?lobbyId=lob-exit')

    // A NEW joiner accepts the relisted game and claims: straight to the
    // existing lobby, no fresh create.
    const nextJoiner = await seedUser('ogl-exit-next')
    const nextPool = await seedPool(nextJoiner, 'SEC', 'draft')
    await joinOpenGame({ shareId: game.shareId, userId: nextJoiner, poolId: nextPool.id })
    const claim = await claimOpenGame({ shareId: game.shareId, userId: nextJoiner, companionCapable: true })
    assert.equal(claim.action, 'join_lobby')
    assert.equal(claim.lobbyUrl, 'https://karabast.net/lobby?lobbyId=lob-exit')
    assert.equal((await attempts(game.id)).length, 1, 'no second attempt was minted')
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

// ---------------------------------------------------------------------------
// Karabast findability — the host's "Findable by Karabast users" choice.
// Persisted on the game so every later surface (notably the match page's
// Create Game button) reads the real intent instead of inferring it from
// visibility, which was wrong in both directions.
// ---------------------------------------------------------------------------
describe('open game karabast findability', { skip: !dbAvailable }, () => {
  async function post(visibility: 'public' | 'private', karabastFindable: boolean) {
    const user = await seedUser('ogl-findable')
    const pool = await seedPool(user, 'SEC', 'draft')
    return postOpenGame({ userId: user, poolId: pool.id, visibility, karabastFindable })
  }

  it('a public lobby marked findable persists the flag', async () => {
    const listing = await post('public', true)
    assert.equal(listing.karabastFindable, true)
    assert.equal((await gameRow(listing.id)).karabast_findable, true)
  })

  it('SPEC: findability defaults OFF — an unasked-for lobby is never published', async () => {
    const user = await seedUser('ogl-findable-default')
    const pool = await seedPool(user, 'SEC', 'draft')
    const listing = await postOpenGame({ userId: user, poolId: pool.id })
    assert.equal(listing.karabastFindable, false)
    assert.equal((await gameRow(listing.id)).karabast_findable, false)
  })

  // Publishing to a public list contradicts a link-only lobby. The service
  // clamps rather than letting the row hit the CHECK constraint, so a stale
  // client sending the contradiction gets a sane lobby, not a 500.
  it('SPEC: findability on a PRIVATE lobby is clamped off, not a DB error', async () => {
    const listing = await post('private', true)
    assert.equal(listing.visibility, 'private')
    assert.equal(listing.karabastFindable, false)
    assert.equal((await gameRow(listing.id)).karabast_findable, false)
  })

  // The clamp is defence in depth; the schema is the backstop. If a future code
  // path bypasses the service, the database still refuses the contradiction.
  it('SPEC: the CHECK constraint refuses private + findable at the schema level', async () => {
    const listing = await post('public', true)
    await assert.rejects(
      () => query('UPDATE open_games SET visibility = $2 WHERE id = $1', [listing.id, 'private']),
      /open_games_karabast_findable_check/
    )
  })
})

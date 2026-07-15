// DB-backed spec tests for the Open Games listing service (Lobby V1, U1).
// Specs: docs/brainstorms/2026-07-08-lobby-homepage-requirements.md R18-R23, R29, R31-R32
// These skip when the local test database is unavailable or unmigrated.
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
  postOpenGame,
  joinOpenGame,
  playNow,
  cancelOpenGame,
  listPublicOpenGames,
  setOpenGameBestOf,
  getOpenGameByShareId,
  sweepOpenGames,
  delistOpenGamesForUser,
  OpenGameError,
} = await import('./openGames')

let dbAvailable = false
try {
  dbAvailable = await db.testConnection()
  if (dbAvailable) {
    const table = await queryRow("SELECT to_regclass('public.open_games') AS table_name")
    dbAvailable = Boolean(table?.table_name)
  }
} catch {
  dbAvailable = false
}

if (!dbAvailable) {
  console.warn(
    `openGames.test.ts: test database unavailable or missing open_games at ${TEST_DB_URL} - skipping. ` +
    'Create it with: createdb swupod_test && POSTGRES_URL=postgresql://localhost:5432/swupod_test npx tsx scripts/migrate.ts dev --yes'
  )
}

const seededUsers: string[] = []
const seededPools: string[] = []

after(async () => {
  if (dbAvailable) {
    for (const poolId of seededPools) {
      await query('DELETE FROM card_pools WHERE id = $1', [poolId])
    }
    for (const userId of seededUsers) {
      await query('DELETE FROM open_games WHERE player1_id = $1 OR player2_id = $1', [userId])
      await query('DELETE FROM users WHERE id = $1', [userId])
    }
  }
  await closePool()
})

async function seedUser(name = 'og-user'): Promise<string> {
  const suffix = randomUUID().slice(0, 8)
  const row = await queryRow(
    `INSERT INTO users (username, discord_id, email)
     VALUES ($1, $2, $3) RETURNING id`,
    [`${name}-${suffix}`, `test-${randomUUID()}`, `${name}-${suffix}@test.local`]
  )
  seededUsers.push(row.id)
  return row.id
}

interface PoolOpts {
  setCode?: string
  format?: string
  built?: boolean
}

async function seedPool(userId: string, opts: PoolOpts = {}): Promise<string> {
  const { setCode = 'SEC', format = 'draft', built = true } = opts
  const pool = await queryRow(
    `INSERT INTO card_pools (user_id, share_id, set_code, set_name, pool_type, cards, deck_builder_state)
     VALUES ($1, $2, $3, $4, $5, '[]'::jsonb, $6::jsonb) RETURNING id`,
    [userId, `og-test-${randomUUID().slice(0, 12)}`, setCode, `${setCode} Set`, format,
      built ? '{"activeLeader":"pos-l","activeBase":"pos-b","cardPositions":{"pos-l":{"card":{"name":"Test Leader","isLeader":true}},"pos-b":{"card":{"name":"Test Base","isBase":true,"aspects":[]}},"pos-c1":{"card":{"id":"T_1","name":"Test Card"},"section":"deck","visible":true,"enabled":true}}}' : '{}']
  )
  seededPools.push(pool.id)
  if (built) {
    await query(
      `INSERT INTO built_decks (card_pool_id, user_id, set_code, pool_type, leader, base, deck, sideboard)
       VALUES ($1, $2, $3, $4, $5, $6, '[]'::jsonb, '[]'::jsonb)`,
      [pool.id, userId, setCode, format, JSON.stringify({ id: 'L1', name: 'Leader' }), JSON.stringify({ id: 'B1', name: 'Base' })]
    )
  }
  return pool.id
}

async function gameRow(id: string) {
  return queryRow('SELECT * FROM open_games WHERE id = $1', [id])
}

describe('openGames service (Lobby V1 spec)', { skip: !dbAvailable }, () => {
  it('post creates an open public listing with set/format derived from the pool', async () => {
    const u = await seedUser()
    const p = await seedPool(u, { setCode: 'SEC', format: 'draft' })
    const game = await postOpenGame({ userId: u, poolId: p })
    assert.equal(game.status, 'open')
    assert.equal(game.visibility, 'public')
    assert.equal(game.setCode, 'SEC')
    assert.equal(game.format, 'draft')
    assert.ok(game.shareId)
    const row = await gameRow(game.id)
    assert.equal(row.player1_pool_id, p)
  })

  it('SPEC R19: posting again replaces the existing open listing, never stacks', async () => {
    const u = await seedUser()
    const p1 = await seedPool(u)
    const p2 = await seedPool(u)
    const first = await postOpenGame({ userId: u, poolId: p1 })
    const second = await postOpenGame({ userId: u, poolId: p2 })
    const firstRow = await gameRow(first.id)
    assert.equal(firstRow.status, 'cancelled')
    const secondRow = await gameRow(second.id)
    assert.equal(secondRow.status, 'open')
  })

  it('SPEC ownership: posting with a pool you do not own is rejected 403', async () => {
    const u = await seedUser()
    const stranger = await seedUser('og-stranger')
    const theirPool = await seedPool(stranger)
    await assert.rejects(
      postOpenGame({ userId: u, poolId: theirPool }),
      (e: OpenGameError) => e instanceof OpenGameError && e.status === 403
    )
  })

  it('SPEC R23: posting a pool without a built deck (leader+base) is rejected', async () => {
    const u = await seedUser()
    const p = await seedPool(u, { built: false })
    await assert.rejects(
      postOpenGame({ userId: u, poolId: p }),
      (e: OpenGameError) => e instanceof OpenGameError && e.code === 'deck_not_ready'
    )
  })

  it('SPEC R32: private listings are excluded from the public list but joinable via shareId', async () => {
    const u = await seedUser()
    const p = await seedPool(u)
    const game = await postOpenGame({ userId: u, poolId: p, visibility: 'private' })
    const { listings } = await listPublicOpenGames()
    assert.ok(!listings.some(l => l.shareId === game.shareId), 'private listing must not appear publicly')
    const fetched = await getOpenGameByShareId(game.shareId)
    assert.equal(fetched?.status, 'open')

    const joiner = await seedUser('og-joiner')
    const jp = await seedPool(joiner)
    const joined = await joinOpenGame({ shareId: game.shareId, userId: joiner, poolId: jp })
    assert.equal(joined.status, 'accepted')
  })

  it('SPEC R29: public listings never expose deck/pool identity', async () => {
    const u = await seedUser()
    const p = await seedPool(u)
    await postOpenGame({ userId: u, poolId: p })
    const { listings } = await listPublicOpenGames()
    for (const l of listings) {
      const json = JSON.stringify(l)
      assert.ok(!('poolId' in l) && !('deck' in l) && !('leader' in l), 'no deck identity fields')
      assert.ok(!json.includes(p), 'pool id must not leak into the listing payload')
    }
  })

  it('listings carry hostDeck (internal, host-only at the API) with the deck display name', async () => {
    // hostDeck mirrors the hostId contract: present on the service payload so
    // the API can show the host their own deck, stripped by every emit layer
    // (GET for other viewers, socket broadcast) — R29 still holds publicly.
    const u = await seedUser()
    const p = await seedPool(u)
    const game = await postOpenGame({ userId: u, poolId: p })
    const { listings } = await listPublicOpenGames()
    const mine = listings.find(l => l.shareId === game.shareId)
    assert.ok(mine?.hostDeck, 'listing carries hostDeck internally')
    // seedPool has no poolName/pool row name -> canonical archetype+date fallback
    assert.equal(typeof mine.hostDeck.name, 'string')
    assert.ok(mine.hostDeck.name.length > 0, 'deck name is non-empty')
  })

  it('bestOf defaults to 1, posts as 3 when asked, and appears on listings', async () => {
    const u = await seedUser()
    const p1 = await seedPool(u)
    const g1 = await postOpenGame({ userId: u, poolId: p1 })
    assert.equal(g1.bestOf, 1)
    const g2 = await postOpenGame({ userId: u, poolId: p1, bestOf: 3 })
    assert.equal(g2.bestOf, 3)
    const { listings } = await listPublicOpenGames()
    assert.equal(listings.find(l => l.shareId === g2.shareId)?.bestOf, 3)
  })

  it('setOpenGameBestOf: host-only, and locked once the lobby is no longer open', async () => {
    const host = await seedUser('og-bo-host')
    const hp = await seedPool(host)
    const game = await postOpenGame({ userId: host, poolId: hp })

    const updated = await setOpenGameBestOf({ shareId: game.shareId, userId: host, bestOf: 3 })
    assert.equal(updated.bestOf, 3)

    const stranger = await seedUser('og-bo-stranger')
    await assert.rejects(
      () => setOpenGameBestOf({ shareId: game.shareId, userId: stranger, bestOf: 1 }),
      (e: OpenGameError) => e.code === 'forbidden'
    )

    const joiner = await seedUser('og-bo-joiner')
    const jp = await seedPool(joiner)
    await joinOpenGame({ shareId: game.shareId, userId: joiner, poolId: jp })
    await assert.rejects(
      () => setOpenGameBestOf({ shareId: game.shareId, userId: host, bestOf: 1 }),
      (e: OpenGameError) => e.code === 'listing_gone'
    )
  })

  it('listings carry the live Karabast lobby id for board dedupe', async () => {
    const u = await seedUser()
    const p = await seedPool(u)
    const game = await postOpenGame({ userId: u, poolId: p })
    const before = await listPublicOpenGames()
    assert.equal(before.listings.find(l => l.shareId === game.shareId)?.karabastLobbyId, null)

    await query(
      `INSERT INTO open_game_lobby_attempts (open_game_id, attempt_number, status, lobby_id)
       VALUES ($1, 1, 'lobby_ready', 'kb-dedupe-1')`,
      [game.id]
    )
    const after = await listPublicOpenGames()
    assert.equal(after.listings.find(l => l.shareId === game.shareId)?.karabastLobbyId, 'kb-dedupe-1')
  })

  it('joining exits the joiner\'s previous lobby (listing + stale pending match)', async () => {
    const host = await seedUser('og-exit-host')
    const hp = await seedPool(host)
    const game = await postOpenGame({ userId: host, poolId: hp })

    const joiner = await seedUser('og-exit-joiner')
    const jp = await seedPool(joiner)
    const oldListing = await postOpenGame({ userId: joiner, poolId: jp })
    // …and a stale pending match with a third player.
    const third = await seedUser('og-exit-third')
    const tp = await seedPool(third)
    const thirdListing = await postOpenGame({ userId: third, poolId: tp })
    const stale = await joinOpenGame({ shareId: thirdListing.shareId, userId: joiner, poolId: jp })

    const joined = await joinOpenGame({ shareId: game.shareId, userId: joiner, poolId: jp })
    assert.equal(joined.status, 'accepted')
    assert.equal((await gameRow(oldListing.id)).status, 'cancelled', 'own listing exited')
    assert.equal((await gameRow(stale.id)).status, 'cancelled', 'stale pending match exited')
  })

  it('a host who is mid-match blocks joins with lobby-language copy', async () => {
    const host = await seedUser('og-busy-host')
    const hp = await seedPool(host)
    const listing = await postOpenGame({ userId: host, poolId: hp })
    // Host also has a pending match (stale listing scenario).
    const other = await seedUser('og-busy-other')
    const op = await seedPool(other)
    const otherListing = await postOpenGame({ userId: other, poolId: op })
    await joinOpenGame({ shareId: otherListing.shareId, userId: host, poolId: hp })

    const joiner = await seedUser('og-busy-joiner')
    const jp = await seedPool(joiner)
    await assert.rejects(
      () => joinOpenGame({ shareId: listing.shareId, userId: joiner, poolId: jp }),
      (e: OpenGameError) => e.code === 'pending_match_exists' && !/game/.test(e.message)
    )
  })

  it('SPEC R18: join is atomic — two concurrent joins, exactly one wins', async () => {
    const poster = await seedUser('og-poster')
    const pp = await seedPool(poster)
    const game = await postOpenGame({ userId: poster, poolId: pp })

    const [a, b] = await Promise.all([seedUser('og-a'), seedUser('og-b')])
    const [pa, pb] = await Promise.all([seedPool(a), seedPool(b)])
    const results = await Promise.allSettled([
      joinOpenGame({ shareId: game.shareId, userId: a, poolId: pa }),
      joinOpenGame({ shareId: game.shareId, userId: b, poolId: pb }),
    ])
    const wins = results.filter(r => r.status === 'fulfilled')
    const losses = results.filter(r => r.status === 'rejected')
    assert.equal(wins.length, 1, 'exactly one join must win')
    assert.equal(losses.length, 1)
    assert.ok((losses[0] as PromiseRejectedResult).reason instanceof OpenGameError)
  })

  it('SPEC R18: self-join is rejected', async () => {
    const u = await seedUser()
    const p1 = await seedPool(u)
    const p2 = await seedPool(u)
    const game = await postOpenGame({ userId: u, poolId: p1 })
    await assert.rejects(
      joinOpenGame({ shareId: game.shareId, userId: u, poolId: p2 }),
      (e: OpenGameError) => e instanceof OpenGameError && e.code === 'self_join'
    )
  })

  it('SPEC R31: join with a different set or format is rejected', async () => {
    const poster = await seedUser()
    const pp = await seedPool(poster, { setCode: 'SEC', format: 'draft' })
    const game = await postOpenGame({ userId: poster, poolId: pp })

    const joiner = await seedUser('og-joiner')
    const wrongSet = await seedPool(joiner, { setCode: 'LAW', format: 'draft' })
    const wrongFormat = await seedPool(joiner, { setCode: 'SEC', format: 'sealed' })
    for (const poolId of [wrongSet, wrongFormat]) {
      await assert.rejects(
        joinOpenGame({ shareId: game.shareId, userId: joiner, poolId }),
        (e: OpenGameError) => e instanceof OpenGameError && e.code === 'format_mismatch'
      )
    }
  })

  it('SPEC R19 (revised 7/15): joining with a pending match EXITS it — replace, never block', async () => {
    const p1 = await seedUser('og-p1')
    const p2 = await seedUser('og-p2')
    const p3 = await seedUser('og-p3')
    const [pool1, pool2, pool3a] = await Promise.all([seedPool(p1), seedPool(p2), seedPool(p3)])
    const g1 = await postOpenGame({ userId: p1, poolId: pool1 })
    const g2 = await postOpenGame({ userId: p2, poolId: pool2 })
    const first = await joinOpenGame({ shareId: g1.shareId, userId: p3, poolId: pool3a })
    const second = await joinOpenGame({ shareId: g2.shareId, userId: p3, poolId: pool3a })
    assert.equal(second.status, 'accepted')
    assert.equal((await gameRow(first.id)).status, 'cancelled', 'previous lobby exited on join')
  })

  it('SPEC R19: concurrent mutual-accept — A joins B\'s listing while B joins A\'s — yields exactly one match', async () => {
    const a = await seedUser('og-mut-a')
    const b = await seedUser('og-mut-b')
    const [poolA1, poolA2, poolB1, poolB2] = await Promise.all([
      seedPool(a), seedPool(a), seedPool(b), seedPool(b),
    ])
    const gameA = await postOpenGame({ userId: a, poolId: poolA1 })
    const gameB = await postOpenGame({ userId: b, poolId: poolB1 })

    const results = await Promise.allSettled([
      joinOpenGame({ shareId: gameB.shareId, userId: a, poolId: poolA2 }),
      joinOpenGame({ shareId: gameA.shareId, userId: b, poolId: poolB2 }),
    ])
    const wins = results.filter(r => r.status === 'fulfilled')
    assert.equal(wins.length, 1, `exactly one accept must win, got ${wins.length}`)

    const pending = await queryRow(
      `SELECT COUNT(*)::int AS n FROM open_games
       WHERE status IN ('accepted','lobby_ready','in_progress')
         AND (player1_id IN ($1,$2) OR player2_id IN ($1,$2))`,
      [a, b]
    )
    assert.equal(pending.n, 1, 'the pair must end with exactly one pending match')
  })

  it('SPEC R18/AE1/AE2: playNow accepts the oldest compatible listing, else posts; own listing is idempotent-wait', async () => {
    // Unique set code per run: playNow matches by set+format, so shared codes
    // would collide with listings left over from earlier runs.
    const runSet = `T${randomUUID().slice(0, 7)}`
    const poster = await seedUser('og-pn-poster')
    const posterPool = await seedPool(poster, { setCode: runSet, format: 'sealed' })
    const posted = await playNow({ userId: poster, poolId: posterPool })
    assert.equal(posted.action, 'posted')

    // Same caller again: own listing must NOT be self-accepted; idempotent waiting.
    const again = await playNow({ userId: poster, poolId: posterPool })
    assert.equal(again.action, 'waiting')
    assert.equal(again.game.id, posted.game.id)

    // A compatible caller instantly matches the oldest listing.
    const joiner = await seedUser('og-pn-joiner')
    const joinerPool = await seedPool(joiner, { setCode: runSet, format: 'sealed' })
    const matched = await playNow({ userId: joiner, poolId: joinerPool })
    assert.equal(matched.action, 'joined')
    assert.equal(matched.game.id, posted.game.id)

    // Incompatible caller posts their own listing instead.
    const other = await seedUser('og-pn-other')
    const otherPool = await seedPool(other, { setCode: runSet, format: 'draft' })
    const posted2 = await playNow({ userId: other, poolId: otherPool })
    assert.equal(posted2.action, 'posted')
  })

  it('SPEC R20: either player can cancel an accepted match; strangers cannot', async () => {
    const p1 = await seedUser()
    const p2 = await seedUser('og-canceller')
    const stranger = await seedUser('og-stranger')
    const [pool1, pool2] = await Promise.all([seedPool(p1), seedPool(p2)])
    const game = await postOpenGame({ userId: p1, poolId: pool1 })
    await joinOpenGame({ shareId: game.shareId, userId: p2, poolId: pool2 })

    await assert.rejects(
      cancelOpenGame({ gameId: game.id, userId: stranger }),
      (e: OpenGameError) => e instanceof OpenGameError && e.status === 403
    )
    const cancelled = await cancelOpenGame({ gameId: game.id, userId: p2 })
    assert.equal(cancelled.status, 'cancelled')
  })

  it('SPEC R9/R20: sweep expires 2h-old open listings and abandons stale accepted/lobby_ready/in_progress rows', async () => {
    const u1 = await seedUser('og-sweep1')
    const u2 = await seedUser('og-sweep2')
    const u3 = await seedUser('og-sweep3')
    const u4 = await seedUser('og-sweep4')
    const pools = await Promise.all([seedPool(u1), seedPool(u2), seedPool(u3), seedPool(u4)])

    const oldOpen = await postOpenGame({ userId: u1, poolId: pools[0] })
    await query(`UPDATE open_games SET created_at = NOW() - INTERVAL '3 hours' WHERE id = $1`, [oldOpen.id])

    const staleAccepted = await postOpenGame({ userId: u2, poolId: pools[1] })
    const joiner = await seedUser('og-sweep-joiner')
    const joinerPool = await seedPool(joiner)
    await joinOpenGame({ shareId: staleAccepted.shareId, userId: joiner, poolId: joinerPool })
    await query(`UPDATE open_games SET accepted_at = NOW() - INTERVAL '3 hours' WHERE id = $1`, [staleAccepted.id])

    const staleLobby = await postOpenGame({ userId: u3, poolId: pools[2] })
    await query(
      `UPDATE open_games SET status = 'lobby_ready', accepted_at = NOW() - INTERVAL '4 hours', updated_at = NOW() - INTERVAL '3 hours' WHERE id = $1`,
      [staleLobby.id]
    )

    const staleInProgress = await postOpenGame({ userId: u4, poolId: pools[3] })
    await query(
      `UPDATE open_games SET status = 'in_progress', accepted_at = NOW() - INTERVAL '6 hours', updated_at = NOW() - INTERVAL '5 hours' WHERE id = $1`,
      [staleInProgress.id]
    )

    await sweepOpenGames()

    assert.equal((await gameRow(oldOpen.id)).status, 'expired')
    assert.equal((await gameRow(staleAccepted.id)).status, 'abandoned')
    assert.equal((await gameRow(staleLobby.id)).status, 'abandoned')
    assert.equal((await gameRow(staleInProgress.id)).status, 'abandoned')
  })

  it('SPEC R19 (sweep frees the player): a swept player can immediately post again', async () => {
    const u = await seedUser('og-freed')
    const p = await seedPool(u)
    const joiner = await seedUser('og-freed-j')
    const jp = await seedPool(joiner)
    const game = await postOpenGame({ userId: u, poolId: p })
    await joinOpenGame({ shareId: game.shareId, userId: joiner, poolId: jp })
    await query(`UPDATE open_games SET accepted_at = NOW() - INTERVAL '30 minutes' WHERE id = $1`, [game.id])
    await sweepOpenGames()
    const fresh = await postOpenGame({ userId: u, poolId: p })
    assert.equal(fresh.status, 'open')
  })

  it('disconnect delist: open listings delist; a join during grace is unaffected by later delist call', async () => {
    const u = await seedUser('og-dc')
    const p = await seedPool(u)
    const game = await postOpenGame({ userId: u, poolId: p })
    await delistOpenGamesForUser(u)
    assert.equal((await gameRow(game.id)).status, 'delisted')

    // Accepted matches are NOT delisted by a poster disconnect.
    const u2 = await seedUser('og-dc2')
    const p2 = await seedPool(u2)
    const joiner = await seedUser('og-dc-j')
    const jp = await seedPool(joiner)
    const g2 = await postOpenGame({ userId: u2, poolId: p2 })
    await joinOpenGame({ shareId: g2.shareId, userId: joiner, poolId: jp })
    await delistOpenGamesForUser(u2)
    assert.equal((await gameRow(g2.id)).status, 'accepted')
  })

  it('joining a cancelled listing fails with listing_gone', async () => {
    const u = await seedUser()
    const p = await seedPool(u)
    const joiner = await seedUser('og-late')
    const jp = await seedPool(joiner)
    const game = await postOpenGame({ userId: u, poolId: p })
    await cancelOpenGame({ gameId: game.id, userId: u })
    await assert.rejects(
      joinOpenGame({ shareId: game.shareId, userId: joiner, poolId: jp }),
      (e: OpenGameError) => e instanceof OpenGameError && e.code === 'listing_gone'
    )
  })
})

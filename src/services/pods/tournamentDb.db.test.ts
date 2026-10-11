import { test } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import { randomUUID, createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// Explicit opt-in: creates and drops its own disposable database on the local /tmp socket.
// POD_TOURNAMENT_DB_TEST=1 npx tsx --test src/services/pods/tournamentDb.db.test.ts
test('pod tournament lifecycle against PostgreSQL', { skip: process.env.POD_TOURNAMENT_DB_TEST !== '1' }, async () => {
  const database = `ptp_pod_tournament_test_${randomUUID().replaceAll('-', '')}`
  const admin = new pg.Client({ host: '/tmp', database: 'postgres' })
  await admin.connect()
  await admin.query(`CREATE DATABASE ${database}`)
  const db = new pg.Client({ host: '/tmp', database })
  await db.connect()
  try {
    process.env.DATABASE_URL = `postgresql://${process.env.USER}@localhost/${database}`
    await db.query(`CREATE TABLE users (id UUID PRIMARY KEY, username TEXT, auth_version INTEGER DEFAULT 1);
      CREATE TABLE pods (id UUID PRIMARY KEY, share_id TEXT UNIQUE, host_id UUID, status TEXT, settings JSONB, name TEXT, set_code TEXT, set_name TEXT);
      CREATE TABLE pod_players (pod_id UUID, user_id UUID, seat_number INT, is_bot BOOLEAN DEFAULT false, dropped BOOLEAN DEFAULT false);
      CREATE TABLE card_pools (id UUID PRIMARY KEY, user_id UUID, share_id TEXT UNIQUE, parent_pool_id UUID, pod_id UUID, created_at TIMESTAMPTZ DEFAULT NOW());`)
    for (const file of ['096_native_deck_versions.sql', '097_native_private_matches.sql', '098_native_reconciliation.sql', '101_native_public_matches.sql', '116_pod_tournaments.sql', '116_pod_tournaments.sql'])
      await db.query(await readFile(join(process.cwd(), 'migrations', file), 'utf8'))

    const podId = randomUUID(), host = randomUUID()
    const humans = [host, randomUUID(), randomUUID()], bots = [randomUUID(), randomUUID()]
    for (const [i, id] of [...humans, ...bots].entries()) {
      await db.query('INSERT INTO users(id,username) VALUES($1,$2)', [id, `P${i + 1}`])
      await db.query('INSERT INTO pod_players(pod_id,user_id,seat_number,is_bot) VALUES($1,$2,$3,$4)', [podId, id, i + 1, bots.includes(id)])
    }
    await db.query("INSERT INTO pods(id,share_id,host_id,status,settings,name,set_code,set_name) VALUES($1,'pod1',$2,'complete','{\"afterDraft\":\"swiss\"}','Thursday','SOR','Spark')", [podId, host])

    const T = await import('./tournamentDb')
    await assert.rejects(T.startTournament('pod1', humans[1]!, {}), /Only the host/)
    await T.saveTournamentSettings('pod1', host, { format: 'swiss', rounds: 3, bestOf: 1, topCut: 4 })
    const saved = (await db.query('SELECT settings FROM pods WHERE id=$1', [podId])).rows[0].settings
    assert.deepEqual(saved.tournament, { format: 'swiss', rounds: 3, bestOf: 1, topCut: 4, botsPlay: true })

    let now = Date.now()
    await T.startTournament('pod1', host, saved.tournament, now)
    await assert.rejects(T.startTournament('pod1', host, saved.tournament, now), /already started/)
    const round1 = (await db.query("SELECT * FROM pod_tournament_matches WHERE pod_id=$1 AND round_number=1 ORDER BY table_number", [podId])).rows
    assert.equal(round1.length, 3, 'two tables and a bye for five players')
    const bye = round1.filter(r => !r.player2_id)
    assert.equal(bye.length, 1)
    assert.ok(bots.includes(bye[0].player1_id), 'the round-1 bye goes to a bot')
    assert.equal(bye[0].winner, 'player1')

    // Native results arrive: seat 0 is player one. Build real native rows the way a launch does.
    const finishNative = async (matchId: string, gameNumber: number, result: 'player1' | 'player2') => {
      const m = (await db.query('SELECT * FROM pod_tournament_matches WHERE id=$1', [matchId])).rows[0]
      const gameId = randomUUID()
      await db.query("INSERT INTO pod_tournament_games(id,match_id,game_number,source) VALUES($1,$2,$3,'native')", [gameId, matchId, gameNumber])
      await db.query(`INSERT INTO ptp_native_matches(id,creator_user_id,request_id,invite_hash,status,result) VALUES($1,$2,$1,$3,'complete',$4)`, [gameId, m.player1_id, `pod:${gameId}`, result])
      for (const [seat, owner] of [m.player1_id, m.player2_id].entries()) {
        const poolId = randomUUID()
        const body: Record<string, unknown> = { schemaVersion: 1, poolId, sourcePoolId: poolId, ownerUserId: owner, setCode: 'SOR', poolType: 'draft', packCount: 3, provenance: 'server-draft', validationVersion: 'v', leader: 'L', base: 'B', deck: [] }
        const hash = createHash('sha256').update(gameId + seat).digest('hex')
        const v = await db.query('INSERT INTO ptp_play_deck_versions(pool_id,source_pool_id,owner_user_id,content_hash,snapshot) VALUES($1,$1,$2,$3,$4) RETURNING id', [poolId, owner, hash, { ...body, contentHash: hash }])
        await db.query('INSERT INTO ptp_native_match_seats(match_id,seat,user_id,deck_version_id,released_at) VALUES($1,$2,$3,$4,NOW())', [gameId, seat, owner, v.rows[0].id])
      }
    }
    const open1 = round1.filter(r => r.player2_id)
    await finishNative(open1[0].id, 1, 'player1')
    await T.syncNativeResults(podId)
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM pod_tournament_matches WHERE pod_id=$1 AND round_number=2', [podId])).rows[0].n, 0, 'round 2 waits for every table')
    await finishNative(open1[1].id, 1, 'player2')
    await T.syncNativeResults(podId)
    const round2 = (await db.query('SELECT * FROM pod_tournament_matches WHERE pod_id=$1 AND round_number=2', [podId])).rows
    assert.equal(round2.length, 3, 'round 2 paired on its own')
    const pairsSoFar = new Set(round1.filter(r => r.player2_id).map(r => [r.player1_id, r.player2_id].sort().join()))
    for (const r of round2.filter(r => r.player2_id)) assert.ok(!pairsSoFar.has([r.player1_id, r.player2_id].sort().join()), 'no rematch')

    // Host fixes round 2: every table by override. A bot-vs-bot table resolves itself.
    for (const r of round2.filter(r => r.player2_id && !r.winner)) await T.overrideMatchResult('pod1', host, r.id, 1, 0, now)
    await assert.rejects(T.overrideMatchResult('pod1', humans[1]!, round2[0].id, 1, 0, now), /Only the host/)
    const round3 = (await db.query('SELECT * FROM pod_tournament_matches WHERE pod_id=$1 AND round_number=3', [podId])).rows
    assert.equal(round3.length, 3)
    for (const r of round3.filter(r => r.player2_id && !r.winner)) await T.overrideMatchResult('pod1', host, r.id, 0, 1, now)
    const t = (await db.query('SELECT * FROM pod_tournaments WHERE pod_id=$1', [podId])).rows[0]
    assert.ok(t.cut_starts_at, 'Swiss done: the top cut is counting down')
    assert.equal((await db.query("SELECT COUNT(*)::int AS n FROM pod_tournament_matches WHERE pod_id=$1 AND stage='elimination'", [podId])).rows[0].n, 0)
    now = new Date(t.cut_starts_at).getTime() + 1
    await T.reconcilePodTournaments(now)
    const semis = (await db.query("SELECT * FROM pod_tournament_matches WHERE pod_id=$1 AND stage='elimination' ORDER BY table_number", [podId])).rows
    assert.equal(semis.length, 2, 'top 4: two semifinals')
    await assert.rejects(T.overrideMatchResult('pod1', host, round3[0].id, 1, 0, now), /final/, 'Swiss is locked once the cut is seeded')
    await assert.rejects(T.overrideMatchResult('pod1', host, semis[0].id, 0, 0, now), /winner|Invalid/)
    for (const s of semis) if (!s.winner) await T.overrideMatchResult('pod1', host, s.id, 1, 0, now)
    const final = (await db.query("SELECT * FROM pod_tournament_matches WHERE pod_id=$1 AND stage='elimination' AND round_number=2", [podId])).rows
    assert.equal(final.length, 1)
    if (!final[0].winner) await T.overrideMatchResult('pod1', host, final[0].id, 0, 1, now)
    assert.equal((await db.query('SELECT status FROM pod_tournaments WHERE pod_id=$1', [podId])).rows[0].status, 'complete')

    // The page view over the finished event.
    const { buildHubView } = await import('./hubView')
    const state = await (await import('../../../lib/db')).withTransaction(tx => T.loadTournament(tx, podId))
    const view = buildHubView({ pod: { shareId: 'pod1', name: 'Thursday', setCode: 'SOR', setName: 'Spark', status: 'complete', hostId: host, settings: saved },
      viewerId: host, nativePlay: false, players: [...humans, ...bots].map((id, i) => ({ id, name: `P${i + 1}`, seat: i + 1, isBot: bots.includes(id), dropped: false, isReady: true, deck: null, poolShareId: null })),
      tournament: state, liveMatches: new Set(), now })
    assert.equal(view.tournament?.status, 'complete')
    assert.deepEqual(view.tabs.map(t => t.label), ['Deckbuilding', 'Round 1', 'Round 2', 'Round 3', 'Top 4', 'Standings'])
    assert.ok(view.tournament?.champion)
  } finally {
    await db.end()
    const { closePool } = await import('../../../lib/db')
    await closePool().catch(() => {})
    await admin.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`)
    await admin.end()
  }
})

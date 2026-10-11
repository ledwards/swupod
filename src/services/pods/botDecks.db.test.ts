import { test } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import { randomUUID } from 'node:crypto'
import { initializeCardCache, getCachedCards } from '../../utils/cardCache'

// Explicit opt-in: creates and drops its own disposable database on the local /tmp socket.
// POD_TOURNAMENT_DB_TEST=1 npx tsx --test src/services/pods/botDecks.db.test.ts
test('bot deck backfill is idempotent and safe under concurrent page loads', { skip: process.env.POD_TOURNAMENT_DB_TEST !== '1' }, async () => {
  const database = `ptp_bot_decks_test_${randomUUID().replaceAll('-', '')}`
  const admin = new pg.Client({ host: '/tmp', database: 'postgres' })
  await admin.connect()
  await admin.query(`CREATE DATABASE ${database}`)
  const db = new pg.Client({ host: '/tmp', database })
  await db.connect()
  try {
    process.env.DATABASE_URL = `postgresql://${process.env.USER}@localhost/${database}`
    delete process.env.POSTGRES_URL
    await db.query(`CREATE TABLE users (id UUID PRIMARY KEY, username TEXT);
      CREATE TABLE pods (id UUID PRIMARY KEY, share_id TEXT UNIQUE, host_id UUID, status TEXT, settings JSONB, name TEXT, set_code TEXT, set_name TEXT, competitive BOOLEAN DEFAULT false, pod_type TEXT DEFAULT 'draft');
      CREATE TABLE pod_players (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), pod_id UUID, user_id UUID, seat_number INT, is_bot BOOLEAN DEFAULT false, drafted_cards JSONB, drafted_leaders JSONB,
        strategy_name TEXT, mixin_name TEXT, committed_leader JSONB, committed_base_color TEXT, is_log_public BOOLEAN DEFAULT false);
      CREATE TABLE card_pools (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID, share_id TEXT UNIQUE, set_code TEXT, set_name TEXT, pool_type TEXT, name TEXT, cards JSONB, packs JSONB,
        pod_id UUID, deck_builder_state JSONB, is_public BOOLEAN, parent_pool_id UUID, created_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE built_decks (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), card_pool_id UUID UNIQUE NOT NULL REFERENCES card_pools(id) ON DELETE CASCADE, user_id UUID, set_code TEXT NOT NULL, pool_type TEXT,
        leader JSONB NOT NULL, base JSONB NOT NULL, deck JSONB NOT NULL, sideboard JSONB NOT NULL, built_at TIMESTAMPTZ DEFAULT NOW());`)

    await initializeCardCache()
    const cards = getCachedCards('HMW').filter(c => c.variantType === 'Normal')
    const leaders = cards.filter(c => c.isLeader)
    const playables = cards.filter(c => !c.isLeader && !c.isBase)
    const podId = randomUUID(), host = randomUUID()
    await db.query('INSERT INTO users(id,username) VALUES($1,$2)', [host, 'Lee'])
    await db.query(`INSERT INTO pods(id,share_id,host_id,status,settings,name,set_code,set_name) VALUES($1,'pod1',$2,'complete','{}','Night','HMW','Homeworlds')`, [podId, host])
    await db.query('INSERT INTO pod_players(pod_id,user_id,seat_number) VALUES($1,$2,1)', [podId, host])
    const bots: string[] = []
    for (let i = 0; i < 4; i++) {
      const id = randomUUID(); bots.push(id)
      const picks = Array.from({ length: 42 }, (_, k) => ({ ...playables[(k * 5 + i * 11) % playables.length]!, packNumber: Math.floor(k / 14) + 1, pickNumber: (k % 14) + 1 }))
      await db.query('INSERT INTO users(id,username) VALUES($1,$2)', [id, `DraftBot ${i}`])
      await db.query('INSERT INTO pod_players(pod_id,user_id,seat_number,is_bot,drafted_cards,drafted_leaders) VALUES($1,$2,$3,true,$4,$5)',
        [podId, id, i + 2, JSON.stringify(picks), JSON.stringify(leaders.slice(i * 2, i * 2 + 3))])
    }
    const { buildBotDecks } = await import('../../utils/botDeckBuilder')
    const { ensureBotDecks } = await import('./botDecks')
    // Bot 0 built at the end of the draft. Bot 1's pool was saved without its deck (the bug);
    // bot 2's pool has no usable state; bot 3 never got a pool.
    assert.equal(await buildBotDecks(podId, 'HMW', {}, { announce: false }), 4)
    const pools = (await db.query('SELECT id,user_id FROM card_pools ORDER BY user_id')).rows
    const poolOf = (bot: string) => pools.find(p => p.user_id === bot)!.id
    await db.query('DELETE FROM built_decks WHERE card_pool_id = ANY($1::uuid[])', [[poolOf(bots[1]!), poolOf(bots[2]!)]])
    await db.query(`UPDATE card_pools SET deck_builder_state='{}' WHERE id=$1`, [poolOf(bots[2]!)])
    await db.query('DELETE FROM card_pools WHERE id=$1', [poolOf(bots[3]!)])
    const kept = (await db.query('SELECT built_at,deck FROM built_decks WHERE card_pool_id=$1', [poolOf(bots[0]!)])).rows[0]

    const counts = await Promise.all([ensureBotDecks(podId), ensureBotDecks(podId), ensureBotDecks(podId), ensureBotDecks(podId)])
    // Only one loader builds; the others see the lock and leave it.
    assert.equal(counts.reduce((a, b) => a + b, 0), 3)
    assert.equal(await ensureBotDecks(podId), 0)
    assert.equal(await ensureBotDecks(podId), 0)

    const rows = (await db.query(`SELECT pp.user_id, COUNT(DISTINCT cp.id)::int AS pools, COUNT(b.id)::int AS decks, MAX(b.built_at) AS built_at,
        (ARRAY_AGG(b.leader))[1] AS leader, (ARRAY_AGG(b.base))[1] AS base, (ARRAY_AGG(b.deck))[1] AS deck
      FROM pod_players pp LEFT JOIN card_pools cp ON cp.pod_id=pp.pod_id AND cp.user_id=pp.user_id LEFT JOIN built_decks b ON b.card_pool_id=cp.id
      WHERE pp.is_bot GROUP BY pp.user_id`)).rows
    assert.equal(rows.length, 4)
    for (const r of rows) {
      assert.equal(r.pools, 1, 'one pool per bot')
      assert.equal(r.decks, 1, 'one built deck per bot')
      assert.ok(r.leader?.id && r.base?.id, 'a leader and a base')
      assert.ok((r.deck as { count: number }[]).reduce((s, e) => s + e.count, 0) >= 30, 'at least 30 cards')
    }
    const after = rows.find(r => r.user_id === bots[0])!
    assert.equal(new Date(after.built_at).getTime(), new Date(kept.built_at).getTime(), 'a built bot is left alone')
    const { closePool } = await import('../../../lib/db')
    await closePool()
  } finally {
    await db.end()
    await admin.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`)
    await admin.end()
  }
})

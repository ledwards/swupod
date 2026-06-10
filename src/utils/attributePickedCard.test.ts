// @ts-nocheck
// Integration test for attributePickedCard helper (U9 write-path).
// Uses the dev DB and a temporary fixture; cleans up everything in a finally.
//
// Run: npx tsx src/utils/attributePickedCard.test.ts
//
// Skipped if POSTGRES_URL is not set or unreachable.
import 'dotenv/config'
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { query, queryRow, queryRows } from '@/lib/db'
import { attributePickedCard } from './trackGeneration'

// Deterministic test UUIDs (valid UUID hex; "u9" intent encoded in "0067" suffix).
const FIXTURE_POD_ID = '00000000-0000-4000-9000-000000000067'
const FIXTURE_USER_A = '00000000-0000-4000-9001-000000000067'
const FIXTURE_USER_B = '00000000-0000-4000-9002-000000000067'

async function ensureUser(userId: string, username: string) {
  // Insert a user row only if it doesn't exist. Use ON CONFLICT to be safe.
  await query(
    `INSERT INTO users (id, username, email)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO NOTHING`,
    [userId, username, `${username}@test-u9.local`]
  )
}

async function ensurePod(podId: string, hostId: string) {
  await query(
    `INSERT INTO pods (id, share_id, host_id, set_code, status, max_players, current_players, pod_type)
     VALUES ($1, $2, $3, 'LAW', 'complete', 2, 2, 'draft')
     ON CONFLICT (id) DO NOTHING`,
    [podId, `u9test-${podId.slice(-8)}`, hostId]
  )
}

async function insertGenRow(opts: { podId: string; cardId: string; packIndex: number }) {
  // Minimal viable row matching the schema CHECK constraints.
  const r = await query(
    `INSERT INTO card_generations (
       card_id, set_code, card_name, card_type, rarity,
       treatment, variant_type, pack_type,
       source_type, source_id, pack_index, user_id
     ) VALUES ($1, 'LAW', 'Test Card', 'Unit', 'Common',
               'base', 'Normal', 'booster',
               'draft', $2, $3, NULL)
     RETURNING id`,
    [opts.cardId, opts.podId, opts.packIndex]
  )
  return r.rows[0].id as number
}

async function cleanupFixture() {
  // Remove all rows we may have created. Order respects FK chains.
  await query(`DELETE FROM card_generations WHERE source_id = $1`, [FIXTURE_POD_ID])
  await query(`DELETE FROM pod_players WHERE pod_id = $1`, [FIXTURE_POD_ID])
  await query(`DELETE FROM pods WHERE id = $1`, [FIXTURE_POD_ID])
  await query(`DELETE FROM users WHERE id IN ($1, $2)`, [FIXTURE_USER_A, FIXTURE_USER_B])
}

let dbAvailable = false
try {
  await queryRow('SELECT 1 AS ok')
  dbAvailable = true
} catch {
  console.log('[U9 test] Skipping — DB not reachable.')
}

if (dbAvailable) {
  describe('attributePickedCard (U9 write-path)', () => {
    before(async () => {
      await cleanupFixture()
      await ensureUser(FIXTURE_USER_A, 'u9user_a')
      await ensureUser(FIXTURE_USER_B, 'u9user_b')
      await ensurePod(FIXTURE_POD_ID, FIXTURE_USER_A)
    })

    after(async () => {
      await cleanupFixture()
    })

    it('claims one NULL row for a freshly picked card', async () => {
      const cardId = 'LAW-test-card-001'
      const genId = await insertGenRow({ podId: FIXTURE_POD_ID, cardId, packIndex: 5 })

      await attributePickedCard({
        podId: FIXTURE_POD_ID,
        cardId,
        userId: FIXTURE_USER_A,
      })

      const row = await queryRow(
        `SELECT user_id FROM card_generations WHERE id = $1`,
        [genId]
      )
      assert.strictEqual(row.user_id, FIXTURE_USER_A,
        'SPEC: user_id should be set to the picker after attribution')
    })

    it('does NOT overwrite an already-attributed row (idempotent / safe-under-concurrency)', async () => {
      const cardId = 'LAW-test-card-002'
      const genId = await insertGenRow({ podId: FIXTURE_POD_ID, cardId, packIndex: 6 })
      // Pre-attribute it (simulating a previous call or migration 024).
      await query(`UPDATE card_generations SET user_id = $1 WHERE id = $2`, [FIXTURE_USER_A, genId])

      // Now a "concurrent" call for the same card by user B should NOT clobber.
      await attributePickedCard({
        podId: FIXTURE_POD_ID,
        cardId,
        userId: FIXTURE_USER_B,
      })

      const row = await queryRow(
        `SELECT user_id FROM card_generations WHERE id = $1`,
        [genId]
      )
      assert.strictEqual(row.user_id, FIXTURE_USER_A,
        'SPEC: existing non-NULL attribution must not be overwritten')
    })

    it('claims exactly ONE row when two NULL rows exist for the same (pod, card_id)', async () => {
      // The bug this guards against: a naive `UPDATE ... WHERE user_id IS NULL`
      // (no LIMIT) would attribute BOTH copies of a duplicate card_id to one
      // user. With LIMIT 1 via id-in-subquery, each call grabs exactly one.
      const cardId = 'LAW-test-card-003'
      const genIdA = await insertGenRow({ podId: FIXTURE_POD_ID, cardId, packIndex: 7 })
      const genIdB = await insertGenRow({ podId: FIXTURE_POD_ID, cardId, packIndex: 12 })

      // User A picks one copy.
      await attributePickedCard({
        podId: FIXTURE_POD_ID,
        cardId,
        userId: FIXTURE_USER_A,
      })

      // User B picks the other copy.
      await attributePickedCard({
        podId: FIXTURE_POD_ID,
        cardId,
        userId: FIXTURE_USER_B,
      })

      const rows = await queryRows(
        `SELECT id, user_id FROM card_generations
          WHERE source_id = $1 AND card_id = $2
          ORDER BY pack_index`,
        [FIXTURE_POD_ID, cardId]
      )
      assert.strictEqual(rows.length, 2)
      const ownerSet = new Set(rows.map(r => r.user_id))
      assert.ok(ownerSet.has(FIXTURE_USER_A),
        'SPEC: user A should own exactly one of the two copies')
      assert.ok(ownerSet.has(FIXTURE_USER_B),
        'SPEC: user B should own exactly one of the two copies')
      assert.strictEqual(rows.find(r => r.id === genIdA)?.user_id, FIXTURE_USER_A,
        'deterministic ordering: lower pack_index → first claim → user A')
      assert.strictEqual(rows.find(r => r.id === genIdB)?.user_id, FIXTURE_USER_B,
        'higher pack_index goes to the second caller')
    })

    it('no-ops when no matching NULL row exists', async () => {
      // attributePickedCard for a card_id that doesn't exist in this pod
      // should not throw and should not affect anything.
      await assert.doesNotReject(
        attributePickedCard({
          podId: FIXTURE_POD_ID,
          cardId: 'nonexistent-card-id',
          userId: FIXTURE_USER_A,
        })
      )
    })

    it('no-ops when userId is null (bot pick path)', async () => {
      const cardId = 'LAW-test-card-004'
      const genId = await insertGenRow({ podId: FIXTURE_POD_ID, cardId, packIndex: 8 })

      await attributePickedCard({
        podId: FIXTURE_POD_ID,
        cardId,
        userId: null,
      })

      const row = await queryRow(
        `SELECT user_id FROM card_generations WHERE id = $1`,
        [genId]
      )
      assert.strictEqual(row.user_id, null,
        'SPEC: bot picks (userId=null) must leave user_id NULL')
    })
  })
}

// Concurrency tests for atomic draft advancement (U2, foundations hardening).
//
// These run against the local swupod_test Postgres (see lib/db.test.ts for
// setup). Transactions + advisory locks cannot be mocked meaningfully, so the
// suite skips loudly when the test DB is unreachable. The target database is
// deliberately NOT read from DATABASE_URL / POSTGRES_URL so a shell pointing
// at the Railway dev/prod DB can never be written to by tests.
import { describe, it, after, afterEach } from 'node:test'
import assert from 'node:assert'
import { randomUUID } from 'node:crypto'
import pg from 'pg'

const TEST_DB_URL =
  process.env['SWUPOD_TEST_DATABASE_URL'] || 'postgresql://localhost:5432/swupod_test'

// lib/db.ts reads the connection string at module init — pin it to the test
// DB before the dynamic imports below.
process.env['DATABASE_URL'] = TEST_DB_URL
process.env['POSTGRES_URL'] = TEST_DB_URL

const db = await import('@/lib/db')
const { query, queryRow, queryRows, closePool } = db
const { processAllStagedPicks, checkAndAdvancePackDraft, _testSeams } = await import('@/src/utils/draftAdvance')
const { processBotTurns } = await import('@/src/utils/botLogic')
const { deleteAbandonedPodRecords } = await import('@/src/utils/podCleanup')

let dbAvailable = false
try {
  dbAvailable = await db.testConnection()
} catch {
  dbAvailable = false
}

if (!dbAvailable) {
  console.warn(
    `⚠️  draft-advance-concurrency.test.ts: test database unreachable at ${TEST_DB_URL} — skipping. ` +
    'Create it with: createdb swupod_test && POSTGRES_URL=postgresql://localhost:5432/swupod_test npx tsx scripts/migrate.ts dev --yes'
  )
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

function leaderCard(n: number) {
  return {
    id: `test-leader-${n}`,
    instanceId: `inst-leader-${n}`,
    name: `Test Leader ${n}`,
    set: 'TST',
    rarity: 'Legendary',
    type: 'Leader',
  }
}

function draftCard(label: string) {
  return {
    id: `test-card-${label}`,
    instanceId: `inst-card-${label}`,
    name: `Test Card ${label}`,
    set: 'TST',
    rarity: 'Common',
    type: 'Unit',
  }
}

interface SeededPod {
  podId: string
  shareId: string
  playerIds: string[]
  userIds: string[]
}

const seededPods: string[] = []
const seededUsers: string[] = []

/**
 * Seed an active 2-player pod in leader_draft phase where BOTH players have
 * staged a selection (pick_status = 'selected'), i.e. ready to process.
 */
async function seedSelectedPod(): Promise<SeededPod> {
  const shareId = `tx-test-${randomUUID().slice(0, 8)}`
  const userIds: string[] = []
  for (let i = 0; i < 2; i++) {
    const user = await queryRow(
      `INSERT INTO users (username, email) VALUES ($1, $2) RETURNING id`,
      [`tx-test-user-${shareId}-${i}`, `tx-test-${shareId}-${i}@example.test`]
    )
    userIds.push(user!.id as string)
    seededUsers.push(user!.id as string)
  }

  const draftState = { phase: 'leader_draft', leaderRound: 1, totalPacks: 3, setCode: 'TST' }
  const pod = await queryRow(
    `INSERT INTO pods (share_id, set_code, status, draft_state, state_version, max_players)
     VALUES ($1, 'TST', 'active', $2, 10, 2) RETURNING id`,
    [shareId, JSON.stringify(draftState)]
  )
  const podId = pod!.id as string
  seededPods.push(podId)

  const playerIds: string[] = []
  for (let seat = 0; seat < 2; seat++) {
    // Each player holds 3 leaders and has selected the first one.
    const leaders = [leaderCard(seat * 10 + 1), leaderCard(seat * 10 + 2), leaderCard(seat * 10 + 3)]
    const player = await queryRow(
      `INSERT INTO pod_players (pod_id, user_id, seat_number, pick_status, is_bot,
                                leaders, drafted_leaders, drafted_cards, selected_card_id)
       VALUES ($1, $2, $3, 'selected', false, $4, '[]', '[]', $5)
       RETURNING id`,
      [podId, userIds[seat], seat, JSON.stringify(leaders), leaders[0].instanceId]
    )
    playerIds.push(player!.id as string)
  }

  return { podId, shareId, playerIds, userIds }
}

/**
 * Seed an active 2-player competitive pod at the end of pack 1. In staged mode,
 * BOTH players have selected the last card in their current pack. In legacy
 * mode, BOTH players have already picked it and hold an empty pack.
 */
async function seedCompetitivePackEndPod(mode: 'selected' | 'picked' = 'selected'): Promise<SeededPod> {
  const shareId = `tx-pack-test-${randomUUID().slice(0, 8)}`
  const userIds: string[] = []
  for (let i = 0; i < 2; i++) {
    const user = await queryRow(
      `INSERT INTO users (username, email) VALUES ($1, $2) RETURNING id`,
      [`tx-pack-test-user-${shareId}-${i}`, `tx-pack-test-${shareId}-${i}@example.test`]
    )
    userIds.push(user!.id as string)
    seededUsers.push(user!.id as string)
  }

  const allPacks = [
    [
      { cards: [draftCard('0-pack-1-last')] },
      { cards: [draftCard('0-pack-2-a'), draftCard('0-pack-2-b')] },
    ],
    [
      { cards: [draftCard('1-pack-1-last')] },
      { cards: [draftCard('1-pack-2-a'), draftCard('1-pack-2-b')] },
    ],
  ]
  const draftState = { phase: 'pack_draft', packNumber: 1, pickInPack: 14, totalPacks: 2, setCode: 'TST' }
  const pod = await queryRow(
    `INSERT INTO pods (
       share_id, set_code, status, draft_state, state_version, max_players,
       competitive, pick_started_at, all_packs
     )
     VALUES ($1, 'TST', 'active', $2, 20, 2, true, NOW(), $3)
     RETURNING id`,
    [shareId, JSON.stringify(draftState), JSON.stringify(allPacks)]
  )
  const podId = pod!.id as string
  seededPods.push(podId)

  const playerIds: string[] = []
  for (let seat = 0; seat < 2; seat++) {
    const selectedCard = draftCard(`${seat}-pack-1-last`)
    const draftedCards = Array.from({ length: 13 }, (_, index) => ({
      ...draftCard(`${seat}-prior-${index + 1}`),
      pickNumber: index + 1,
      packNumber: 1,
      pickInPack: index + 1,
    }))
    const currentPack = mode === 'selected' ? [selectedCard] : []
    const selectedCardId = mode === 'selected' ? selectedCard.instanceId : null
    if (mode === 'picked') {
      draftedCards.push({
        ...selectedCard,
        pickNumber: 14,
        packNumber: 1,
        pickInPack: 14,
      })
    }
    const player = await queryRow(
      `INSERT INTO pod_players (
         pod_id, user_id, seat_number, pick_status, is_bot,
         leaders, drafted_leaders, drafted_cards, current_pack, selected_card_id
       )
       VALUES ($1, $2, $3, $4, false, '[]', '[]', $5, $6, $7)
       RETURNING id`,
      [
        podId,
        userIds[seat],
        seat,
        mode,
        JSON.stringify(draftedCards),
        JSON.stringify(currentPack),
        selectedCardId,
      ]
    )
    playerIds.push(player!.id as string)
  }

  return { podId, shareId, playerIds, userIds }
}

async function podStateVersion(podId: string): Promise<number> {
  const pod = await queryRow('SELECT state_version FROM pods WHERE id = $1', [podId])
  return pod!.state_version as number
}

async function assertPackTwoReviewTimerDeferred(podId: string, beforeAdvanceMs: number): Promise<void> {
  const pod = await queryRow(
    'SELECT draft_state, pick_started_at FROM pods WHERE id = $1',
    [podId]
  )
  const draftState = typeof pod!.draft_state === 'string'
    ? JSON.parse(pod!.draft_state)
    : pod!.draft_state as { packNumber: number; pickInPack: number; reviewUntil?: string }
  const pickStartedAt = pod!.pick_started_at instanceof Date
    ? pod!.pick_started_at
    : new Date(pod!.pick_started_at as string)

  assert.strictEqual(draftState.packNumber, 2)
  assert.strictEqual(draftState.pickInPack, 1)
  assert.ok(draftState.reviewUntil, 'competitive pack transition starts the review period')
  assert.strictEqual(
    pickStartedAt.getTime(),
    new Date(draftState.reviewUntil!).getTime(),
    'pack 2 timer must start when review ends, not when pack 1 ends'
  )
  assert.ok(
    new Date(draftState.reviewUntil!).getTime() - beforeAdvanceMs >= 25_000,
    'reviewUntil should be approximately 30 seconds after pack 1 ended'
  )
}

describe('atomic draft advancement (pg_advisory_xact_lock)', { skip: !dbAvailable }, () => {
  afterEach(() => {
    delete _testSeams.afterPlayerPickApplied
  })

  after(async () => {
    // Clean up seeded rows (draft_picks/pod_players cascade from pods)
    for (const podId of seededPods) {
      await query('DELETE FROM pods WHERE id = $1', [podId])
    }
    for (const userId of seededUsers) {
      await query('DELETE FROM users WHERE id = $1', [userId])
    }
  })

  it('simultaneous submissions: exactly one processes, no duplicate picks, state_version advances once', async () => {
    const { podId } = await seedSelectedPod()

    const [a, b] = await Promise.all([
      processAllStagedPicks(podId),
      processAllStagedPicks(podId),
    ])

    assert.strictEqual([a, b].filter(Boolean).length, 1, 'exactly one caller must process the picks')

    const picks = await queryRows('SELECT user_id FROM draft_picks WHERE pod_id = $1', [podId])
    assert.strictEqual(picks.length, 2, 'one draft_picks row per player, no duplicates')
    assert.strictEqual(new Set(picks.map(p => p.user_id)).size, 2, 'each player picked exactly once')

    // Advance writes exactly one state_version bump (10 → 11)
    assert.strictEqual(await podStateVersion(podId), 11)

    const players = await queryRows(
      'SELECT pick_status, selected_card_id, drafted_leaders FROM pod_players WHERE pod_id = $1',
      [podId]
    )
    for (const player of players) {
      assert.strictEqual(player.pick_status, 'picking', 'players reset for the next round')
      assert.strictEqual(player.selected_card_id, null)
      const drafted = player.drafted_leaders as unknown[]
      assert.strictEqual((Array.isArray(drafted) ? drafted : JSON.parse(String(drafted))).length, 1)
    }
  })

  it('blocks (does not error) while another transaction holds the pod advisory lock, then completes', async () => {
    const { podId } = await seedSelectedPod()

    // Hold the pod's advisory lock in a manual transaction on a raw client
    // (independent of the app pool and of withTransaction's nesting guard).
    const holder = new pg.Client({ connectionString: TEST_DB_URL })
    await holder.connect()
    try {
      await holder.query('BEGIN')
      await holder.query('SELECT pg_advisory_xact_lock(hashtext($1::text))', [podId])

      // Start processing while the lock is held — it must wait, not fail.
      const processPromise = processAllStagedPicks(podId)
      await sleep(400)

      const picksWhileLocked = await queryRows('SELECT id FROM draft_picks WHERE pod_id = $1', [podId])
      assert.strictEqual(picksWhileLocked.length, 0, 'processing must not proceed while the lock is held')

      // Lock released on commit — processing now completes with correct state.
      await holder.query('COMMIT')
      const processed = await processPromise
      assert.strictEqual(processed, true)
    } finally {
      await holder.end()
    }

    const picks = await queryRows('SELECT id FROM draft_picks WHERE pod_id = $1', [podId])
    assert.strictEqual(picks.length, 2)
    assert.strictEqual(await podStateVersion(podId), 11)
  })

  it('crash mid-advance rolls back EVERYTHING; a retry then succeeds cleanly', async () => {
    const { podId } = await seedSelectedPod()

    // Inject a crash after the first player's pick has been applied.
    _testSeams.afterPlayerPickApplied = (playerIndex: number) => {
      if (playerIndex === 0) {
        throw new Error('injected crash after player 0')
      }
    }

    await assert.rejects(processAllStagedPicks(podId), /injected crash after player 0/)

    // ROLLBACK left the draft in the exact pre-advance state.
    const players = await queryRows(
      'SELECT pick_status, selected_card_id, drafted_leaders FROM pod_players WHERE pod_id = $1 ORDER BY seat_number',
      [podId]
    )
    for (const player of players) {
      assert.strictEqual(player.pick_status, 'selected', 'all players must still be selected after rollback')
      assert.ok(player.selected_card_id, 'selected_card_id must be intact after rollback')
      const drafted = player.drafted_leaders as unknown[]
      assert.strictEqual((Array.isArray(drafted) ? drafted : JSON.parse(String(drafted))).length, 0)
    }
    assert.strictEqual(await podStateVersion(podId), 10, 'state_version unchanged after rollback')
    const picks = await queryRows('SELECT id FROM draft_picks WHERE pod_id = $1', [podId])
    assert.strictEqual(picks.length, 0, 'no draft_picks rows from the rolled-back attempt')

    // Retry without the crash — clean end-to-end success.
    delete _testSeams.afterPlayerPickApplied
    const retried = await processAllStagedPicks(podId)
    assert.strictEqual(retried, true)
    assert.strictEqual(await podStateVersion(podId), 11)
    assert.strictEqual((await queryRows('SELECT id FROM draft_picks WHERE pod_id = $1', [podId])).length, 2)
  })

  it('slow processing (>2s) no longer double-fires (old soft-lock expiry regression)', async () => {
    const { podId } = await seedSelectedPod()

    // First caller stalls 2.5s mid-processing — longer than the retired
    // 2-second bot_processing_since expiry that used to let a second caller
    // "expire" the lock and double-process.
    let stalled = false
    _testSeams.afterPlayerPickApplied = async (playerIndex: number) => {
      if (playerIndex === 0 && !stalled) {
        stalled = true
        await sleep(2500)
      }
    }

    const first = processAllStagedPicks(podId)
    await sleep(300) // ensure the first caller holds the advisory lock
    const second = processAllStagedPicks(podId)

    const [a, b] = await Promise.all([first, second])
    assert.strictEqual(a, true, 'first (slow) caller processes')
    assert.strictEqual(b, false, 'second caller waits on the lock, re-checks, and no-ops')

    const picks = await queryRows('SELECT user_id FROM draft_picks WHERE pod_id = $1', [podId])
    assert.strictEqual(picks.length, 2, 'no double-processed picks')
    assert.strictEqual(await podStateVersion(podId), 11, 'state_version advanced exactly once')
  })

  it('bot-driven advancement (processBotTurns) processes staged picks under the same locks', async () => {
    const { podId } = await seedSelectedPod()

    await processBotTurns(podId)

    const picks = await queryRows('SELECT id FROM draft_picks WHERE pod_id = $1', [podId])
    assert.strictEqual(picks.length, 2)
    const players = await queryRows('SELECT pick_status FROM pod_players WHERE pod_id = $1', [podId])
    assert.ok(players.every(p => p.pick_status === 'picking'), 'advanced to the next leader round')
  })

  it('competitive inter-pack review does not spend the next pack timer', async () => {
    const { podId } = await seedCompetitivePackEndPod('selected')
    const beforeAdvanceMs = Date.now()

    const processed = await processAllStagedPicks(podId)
    assert.strictEqual(processed, true)

    await assertPackTwoReviewTimerDeferred(podId, beforeAdvanceMs)
  })

  it('legacy competitive pack advancement does not spend the next pack timer', async () => {
    const { podId } = await seedCompetitivePackEndPod('picked')
    const podBeforeAdvance = await queryRow(
      `SELECT id, share_id, status, draft_state, state_version, settings, competitive
       FROM pods WHERE id = $1`,
      [podId]
    )
    const draftState = typeof podBeforeAdvance!.draft_state === 'string'
      ? JSON.parse(podBeforeAdvance!.draft_state)
      : podBeforeAdvance!.draft_state
    const beforeAdvanceMs = Date.now()

    const advanced = await checkAndAdvancePackDraft(podId, draftState, podBeforeAdvance as never)
    assert.strictEqual(advanced, true)

    await assertPackTwoReviewTimerDeferred(podId, beforeAdvanceMs)
  })
})

describe('abandoned pod cleanup atomicity', { skip: !dbAvailable }, () => {
  it('a failed pods DELETE rolls back the card_pools and pod_players DELETEs', async () => {
    const shareId = `cleanup-test-${randomUUID().slice(0, 8)}`
    const pod = await queryRow(
      `INSERT INTO pods (share_id, set_code, status) VALUES ($1, 'TST', 'waiting') RETURNING id`,
      [shareId]
    )
    const podId = pod!.id as string
    await query(
      `INSERT INTO card_pools (share_id, set_code, cards, pod_id) VALUES ($1, 'TST', '[]', $2)`,
      [`${shareId}-pool`, podId]
    )
    await query(
      `INSERT INTO pod_players (pod_id, seat_number, pick_status) VALUES ($1, 0, 'waiting')`,
      [podId]
    )

    // Force the pods DELETE to fail at the DB level for this specific pod.
    await query(`
      CREATE OR REPLACE FUNCTION tx_test_block_pod_delete() RETURNS trigger AS $$
      BEGIN
        IF OLD.share_id LIKE 'cleanup-test-%' THEN
          RAISE EXCEPTION 'pods DELETE blocked by test trigger';
        END IF;
        RETURN OLD;
      END
      $$ LANGUAGE plpgsql`)
    await query(`CREATE TRIGGER tx_test_block_pod_delete BEFORE DELETE ON pods
                 FOR EACH ROW EXECUTE FUNCTION tx_test_block_pod_delete()`)

    try {
      await assert.rejects(deleteAbandonedPodRecords(podId), /blocked by test trigger/)

      // Rolled back: dependent rows must still exist.
      const pools = await queryRows('SELECT id FROM card_pools WHERE pod_id = $1', [podId])
      const players = await queryRows('SELECT id FROM pod_players WHERE pod_id = $1', [podId])
      const pods = await queryRows('SELECT id FROM pods WHERE id = $1', [podId])
      assert.strictEqual(pools.length, 1, 'card_pools row restored by rollback')
      assert.strictEqual(players.length, 1, 'pod_players row restored by rollback')
      assert.strictEqual(pods.length, 1, 'pod row untouched')
    } finally {
      await query('DROP TRIGGER IF EXISTS tx_test_block_pod_delete ON pods')
      await query('DROP FUNCTION IF EXISTS tx_test_block_pod_delete()')
    }

    // Without the trigger the cleanup deletes everything atomically.
    await deleteAbandonedPodRecords(podId)
    assert.strictEqual((await queryRows('SELECT id FROM pods WHERE id = $1', [podId])).length, 0)
    assert.strictEqual((await queryRows('SELECT id FROM card_pools WHERE pod_id = $1', [podId])).length, 0)
    assert.strictEqual((await queryRows('SELECT id FROM pod_players WHERE pod_id = $1', [podId])).length, 0)
  })

  after(async () => {
    await closePool()
  })
})

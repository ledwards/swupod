// Integration tests for the leader preview phase.
//
// SPEC (plans/COMPETITIVE_SEALED_AND_DRAFT_FLOW_PLAN.md, Feature 2 + review):
//   - POST /start deals packs into phase 'leader_preview': pick_status
//     'waiting', pick_started_at NULL, no timers.
//   - A draft NEVER starts picking without the host. No timer, sweep or bot may
//     perform the transition.
//   - A pod the host abandons on the preview is CANCELLED 24 hours later, using
//     the same teardown as the host's own Cancel Draft.
//   - The host transition is atomic and idempotent: two overlapping calls (host
//     with two tabs) produce exactly one transition, and the loser must not
//     re-stamp the timer or reset a seat.
//
// Like draft-timers.test.ts these run against the local swupod_test Postgres
// and skip loudly when it is unreachable. The target database is deliberately
// NOT read from DATABASE_URL / POSTGRES_URL so a shell pointing at the Railway
// dev/prod DB can never be written to by tests.
import { describe, it, after } from 'node:test'
import assert from 'node:assert'
import { randomUUID } from 'node:crypto'

const TEST_DB_URL =
  process.env['SWUPOD_TEST_DATABASE_URL'] || 'postgresql://localhost:5432/swupod_test'

// lib/db.ts reads the connection string at module init — pin it to the test
// DB before the dynamic imports below.
process.env['DATABASE_URL'] = TEST_DB_URL
process.env['POSTGRES_URL'] = TEST_DB_URL

const db = await import('@/lib/db')
const { query, queryRow, queryRows } = db
const {
  beginPickingTransition,
  sweepStalledLeaderPreviews,
  LEADER_PREVIEW_CANCEL_AFTER_SECONDS,
} = await import('@/src/utils/draftPreview')
const { cancelDraftPod } = await import('@/src/utils/podCleanup')

let dbAvailable = false
try {
  dbAvailable = await db.testConnection()
} catch {
  dbAvailable = false
}

if (!dbAvailable) {
  console.warn(
    `⚠️  leader-preview.test.ts: test database unreachable at ${TEST_DB_URL} — skipping. ` +
    'Create it with: createdb swupod_test && POSTGRES_URL=postgresql://localhost:5432/swupod_test npx tsx scripts/migrate.ts dev --yes'
  )
}

const DAY_SECONDS = 24 * 60 * 60

function leaderCard(n: number) {
  return {
    id: `test-leader-${n}`,
    instanceId: `inst-leader-${n}`,
    name: `Test Leader ${n}`,
    set: 'TST',
    rarity: 'Common',
    type: 'Leader',
  }
}

const seededPods: string[] = []
const seededUsers: string[] = []

interface PreviewSeedOptions {
  seats?: number
  /** How long ago POST /start dealt the packs and entered the preview. */
  previewStartedSecondsAgo?: number
  /** Omit previewStartedAt entirely — a pod dealt before it was recorded. */
  omitPreviewStartedAt?: boolean
  paused?: boolean
}

interface SeededPreviewPod {
  podId: string
  shareId: string
  hostId: string
  playerIds: string[]
}

/**
 * Seed a pod in exactly the state POST /start leaves behind: active, phase
 * 'leader_preview', every seat 'waiting', pick_started_at NULL.
 */
async function seedPreviewPod(options: PreviewSeedOptions = {}): Promise<SeededPreviewPod> {
  const {
    seats = 3,
    previewStartedSecondsAgo = 0,
    omitPreviewStartedAt = false,
    paused = false,
  } = options

  const shareId = `preview-test-${randomUUID().slice(0, 8)}`
  const userIds: string[] = []
  for (let i = 0; i < seats; i++) {
    const user = await queryRow(
      `INSERT INTO users (username, email) VALUES ($1, $2) RETURNING id`,
      [`preview-test-user-${shareId}-${i}`, `preview-test-${shareId}-${i}@example.test`]
    )
    userIds.push(user!.id as string)
    seededUsers.push(user!.id as string)
  }

  const draftState: Record<string, unknown> = {
    phase: 'leader_preview',
    leaderRound: 1,
    totalPacks: 3,
    packNumber: 0,
    pickInPack: 0,
    timerStartedAt: null,
    setCode: 'TST',
  }
  if (!omitPreviewStartedAt) {
    draftState.previewStartedAt =
      new Date(Date.now() - previewStartedSecondsAgo * 1000).toISOString()
  }

  const allPacks = Array.from({ length: seats }, (_, seat) =>
    Array.from({ length: 3 }, (_, pack) => ({
      cards: Array.from({ length: 14 }, (_, c) => leaderCard(seat * 1000 + pack * 100 + c)),
    }))
  )

  const pod = await queryRow(
    `INSERT INTO pods (share_id, set_code, set_name, status, draft_state, state_version, max_players,
                       all_packs, competitive, timed, timer_enabled,
                       pick_timeout_seconds, timer_seconds, paused, paused_duration_seconds,
                       pick_started_at, started_at, host_id)
     VALUES ($1, 'TST', 'Test Set', 'active', $2, 10, $3, $4, false, true, true, 120, 30, $5, 0,
             NULL, NOW() - ($6 || ' seconds')::interval, $7)
     RETURNING id`,
    [
      shareId, JSON.stringify(draftState), seats, JSON.stringify(allPacks),
      paused, String(previewStartedSecondsAgo), userIds[0],
    ]
  )
  const podId = pod!.id as string
  seededPods.push(podId)

  const playerIds: string[] = []
  for (let seat = 0; seat < seats; seat++) {
    const player = await queryRow(
      `INSERT INTO pod_players (pod_id, user_id, seat_number, pick_status, is_bot,
                                leaders, drafted_leaders, drafted_cards, current_pack,
                                selected_card_id)
       VALUES ($1, $2, $3, 'waiting', false, $4, '[]', '[]', $5, NULL)
       RETURNING id`,
      [
        podId, userIds[seat], seat + 1,
        JSON.stringify([leaderCard(seat * 10 + 1), leaderCard(seat * 10 + 2), leaderCard(seat * 10 + 3)]),
        JSON.stringify(allPacks[seat][0].cards),
      ]
    )
    playerIds.push(player!.id as string)
  }

  return { podId, shareId, hostId: userIds[0], playerIds }
}

async function readPod(podId: string): Promise<Record<string, unknown> | null> {
  return await queryRow(
    'SELECT id, status, draft_state, state_version, pick_started_at FROM pods WHERE id = $1',
    [podId]
  )
}

async function readDraftState(podId: string): Promise<Record<string, unknown>> {
  const pod = await readPod(podId)
  const raw = pod!.draft_state
  return (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, unknown>
}

async function readPickStatuses(podId: string): Promise<string[]> {
  const rows = await queryRows(
    'SELECT pick_status FROM pod_players WHERE pod_id = $1 ORDER BY seat_number',
    [podId]
  )
  return rows.map(r => r.pick_status as string)
}

after(async () => {
  for (const podId of seededPods) {
    await query('DELETE FROM card_generations WHERE source_id = $1', [podId]).catch(() => {})
    await query('DELETE FROM pods WHERE id = $1', [podId])
  }
  for (const userId of seededUsers) {
    await query('DELETE FROM card_generations WHERE user_id = $1', [userId]).catch(() => {})
    await query('DELETE FROM users WHERE id = $1', [userId])
  }
})

describe('a draft never starts picking without the host', { skip: !dbAvailable }, () => {
  // The user's rule: hitting Ready reveals the leaders, and ONLY the host may
  // open picking. An earlier iteration auto-advanced an expired preview — that
  // is exactly the behaviour this test exists to prevent from coming back.
  it('SPEC: the sweep cancels a stalled preview, it never starts it', async () => {
    const { podId } = await seedPreviewPod({ previewStartedSecondsAgo: DAY_SECONDS + 60 })

    await sweepStalledLeaderPreviews()

    const pod = await readPod(podId)
    assert.strictEqual(pod, null, 'SPEC: the stalled pod is cancelled (deleted), not started')

    const started = await queryRows(
      `SELECT id FROM pods WHERE draft_state->>'phase' = 'leader_draft' AND id = $1`,
      [podId]
    )
    assert.strictEqual(started.length, 0, 'SPEC: no automatic path may reach leader_draft')
  })

  it('SPEC: a preview younger than 24h is left completely alone', async () => {
    const { podId } = await seedPreviewPod({ previewStartedSecondsAgo: DAY_SECONDS - 600 })

    await sweepStalledLeaderPreviews()

    const state = await readDraftState(podId)
    assert.strictEqual(state.phase, 'leader_preview', 'still waiting on the host')
    const pod = await readPod(podId)
    assert.strictEqual(pod!.pick_started_at, null, 'no timer starts during the preview')
    assert.deepStrictEqual(
      await readPickStatuses(podId), ['waiting', 'waiting', 'waiting'],
      'nobody can pick until the host says so'
    )
  })

  it(`SPEC: the cancel threshold is ${LEADER_PREVIEW_CANCEL_AFTER_SECONDS}s (24 hours)`, () => {
    assert.strictEqual(LEADER_PREVIEW_CANCEL_AFTER_SECONDS, DAY_SECONDS)
  })
})

describe('stalled leader previews are cancelled after 24 hours', { skip: !dbAvailable }, () => {
  // BUGGY (old code): once /start ran, only the host calling /begin-picking
  // could move the pod. checkAndEnforceTimeout returns early on a NULL
  // pick_started_at, bots need pick_status='picking', /leave demanded
  // status='waiting', and the abandoned-pod cleanup only sweeps lobbies — so a
  // host who closed their laptop after hitting Ready left a pod that nothing in
  // the system would ever touch again.
  it('FIXED: a pod stuck on the preview past the threshold is torn down', async () => {
    const { podId, playerIds } = await seedPreviewPod({
      previewStartedSecondsAgo: DAY_SECONDS + 3600,
    })
    await query(
      `INSERT INTO card_pools (pod_id, user_id, share_id, cards, pool_type, set_code)
       VALUES ($1, (SELECT user_id FROM pod_players WHERE id = $2), $3, '[]', 'draft', 'TST')`,
      [podId, playerIds[0], `pool-${randomUUID().slice(0, 8)}`]
    )

    const cancelled = await sweepStalledLeaderPreviews()
    assert.ok(cancelled >= 1, 'the sweep reports what it cancelled')

    assert.strictEqual(await readPod(podId), null, 'the pod is gone')
    const players = await queryRows('SELECT id FROM pod_players WHERE pod_id = $1', [podId])
    assert.strictEqual(players.length, 0, 'its seats are gone')
    const pools = await queryRows('SELECT id FROM card_pools WHERE pod_id = $1', [podId])
    assert.strictEqual(pools.length, 0, 'its card pools are gone')
  })

  it('SPEC: cancellation reuses the host Cancel Draft teardown', async () => {
    // The distinctive thing the host's cancel does beyond deleting rows is
    // re-attribute this draft's card_generations to the players who drafted
    // them, so showcases survive the pod. If that happened, the sweep genuinely
    // went through the shared path rather than a bare DELETE.
    const { podId, shareId, playerIds } = await seedPreviewPod({
      previewStartedSecondsAgo: DAY_SECONDS + 60,
    })
    const player = await queryRow('SELECT user_id FROM pod_players WHERE id = $1', [playerIds[1]])
    const ownerId = player!.user_id as string

    await query(
      `UPDATE pod_players SET drafted_leaders = $1 WHERE id = $2`,
      [JSON.stringify([leaderCard(77)]), playerIds[1]]
    )
    await query(
      `INSERT INTO card_generations (card_id, set_code, card_name, card_type, rarity,
                                     treatment, variant_type, pack_type,
                                     source_type, source_id, source_share_id, user_id)
       VALUES ($1, 'TST', 'Test Leader 77', 'Leader', 'Common',
               'base', 'Normal', 'leader', 'draft', $2, $3, NULL)`,
      [leaderCard(77).id, podId, shareId]
    )

    await sweepStalledLeaderPreviews()

    const generation = await queryRow(
      `SELECT user_id FROM card_generations WHERE source_share_id = $1 AND card_id = $2`,
      [shareId, leaderCard(77).id]
    )
    assert.strictEqual(
      generation!.user_id, ownerId,
      'SPEC: the shared teardown re-attributed the card to its drafter'
    )
  })

  it('falls back to started_at for a pod dealt before previewStartedAt was recorded', async () => {
    const stale = await seedPreviewPod({
      omitPreviewStartedAt: true, previewStartedSecondsAgo: DAY_SECONDS + 60,
    })
    const fresh = await seedPreviewPod({
      omitPreviewStartedAt: true, previewStartedSecondsAgo: 60,
    })

    await sweepStalledLeaderPreviews()

    assert.strictEqual(await readPod(stale.podId), null, 'the day-old pod is cancelled')
    assert.ok(await readPod(fresh.podId), 'the fresh pod survives')
  })

  it('cancels paused pods too — pausing is not a way to leak a pod forever', async () => {
    const { podId } = await seedPreviewPod({ previewStartedSecondsAgo: DAY_SECONDS + 60 })
    await query('UPDATE pods SET paused = true, paused_at = NOW() WHERE id = $1', [podId])

    await sweepStalledLeaderPreviews()

    assert.strictEqual(await readPod(podId), null)
  })

  it('cancelling an already-cancelled pod is a harmless no-op', async () => {
    // The host clicking Cancel Draft and the sweep firing can land together;
    // whichever loses must not throw or double-post to chat/Discord.
    const { podId } = await seedPreviewPod({ previewStartedSecondsAgo: DAY_SECONDS + 60 })

    assert.strictEqual(await cancelDraftPod(podId, 'Host', 'first'), true)
    assert.strictEqual(
      await cancelDraftPod(podId, 'Host', 'second'), false,
      'SPEC: a pod that is already gone reports "not cancelled" instead of failing'
    )
  })

  it('never touches a pod that has moved past the preview', async () => {
    const { podId } = await seedPreviewPod({ previewStartedSecondsAgo: DAY_SECONDS + 60 })
    await query(
      `UPDATE pods SET draft_state = jsonb_set(draft_state, '{phase}', '"pack_draft"')
       WHERE id = $1`,
      [podId]
    )

    await sweepStalledLeaderPreviews()

    assert.ok(await readPod(podId), 'a real draft in progress is never cancelled by this sweep')
  })
})

describe('the host transition is atomic — a second caller does nothing', { skip: !dbAvailable }, () => {
  // BUGGY (old code): the route did SELECT → validate → two separate,
  // unconditional, non-transactional UPDATEs with no rowCount check. Two
  // overlapping calls both passed validation; the second one's unconditional
  // `pick_status='picking'` reset seats the first call's bots had already moved
  // to 'selected' (leaving selected_card_id populated), so processAllStagedPicks
  // never saw "all selected" and the round stalled until the pick timer bailed
  // it out. pick_started_at was re-stamped and state_version advanced twice.
  it('FIXED: two concurrent transitions produce exactly one transition', async () => {
    const { podId, shareId } = await seedPreviewPod({ seats: 3 })

    const results = await Promise.all([
      beginPickingTransition(podId, shareId),
      beginPickingTransition(podId, shareId),
    ])

    assert.strictEqual(
      results.filter(Boolean).length, 1,
      'SPEC: exactly one caller may perform the transition'
    )
    const pod = await readPod(podId)
    assert.strictEqual(
      pod!.state_version, 11,
      'SPEC: state_version advances once, not twice'
    )
  })

  it('FIXED: the losing caller never resets a seat that has already selected', async () => {
    const { podId, shareId, playerIds } = await seedPreviewPod({ seats: 3 })

    assert.strictEqual(await beginPickingTransition(podId, shareId), true)

    // Stand in for a bot (or fast human) that selected right after picking
    // opened, before the duplicate call lands.
    await query(
      `UPDATE pod_players SET pick_status = 'selected', selected_card_id = $1 WHERE id = $2`,
      ['inst-leader-1', playerIds[0]]
    )
    const podAfterFirst = await readPod(podId)

    const second = await beginPickingTransition(podId, shareId)

    assert.strictEqual(second, false, 'SPEC: the duplicate call is a no-op')
    const statuses = await readPickStatuses(podId)
    assert.strictEqual(
      statuses[0], 'selected',
      'SPEC: a seat that already selected is left alone — resetting it strands the round'
    )
    const podAfterSecond = await readPod(podId)
    assert.strictEqual(
      podAfterSecond!.state_version, podAfterFirst!.state_version,
      'the no-op call does not bump state_version'
    )
    assert.deepStrictEqual(
      podAfterSecond!.pick_started_at, podAfterFirst!.pick_started_at,
      'SPEC: the pick timer is not restarted'
    )
  })

  it('opens every waiting seat and starts the pick timer', async () => {
    const { podId, shareId } = await seedPreviewPod({ seats: 3 })

    assert.strictEqual(await beginPickingTransition(podId, shareId), true)

    const state = await readDraftState(podId)
    assert.strictEqual(state.phase, 'leader_draft')
    assert.strictEqual(state.previewStartedAt, undefined, 'the preview stamp is dropped')
    assert.strictEqual(state.totalPacks, 3, 'every other draft_state key survives')
    const pod = await readPod(podId)
    assert.ok(pod!.pick_started_at, 'the pick timer starts, so timeouts can be enforced')
    assert.deepStrictEqual(await readPickStatuses(podId), ['picking', 'picking', 'picking'])
  })

  it('refuses to start a pod that is no longer active', async () => {
    const { podId, shareId } = await seedPreviewPod({ seats: 2 })
    await query(`UPDATE pods SET status = 'completed' WHERE id = $1`, [podId])

    assert.strictEqual(await beginPickingTransition(podId, shareId), false)
    assert.strictEqual((await readDraftState(podId)).phase, 'leader_preview')
  })
})

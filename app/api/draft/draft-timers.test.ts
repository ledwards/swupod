// Integration tests for draft timer correctness.
//
// Covers four bugs where the pick timers disagreed with what the server would
// actually enforce:
//   1. The Last Player timer never started on a human selection.
//   2. The competitive inter-pack review ate half of pick 1's allowance.
//   3. A forced pick could overwrite a selection the player had just made.
//   4. A selection could be staged against a pack that had already rotated.
//
// Like draft-advance-concurrency.test.ts these run against the local
// swupod_test Postgres and skip loudly when it is unreachable. The target
// database is deliberately NOT read from DATABASE_URL / POSTGRES_URL so a shell
// pointing at the Railway dev/prod DB can never be written to by tests.
import { describe, it, after, afterEach } from 'node:test'
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
const { processAllStagedPicks } = await import('@/src/utils/draftAdvance')
const { checkAndEnforceTimeout, sweepExpiredDraftTimers, _testSeams } =
  await import('@/src/utils/draftTimeout')
const { stageSelection, markLastPlayerStartIfNeeded } = await import('@/src/utils/draftSelection')
const { INTER_PACK_REVIEW_SECONDS } = await import('@/src/services/matchmaking/timers')

let dbAvailable = false
try {
  dbAvailable = await db.testConnection()
} catch {
  dbAvailable = false
}

if (!dbAvailable) {
  console.warn(
    `⚠️  draft-timers.test.ts: test database unreachable at ${TEST_DB_URL} — skipping. ` +
    'Create it with: createdb swupod_test && POSTGRES_URL=postgresql://localhost:5432/swupod_test npx tsx scripts/migrate.ts dev --yes'
  )
}

function packCard(n: number) {
  return {
    id: `test-card-${n}`,
    instanceId: `inst-card-${n}`,
    name: `Test Card ${n}`,
    set: 'TST',
    rarity: 'Common',
    type: 'Unit',
    cost: 2,
  }
}

const seededPods: string[] = []
const seededUsers: string[] = []

interface SeedOptions {
  /** Number of seats. Seat 0 is left 'picking'; the rest start 'selected'. */
  seats?: number
  competitive?: boolean
  packNumber?: number
  totalPacks?: number
  /** Cards dealt to each seat. */
  packSize?: number
  /** How long ago the current pick started. */
  pickStartedSecondsAgo?: number
  pickTimeoutSeconds?: number
  timerSeconds?: number
}

interface SeededPod {
  podId: string
  playerIds: string[]
}

/**
 * Seed an active pack_draft pod. Seat 0 is the straggler still 'picking';
 * every other seat has already staged a selection.
 */
async function seedPackDraftPod(options: SeedOptions = {}): Promise<SeededPod> {
  const {
    seats = 2,
    competitive = false,
    packNumber = 1,
    totalPacks = 3,
    packSize = 14,
    pickStartedSecondsAgo = 0,
    pickTimeoutSeconds = 120,
    timerSeconds = 30,
  } = options

  const shareId = `timer-test-${randomUUID().slice(0, 8)}`
  const userIds: string[] = []
  for (let i = 0; i < seats; i++) {
    const user = await queryRow(
      `INSERT INTO users (username, email) VALUES ($1, $2) RETURNING id`,
      [`timer-test-user-${shareId}-${i}`, `timer-test-${shareId}-${i}@example.test`]
    )
    userIds.push(user!.id as string)
    seededUsers.push(user!.id as string)
  }

  const draftState = { phase: 'pack_draft', packNumber, pickInPack: 1, totalPacks, setCode: 'TST' }

  // all_packs must hold a pack per seat per round so advancement can deal the
  // next one: allPacks[seat][packIndex].
  const allPacks = Array.from({ length: seats }, (_, seat) =>
    Array.from({ length: totalPacks }, (_, pack) => ({
      cards: Array.from({ length: packSize }, (_, c) => packCard(seat * 1000 + pack * 100 + c)),
    }))
  )

  const pod = await queryRow(
    `INSERT INTO pods (share_id, set_code, status, draft_state, state_version, max_players,
                       all_packs, competitive, timed, timer_enabled,
                       pick_timeout_seconds, timer_seconds, paused, paused_duration_seconds,
                       pick_started_at)
     VALUES ($1, 'TST', 'active', $2, 10, $3, $4, $5, true, true, $6, $7, false, 0,
             NOW() - ($8 || ' seconds')::interval)
     RETURNING id`,
    [
      shareId, JSON.stringify(draftState), seats, JSON.stringify(allPacks),
      competitive, pickTimeoutSeconds, timerSeconds, String(pickStartedSecondsAgo),
    ]
  )
  const podId = pod!.id as string
  seededPods.push(podId)

  const playerIds: string[] = []
  for (let seat = 0; seat < seats; seat++) {
    const pack = allPacks[seat][packNumber - 1].cards
    const isStraggler = seat === 0
    const player = await queryRow(
      `INSERT INTO pod_players (pod_id, user_id, seat_number, pick_status, is_bot,
                                leaders, drafted_leaders, drafted_cards, current_pack,
                                selected_card_id)
       VALUES ($1, $2, $3, $4, false, '[]', '[]', '[]', $5, $6)
       RETURNING id`,
      [
        podId, userIds[seat], seat,
        isStraggler ? 'picking' : 'selected',
        JSON.stringify(pack),
        isStraggler ? null : pack[0].instanceId,
      ]
    )
    playerIds.push(player!.id as string)
  }

  return { podId, playerIds }
}

async function readDraftState(podId: string): Promise<Record<string, unknown>> {
  const pod = await queryRow('SELECT draft_state FROM pods WHERE id = $1', [podId])
  const raw = pod!.draft_state
  return (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, unknown>
}

async function readPlayer(playerId: string): Promise<Record<string, unknown>> {
  return (await queryRow('SELECT * FROM pod_players WHERE id = $1', [playerId]))!
}

after(async () => {
  for (const podId of seededPods) {
    await query('DELETE FROM pods WHERE id = $1', [podId])
  }
  for (const userId of seededUsers) {
    await query('DELETE FROM users WHERE id = $1', [userId])
  }
})

describe('Last Player timer starts on any path that leaves one picker', { skip: !dbAvailable }, () => {
  // BUGGY (old code): lastPlayerStartedAt was only written inside the bot pick
  // functions, so in an all-human pod the Last Player timer never engaged and
  // checkAndEnforceTimeout had nothing to enforce — a slow human could stall
  // the pod forever.
  it('FIXED: a human selection that leaves one picker sets lastPlayerStartedAt', async () => {
    // 3 seats: seats 1 and 2 pre-selected, seat 0 still picking. Seat 1
    // re-selecting is a no-op for the count; instead make seat 2 the last one
    // by returning seat 0 to picking is unnecessary — seed leaves exactly one.
    const { podId } = await seedPackDraftPod({ seats: 3 })

    const before = await readDraftState(podId)
    assert.strictEqual(before.lastPlayerStartedAt, undefined, 'precondition: timer not yet started')

    await markLastPlayerStartIfNeeded(podId)

    const after = await readDraftState(podId)
    assert.ok(
      typeof after.lastPlayerStartedAt === 'string',
      'exactly one player picking must start the Last Player timer'
    )
    assert.ok(
      Number.isFinite(new Date(after.lastPlayerStartedAt as string).getTime()),
      'lastPlayerStartedAt must be a parseable ISO timestamp'
    )
  })

  it('does not start the timer while more than one player is still picking', async () => {
    const { podId, playerIds } = await seedPackDraftPod({ seats: 3 })
    // Return a second player to 'picking' — now two are outstanding.
    await query(`UPDATE pod_players SET pick_status = 'picking', selected_card_id = NULL WHERE id = $1`, [playerIds[1]])

    await markLastPlayerStartIfNeeded(podId)

    const state = await readDraftState(podId)
    assert.strictEqual(state.lastPlayerStartedAt, undefined, 'two pickers is not "last player"')
  })

  it('is idempotent — a second call does not restart the countdown', async () => {
    const { podId } = await seedPackDraftPod({ seats: 2 })

    await markLastPlayerStartIfNeeded(podId)
    const first = (await readDraftState(podId)).lastPlayerStartedAt

    await new Promise(resolve => setTimeout(resolve, 1100))
    await markLastPlayerStartIfNeeded(podId)
    const second = (await readDraftState(podId)).lastPlayerStartedAt

    assert.strictEqual(second, first, 'repeat calls must not extend the last player timer')
  })

  it('preserves other draft_state keys (no read-modify-write clobber)', async () => {
    const { podId } = await seedPackDraftPod({ seats: 2, packNumber: 2 })

    await markLastPlayerStartIfNeeded(podId)

    const state = await readDraftState(podId)
    assert.strictEqual(state.phase, 'pack_draft')
    assert.strictEqual(state.packNumber, 2)
    assert.strictEqual(state.setCode, 'TST')
  })
})

describe('competitive inter-pack review does not eat the next pick timer', { skip: !dbAvailable }, () => {
  // BUGGY (old code): advancing to a new pack set pick_started_at = NOW() and
  // reviewUntil = now + 30s together. Enforcement skipped during review but
  // still measured elapsed from pick_started_at, so pick 1 of packs 2 and 3 got
  // 60 - 30 = 30 seconds instead of the Appendix C 60.
  it('FIXED: the pick clock starts when the review window closes', async () => {
    // One card each: both seats select, the pack round exhausts, pack 2 deals.
    const { podId, playerIds } = await seedPackDraftPod({
      seats: 2, competitive: true, packNumber: 1, totalPacks: 3, packSize: 1,
    })
    // Seat 0 (the straggler) stages its only card so all seats are resolved.
    const straggler = await readPlayer(playerIds[0])
    const pack = straggler.current_pack as { instanceId: string }[]
    await query(
      `UPDATE pod_players SET pick_status = 'selected', selected_card_id = $1 WHERE id = $2`,
      [pack[0].instanceId, playerIds[0]]
    )

    const processed = await processAllStagedPicks(podId)
    assert.strictEqual(processed, true, 'precondition: the pack round advanced')

    const pod = await queryRow('SELECT pick_started_at, draft_state FROM pods WHERE id = $1', [podId])
    const state = (typeof pod!.draft_state === 'string'
      ? JSON.parse(pod!.draft_state as string)
      : pod!.draft_state) as Record<string, unknown>

    assert.strictEqual(state.packNumber, 2, 'precondition: dealt the next pack')
    assert.ok(state.reviewUntil, 'competitive pods get an inter-pack review window')

    const pickStartedAtMs = new Date(pod!.pick_started_at as string).getTime()
    const reviewUntilMs = new Date(state.reviewUntil as string).getTime()

    assert.strictEqual(
      pickStartedAtMs, reviewUntilMs,
      'SPEC: the pick clock must start exactly when the review window ends'
    )
    // And that is the full review window into the future, so zero of the pick
    // allowance has been consumed while the player reviews.
    assert.ok(
      pickStartedAtMs - Date.now() > (INTER_PACK_REVIEW_SECONDS - 5) * 1000,
      `SPEC: pick clock starts ~${INTER_PACK_REVIEW_SECONDS}s out, not immediately`
    )
  })

  it('non-competitive pods still start the pick clock immediately', async () => {
    const { podId, playerIds } = await seedPackDraftPod({
      seats: 2, competitive: false, packNumber: 1, totalPacks: 3, packSize: 1,
    })
    const straggler = await readPlayer(playerIds[0])
    const pack = straggler.current_pack as { instanceId: string }[]
    await query(
      `UPDATE pod_players SET pick_status = 'selected', selected_card_id = $1 WHERE id = $2`,
      [pack[0].instanceId, playerIds[0]]
    )

    await processAllStagedPicks(podId)

    const pod = await queryRow('SELECT pick_started_at, draft_state FROM pods WHERE id = $1', [podId])
    const state = (typeof pod!.draft_state === 'string'
      ? JSON.parse(pod!.draft_state as string)
      : pod!.draft_state) as Record<string, unknown>

    assert.strictEqual(state.reviewUntil, undefined, 'casual pods have no review window')
    assert.ok(
      new Date(pod!.pick_started_at as string).getTime() <= Date.now() + 1000,
      'casual pick clock starts now'
    )
  })
})

describe('a forced pick never overwrites a real selection', { skip: !dbAvailable }, () => {
  afterEach(() => {
    delete _testSeams.beforeForcePicks
  })

  it('still forces a pick for a player who genuinely did not select', async () => {
    const { podId, playerIds } = await seedPackDraftPod({
      seats: 2, packSize: 14, pickStartedSecondsAgo: 300, pickTimeoutSeconds: 120,
    })

    const enforced = await checkAndEnforceTimeout(podId)
    assert.strictEqual(enforced, true, 'an expired round timer must force picks')

    const after = await readPlayer(playerIds[0])
    const drafted = after.drafted_cards as { instanceId: string }[]
    assert.strictEqual(drafted.length, 1, 'the idle player got a card picked for them')
  })

  // BUGGY (old code): forcePackSelect/forceLeaderSelect updated unconditionally.
  // The player list is read before the enforcement lock is taken, so a human
  // selection landing in that window was silently replaced by the bot's choice.
  //
  // The seam lands the selection at exactly that point — after enforcement has
  // decided this player is idle, before it writes the forced pick.
  it('FIXED: enforcement leaves a selection made in the race window intact', async () => {
    // Control run: establish which card enforcement forces when nobody selects,
    // so the racing selection can be a demonstrably different one. Pods are
    // seeded deterministically, so the two packs hold identical card ids.
    const control = await seedPackDraftPod({
      seats: 2, packSize: 14, pickStartedSecondsAgo: 300, pickTimeoutSeconds: 120,
    })
    await checkAndEnforceTimeout(control.podId)
    const controlDrafted = (await readPlayer(control.playerIds[0])).drafted_cards as { instanceId: string }[]
    const forcedCardId = controlDrafted[0].instanceId

    const { podId, playerIds } = await seedPackDraftPod({
      seats: 2, packSize: 14, pickStartedSecondsAgo: 300, pickTimeoutSeconds: 120,
    })
    const straggler = await readPlayer(playerIds[0])
    const pack = straggler.current_pack as { instanceId: string }[]
    const chosen = pack.find(c => c.instanceId !== forcedCardId)!.instanceId

    _testSeams.beforeForcePicks = async () => {
      const staged = await stageSelection(playerIds[0], chosen, 'current_pack')
      assert.strictEqual(staged, true, 'precondition: the racing selection staged')
    }

    await checkAndEnforceTimeout(podId)

    const after = await readPlayer(playerIds[0])
    const drafted = after.drafted_cards as { instanceId: string }[]
    assert.strictEqual(drafted.length, 1, 'the round advanced and applied one pick')
    assert.strictEqual(
      drafted[0].instanceId, chosen,
      'SPEC: the player\'s own selection must win over the forced pick'
    )
    assert.notStrictEqual(
      drafted[0].instanceId, forcedCardId,
      'the forced pick was genuinely a different card — the guard did the work'
    )
  })

  it('does not enforce before the round timer expires', async () => {
    const { podId } = await seedPackDraftPod({
      seats: 2, pickStartedSecondsAgo: 5, pickTimeoutSeconds: 120,
    })

    const enforced = await checkAndEnforceTimeout(podId)
    assert.strictEqual(enforced, false, 'a live timer must not force picks')
  })
})

describe('staging a selection re-validates against the live pack', { skip: !dbAvailable }, () => {
  // BUGGY (old code): the select route validated against a snapshot read, then
  // wrote unconditionally. If enforcement advanced the draft in between, the
  // write stored a card from the *previous* pack. processAllStagedPicks then
  // silently skipped it (cardIndex < 0): the player lost their pick and the
  // pack circulated one card oversized.
  it('FIXED: a card no longer in the pack cannot be staged', async () => {
    const { podId, playerIds } = await seedPackDraftPod({ seats: 2 })
    void podId

    const staged = await stageSelection(playerIds[0], 'inst-card-does-not-exist', 'current_pack')

    assert.strictEqual(staged, false, 'SPEC: staging must fail when the card is gone')
    const player = await readPlayer(playerIds[0])
    assert.strictEqual(player.selected_card_id, null, 'no selection was written')
    assert.strictEqual(player.pick_status, 'picking', 'the player is still picking')
  })

  it('stages a card that is genuinely in the pack', async () => {
    const { playerIds } = await seedPackDraftPod({ seats: 2 })

    const before = await readPlayer(playerIds[0])
    const pack = before.current_pack as { instanceId: string }[]
    const staged = await stageSelection(playerIds[0], pack[3].instanceId, 'current_pack')

    assert.strictEqual(staged, true)
    const after = await readPlayer(playerIds[0])
    assert.strictEqual(after.selected_card_id, pack[3].instanceId)
    assert.strictEqual(after.pick_status, 'selected')
  })

  it('validates leaders against the leaders column during leader draft', async () => {
    const { podId, playerIds } = await seedPackDraftPod({ seats: 2 })
    const leaders = [
      { id: 'test-leader-1', instanceId: 'inst-leader-1', name: 'L1', set: 'TST', type: 'Leader' },
    ]
    await query(`UPDATE pod_players SET leaders = $1 WHERE id = $2`, [JSON.stringify(leaders), playerIds[0]])
    await query(`UPDATE pods SET draft_state = $1 WHERE id = $2`, [
      JSON.stringify({ phase: 'leader_draft', leaderRound: 1, totalPacks: 3, setCode: 'TST' }), podId,
    ])

    assert.strictEqual(await stageSelection(playerIds[0], 'inst-leader-1', 'leaders'), true)
    assert.strictEqual(await stageSelection(playerIds[0], 'inst-leader-9', 'leaders'), false)
  })
})

describe('server-side timer sweep runs without any connected client', { skip: !dbAvailable }, () => {
  // BUGGY (old code): checkAndEnforceTimeout only ran from the draft/state/
  // select routes. The live draft page is socket-driven, so nothing enforced a
  // timeout unless a connected client's countdown fired — and a backgrounded
  // tab has its timers throttled (mobile Safari suspends JS entirely). Rounds
  // hung at 0:00 until somebody foregrounded a tab.
  it('FIXED: forces picks for an expired pod with no client involvement', async () => {
    const { podId, playerIds } = await seedPackDraftPod({
      seats: 2, packSize: 14, pickStartedSecondsAgo: 300, pickTimeoutSeconds: 120,
    })

    const enforced = await sweepExpiredDraftTimers()
    assert.ok(enforced >= 1, 'the sweep must force picks for the expired pod')

    const after = await readPlayer(playerIds[0])
    const drafted = after.drafted_cards as { instanceId: string }[]
    assert.strictEqual(drafted.length, 1, 'the stalled round advanced on its own')
    void podId
  })

  it('leaves pods whose timer is still running alone', async () => {
    const { playerIds } = await seedPackDraftPod({
      seats: 2, pickStartedSecondsAgo: 6, pickTimeoutSeconds: 120,
    })

    await sweepExpiredDraftTimers()

    const after = await readPlayer(playerIds[0])
    const drafted = after.drafted_cards as { instanceId: string }[]
    assert.strictEqual(drafted.length, 0, 'a live timer must not be forced')
    assert.strictEqual(after.pick_status, 'picking')
  })

  it('skips paused pods', async () => {
    const { podId, playerIds } = await seedPackDraftPod({
      seats: 2, pickStartedSecondsAgo: 300, pickTimeoutSeconds: 120,
    })
    await query(`UPDATE pods SET paused = true, paused_at = NOW() WHERE id = $1`, [podId])

    await sweepExpiredDraftTimers()

    const after = await readPlayer(playerIds[0])
    assert.strictEqual(
      (after.drafted_cards as unknown[]).length, 0,
      'a paused draft must never be force-picked by the sweep'
    )
  })
})

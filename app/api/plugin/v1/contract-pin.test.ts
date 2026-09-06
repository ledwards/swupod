// Contract-pin tests for the wayfinder ⇄ swupod Swiss Practice pipeline (N4,
// 2026-07-07 arch refresh plan).
//
// The golden request/response fixtures live in
// contract/wayfinder-practice-contract.json; wayfinder commits mirror fixtures
// on its side (hand-duplicated by design — no shared package, swupod wins
// ties). Each test asserts a route accepts the pinned golden request and
// produces a response whose declared fields are present AND typed.
//
// The old-extension fixtures (new fields absent) are FIRST-CLASS: per the
// 0–48h extension publish-lag rule, prod always serves a population of old
// extension builds, so absent-field requests must keep working forever.
//
// DB-backed — skips loudly when the local test database is unreachable (same
// pattern as liveGames.claim.test.ts).
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CONTRACT_PATH = join(__dirname, '../../../../contract/wayfinder-practice-contract.json')

const TEST_DB_URL =
  process.env['SWUPOD_TEST_DATABASE_URL'] || 'postgresql://localhost:5432/swupod_test'
process.env['DATABASE_URL'] = TEST_DB_URL
process.env['POSTGRES_URL'] = TEST_DB_URL

const SERVICE_KEY = 'contract-pin-test-service-key'

const db = await import('@/lib/db')
const { query, queryRow, closePool } = db
const { claimPracticeMatchGame } = await import('@/src/services/matchmaking/liveGames')

let dbAvailable = false
try {
  dbAvailable = await db.testConnection()
  if (dbAvailable) {
    const table = await queryRow("SELECT to_regclass('public.practice_match_games') AS table_name")
    dbAvailable = Boolean(table?.['table_name'])
  }
} catch {
  dbAvailable = false
}

if (!dbAvailable) {
  console.warn(
    `contract-pin.test.ts: test database unavailable or missing practice tables at ${TEST_DB_URL} — skipping. ` +
      'Create it with: createdb swupod_test && POSTGRES_URL=postgresql://localhost:5432/swupod_test npx tsx scripts/migrate.ts dev --yes'
  )
}

// ---------------------------------------------------------------------------
// Contract loading + fixture helpers
// ---------------------------------------------------------------------------

const contract = JSON.parse(readFileSync(CONTRACT_PATH, 'utf8'))

/** Replace "{{key}}" placeholder strings using the provided context. */
function resolveFixture<T>(fixture: T, context: Record<string, string>): T {
  return JSON.parse(
    JSON.stringify(fixture).replace(/\{\{(\w+)\}\}/g, (whole, key: string) => {
      const value = context[key]
      if (value === undefined) throw new Error(`No context value for placeholder ${whole}`)
      return value
    })
  ) as T
}

/** Assert `value` matches a declared contract type like "string|null" or "array". */
function assertTyped(value: unknown, declared: string, fieldPath: string): void {
  const options = declared.split('|')
  const matches = options.some((option) => {
    switch (option) {
      case 'null':
        return value === null
      case 'array':
        return Array.isArray(value)
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value)
      case 'string':
      case 'boolean':
      case 'number':
        return typeof value === option
      default:
        throw new Error(`Unknown declared type "${option}" for ${fieldPath}`)
    }
  })
  assert.ok(
    matches,
    `${fieldPath} should be ${declared}, got ${value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value} (${JSON.stringify(value)})`
  )
}

function assertResponseData(
  data: Record<string, unknown>,
  declaredFields: Record<string, string>,
  label: string
): void {
  for (const [field, declared] of Object.entries(declaredFields)) {
    assert.ok(field in data, `${label}: response data is missing declared field "${field}"`)
    assertTyped(data[field], declared, `${label}.${field}`)
  }
}

function makeRequest(path: string, init: { method?: string; body?: unknown; key?: string | null } = {}): Request {
  const headers: Record<string, string> = { 'x-forwarded-for': '127.0.0.1' }
  if (init.key !== null) headers['authorization'] = `Bearer ${init.key ?? SERVICE_KEY}`
  if (init.body !== undefined) headers['content-type'] = 'application/json'
  return new Request(`http://localhost${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
}

// ---------------------------------------------------------------------------
// Seeding (mirrors liveGames.claim.test.ts)
// ---------------------------------------------------------------------------

interface SeededMatch {
  podId: string
  shareId: string
  matchId: string
  userIds: string[]
  poolShareIds: string[]
}

const seededPods: string[] = []
const seededUsers: string[] = []

before(() => {
  process.env['PTP_SERVICE_KEY'] = SERVICE_KEY
})

after(async () => {
  if (dbAvailable) {
    for (const podId of seededPods) {
      await query('DELETE FROM pods WHERE id = $1', [podId])
    }
    for (const userId of seededUsers) {
      await query('DELETE FROM users WHERE id = $1', [userId])
    }
    await closePool()
  }
  delete process.env['PTP_SERVICE_KEY']
})

async function seedSwissMatch(options: { competitive?: boolean; discordId?: string } = {}): Promise<SeededMatch> {
  const suffix = randomUUID().slice(0, 8)
  const userIds: string[] = []

  for (let i = 0; i < 2; i++) {
    const user = await queryRow(
      `INSERT INTO users (username, email, discord_id)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [
        `contract-pin-${suffix}-${i}`,
        `contract-pin-${suffix}-${i}@example.test`,
        i === 0 && options.discordId ? options.discordId : null,
      ]
    )
    userIds.push(user!['id'] as string)
    seededUsers.push(user!['id'] as string)
  }

  const shareId = `contract-pod-${suffix}`
  const pod = await queryRow(
    `INSERT INTO pods (share_id, host_id, set_code, status, draft_state, state_version, max_players, current_players, competitive)
     VALUES ($1, $2, 'TST', 'complete', $3, 1, 2, 2, $4)
     RETURNING id`,
    [
      shareId,
      userIds[0],
      JSON.stringify({ phase: 'matchmaking', matchmakingStatus: 'active', currentRound: 1 }),
      options.competitive ?? true,
    ]
  )
  const podId = pod!['id'] as string
  seededPods.push(podId)

  const poolShareIds: string[] = []
  for (let i = 0; i < 2; i++) {
    const poolShareId = `contract-pool-${suffix}-${i}`
    await query(
      `INSERT INTO card_pools (user_id, share_id, set_code, cards, pod_id)
       VALUES ($1, $2, 'TST', '[]', $3)`,
      [userIds[i], poolShareId, podId]
    )
    poolShareIds.push(poolShareId)
  }

  for (let seat = 0; seat < 2; seat++) {
    await query(
      `INSERT INTO pod_players (pod_id, user_id, seat_number, pick_status, is_bot, leaders, drafted_leaders, drafted_cards, current_pack)
       VALUES ($1, $2, $3, 'done', false, '[]', '[]', '[]', '[]')`,
      [podId, userIds[seat], seat + 1]
    )
  }

  const round = await queryRow(
    `INSERT INTO practice_rounds (pod_id, round_number, status)
     VALUES ($1, 1, 'active')
     RETURNING id`,
    [podId]
  )

  const match = await queryRow(
    `INSERT INTO practice_matches (round_id, pod_id, player1_id, player2_id, is_bye, final_confirmed)
     VALUES ($1, $2, $3, $4, false, false)
     RETURNING id`,
    [round!['id'], podId, userIds[0], userIds[1]]
  )

  return { podId, shareId, matchId: match!['id'] as string, userIds, poolShareIds }
}

/**
 * Placeholder context for one test run. Identifier-bearing placeholders
 * (lobby, wayfinder match/game ids) are unique per invocation because the DB
 * enforces global uniqueness on them — the contract pins the SHAPE, not the
 * literal id values.
 */
function uniqueContext(extra: Record<string, string> = {}): Record<string, string> {
  const suffix = randomUUID().slice(0, 8)
  return {
    lobbyId: `lobby-${suffix}`,
    wayfinderMatchId: `wf-match-${suffix}`,
    wayfinderGameId: `wf-game-${suffix}`,
    idempotencyKey: `idem-${suffix}`,
    ...extra,
  }
}

async function seedClaimedGame(seeded: SeededMatch): Promise<string> {
  const claim = await claimPracticeMatchGame({
    shareId: seeded.shareId,
    matchId: seeded.matchId,
    userId: seeded.userIds[0]!,
  })
  assert.ok(claim.practiceMatchGameId, 'claim should yield a practice match game id')
  return claim.practiceMatchGameId!
}

// ---------------------------------------------------------------------------
// The pins
// ---------------------------------------------------------------------------

// DB-independent: runs even when the test database is unavailable.
describe('contract pin: version', () => {
  it('pins contract version 2 — bump deliberately on any shape change and re-mirror wayfinder\'s copy', () => {
    // wayfinder's mirror test (apps/web/tests/unit/ptp-practice-contract-pin.test.ts)
    // asserts the same version, so a shape change without a re-mirror fails
    // loudly on whichever side is stale instead of drifting silently.
    assert.equal(contract.version, 2)
  })
})

describe('contract pin: POST /api/plugin/v1/practice/match-game/lifecycle', { skip: !dbAvailable }, () => {
  const spec = contract.endpoints.practiceMatchGameLifecycle

  it('accepts the golden request (all fields) and answers the declared shape', async () => {
    const { POST } = await import('./practice/match-game/lifecycle/route')
    const seeded = await seedSwissMatch()
    const gameId = await seedClaimedGame(seeded)

    const body = resolveFixture(spec.goldenRequest, uniqueContext({
      practiceMatchGameId: gameId,
      poolShareId: seeded.poolShareIds[0]!,
    }))
    const response = await POST(makeRequest(spec.path, { method: 'POST', body }) as never)
    const envelope = await response.json()

    assert.equal(response.status, 200, `expected 200, got ${response.status}: ${JSON.stringify(envelope)}`)
    assert.equal(envelope.success, true)
    assertResponseData(envelope.data, spec.responseDataFields, 'lifecycle(golden)')
    assert.equal(envelope.data.practiceMatchGameId, gameId)
    assert.equal(envelope.data.status, 'lobby_ready')
  })

  it('OLD EXTENSION: accepts the fields-absent request identically (forward-compat)', async () => {
    const { POST } = await import('./practice/match-game/lifecycle/route')
    const seeded = await seedSwissMatch()
    const gameId = await seedClaimedGame(seeded)

    const body = resolveFixture(spec.oldExtensionRequest, uniqueContext({
      practiceMatchGameId: gameId,
      poolShareId: seeded.poolShareIds[0]!,
    }))
    const response = await POST(makeRequest(spec.path, { method: 'POST', body }) as never)
    const envelope = await response.json()

    assert.equal(response.status, 200, `expected 200, got ${response.status}: ${JSON.stringify(envelope)}`)
    assertResponseData(envelope.data, spec.responseDataFields, 'lifecycle(old-extension)')
    assert.equal(envelope.data.status, 'lobby_ready')
  })

  it('rejects a request missing a required field with a 400', async () => {
    const { POST } = await import('./practice/match-game/lifecycle/route')
    const response = await POST(
      makeRequest(spec.path, { method: 'POST', body: { poolShareId: 'x', status: 'lobby_ready' } }) as never
    )
    assert.equal(response.status, 400)
  })

  it('rejects a missing/wrong service key with a 401', async () => {
    const { POST } = await import('./practice/match-game/lifecycle/route')
    const response = await POST(
      makeRequest(spec.path, { method: 'POST', body: {}, key: 'wrong-key' }) as never
    )
    assert.equal(response.status, 401)
  })
})

describe('contract pin: POST /api/plugin/v1/match/result', { skip: !dbAvailable }, () => {
  const spec = contract.endpoints.matchResult

  it('accepts the golden competitive per-game request (all identity fields)', async () => {
    const { POST } = await import('./match/result/route')
    const seeded = await seedSwissMatch()
    const gameId = await seedClaimedGame(seeded)

    const body = resolveFixture(spec.goldenCompetitiveRequest, uniqueContext({
      practiceMatchGameId: gameId,
      poolShareId: seeded.poolShareIds[0]!,
    }))
    const response = await POST(makeRequest(spec.path, { method: 'POST', body }) as never)
    const envelope = await response.json()

    assert.equal(response.status, 200, `expected 200, got ${response.status}: ${JSON.stringify(envelope)}`)
    assert.equal(envelope.success, true)
    assertResponseData(envelope.data, spec.competitiveResponseDataFields, 'matchResult(golden)')
    assert.equal(envelope.data.competitive, true)
  })

  it('OLD EXTENSION: accepts the competitive request without identity/format/replay fields', async () => {
    const { POST } = await import('./match/result/route')
    const seeded = await seedSwissMatch()
    const gameId = await seedClaimedGame(seeded)

    const body = resolveFixture(spec.oldExtensionCompetitiveRequest, uniqueContext({
      practiceMatchGameId: gameId,
      poolShareId: seeded.poolShareIds[0]!,
    }))
    const response = await POST(makeRequest(spec.path, { method: 'POST', body }) as never)
    const envelope = await response.json()

    assert.equal(response.status, 200, `expected 200, got ${response.status}: ${JSON.stringify(envelope)}`)
    assertResponseData(envelope.data, spec.competitiveResponseDataFields, 'matchResult(old-extension)')
    assert.equal(envelope.data.competitive, true)
  })

  it('OLD EXTENSION: casual single-shot result (three fields only) still logs one win', async () => {
    const { POST } = await import('./match/result/route')
    const seeded = await seedSwissMatch({ competitive: false })

    const body = resolveFixture(spec.oldExtensionCasualRequest, uniqueContext({
      poolShareId: seeded.poolShareIds[0]!,
    }))
    const response = await POST(makeRequest(spec.path, { method: 'POST', body }) as never)
    const envelope = await response.json()

    assert.equal(response.status, 200, `expected 200, got ${response.status}: ${JSON.stringify(envelope)}`)
    assertResponseData(envelope.data, spec.casualResponseDataFields, 'matchResult(casual)')

    const pool = await queryRow('SELECT wins, losses FROM card_pools WHERE share_id = $1', [
      seeded.poolShareIds[0],
    ])
    assert.equal(pool!['wins'], 1, 'old-payload casual win must increment the pool win counter')
    assert.equal(pool!['losses'], 0)
  })

  it('rejects a request missing required fields with a 400', async () => {
    const { POST } = await import('./match/result/route')
    const response = await POST(
      makeRequest(spec.path, { method: 'POST', body: { poolShareId: 'x', result: 'win' } }) as never
    )
    assert.equal(response.status, 400)
  })
})

describe('contract pin: GET /api/plugin/v1/practice/swiss-summary', { skip: !dbAvailable }, () => {
  const spec = contract.endpoints.swissSummary

  it('answers the golden query with the declared summary shape', async () => {
    const { GET } = await import('./practice/swiss-summary/route')
    const seeded = await seedSwissMatch()
    const gameId = await seedClaimedGame(seeded)

    const queryFixture = resolveFixture(spec.goldenQuery, {
      practiceMatchGameId: gameId,
      poolShareId: seeded.poolShareIds[0]!,
    }) as Record<string, string>
    const search = new URLSearchParams(queryFixture).toString()
    const response = await GET(makeRequest(`${spec.path}?${search}`) as never)
    const envelope = await response.json()

    assert.equal(response.status, 200, `expected 200, got ${response.status}: ${JSON.stringify(envelope)}`)
    assertResponseData(envelope.data, spec.responseDataFields, 'swissSummary(golden)')
    assert.ok(
      (spec.statusValues as string[]).includes(envelope.data.status),
      `summary status must be one of ${spec.statusValues}, got ${envelope.data.status}`
    )
    for (const standing of envelope.data.standings) {
      assertResponseData(standing, spec.standingFields, 'swissSummary.standing')
    }
    if (envelope.data.pairing !== null) {
      assertResponseData(envelope.data.pairing, spec.pairingFields, 'swissSummary.pairing')
    }
  })

  it('rejects a query missing required params with a 400', async () => {
    const { GET } = await import('./practice/swiss-summary/route')
    const response = await GET(makeRequest(`${spec.path}?poolShareId=x`) as never)
    assert.equal(response.status, 400)
  })
})

describe('contract pin: GET /api/private/user-data', { skip: !dbAvailable }, () => {
  const spec = contract.endpoints.userData

  it('answers the golden query with the declared envelope for a known user', async () => {
    const { GET } = await import('../../private/user-data/route')
    const discordId = `contract-discord-${randomUUID().slice(0, 8)}`
    await seedSwissMatch({ discordId })

    const queryFixture = resolveFixture(spec.goldenQuery, { discordId }) as Record<string, string>
    const search = new URLSearchParams(queryFixture).toString()
    const response = await GET(makeRequest(`${spec.path}?${search}`) as never)
    const envelope = await response.json()

    assert.equal(response.status, 200)
    assertResponseData(envelope.data, spec.responseDataFields, 'userData(golden)')
    assertResponseData(envelope.data.user, spec.userFields, 'userData.user')
    assert.equal(envelope.data.user.discordId, discordId)
    assert.ok(envelope.data.pools.length >= 1, 'seeded pool should be returned')
  })

  it('answers the pinned empty envelope for an unknown discord_id', async () => {
    const { GET } = await import('../../private/user-data/route')
    const response = await GET(
      makeRequest(`${spec.path}?discord_id=contract-unknown-${randomUUID().slice(0, 8)}`) as never
    )
    const envelope = await response.json()
    assert.equal(response.status, 200)
    assert.deepEqual(envelope.data, spec.unknownUserResponseData)
  })
})

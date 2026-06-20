// tests/e2e/live-swiss-fake-companion.spec.ts
// @ts-nocheck
// Browser-level Swiss Practice orchestration test with a fake Companion.
//
// This intentionally does not hit real Karabast. It proves the PTP browser,
// claim endpoint, lifecycle/result endpoints, socket read model, live/completed
// grouping, and Swiss advancement work together. Wayfinder should cover the real
// extension against fake Karabast in its own repo.
import { test, expect, type BrowserContext } from '@playwright/test'
import pg from 'pg'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { createTestUser, cleanupTestUsers, closeDb } from './test-utils.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '../../.env.local') })
dotenv.config({ path: join(__dirname, '../../.env') })

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000'
const SERVICE_KEY = process.env.PTP_SERVICE_KEY
const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL
const TEST_ID = `e2e_live_swiss_${Date.now()}`

function uniqueId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function serviceHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${SERVICE_KEY}`,
  }
}

test.describe.configure({ mode: 'serial' })
test.skip(
  ({ browserName, isMobile }) => browserName !== 'chromium' || isMobile,
  'Desktop Chromium only: fake Companion uses page bindings'
)
test.setTimeout(120_000)

test('fake Companion drives live Swiss from create/join through round advance', async ({ browser }) => {
  test.skip(!SERVICE_KEY, 'PTP_SERVICE_KEY not set')
  test.skip(!connectionString, 'DATABASE_URL or POSTGRES_URL not set')

  const db = new pg.Pool({ connectionString })
  let fixture: LiveSwissFixture | null = null
  let playerAContext: BrowserContext | null = null
  let playerCContext: BrowserContext | null = null

  try {
    fixture = await createLiveSwissFixture(db)
    const captured: CapturedIntent[] = []

    playerAContext = await browser.newContext()
    playerCContext = await browser.newContext()
    await loginContext(playerAContext, fixture.players[0])
    await loginContext(playerCContext, fixture.players[2])
    await installFakeCompanion(playerAContext, captured)
    await installFakeCompanion(playerCContext, captured)

    const playerAPage = await playerAContext.newPage()
    const playerCPage = await playerCContext.newPage()

    await playerAPage.goto(`${BASE_URL}/pool/${fixture.poolShareIds[0]}/deck/play?wayfinder=1`)
    await playerCPage.goto(`${BASE_URL}/pool/${fixture.poolShareIds[2]}/deck/play?wayfinder=1`)

    const playerAMatch = playerAPage.locator(`[data-testid="match-card-${fixture.matchIds[0]}"]`)
    const playerCMatch = playerCPage.locator(`[data-testid="match-card-${fixture.matchIds[0]}"]`)
    await expect(playerAMatch).toBeVisible()
    await expect(playerCMatch).toBeVisible()

    await playerAMatch.getByRole('button', { name: /Play Game/i }).click()

    const createIntent = await waitForIntent(captured, 'wayfinder:practice-create-game')
    expect(createIntent.practiceMatchGameId).toBeTruthy()
    expect(createIntent.matchId).toBe(fixture.matchIds[0])
    expect(createIntent.poolShareId).toBe(fixture.poolShareIds[0])

    await postLifecycle({
      practiceMatchGameId: createIntent.practiceMatchGameId,
      poolShareId: fixture.poolShareIds[0],
      status: 'lobby_ready',
      lobbyId: 'fake-karabast-r1m1',
      lobbyUrl: 'https://fake-karabast.test/lobby/r1m1',
      spectateUrl: 'https://fake-karabast.test/watch/r1m1',
      wayfinderMatchId: 'wf-e2e-r1m1',
      lifecycleIdempotencyKey: 'e2e-r1m1-lobby-ready',
    })

    await expect(playerCMatch.getByRole('button', { name: /Join Game/i })).toBeVisible({ timeout: 15_000 })
    await playerCMatch.getByRole('button', { name: /Join Game/i }).click()

    const joinIntent = await waitForIntent(captured, 'wayfinder:practice-join-game')
    expect(joinIntent.practiceMatchGameId).toBe(createIntent.practiceMatchGameId)
    expect(joinIntent.lobbyUrl).toBe('https://fake-karabast.test/lobby/r1m1')

    await postLifecycle({
      practiceMatchGameId: createIntent.practiceMatchGameId,
      poolShareId: fixture.poolShareIds[2],
      status: 'in_progress',
      wayfinderGameId: 'wf-game-e2e-r1m1-g1',
      lifecycleIdempotencyKey: 'e2e-r1m1-in-progress',
    })

    await expect(playerAMatch).toHaveAttribute('data-live-game-status', 'in_progress', { timeout: 15_000 })

    await postResult({
      poolShareId: fixture.poolShareIds[0],
      result: 'win',
      matchId: 'wf-e2e-r1m1',
      practiceMatchGameId: createIntent.practiceMatchGameId,
      gameNumber: 1,
      wayfinderGameId: 'wf-game-e2e-r1m1-g1',
      replayUrl: 'https://wayfinder.example/replay/e2e-r1m1-g1',
    })
    await postResult({
      poolShareId: fixture.poolShareIds[0],
      result: 'win',
      matchId: 'wf-e2e-r1m1',
      gameNumber: 2,
      wayfinderGameId: 'wf-game-e2e-r1m1-g2',
      replayUrl: 'https://wayfinder.example/replay/e2e-r1m1-g2',
    })

    await expect(
      playerAPage.locator(`.matchmaking-round-match-group--completed [data-testid="match-card-${fixture.matchIds[0]}"]`)
    ).toBeVisible({ timeout: 15_000 })

    await postResult({
      poolShareId: fixture.poolShareIds[1],
      result: 'win',
      matchId: 'wf-e2e-r1m2',
      gameNumber: 1,
      replayUrl: 'https://wayfinder.example/replay/e2e-r1m2-g1',
    })
    await postResult({
      poolShareId: fixture.poolShareIds[1],
      result: 'win',
      matchId: 'wf-e2e-r1m2',
      gameNumber: 2,
      replayUrl: 'https://wayfinder.example/replay/e2e-r1m2-g2',
    })

    await expect(playerAPage.locator('[data-testid="matchmaking-panel"]')).toHaveAttribute('data-current-round', '2', { timeout: 15_000 })
    await expect(playerAPage.locator('[data-testid="matchmaking-round-section-2"]')).toBeVisible()

    const roundTwoPairings = await getRoundPairings(db, fixture.podId, 2)
    expect(roundTwoPairings).toEqual([
      playerPairKey(fixture.userIds[0], fixture.userIds[1]),
      playerPairKey(fixture.userIds[2], fixture.userIds[3]),
    ].sort())
  } finally {
    await playerAContext?.close()
    await playerCContext?.close()
    if (fixture) {
      await cleanupLiveSwissFixture(db, fixture.podId)
    }
    await db.end()
    await cleanupTestUsers(TEST_ID)
    await closeDb()
  }
})

interface CapturedIntent {
  type: string
  [key: string]: unknown
}

interface LiveSwissFixture {
  podId: string
  podShareId: string
  players: Awaited<ReturnType<typeof createTestUser>>[]
  userIds: string[]
  poolShareIds: string[]
  matchIds: string[]
}

async function installFakeCompanion(context: BrowserContext, captured: CapturedIntent[]) {
  await context.exposeBinding('ptpFakeCompanionCapture', async (_source, payload: CapturedIntent) => {
    captured.push(payload)
  })
  await context.addInitScript(() => {
    const meta = document.createElement('meta')
    meta.name = 'wayfinder-installed'
    meta.content = 'true'
    document.documentElement.appendChild(meta)
    window.addEventListener('message', event => {
      if (event.source !== window) return
      const payload = event.data
      if (
        payload?.type === 'wayfinder:practice-create-game' ||
        payload?.type === 'wayfinder:practice-join-game'
      ) {
        window.ptpFakeCompanionCapture(payload)
      }
    })
  })
}

async function waitForIntent(captured: CapturedIntent[], type: string): Promise<CapturedIntent> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < 10_000) {
    const intent = captured.find(item => item.type === type)
    if (intent) return intent
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  throw new Error(`Timed out waiting for ${type}`)
}

async function loginContext(context: BrowserContext, player: Awaited<ReturnType<typeof createTestUser>>) {
  await context.addCookies([{
    name: player.cookieName,
    value: player.token,
    url: BASE_URL,
  }])
}

async function cleanupLiveSwissFixture(db: pg.Pool, podId: string) {
  await db.query('DELETE FROM practice_match_games WHERE pod_id = $1', [podId])
  await db.query('DELETE FROM practice_matches WHERE pod_id = $1', [podId])
  await db.query('DELETE FROM practice_rounds WHERE pod_id = $1', [podId])
}

async function createLiveSwissFixture(db: pg.Pool): Promise<LiveSwissFixture> {
  const players = await Promise.all([
    createTestUser('LiveA', TEST_ID, { isBetaTester: true }),
    createTestUser('LiveB', TEST_ID, { isBetaTester: true }),
    createTestUser('LiveC', TEST_ID, { isBetaTester: true }),
    createTestUser('LiveD', TEST_ID, { isBetaTester: true }),
  ])
  const userIds = players.map(player => player.user.id)
  const podShareId = uniqueId('live-swiss-pod')
  const pod = await db.query(
    `INSERT INTO pods (
       share_id,
       host_id,
       set_code,
       set_name,
       name,
       status,
       max_players,
       current_players,
       competitive,
       draft_state,
       state_version,
       box_packs,
       is_public
     )
     VALUES ($1, $2, 'SOR', 'Spark of Rebellion', 'Live Swiss Fake Companion', 'active',
       4, 4, true, $3::jsonb, 1, '[]'::jsonb, false)
     RETURNING id`,
    [
      podShareId,
      userIds[0],
      JSON.stringify({
        phase: 'matchmaking',
        matchmakingStatus: 'active',
        currentRound: 1,
      }),
    ]
  )
  const podId = pod.rows[0].id as string

  const poolShareIds: string[] = []
  for (let i = 0; i < userIds.length; i++) {
    const poolShareId = uniqueId(`live-swiss-pool-${i}`)
    await db.query(
      `INSERT INTO card_pools (
         share_id,
         pod_id,
         user_id,
         set_code,
         pool_type,
         cards,
         deck_builder_state,
         wins,
         losses,
         draws,
         wayfinder_match_ids,
         created_at,
         updated_at
       )
       VALUES ($1, $2, $3, 'SOR', 'draft', '[]'::jsonb, $4::jsonb, 0, 0, 0, '{}', NOW(), NOW())`,
      [
        poolShareId,
        podId,
        userIds[i],
        JSON.stringify({
          cardPositions: {},
          poolName: `Live Swiss Browser Deck ${i + 1}`,
        }),
      ]
    )
    poolShareIds.push(poolShareId)
  }

  for (let seat = 0; seat < userIds.length; seat++) {
    await db.query(
      `INSERT INTO pod_players (
         pod_id,
         user_id,
         seat_number,
         pick_status,
         is_bot,
         leaders,
         drafted_leaders,
         drafted_cards,
         current_pack
       )
       VALUES ($1, $2, $3, 'done', false, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb)`,
      [podId, userIds[seat], seat + 1]
    )
  }

  const round = await db.query(
    `INSERT INTO practice_rounds (pod_id, round_number, status, created_at)
     VALUES ($1, 1, 'active', NOW())
     RETURNING id`,
    [podId]
  )
  const roundId = round.rows[0].id as string
  const matchOne = await createPracticeMatch(db, roundId, podId, userIds[0], userIds[2])
  const matchTwo = await createPracticeMatch(db, roundId, podId, userIds[1], userIds[3])

  return {
    podId,
    podShareId,
    players,
    userIds,
    poolShareIds,
    matchIds: [matchOne, matchTwo],
  }
}

async function createPracticeMatch(
  db: pg.Pool,
  roundId: string,
  podId: string,
  player1Id: string,
  player2Id: string
): Promise<string> {
  const match = await db.query(
    `INSERT INTO practice_matches (
       round_id,
       pod_id,
       player1_id,
       player2_id,
       is_bye,
       final_confirmed,
       created_at
     )
     VALUES ($1, $2, $3, $4, false, false, NOW())
     RETURNING id`,
    [roundId, podId, player1Id, player2Id]
  )
  return match.rows[0].id as string
}

async function postLifecycle(body: Record<string, unknown>) {
  const response = await fetch(`${BASE_URL}/api/plugin/v1/practice/match-game/lifecycle`, {
    method: 'POST',
    headers: serviceHeaders(),
    body: JSON.stringify(body),
  })
  expect(response.ok, await response.text()).toBe(true)
}

async function postResult(body: Record<string, unknown>) {
  const response = await fetch(`${BASE_URL}/api/plugin/v1/match/result`, {
    method: 'POST',
    headers: serviceHeaders(),
    body: JSON.stringify(body),
  })
  expect(response.ok, await response.text()).toBe(true)
}

async function getRoundPairings(db: pg.Pool, podId: string, roundNumber: number): Promise<string[]> {
  const rows = await db.query(
    `SELECT pm.player1_id, pm.player2_id
     FROM practice_matches pm
     JOIN practice_rounds pr ON pr.id = pm.round_id
     WHERE pm.pod_id = $1 AND pr.round_number = $2 AND pm.is_bye = false
     ORDER BY pm.created_at`,
    [podId, roundNumber]
  )
  return rows.rows
    .map(row => playerPairKey(row.player1_id, row.player2_id))
    .sort()
}

function playerPairKey(player1Id?: string | null, player2Id?: string | null): string {
  return [player1Id, player2Id].filter(Boolean).sort().join(':')
}

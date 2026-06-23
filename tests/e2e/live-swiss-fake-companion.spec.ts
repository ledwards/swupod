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
import { seedLiveSwissPod, cleanupLiveSwissPod } from '../../lib/testFixtures/liveSwiss.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '../../.env.local') })
dotenv.config({ path: join(__dirname, '../../.env') })

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000'
const SERVICE_KEY = process.env.PTP_SERVICE_KEY
const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL
const TEST_ID = `e2e_live_swiss_${Date.now()}`

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

    await playerAPage.goto(`${BASE_URL}/pool/${fixture.poolShareIds[0]}/deck/play?wfcap=ready`)
    await playerCPage.goto(`${BASE_URL}/pool/${fixture.poolShareIds[2]}/deck/play?wfcap=ready`)

    const playerAMatch = playerAPage.locator(`[data-testid="match-card-${fixture.matchIds[0]}"]`)
    const playerCMatch = playerCPage.locator(`[data-testid="match-card-${fixture.matchIds[0]}"]`)
    await expect(playerAMatch).toBeVisible({ timeout: 30_000 })
    await expect(playerCMatch).toBeVisible({ timeout: 30_000 })

    // The live action button is icon-only ("Play") / "Join"; drive + assert off
    // the card's `data-live-game-action` attribute + `.match-card-live-button`
    // class rather than the label text, which has changed before.
    await expect(playerAMatch).toHaveAttribute('data-live-game-action', 'play', { timeout: 15_000 })
    await playerAMatch.locator('.match-card-live-button').click()

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

    await expect(playerCMatch).toHaveAttribute('data-live-game-action', 'join', { timeout: 15_000 })
    await playerCMatch.locator('.match-card-live-button').click()

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
    // Register the intent capture FIRST. The install marker below can throw at
    // document_start (document.documentElement is null before the <html> element
    // exists), and that must not prevent the message listener from attaching.
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
    // Best-effort install marker for a CAPABLE Companion. Detection + the
    // practice-live capability are forced via ?wfcap=ready, so this is
    // belt-and-suspenders — guard against a null root and dedupe.
    const addMarker = () => {
      if (document.querySelector('meta[name="wayfinder-installed"]')) return
      const root = document.documentElement || document.head || document.body
      if (!root) return
      const meta = document.createElement('meta')
      meta.name = 'wayfinder-installed'
      meta.content = 'true'
      meta.setAttribute('data-capabilities', 'ptp-practice-live')
      root.appendChild(meta)
    }
    if (document.documentElement) addMarker()
    else document.addEventListener('DOMContentLoaded', addMarker)
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
  await cleanupLiveSwissPod((text, params) => db.query(text, params), { podId })
}

async function createLiveSwissFixture(db: pg.Pool): Promise<LiveSwissFixture> {
  const players = await Promise.all([
    createTestUser('LiveA', TEST_ID, { isBetaTester: true }),
    createTestUser('LiveB', TEST_ID, { isBetaTester: true }),
    createTestUser('LiveC', TEST_ID, { isBetaTester: true }),
    createTestUser('LiveD', TEST_ID, { isBetaTester: true }),
  ])
  const userIds = players.map(player => player.user.id)
  const seeded = await seedLiveSwissPod((text, params) => db.query(text, params), { userIds })

  return {
    podId: seeded.podId,
    podShareId: seeded.podShareId,
    players,
    userIds,
    poolShareIds: seeded.poolShareIds,
    matchIds: seeded.matches.map(match => match.matchId),
  }
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

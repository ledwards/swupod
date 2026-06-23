// tests/e2e/live-swiss-manual-lobby-recovery.spec.ts
// @ts-nocheck
// Browser-level Swiss Practice RECOVERY test with a fake Companion.
//
// Reproduces the real-world symptom: the auto-create of the Karabast lobby
// FAILS (the extension reports `failed`), the player then makes the lobby BY
// HAND, and the extension reports `lobby_ready` for that manual lobby. The
// opponent MUST then see a working "Join Game" button pointing at the manual
// lobby. Before the fix this never happened — the failed game was terminal and
// the manual lobby was never surfaced, so "other player does not see new lobby".
//
// This is the PTP-side half of the pair. The extension-side guarantees (a manual
// lobby is observed + reported as lobby_ready, and a Karabast-tab refresh keeps
// the practice context alive) are covered by the Wayfinder harness tests in
// karabast-ptp-practice.test.ts. Here we prove the read model + Join button.
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
const TEST_ID = `e2e_manual_lobby_${Date.now()}`

const MANUAL_LOBBY_ID = 'manual-karabast-r1m1'
const MANUAL_LOBBY_URL = 'https://fake-karabast.test/lobby/manual-r1m1'

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
test.setTimeout(180_000)

test('manual lobby after auto-create failure is surfaced to the opponent as Join Game', async ({ browser }) => {
  test.skip(!SERVICE_KEY, 'PTP_SERVICE_KEY not set')
  test.skip(!connectionString, 'DATABASE_URL or POSTGRES_URL not set')

  const db = new pg.Pool({ connectionString })
  let fixture: LiveSwissFixture | null = null
  let creatorContext: BrowserContext | null = null
  let opponentContext: BrowserContext | null = null

  try {
    fixture = await createLiveSwissFixture(db)
    const captured: CapturedIntent[] = []

    creatorContext = await browser.newContext()
    opponentContext = await browser.newContext()
    await loginContext(creatorContext, fixture.players[0])
    await loginContext(opponentContext, fixture.players[2])
    await installFakeCompanion(creatorContext, captured)
    await installFakeCompanion(opponentContext, captured)

    const creatorPage = await creatorContext.newPage()
    const opponentPage = await opponentContext.newPage()

    await creatorPage.goto(`${BASE_URL}/pool/${fixture.poolShareIds[0]}/deck/play?wfcap=ready`)
    await opponentPage.goto(`${BASE_URL}/pool/${fixture.poolShareIds[2]}/deck/play?wfcap=ready`)

    const t0 = Date.now()
    const step = (label: string) => console.log(`[recovery-test] ${label} +${Date.now() - t0}ms`)

    const creatorMatch = creatorPage.locator(`[data-testid="match-card-${fixture.matchIds[0]}"]`)
    const opponentMatch = opponentPage.locator(`[data-testid="match-card-${fixture.matchIds[0]}"]`)
    await expect(creatorMatch).toBeVisible({ timeout: 30_000 })
    await expect(opponentMatch).toBeVisible({ timeout: 30_000 })
    step('both match cards visible')

    // The match card exposes its live action as `data-live-game-action`
    // ('play' | 'join' | 'retry' | 'waiting' | …) and the button as
    // `.match-card-live-button`. We drive + assert off those rather than the
    // button label, which is icon-only ("Play") / "Join" and has changed before.
    const creatorButton = creatorMatch.locator('.match-card-live-button')
    const opponentButton = opponentMatch.locator('.match-card-live-button')

    // 1) Creator hits Play — extension intent carries the game id.
    await expect(creatorMatch).toHaveAttribute('data-live-game-action', 'play', { timeout: 15_000 })
    await creatorButton.click()

    const createIntent = await waitForIntent(captured, 'wayfinder:practice-create-game')
    expect(createIntent.practiceMatchGameId).toBeTruthy()
    const practiceMatchGameId = createIntent.practiceMatchGameId
    step('create intent captured')

    // 2) Auto-create FAILS. The extension reports `failed`. The opponent must NOT
    //    be offered a (broken) Join — the failed state falls back to a plain
    //    play/retry action, never 'join'.
    await postLifecycle({
      practiceMatchGameId,
      poolShareId: fixture.poolShareIds[0],
      status: 'failed',
      failureReason: 'Create Lobby tab not found',
      lifecycleIdempotencyKey: 'manual-r1m1-failed',
    })
    step('failed posted')

    // After the failure the opponent settles on the play/retry action, never join.
    await expect(opponentMatch).toHaveAttribute('data-live-game-action', 'play', { timeout: 15_000 })
    step('confirmed no Join offered after failure (action=play)')

    // 3) Creator builds the lobby BY HAND. The extension observes the lobby and
    //    reports `lobby_ready` for it. PTP recovery ("newest lobby wins") opens a
    //    fresh attempt on the terminal game rather than rejecting the transition.
    const recovery = await postLifecycle({
      practiceMatchGameId,
      poolShareId: fixture.poolShareIds[0],
      status: 'lobby_ready',
      lobbyId: MANUAL_LOBBY_ID,
      lobbyUrl: MANUAL_LOBBY_URL,
      spectateUrl: 'https://fake-karabast.test/watch/manual-r1m1',
      wayfinderMatchId: 'wf-e2e-manual-r1m1',
      lifecycleIdempotencyKey: 'manual-r1m1-lobby-ready',
    })
    // Recovery opens a FRESH attempt off the terminal game ("newest lobby wins").
    // The route wraps results as { success, data: {...} }.
    const recovered = (recovery?.data ?? {}) as Record<string, unknown>
    expect(recovered.previousStatus).toBe('failed')
    expect(recovered.status).toBe('lobby_ready')
    expect(recovered.practiceMatchGameId).toBeTruthy()
    step(`lobby_ready recovery fired (failed -> lobby_ready) game ${recovered.practiceMatchGameId}`)

    // 4) The opponent now sees a JOIN action — pointing at the MANUAL lobby. This
    //    is the whole point: before the fix the failed game stayed terminal and
    //    the manually-made lobby was never surfaced to the opponent.
    await expect(opponentMatch).toHaveAttribute('data-live-game-action', 'join', { timeout: 20_000 })
    step('opponent sees Join action')
    await opponentButton.click()

    const joinIntent = await waitForIntent(captured, 'wayfinder:practice-join-game')
    expect(joinIntent.lobbyUrl).toBe(MANUAL_LOBBY_URL)
    expect(joinIntent.practiceMatchGameId).toBeTruthy()
    step('join intent carries the manual lobby URL')
  } finally {
    // Defensive teardown: a body assertion failure must NOT be masked by a
    // context-already-closed error during cleanup.
    try { await creatorContext?.close() } catch {}
    try { await opponentContext?.close() } catch {}
    if (fixture) {
      try { await cleanupLiveSwissFixture(db, fixture.podId) } catch {}
    }
    try { await db.end() } catch {}
    try { await cleanupTestUsers(TEST_ID) } catch {}
    try { await closeDb() } catch {}
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
    createTestUser('ManualA', TEST_ID, { isBetaTester: true }),
    createTestUser('ManualB', TEST_ID, { isBetaTester: true }),
    createTestUser('ManualC', TEST_ID, { isBetaTester: true }),
    createTestUser('ManualD', TEST_ID, { isBetaTester: true }),
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

async function postLifecycle(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(`${BASE_URL}/api/plugin/v1/practice/match-game/lifecycle`, {
    method: 'POST',
    headers: serviceHeaders(),
    body: JSON.stringify(body),
  })
  const text = await response.text()
  expect(response.ok, text).toBe(true)
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return {}
  }
}

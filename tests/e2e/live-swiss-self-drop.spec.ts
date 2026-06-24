// tests/e2e/live-swiss-self-drop.spec.ts
// @ts-nocheck
// UI-driven self-drop during Swiss Practice.
//
// Every action goes through the browser: a non-host player opens their play
// page, clicks "Drop from event", and confirms in the modal. We then assert the
// observable consequences in their own UI — their match is recorded as a loss to
// the opponent, the "you dropped" note appears, and the standings flag them as
// dropped. The round-advance / bye-after-drop invariants are proven
// deterministically by the DB-backed service test (drops.test.ts); here we prove
// the wiring from button to backend to socket read model.
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
const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL
const TEST_ID = `e2e_self_drop_${Date.now()}`

test.describe.configure({ mode: 'serial' })
test.skip(
  ({ browserName, isMobile }) => browserName !== 'chromium' || isMobile,
  'Desktop Chromium only'
)
test.setTimeout(120_000)

test('a non-host player self-drops through the UI and is recorded as a loss + flagged dropped', async ({ browser }) => {
  test.skip(!connectionString, 'DATABASE_URL or POSTGRES_URL not set')

  const db = new pg.Pool({ connectionString })
  let podId: string | null = null
  let dropperContext: BrowserContext | null = null

  try {
    // seedLiveSwissPod pairs round 1 as (user1 vs user3) and (user2 vs user4),
    // with user1 as host. We drop user3 — a non-host whose match is user1 vs user3.
    const players = await Promise.all([
      createTestUser('DropHost', TEST_ID),
      createTestUser('DropB', TEST_ID),
      createTestUser('DropC', TEST_ID),
      createTestUser('DropD', TEST_ID),
    ])
    const userIds = players.map(p => p.user.id)
    const seeded = await seedLiveSwissPod((text, params) => db.query(text, params), { userIds })
    podId = seeded.podId

    const dropper = players[2] // user3 / DropC — non-host, plays in match 1
    const opponentMatchId = seeded.matches[0].matchId // user1 vs user3

    dropperContext = await browser.newContext()
    await dropperContext.addCookies([{ name: dropper.cookieName, value: dropper.token, url: BASE_URL }])
    const page = await dropperContext.newPage()
    await page.goto(`${BASE_URL}/pool/${seeded.poolShareIds[2]}/deck/play`)

    // The panel renders and the self-drop control is available to this non-host player.
    await expect(page.locator('[data-testid="matchmaking-panel"]')).toBeVisible({ timeout: 30_000 })
    const dropButton = page.locator('[data-testid="self-drop-button"]')
    await expect(dropButton).toBeVisible({ timeout: 15_000 })

    // Drop requires confirming the danger modal — no accidental one-click drops.
    await dropButton.click()
    const confirm = page.locator('[data-testid="self-drop-confirm"]')
    await expect(confirm).toBeVisible()
    await confirm.click()

    // The socket read model updates: the dropper now sees the dropped note and
    // their open match resolved as a loss to the opponent (player1 = host wins).
    await expect(page.locator('[data-testid="self-drop-dropped-note"]')).toBeVisible({ timeout: 15_000 })

    const matchCard = page.locator(`[data-testid="match-card-${opponentMatchId}"]`)
    await expect(matchCard).toHaveAttribute('data-final-confirmed', 'true', { timeout: 15_000 })
    await expect(matchCard).toHaveAttribute('data-match-winner', 'player1')

    // The drop button is gone (replaced by the passive note) — drop is one-way.
    await expect(dropButton).toHaveCount(0)

    // Standings flag the dropped player.
    await page.locator('[data-testid="matchmaking-tab-results"]').click()
    const myStanding = page.locator(`.matchmaking-standing-row[data-player-id="${userIds[2]}"]`)
    await expect(myStanding).toHaveClass(/matchmaking-standing-row--dropped/, { timeout: 15_000 })
    await expect(myStanding.locator('.matchmaking-standing-dropped')).toHaveText(/dropped/i)
  } finally {
    await dropperContext?.close()
    if (podId) {
      await cleanupLiveSwissPod((text, params) => db.query(text, params), { podId })
    }
    await db.end()
    await cleanupTestUsers(TEST_ID)
    await closeDb()
  }
})

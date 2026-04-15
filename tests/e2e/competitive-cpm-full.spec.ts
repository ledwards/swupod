// tests/e2e/competitive-cpm-full.spec.ts
// @ts-nocheck
//
// Full UI-driven e2e test for Competitive Practice Mode (CPM).
// 8 real browser contexts. Every user action — draft creation, joining,
// picking cards, building decks, reporting matches — is a UI click.
// No fetch() calls to app API routes. No DB writes that simulate user
// actions (user creation and cleanup excepted).
//
// Spec: docs/superpowers/specs/2026-04-14-cpm-full-ui-e2e-design.md
//
// Run: npm run test:e2e -- --grep "8-player CPM"
// Override seed: CPM_SEED=12345 npm run test:e2e -- --grep "8-player CPM"
//
// Runtime: 30-90 minutes. This is intentional — the test exercises real
// timers, real socket sync, and real UI transitions across 8 tabs.
import { test, expect, chromium, Browser, BrowserContext, Page } from '@playwright/test'
import { createTestUser, cleanupTestUsers, closeDb } from './test-utils.ts'

const NUM_PLAYERS = 8
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000'
const TEST_ID = `e2e_cpm_${Date.now()}`
const SEED = Number(process.env.CPM_SEED) || 42

test.describe.configure({ mode: 'serial' })
test.skip(({ browserName, isMobile }) =>
  browserName !== 'chromium' || isMobile,
  'Skipped: Desktop Chromium only (long-running integration test)'
)
test.setTimeout(5_400_000) // 90 minutes

// ── Mulberry32 seeded PRNG ──────────────────────────────────────────────────
function mulberry32(seed: number): () => number {
  let a = seed
  return function () {
    a |= 0
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

test.describe('8-player CPM full UI flow', () => {
  let browser: Browser
  let contexts: BrowserContext[] = []
  let pages: Page[] = []
  let users: any[] = []
  let shareId: string | null = null
  let poolShareIds: (string | null)[] = []
  const rng = mulberry32(SEED)

  // Map seat number (1..8) → page index, populated after seats are read from lobby
  let seatToPageIdx = new Map<number, number>()

  test.beforeAll(async () => {
    console.log(`\n${'='.repeat(60)}`)
    console.log('Starting 8-Player CPM Full UI E2E Test')
    console.log(`Test ID: ${TEST_ID}`)
    console.log(`Seed: ${SEED}`)
    console.log(`${'='.repeat(60)}\n`)

    browser = await chromium.launch({
      headless: process.env.HEADLESS !== 'false' ? true : false,
      slowMo: 50,
    })

    for (let i = 0; i < NUM_PLAYERS; i++) {
      // Player 0 is host — needs is_admin to bypass FOP check + show the Competitive toggle
      const isHost = i === 0
      const userData = await createTestUser(`CpmP${i + 1}`, TEST_ID, {
        isBetaTester: true,
        isAdmin: isHost,
      })
      users.push(userData)

      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
      })
      contexts.push(context)

      const urlObj = new URL(BASE_URL)
      const cookieConfig: any = {
        name: userData.cookieName,
        value: userData.token,
        httpOnly: true,
        sameSite: 'Lax',
      }
      if (urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1') {
        cookieConfig.url = BASE_URL
      } else {
        cookieConfig.domain = urlObj.hostname
        cookieConfig.path = '/'
      }
      await context.addCookies([cookieConfig])

      const page = await context.newPage()
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          console.log(`  [P${i + 1} Error]:`, msg.text().slice(0, 120))
        }
      })
      pages.push(page)
      poolShareIds.push(null)
      console.log(`  ✓ Created: ${userData.user.username} (admin=${isHost})`)
    }

    console.log(`\n✓ All ${NUM_PLAYERS} test users ready\n`)
  })

  test.afterAll(async () => {
    console.log('\nCleaning up...')
    try {
      await cleanupTestUsers(TEST_ID)
    } catch (e: any) {
      console.error('Cleanup error:', e.message)
    }
    await closeDb()
    for (const context of contexts) {
      await context.close()
    }
    if (browser) {
      await browser.close()
    }
  })

  test('8-player CPM: create → draft → build decks → 3 rounds of BO3 → final standings', async () => {
    // Phases will be filled in by subsequent tasks.
    // For now, just sanity-check the harness.
    expect(pages.length).toBe(NUM_PLAYERS)
    expect(users.length).toBe(NUM_PLAYERS)
  })
})

// @ts-nocheck
/**
 * Lobby V1 Open Games E2E (U8).
 *
 * Two browser contexts drive the whole flow through the UI (never the API
 * for user actions — house rule): poster opens New Game and creates a
 * listing; joiner sees it live on the board, joins with a filtered deck
 * pick; both land on the match page. Plus Play Now instant-match and
 * either-player cancel. Deck fixtures are seeded directly (test setup, not
 * a user action).
 */
import { test, expect, chromium, Browser, BrowserContext, Page } from '@playwright/test'
import { createTestUser, cleanupTestUsers, closeDb, getPool } from './test-utils.ts'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const TEST_ID = 'lobby_og'
// Unique per run: open-game matching is strict same-set+format, so a shared
// set code would collide with listings left over from prior runs.
const RUN_SET = `E${Date.now().toString(36).slice(-6).toUpperCase()}`

async function seedDeck(userId: string, setCode: string, format: string): Promise<string> {
  const db = getPool()
  const shareId = `e2e-${TEST_ID}-${Math.random().toString(36).slice(2, 10)}`
  const pool = await db.query(
    `INSERT INTO card_pools (user_id, share_id, set_code, set_name, pool_type, cards)
     VALUES ($1, $2, $3, $4, $5, '[]'::jsonb) RETURNING id`,
    [userId, shareId, setCode, `${setCode} Set`, format]
  )
  await db.query(
    `INSERT INTO built_decks (card_pool_id, user_id, set_code, pool_type, leader, base, deck, sideboard)
     VALUES ($1, $2, $3, $4, '{}', '{}', '[]'::jsonb, '[]'::jsonb)`,
    [pool.rows[0].id, userId, setCode, format]
  )
  return shareId
}

async function newUserContext(browser: Browser, user): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport: { width: 1280, height: 900 },
  })
  await context.addCookies([{ name: user.cookieName, value: user.token, url: BASE_URL }])
  const page = await context.newPage()
  return { context, page }
}

test.describe('Lobby V1 — Open Games', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(180_000)

  let browser: Browser
  let poster, joiner
  let posterCtx: { context: BrowserContext; page: Page }
  let joinerCtx: { context: BrowserContext; page: Page }

  test.beforeAll(async () => {
    browser = await chromium.launch()
    poster = await createTestUser('LobbyPoster', TEST_ID)
    joiner = await createTestUser('LobbyJoiner', TEST_ID)
    await seedDeck(poster.user.id, RUN_SET, 'draft')
    // A wrong-format deck proves the join picker filters (R31). Seeded FIRST
    // so the joiner's most-recent deck (which Play Now uses) is the draft one.
    await seedDeck(joiner.user.id, RUN_SET, 'sealed')
    await seedDeck(joiner.user.id, RUN_SET, 'draft')
    posterCtx = await newUserContext(browser, poster)
    joinerCtx = await newUserContext(browser, joiner)
  })

  test.afterAll(async () => {
    const db = getPool()
    await db.query(
      `DELETE FROM open_games WHERE player1_id IN (SELECT id FROM users WHERE discord_id LIKE $1)
         OR player2_id IN (SELECT id FROM users WHERE discord_id LIKE $1)`,
      [`test_${TEST_ID}_%`]
    )
    await cleanupTestUsers(TEST_ID)
    await closeDb()
    await posterCtx?.context.close()
    await joinerCtx?.context.close()
    await browser?.close()
  })

  test('poster creates a public open game through New Game', async () => {
    const { page } = posterCtx
    await page.goto('/lobby')
    await page.getByRole('button', { name: 'New Game' }).click()

    // Deck picker: select the seeded draft deck.
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.locator('[role="radio"]', { hasText: RUN_SET }).first().click()
    await page.getByRole('button', { name: 'Create Game' }).click()

    // Poster lands on the match page in the waiting state.
    await page.waitForURL(/\/g\//)
    await expect(page.getByText('Waiting for an opponent')).toBeVisible()
  })

  test('joiner sees the listing live on the board and joins with a filtered deck', async () => {
    const { page } = joinerCtx
    await page.goto('/lobby')

    // The listing shows the poster + set/format badges but NEVER deck
    // identity (R29).
    const row = page.locator('.lobby-row', { hasText: 'LobbyPoster' })
    await expect(row).toBeVisible()
    await expect(row.getByText(RUN_SET, { exact: true })).toBeVisible()
    await expect(row.getByText('Draft', { exact: true })).toBeVisible()

    await row.getByRole('button', { name: 'Join' }).click()

    // Filter line proves strict matching (R31): 1 draft of 2 total decks.
    await expect(page.getByText(/1 of\s+2 eligible/)).toBeVisible()
    // The wrong-format deck is present but disabled.
    await expect(page.locator('.lobby-deck-off', { hasText: 'wrong set or format' })).toBeVisible()

    await page.locator('[role="radio"]:not(.lobby-deck-off)').first().click()
    await page.getByRole('button', { name: 'Join Game' }).click()

    // Joiner lands on the match page with both seats.
    await page.waitForURL(/\/g\//)
    await expect(page.getByText('LobbyPoster')).toBeVisible()
    await expect(page.getByText('LobbyJoiner (you)')).toBeVisible()
  })

  test('poster sees the match live (accepted) without reloading', async () => {
    const { page } = posterCtx
    // The 10s match-page poll picks up the accepted state.
    await expect(page.getByText('LobbyJoiner')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Waiting for an opponent')).not.toBeVisible()
  })

  test('either player can cancel the match (R20)', async () => {
    const { page } = joinerCtx
    await page.getByRole('button', { name: 'Cancel match' }).click()
    await expect(page.getByText(/cancelled/i).first()).toBeVisible({ timeout: 10_000 })
  })

  test('Play Now instantly matches two compatible seekers (AE1/AE2)', async () => {
    // Poster goes first: empty board → posts a seek.
    const posterPage = posterCtx.page
    await posterPage.goto('/lobby')
    await posterPage.getByRole('button', { name: 'Play Now' }).click()
    await expect(posterPage.getByText(/on the board|waiting for an opponent/i).first())
      .toBeVisible({ timeout: 15_000 })

    // Joiner's Play Now accepts the oldest compatible listing instantly.
    const joinerPage = joinerCtx.page
    await joinerPage.goto('/lobby')
    await joinerPage.getByRole('button', { name: 'Play Now' }).click()
    await joinerPage.waitForURL(/\/g\//, { timeout: 15_000 })
    await expect(joinerPage.getByText('LobbyPoster')).toBeVisible()
  })
})

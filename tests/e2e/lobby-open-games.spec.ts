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
    `INSERT INTO card_pools (user_id, share_id, set_code, set_name, pool_type, cards, deck_builder_state)
     VALUES ($1, $2, $3, $4, $5, '[]'::jsonb, $6::jsonb) RETURNING id`,
    [userId, shareId, setCode, `${setCode} Set`, format, '{"activeLeader":"pos-l","activeBase":"pos-b","cardPositions":{"pos-l":{"card":{"name":"Test Leader","isLeader":true}},"pos-b":{"card":{"name":"Test Base","isBase":true,"aspects":[]}},"pos-c1":{"card":{"id":"T_1","name":"Test Card"},"section":"deck","visible":true,"enabled":true}}}']
  )
  await db.query(
    `INSERT INTO built_decks (card_pool_id, user_id, set_code, pool_type, leader, base, deck, sideboard)
     VALUES ($1, $2, $3, $4, '{}', '{}', '[]'::jsonb, '[]'::jsonb)`,
    [pool.rows[0].id, userId, setCode, format]
  )
  return shareId
}

/**
 * Fail fast when the server at BASE_URL is not backed by the same database
 * the test fixtures are seeded into. This suite seeds users/pools/decks via
 * direct SQL (test-utils resolves DATABASE_URL || POSTGRES_URL, where
 * .env.local's DATABASE_URL silently beats a shell POSTGRES_URL), while the
 * server resolves its own env — a shared dev server whose .env.local points
 * elsewhere makes every fixture invisible and the first deck radio times out
 * 180s later with no clue. Probe: create a user THROUGH the server, then look
 * it up through the fixture pool.
 */
async function assertServerDbMatchesFixtures(): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/test/create-user`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'LobbyDbProbe', testId: TEST_ID }),
  }).catch((err: Error) => {
    throw new Error(`DB probe: cannot reach ${BASE_URL}/api/test/create-user (${err.message}) — is the server running?`)
  })
  if (!res.ok) {
    throw new Error(`DB probe: POST ${BASE_URL}/api/test/create-user returned ${res.status} — server misconfigured for E2E?`)
  }
  const json = await res.json()
  const probeId = (json.data || json).user.id
  const found = await getPool().query('SELECT 1 FROM users WHERE id = $1', [probeId])
  if (found.rowCount === 0) {
    throw new Error(
      `SERVER/TEST DATABASE MISMATCH: the server at ${BASE_URL} wrote probe user ${probeId} to a different database than the one test fixtures use ` +
        `(tests resolve DATABASE_URL || POSTGRES_URL after loading .env.local/.env). Restart the server against the tests' database, ` +
        `or point BASE_URL/TEST_BASE_URL at a server that shares it — otherwise seeded decks can never appear in the UI.`
    )
  }
}

/**
 * Wait for the match page after creating/joining a game — with recovery.
 * The shared dev server hot-reloads whenever anyone edits source (this suite
 * often runs alongside active development), and a Fast Refresh full reload of
 * /lobby cancels the client-side router.push() fired right after the POST
 * succeeds: the open_games row exists, only the navigation got eaten. Recover
 * by going straight to the match URL (users can do the same via the share
 * link). If the row does NOT exist, the action itself failed — fail loudly.
 */
async function waitForMatchPage(page: Page, seat: 'player1_id' | 'player2_id', userId: string): Promise<void> {
  try {
    await page.waitForURL(/\/g\//, { timeout: 30_000 })
  } catch {
    const row = await getPool().query(
      `SELECT share_id FROM open_games WHERE ${seat} = $1 ORDER BY created_at DESC LIMIT 1`,
      [userId]
    )
    if (row.rowCount === 0) {
      throw new Error(`No open_games row with ${seat} = ${userId} — the create/join action itself failed (not just navigation)`)
    }
    console.warn(`[lobby-open-games] router.push to /g/ was lost (dev-server reload?) — recovering via direct navigation`)
    await page.goto(`/g/${row.rows[0].share_id}`)
  }
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
    // Before seeding anything: one clear diagnostic beats a 180s timeout.
    await assertServerDbMatchesFixtures()

    browser = await chromium.launch()
    poster = await createTestUser('LobbyPoster', TEST_ID)
    joiner = await createTestUser('LobbyJoiner', TEST_ID)
    await seedDeck(poster.user.id, RUN_SET, 'draft')
    // A wrong-format deck proves the join picker filters (R31). Seeded FIRST
    // so the joiner's most-recent deck (which Play Now uses) is the draft one.
    await seedDeck(joiner.user.id, RUN_SET, 'sealed')
    await seedDeck(joiner.user.id, RUN_SET, 'draft')

    // Warm the dev server's on-demand compiles before any UI interaction, and
    // prove the seeded fixtures are visible through the server (auth + DB) so
    // a failure here is a clear message, not a deck-radio timeout at line ~90.
    const cookie = { cookie: `${poster.cookieName}=${poster.token}` }
    const [, , , deckRes] = await Promise.all([
      fetch(`${BASE_URL}/lobby`, { headers: cookie }),
      fetch(`${BASE_URL}/g/warmup-probe`, { headers: cookie }),
      fetch(`${BASE_URL}/api/open-games`, { headers: cookie }),
      fetch(`${BASE_URL}/api/open-games/eligible-decks`, { headers: cookie }),
    ])
    if (!deckRes.ok) {
      throw new Error(
        `eligible-decks returned ${deckRes.status} for a freshly seeded test user — JWT_SECRET mismatch between tests and the server at ${BASE_URL}?`
      )
    }
    const deckJson = await deckRes.json()
    const decks = (deckJson.data || deckJson).decks || []
    if (!decks.some((d: { setCode: string }) => d.setCode === RUN_SET)) {
      throw new Error(
        `Seeded ${RUN_SET} deck is not visible via ${BASE_URL}/api/open-games/eligible-decks — server and test fixtures are out of sync.`
      )
    }

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
    await page.getByRole('button', { name: 'New Lobby' }).click()

    // Deck picker: select the seeded draft deck. (RUN_SET is synthetic, so
    // the picker buckets it as "Other"/Chaos — match on the deck's leader.)
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.locator('[role="radio"]', { hasText: 'Draft' }).first().click()
    await page.getByRole('button', { name: 'Create Lobby' }).click()

    // Poster lands on the match page in the waiting state.
    await waitForMatchPage(page, 'player1_id', poster.user.id)
    await expect(page.getByText('Waiting for an opponent')).toBeVisible()
  })

  test('joiner sees the listing live on the board and joins with a filtered deck', async () => {
    const { page } = joinerCtx
    await page.goto('/lobby')

    // The listing shows the poster + set/format badges but NEVER deck
    // identity (R29).
    // 15s: the row arrives over the socket, and a shared dev server can be
    // mid-recompile — the 5s default expect timeout is too tight here.
    const row = page.locator('.lobby-row', { hasText: 'LobbyPoster' })
    await expect(row).toBeVisible({ timeout: 15_000 })
    await expect(row.getByText(RUN_SET, { exact: true })).toBeVisible()
    await expect(row.getByText('Draft', { exact: true })).toBeVisible()

    await row.getByRole('button', { name: 'Join' }).click()

    // Strict matching (R31): the subtitle counts eligible decks only, and the
    // wrong-format deck is NOT rendered at all.
    // 15s: DeckPicker fetches (and auto-retries once) on a busy dev server.
    await expect(page.getByText(/\(1 eligible\)/)).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[role="radio"]')).toHaveCount(1)

    await page.locator('[role="radio"]').first().click()
    await page.getByRole('button', { name: 'Join Lobby' }).click()

    // Joiner lands on the match page with both seats. (The host's name also
    // appears in the "waiting for X to create the lobby" note — scope to the
    // players list.)
    await waitForMatchPage(page, 'player2_id', joiner.user.id)
    await expect(page.locator('.lobby-match-players').getByText('LobbyPoster')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('LobbyJoiner (you)')).toBeVisible({ timeout: 15_000 })
  })

  test('poster sees the match live (accepted) without reloading', async () => {
    const { page } = posterCtx
    // The 10s match-page poll picks up the accepted state.
    await expect(page.getByText('LobbyJoiner')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('Waiting for an opponent')).not.toBeVisible()
  })

  test('either player can cancel the lobby (R20) — canceller returns to /lobby, opponent sees it closed', async () => {
    const { page } = joinerCtx
    await page.getByRole('button', { name: 'Cancel this lobby' }).click()
    // The canceller goes straight back to the lobby — no terminal screen.
    await page.waitForURL(/\/lobby/, { timeout: 15_000 })
    // The other player has NO dead-lobby page: they're kicked back to the
    // lobby with the "opponent cancelled" toast (socket push or 10s poll).
    await posterCtx.page.waitForURL(/\/lobby/, { timeout: 20_000 })
    await expect(posterCtx.page.getByText(/lobby was cancelled|cancelled the lobby/i).first())
      .toBeVisible({ timeout: 10_000 })
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
    await waitForMatchPage(joinerPage, 'player2_id', joiner.user.id)
    await expect(joinerPage.locator('.lobby-match-players').getByText('LobbyPoster')).toBeVisible()
  })
})

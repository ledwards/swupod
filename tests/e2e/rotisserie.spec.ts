// @ts-nocheck
import { test, expect, chromium, Browser, BrowserContext, Page } from '@playwright/test'
import { createTestUser, cleanupTestUsers, closeDb } from './test-utils.ts'
import { launchOptions } from './browser-launch'

/**
 * Rotisserie Draft E2E test
 * Tests: navigate to rotisserie → auto-create draft → lobby UI → select sets → add bot → start draft → pick a card
 *
 * Run: npx playwright test tests/e2e/rotisserie.spec.ts --workers=1
 */

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000'
const TEST_ID = `e2e_rotisserie_${Date.now()}`

test.describe.configure({ mode: 'serial' })
test.skip(({ browserName, isMobile }) =>
  browserName !== 'chromium' || isMobile,
  'Skipped: Desktop Chromium only'
)
test.setTimeout(120000) // 2 minutes

test.describe('Rotisserie Draft', () => {
  let browser: Browser
  let context: BrowserContext
  let page: Page
  let user: any
  let draftShareId: string

  test.beforeAll(async () => {
    browser = await chromium.launch(launchOptions)

    user = await createTestUser('RotisseriePlayer', TEST_ID, { isBetaTester: true })

    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    })

    const urlObj = new URL(BASE_URL)
    const cookieConfig: any = {
      name: user.cookieName,
      value: user.token,
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

    page = await context.newPage()
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`  [Error]:`, msg.text().slice(0, 300))
      }
    })

    console.log(`✓ Created beta test user: ${user.user.username}`)
  })

  test.afterAll(async () => {
    try { await cleanupTestUsers(TEST_ID) } catch (e: any) { console.error('Cleanup error:', e.message) }
    await closeDb()
    if (context) await context.close()
    if (browser) await browser.close()
  })

  test('navigating to rotisserie creates draft and redirects to lobby', async () => {
    await page.goto(`${BASE_URL}/formats/rotisserie`)

    // Should show "Creating draft..." briefly then redirect
    await page.waitForURL(/\/formats\/rotisserie\/[a-zA-Z0-9_-]+/, { timeout: 30000 })
    const url = page.url()
    expect(url).toContain('/formats/rotisserie/')

    // Extract shareId for later tests
    draftShareId = url.split('/formats/rotisserie/')[1]
    console.log(`✓ Auto-created draft and navigated to lobby: ${url}`)
  })

  test('lobby shows waiting state with set selection and host controls', async () => {
    // Wait for lobby to load
    await page.waitForLoadState('networkidle')

    // Should show "Rotisserie Draft" header
    await expect(page.locator('h1')).toHaveText('Rotisserie Draft')

    // Should show set selection grid
    await expect(page.locator('.sets-selection-section')).toBeVisible()
    await expect(page.locator('.set-card').first()).toBeVisible({ timeout: 10000 })
    const setCount = await page.locator('.set-card').count()
    expect(setCount).toBeGreaterThanOrEqual(6) // At least 6 released sets
    console.log(`✓ Found ${setCount} sets in selection grid`)

    // No sets selected by default
    const selectedSets = page.locator('.set-card.selected')
    const selectedCount = await selectedSets.count()
    expect(selectedCount).toBe(0)
    console.log(`✓ No sets selected by default`)

    // Should show players section with host
    const playersSection = page.locator('.players-section')
    await expect(playersSection).toBeVisible()
    await expect(playersSection.locator('h3')).toContainText('Players (1/')
    console.log('✓ Players section shows 1 player')

    // Host should be listed with "(You)"
    await expect(page.locator('.player-item:has-text("(You)")')).toBeVisible()
    console.log('✓ Host player shown with (You) marker')

    // Copy Shareable Link button should be visible
    await expect(page.locator('button:has-text("Copy Shareable Link")')).toBeVisible()
    console.log('✓ Copy Shareable Link button visible')

    // Add Bot button should be visible (host control)
    await expect(page.locator('button:has-text("Add Bot")')).toBeVisible()
    console.log('✓ Add Bot button visible')

    // Get Cooking button should not be visible (need 2+ players and sets)
    await expect(page.locator('.waiting-text')).toContainText('Need 2+ players')
    console.log('✓ Shows "Need 2+ players" message')
  })

  test('can toggle set selection', async () => {
    // Click first set to select it
    const setCards = page.locator('.set-card')
    await setCards.first().click()
    await page.waitForTimeout(500)

    // Should now be selected
    await expect(setCards.first()).toHaveClass(/selected/)
    console.log('✓ Selected first set')

    // Select a second set for more interesting draft
    await setCards.nth(1).click()
    await page.waitForTimeout(500)
    await expect(setCards.nth(1)).toHaveClass(/selected/)
    console.log('✓ Selected second set')
  })

  test('can add a bot player', async () => {
    const addBotButton = page.locator('button:has-text("Add Bot")')
    await addBotButton.click()
    await page.waitForTimeout(500)

    // Players section should now show 2 players
    await expect(page.locator('.players-section h3')).toContainText('Players (2/')
    console.log('✓ Bot added, now 2 players')

    // Bot should appear in player list
    await expect(page.locator('.player-item:has-text("Bot")')).toBeVisible()
    console.log('✓ Bot visible in player list')

    // Get Cooking button should now be visible
    await expect(page.locator('button:has-text("Get Cooking!")')).toBeVisible()
    console.log('✓ Get Cooking button now visible')
  })

  test('can start the draft', async () => {
    const startButton = page.locator('button:has-text("Get Cooking!")')
    await expect(startButton).toBeEnabled()
    await startButton.click()
    await page.waitForTimeout(1000)

    // Should show "Drafting Phase" in header
    await expect(page.locator('.draft-round-info')).toBeVisible({ timeout: 10000 })
    console.log('✓ Draft started, shows draft phase info')

    // Should show turn indicator
    await expect(page.locator('.turn-indicator')).toBeVisible()
    console.log('✓ Turn indicator visible')

    // Should show card pool
    await expect(page.locator('.card-pool')).toBeVisible()
    console.log('✓ Card pool visible')

    // Should have cards to pick from
    const poolCards = page.locator('.pool-card')
    const cardCount = await poolCards.count()
    expect(cardCount).toBeGreaterThan(0)
    console.log(`✓ ${cardCount} cards in pool`)

    // Should show type filter controls (Show row)
    await expect(page.locator('.type-filter-group')).toBeVisible()
    console.log('✓ Type filter controls visible')

    // Should show sort controls (Sort row)
    await expect(page.locator('.sort-group')).toBeVisible()
    console.log('✓ Sort controls visible')

    // With 2 sets, should show set filter buttons
    await expect(page.locator('.set-filter-group')).toBeVisible({ timeout: 5000 })
    console.log('✓ Set filter buttons visible (2+ sets)')
  })

  test('can pick a card when it is your turn', async () => {
    // Check if it's our turn
    const turnIndicator = page.locator('.turn-indicator')
    const turnText = await turnIndicator.textContent()

    if (turnText?.includes("your turn")) {
      // It's our turn - pick a card (click any unpicked card)
      const unpickedCard = page.locator('.pool-card:not(.picked)').first()
      await unpickedCard.click()
      await page.waitForTimeout(1000)

      // Should see our pick in the sidebar
      await expect(page.locator('.my-picks-section')).toBeVisible()
      await expect(page.locator('.my-picks-section h3')).toContainText('My Picks (1)')
      console.log('✓ Picked a card successfully')
    } else {
      // Bot goes first - wait for it to pick
      console.log('✓ Bot has first pick (waiting for bot)')
      await page.waitForTimeout(2000) // Bot picks after 500ms delay

      // After bot picks, it should be our turn
      await expect(turnIndicator).toContainText("your turn", { timeout: 5000 })
      console.log('✓ Now our turn after bot picked')
    }
  })

  test('cancel button from lobby cancels draft', async () => {
    // Create a new draft to test cancel
    await page.goto(`${BASE_URL}/formats/rotisserie`)
    await page.waitForURL(/\/formats\/rotisserie\/[a-zA-Z0-9_-]+/, { timeout: 30000 })
    await page.waitForLoadState('networkidle')

    // Find and click cancel button
    const cancelButton = page.locator('button:has-text("Cancel Draft")')
    await expect(cancelButton).toBeVisible({ timeout: 5000 })
    await cancelButton.click()

    // Wait for navigation to /formats (the formats landing page)
    await page.waitForURL(url => {
      const path = new URL(url).pathname
      return path === '/formats' || path === '/formats/'
    }, { timeout: 10000 })
    console.log('✓ Cancel navigated to /formats')
  })
})

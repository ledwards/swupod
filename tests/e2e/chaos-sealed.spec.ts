// @ts-nocheck
import { test, expect, chromium, Browser, BrowserContext, Page } from '@playwright/test'
import { createTestUser, cleanupTestUsers, closeDb } from './test-utils.ts'
import { waitForCardsToLoad } from './helpers.ts'
import { launchOptions } from './browser-launch'

/**
 * Chaos Sealed E2E test
 * Tests: navigate to chaos sealed → select 6 packs → generate pool → view cards
 *
 * Note: Run separately from chaos-draft (not in parallel) to avoid ECONNRESET
 * from dev server under concurrent pack generation load.
 * e.g.: npx playwright test tests/e2e/chaos-sealed.spec.ts --workers=1
 */

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000'
const TEST_ID = `e2e_chaos_sealed_${Date.now()}`

test.describe.configure({ mode: 'serial' })
test.skip(({ browserName, isMobile }) =>
  browserName !== 'chromium' || isMobile,
  'Skipped: Desktop Chromium only'
)
test.setTimeout(120000) // 2 minutes

test.describe('Chaos Sealed', () => {
  let browser: Browser
  let context: BrowserContext
  let page: Page
  let user: any

  test.beforeAll(async () => {
    browser = await chromium.launch(launchOptions)

    user = await createTestUser('ChaosSealedPlayer', TEST_ID, { isBetaTester: true })

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

  test('page loads and shows set selection grid', async () => {
    await page.goto(`${BASE_URL}/formats/chaos-sealed`)
    await page.waitForLoadState('networkidle')

    // Page title and subtitle visible
    await expect(page.locator('h1')).toHaveText('Chaos Sealed')
    await expect(page.locator('.chaos-sealed-subtitle')).toBeVisible()

    // Set buttons appear
    await expect(page.locator('.set-button').first()).toBeVisible({ timeout: 10000 })
    const setCount = await page.locator('.set-button').count()
    expect(setCount).toBeGreaterThanOrEqual(6)
    console.log(`✓ Found ${setCount} sets`)

    // Counter shows 0/6
    await expect(page.locator('h3').first()).toContainText('0/6')

    // Generate button is disabled
    const genButton = page.locator('button:has-text("Create Chaos")')
    await expect(genButton).toBeDisabled()
    console.log('✓ Generate button disabled with no selection')
  })

  test('select 6 packs using + button for duplicates', async () => {
    const setButtons = page.locator('.set-button')

    // Click first 3 sets once each
    await setButtons.nth(0).click()
    await page.waitForTimeout(200)
    await setButtons.nth(1).click()
    await page.waitForTimeout(200)
    await setButtons.nth(2).click()
    await page.waitForTimeout(200)
    await expect(page.locator('h3').first()).toContainText('3/6')

    // Use + button to add 3 more from the first 3 sets
    // The + buttons are inside selected set-buttons
    const plusButtons = page.locator('.set-button.selected .selection-button').filter({ hasText: '+' })
    const plusCount = await plusButtons.count()
    expect(plusCount).toBeGreaterThanOrEqual(1)

    await plusButtons.first().click()
    await page.waitForTimeout(200)
    await expect(page.locator('h3').first()).toContainText('4/6')

    // Click 2 more different sets
    await setButtons.nth(3).click()
    await page.waitForTimeout(200)
    await setButtons.nth(4).click()
    await page.waitForTimeout(200)
    await expect(page.locator('h3').first()).toContainText('6/6')

    // Selected packs tray shows 6 packs
    const selectedPacks = page.locator('.selected-pack:not(.skeleton)')
    await expect(selectedPacks).toHaveCount(6)

    // Generate button is now enabled
    const genButton = page.locator('button:has-text("Create Chaos")')
    await expect(genButton).toBeEnabled()
    console.log('✓ Selected 6 packs, generate button enabled')
  })

  test('deselect a pack by clicking it in the tray', async () => {
    const selectedPacks = page.locator('.selected-pack:not(.skeleton)')
    await selectedPacks.first().click()
    await page.waitForTimeout(200)

    await expect(page.locator('h3').first()).toContainText('5/6')

    const genButton = page.locator('button:has-text("Create Chaos")')
    await expect(genButton).toBeDisabled()

    // Re-add to get back to 6
    const setButtons = page.locator('.set-button')
    // Click an unselected set or use + on a selected one
    const plusButtons = page.locator('.set-button.selected .selection-button').filter({ hasText: '+' })
    if (await plusButtons.count() > 0) {
      await plusButtons.first().click()
    } else {
      await setButtons.nth(5).click()
    }
    await page.waitForTimeout(200)
    await expect(page.locator('h3').first()).toContainText('6/6')
    console.log('✓ Deselect and reselect works')
  })

  test('generate chaos sealed pool and view cards', async () => {
    const genButton = page.locator('button:has-text("Create Chaos")')
    await expect(genButton).toBeEnabled()
    await genButton.click()

    // Should show "Creating..." state
    await expect(page.locator('button:has-text("Creating...")')).toBeVisible({ timeout: 5000 })

    // Should navigate to /pool/<shareId>
    await page.waitForURL(/\/pool\/[a-zA-Z0-9_-]+/, { timeout: 30000 })
    const url = page.url()
    expect(url).toContain('/pool/')
    console.log(`✓ Navigated to pool: ${url}`)

    // Wait for cards to load (handles pack opening animation)
    await waitForCardsToLoad(page)
    await page.waitForTimeout(2000)

    // Should have cards visible (6 packs * 16 cards = 96)
    const cardCount = await page.locator('.card-image, .pool-card, .canvas-card').count()
    expect(cardCount).toBeGreaterThanOrEqual(80)
    console.log(`✓ Pool has ${cardCount} cards`)
  })

  test('cancel button navigates back to formats page', async () => {
    await page.goto(`${BASE_URL}/formats/chaos-sealed`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('.set-button').first()).toBeVisible({ timeout: 10000 })

    const cancelButton = page.locator('button:has-text("Cancel")')
    await cancelButton.click()

    await page.waitForURL(/\/formats$/, { timeout: 10000 })
    console.log('✓ Cancel navigated to /formats')
  })
})

// @ts-nocheck
import { test, expect, chromium, Browser, BrowserContext, Page } from '@playwright/test'
import { createTestUser, cleanupTestUsers, closeDb } from './test-utils.ts'
import { launchOptions } from './browser-launch'

/**
 * Chaos Draft E2E test
 * Tests: navigate to chaos draft → select 3 packs → create draft → land on draft lobby
 *
 * Note: Run separately from chaos-sealed (not in parallel) to avoid ECONNRESET
 * from dev server under concurrent pack generation load.
 * e.g.: npx playwright test tests/e2e/chaos-draft.spec.ts --workers=1
 */

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000'
const TEST_ID = `e2e_chaos_draft_${Date.now()}`

test.describe.configure({ mode: 'serial' })
test.skip(({ browserName, isMobile }) =>
  browserName !== 'chromium' || isMobile,
  'Skipped: Desktop Chromium only'
)
test.setTimeout(120000) // 2 minutes

test.describe('Chaos Draft', () => {
  let browser: Browser
  let context: BrowserContext
  let page: Page
  let user: any

  test.beforeAll(async () => {
    browser = await chromium.launch(launchOptions)

    user = await createTestUser('ChaosDraftPlayer', TEST_ID, { isBetaTester: true })

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
    await page.goto(`${BASE_URL}/formats/chaos-draft`)
    await page.waitForLoadState('networkidle')

    // Page title and subtitle visible
    await expect(page.locator('h1')).toHaveText('Solo Chaos Draft')
    await expect(page.locator('.chaos-draft-subtitle')).toBeVisible()

    // Set buttons appear
    await expect(page.locator('.pack-selector-button').first()).toBeVisible({ timeout: 10000 })
    const setCount = await page.locator('.pack-selector-button').count()
    expect(setCount).toBeGreaterThanOrEqual(6) // At least 6 released sets
    console.log(`✓ Found ${setCount} sets`)

    // Counter starts at zero. The total is deliberately not hardcoded — the
    // default pack count is a product decision that has already moved once
    // (chaos draft went from 3 to 4), and pinning it here just re-breaks.
    await expect(page.locator('h3').first()).toContainText(/Select \d+ Packs \(0\/\d+\)/)

    // Create button is disabled
    const createButton = page.locator('button:has-text("Create Chaos")')
    await expect(createButton).toBeDisabled()
    console.log('✓ Create button disabled with no selection')
  })

  test('select 3 packs and see them in the tray', async () => {
    // Click first 3 different sets
    const setButtons = page.locator('.pack-selector-button')

    await setButtons.nth(0).click()
    await page.waitForTimeout(200)
    await expect(page.locator('h3').first()).toContainText(/\(1\/\d+\)/)

    await setButtons.nth(1).click()
    await page.waitForTimeout(200)
    await expect(page.locator('h3').first()).toContainText('2/3')

    await setButtons.nth(2).click()
    await page.waitForTimeout(200)
    await expect(page.locator('h3').first()).toContainText('3/3')

    // Selected packs tray shows 3 packs (non-skeleton)
    const selectedPacks = page.locator('.selected-pack:not(.skeleton)')
    await expect(selectedPacks).toHaveCount(3)

    // Create button is now enabled
    const createButton = page.locator('button:has-text("Create Chaos")')
    await expect(createButton).toBeEnabled()
    console.log('✓ Selected 3 packs, create button enabled')
  })

  test('deselect a pack by clicking it in the tray', async () => {
    // Click the first selected pack to remove it
    const selectedPacks = page.locator('.selected-pack:not(.skeleton)')
    await selectedPacks.first().click()
    await page.waitForTimeout(200)

    // Should be back to 2/3
    await expect(page.locator('h3').first()).toContainText('2/3')

    // Create button disabled again
    const createButton = page.locator('button:has-text("Create Chaos")')
    await expect(createButton).toBeDisabled()

    // Re-select to get back to 3
    const setButtons = page.locator('.pack-selector-button')
    await setButtons.nth(0).click()
    await page.waitForTimeout(200)
    await expect(page.locator('h3').first()).toContainText('3/3')
    console.log('✓ Deselect and reselect works')
  })

  test('create chaos draft and navigate to draft lobby', async () => {
    const createButton = page.locator('button:has-text("Create Chaos")')
    await expect(createButton).toBeEnabled()
    await createButton.click()

    // Should show "Creating..." state
    await expect(page.locator('button:has-text("Creating...")')).toBeVisible({ timeout: 5000 })

    // Should navigate to /draft/<shareId>
    await page.waitForURL(/\/draft\/[a-zA-Z0-9_-]+/, { timeout: 30000 })
    const url = page.url()
    expect(url).toContain('/draft/')
    console.log(`✓ Navigated to draft: ${url}`)
  })

  test('cancel button navigates back to formats page', async () => {
    await page.goto(`${BASE_URL}/formats/chaos-draft`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('.pack-selector-button').first()).toBeVisible({ timeout: 10000 })

    const cancelButton = page.locator('button:has-text("Cancel")')
    await cancelButton.click()

    await page.waitForURL(/\/formats$/, { timeout: 10000 })
    console.log('✓ Cancel navigated to /formats')
  })
})

test.describe('Chaos Formats Open Access', () => {
  let browser: Browser
  let context: BrowserContext
  let page: Page

  test.beforeAll(async () => {
    browser = await chromium.launch(launchOptions)

    // Anonymous user - no auth cookie
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    })

    page = await context.newPage()
    console.log('✓ Created anonymous browser context (no auth)')
  })

  test.afterAll(async () => {
    if (context) await context.close()
    if (browser) await browser.close()
  })

  test('anonymous user can access /formats/chaos-draft', async () => {
    await page.goto(`${BASE_URL}/formats/chaos-draft`)
    await page.waitForLoadState('networkidle')

    // Should see the chaos draft UI, not 404
    await expect(page.locator('h1')).toHaveText('Solo Chaos Draft', { timeout: 10000 })
    console.log('✓ Anonymous user can access chaos draft')
  })

  test('anonymous user can access /formats/chaos-sealed', async () => {
    await page.goto(`${BASE_URL}/formats/chaos-sealed`)
    await page.waitForLoadState('networkidle')

    // Should see the chaos sealed UI, not 404
    await expect(page.locator('h1')).toHaveText('Chaos Sealed', { timeout: 10000 })
    console.log('✓ Anonymous user can access chaos sealed')
  })

  test('anonymous user can access /formats', async () => {
    await page.goto(`${BASE_URL}/formats`)
    await page.waitForLoadState('networkidle')

    // Should see formats page
    await expect(page.locator('h1')).toHaveText('Other Formats', { timeout: 10000 })
    console.log('✓ Anonymous user can access formats page')
  })
})

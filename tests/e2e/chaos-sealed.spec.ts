// @ts-nocheck
import { test, expect, chromium, Browser, BrowserContext, Page } from '@playwright/test'
import { createTestUser, cleanupTestUsers, closeDb } from './test-utils.ts'
import { waitForCardsToLoad } from './helpers.ts'
import { launchOptions } from './browser-launch'
import { requiredPackCount, trayPacks, expectSelected, duplicateButtons } from './chaos-helpers.ts'

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
  /** Slots the picker asked for, so the pool assertion scales with it. */
  let requiredPacks = 0

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
    await expect(page.locator('.pack-selector-button').first()).toBeVisible({ timeout: 10000 })
    const setCount = await page.locator('.pack-selector-button').count()
    expect(setCount).toBeGreaterThanOrEqual(6)
    console.log(`✓ Found ${setCount} sets`)

    // Counter starts at zero. The total is deliberately not hardcoded — the
    // default pack count is a product decision that has already moved once
    // (chaos draft went from 3 to 4), and pinning it here just re-breaks.
    await expect(page.locator('h3').first()).toContainText(/Select \d+ Packs \(0\/\d+\)/)

    // Generate button is disabled
    const genButton = page.locator('button:has-text("Create Chaos")')
    await expect(genButton).toBeDisabled()
    console.log('✓ Generate button disabled with no selection')
  })

  test('fill the pool, using + to take a second copy of a set', async () => {
    const setButtons = page.locator('.pack-selector-button')
    const required = await requiredPackCount(page)
    requiredPacks = required
    // Sealed always wants more slots than the three distinct sets below, which
    // is what leaves room for the duplicate this test is about.
    expect(required).toBeGreaterThan(3)

    for (let i = 0; i < 3; i++) {
      await setButtons.nth(i).click()
      await expectSelected(page, i + 1, required)
    }

    // A second copy of the first set, via its + control.
    await expect(duplicateButtons(page).first()).toBeVisible()
    await duplicateButtons(page).first().click()
    await expectSelected(page, 4, required)

    // Distinct sets for whatever slots remain. One selection so far was a
    // duplicate, so the next unused set button is at index `selected - 1`.
    for (let selected = 4; selected < required; selected++) {
      await setButtons.nth(selected - 1).click()
      await expectSelected(page, selected + 1, required)
    }

    await expect(trayPacks(page)).toHaveCount(required)

    const genButton = page.locator('button:has-text("Create Chaos")')
    await expect(genButton).toBeEnabled()
    console.log(`✓ Selected ${required} packs, generate button enabled`)
  })

  test('deselect a pack by clicking it in the tray', async () => {
    const required = await requiredPackCount(page)

    await trayPacks(page).first().click()
    await expectSelected(page, required - 1, required)

    const genButton = page.locator('button:has-text("Create Chaos")')
    await expect(genButton).toBeDisabled()

    // Put it back, so the next test starts from a complete pool.
    await duplicateButtons(page).first().click()
    await expectSelected(page, required, required)
    console.log('✓ Deselect and reselect works')
  })

  test('generate chaos sealed pool and view cards', async () => {
    const genButton = page.locator('button:has-text("Create Chaos")')
    await expect(genButton).toBeEnabled()
    await genButton.click()

    // Should show "Creating..." state
    await expect(page.locator('button:has-text("Creating...")')).toBeVisible({ timeout: 5000 })

    // The generated pool opens in a pack-opening animation on this same URL —
    // finishing or skipping it is what routes to /pool/<shareId>, so waiting on
    // the URL first would just time out with the packs sitting on screen.
    await expect(page.locator('.skip-button')).toBeVisible({ timeout: 60000 })
    await waitForCardsToLoad(page)

    // The page pushes /pool/<shareId>, which redirects a sealed pool on to
    // /sealed_pool/<shareId> — so match either.
    await page.waitForURL(/\/(sealed_)?pool\/[a-zA-Z0-9_-]+/, { timeout: 30000 })
    const url = page.url()
    expect(url).toMatch(/\/(sealed_)?pool\//)
    console.log(`✓ Navigated to pool: ${url}`)

    await waitForCardsToLoad(page)
    await page.waitForTimeout(2000)

    // A pack is 16 cards; allow slack for however the pool is rendered rather
    // than pinning a total that moves with the picker's default.
    const cardCount = await page.locator('.card-image, .pool-card, .canvas-card').count()
    expect(cardCount).toBeGreaterThanOrEqual(requiredPacks * 13)
    console.log(`✓ Pool has ${cardCount} cards`)
  })

  test('cancel button navigates back to formats page', async () => {
    await page.goto(`${BASE_URL}/formats/chaos-sealed`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('.pack-selector-button').first()).toBeVisible({ timeout: 10000 })

    const cancelButton = page.locator('button:has-text("Cancel")')
    await cancelButton.click()

    await page.waitForURL(/\/formats$/, { timeout: 10000 })
    console.log('✓ Cancel navigated to /formats')
  })
})

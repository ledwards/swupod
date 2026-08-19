// @ts-nocheck
import { settleNewPool } from './helpers.ts'
import { test, expect, chromium, Browser, BrowserContext, Page } from '@playwright/test'
import { closeDb } from './test-utils.ts'
import pg from 'pg'

/**
 * Play Page Discord Login E2E Test
 *
 * Tests that the Discord login button on the Play page:
 * 1. Is visible when user is logged out
 * 2. Has the correct href pointing to /api/auth/signin/discord (not /api/auth/login)
 * 3. Includes the correct return_to parameter for redirect after login
 *
 * This test was created to verify the fix for the broken Discord login button
 * which was using the wrong auth endpoint.
 */

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000'
const TEST_ID = `e2e_login_${Date.now()}`

test.describe.configure({ mode: 'serial' })
test.skip(({ browserName, isMobile }) =>
  browserName !== 'chromium' || isMobile,
  'Skipped: Desktop Chromium only'
)
test.setTimeout(60000)

test.describe('Play page Discord login button', () => {
  let browser: Browser
  let context: BrowserContext
  let page: Page
  let poolShareId: string | null = null

  test.beforeAll(async () => {
    console.log(`\n${'='.repeat(50)}`)
    console.log('Starting Play Page Login Test')
    console.log(`Test ID: ${TEST_ID}`)
    console.log(`${'='.repeat(50)}\n`)

    browser = await chromium.launch({
      headless: true,
      slowMo: 50,
    })

    // NO AUTH - create context without any cookies
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    })

    page = await context.newPage()
    page.on('console', msg => {
      const text = msg.text()
      if (msg.type() === 'error' && !text.includes('401')) {
        console.log(`  [Error]:`, text.slice(0, 300))
      }
    })

    console.log('✓ Browser context created WITHOUT authentication\n')
  })

  test.afterAll(async () => {
    console.log('\nCleaning up...')

    // Clean up the test pool
    if (poolShareId) {
      try {
        const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL
        if (connectionString) {
          const pool = new pg.Pool({ connectionString })
          await pool.query('DELETE FROM card_pools WHERE share_id = $1', [poolShareId])
          await pool.end()
          console.log(`✓ Deleted test pool: ${poolShareId}`)
        }
      } catch (e: any) {
        console.error('Cleanup error:', e.message)
      }
    }

    await closeDb()
    if (context) await context.close()
    if (browser) await browser.close()
  })

  test('Discord login button has correct href pointing to /api/auth/signin/discord', async () => {
    // === STEP 1: Create a sealed pool as anonymous user ===
    console.log('--- STEP 1: Creating sealed pool for test ---')
    await page.goto(`${BASE_URL}/sets`)
    await page.waitForLoadState('networkidle')

    await expect(page.locator('.sets-grid .set-card').first()).toBeVisible({ timeout: 10000 })
    await page.locator('.sets-grid .set-card').first().click()

    // Settle on the pool: dismiss the pack-opening animation and wait for the
    // row to exist, or /deck/play renders "Pool not found" and no login banner.
    poolShareId = await settleNewPool(page)
    console.log(`✓ Pool created: ${poolShareId}`)

    // === STEP 2: Navigate to Play page ===
    console.log('\n--- STEP 2: Navigate to Play page ---')
    await page.goto(`${BASE_URL}/pool/${poolShareId}/deck/play`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    console.log('✓ Navigated to Play page')

    // === STEP 3: Verify login banner is visible ===
    console.log('\n--- STEP 3: Verify login banner is visible ---')
    const loginBanner = page.locator('.login-banner')
    await expect(loginBanner).toBeVisible({ timeout: 5000 })
    console.log('✓ Login banner is visible')

    // === STEP 4: Verify login button has correct href ===
    console.log('\n--- STEP 4: Verify login button href ---')
    const loginButton = page.locator('.login-banner-button')
    await expect(loginButton).toBeVisible()
    await expect(loginButton).toContainText('Login with Discord')
    console.log('✓ Login button is visible')

    // Get the href attribute
    const href = await loginButton.getAttribute('href')
    console.log(`  Button href: ${href}`)

    // Verify it uses the CORRECT endpoint
    expect(href).toContain('/api/auth/signin/discord')
    console.log('✓ Button uses correct endpoint: /api/auth/signin/discord')

    // Verify it does NOT use the OLD broken endpoint
    expect(href).not.toContain('/api/auth/login')
    console.log('✓ Button does NOT use broken endpoint: /api/auth/login')

    // Verify it includes the return_to parameter with the correct path
    expect(href).toContain('return_to=')
    expect(href).toContain(encodeURIComponent(`/pool/${poolShareId}/deck/play`))
    console.log('✓ Button includes correct return_to parameter')

    // === STEP 5: Verify button styling (text should remain white) ===
    console.log('\n--- STEP 5: Verify button styling ---')
    const buttonColor = await loginButton.evaluate(el => getComputedStyle(el).color)
    console.log(`  Button color: ${buttonColor}`)
    // Color should be white (rgb(255, 255, 255))
    expect(buttonColor).toMatch(/rgb\(255,\s*255,\s*255\)|white/)
    console.log('✓ Button text color is white')

    // === Summary ===
    console.log('\n' + '='.repeat(50))
    console.log('TEST SUMMARY: Play Page Discord Login Button')
    console.log('='.repeat(50))
    console.log('1. Login banner: VISIBLE when logged out')
    console.log('2. Login button: CORRECT endpoint /api/auth/signin/discord')
    console.log('3. Return URL: CORRECT parameter for redirect')
    console.log('4. Button styling: WHITE text color')
    console.log('')
    console.log('SUCCESS: Discord login button is correctly configured!')
    console.log('='.repeat(50) + '\n')
  })
})

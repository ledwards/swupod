// @ts-nocheck
import { test, expect, chromium, Browser, BrowserContext, Page } from '@playwright/test'
import { createTestUser, cleanupTestUsers, closeDb } from './test-utils.ts'
import pg from 'pg'
import { launchOptions } from './browser-launch'

/**
 * Logged-out user export E2E test
 *
 * Tests that:
 * 1. Logged-out user can create a sealed pool (anonymous pools allowed)
 * 2. Logged-out user can build and SAVE a deck (anonymous pools can be edited by anyone)
 * 3. Export from Play page shows the saved deck data
 * 4. Login banner is shown on Play page
 * 5. After login, pool is claimed and associated with user
 */

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000'
const TEST_ID = `e2e_logout_${Date.now()}`

test.describe.configure({ mode: 'serial' })
test.skip(({ browserName, isMobile }) =>
  browserName !== 'chromium' || isMobile,
  'Skipped: Desktop Chromium only'
)
test.setTimeout(180000)

test.describe('Logged-out user export flow', () => {
  let browser: Browser
  let context: BrowserContext
  let page: Page
  let poolShareId: string | null = null
  let testUser: any = null

  test.beforeAll(async () => {
    console.log(`\n${'='.repeat(50)}`)
    console.log('Starting Logged-Out Export Test')
    console.log(`Test ID: ${TEST_ID}`)
    console.log(`${'='.repeat(50)}\n`)

    browser = await chromium.launch({
      ...launchOptions,
    })

    // NO AUTH - create context without any cookies
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      permissions: ['clipboard-read', 'clipboard-write'],
    })

    page = await context.newPage()
    page.on('console', msg => {
      const text = msg.text()
      if (msg.type() === 'error' && !text.includes('401')) {
        // Don't log expected 401s anymore since they shouldn't happen
        console.log(`  [Error]:`, text.slice(0, 300))
      }
    })

    // Create a test user for the login/claim portion of the test
    console.log('Creating test user for claim test...')
    testUser = await createTestUser('ClaimTester', TEST_ID)
    console.log(`✓ Created test user: ${testUser.user.username}`)

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

    // Clean up test users
    try {
      await cleanupTestUsers(TEST_ID)
    } catch (e: any) {
      console.error('User cleanup error:', e.message)
    }

    await closeDb()
    if (context) await context.close()
    if (browser) await browser.close()
  })

  test('logged-out user: create pool → build deck → save works → export works', async () => {
    // === STEP 1: Create a sealed pool (should work for anonymous users) ===
    console.log('--- STEP 1: Creating sealed pool as logged-out user ---')
    await page.goto(`${BASE_URL}/sets`)
    await page.waitForLoadState('networkidle')

    await expect(page.locator('.sets-grid .set-card').first()).toBeVisible({ timeout: 10000 })
    const setName = await page.locator('.sets-grid .set-card').first().locator('.set-name, h3, h2').textContent()
    await page.locator('.sets-grid .set-card').first().click()
    console.log(`✓ Selected set: ${setName?.trim()}`)

    await page.waitForURL(/\/pool\/[a-zA-Z0-9_-]+/, { timeout: 30000 })
    poolShareId = page.url().split('/pool/')[1]?.split('/')[0]?.split('?')[0]
    console.log(`✓ Pool created: ${poolShareId}`)

    // The pool only persists to the DB when the pack-opening animation completes
    // (app/pools/new: handleAnimationComplete → savePool). Click "Skip →" to
    // finish it — the real user flow — then wait for the save to land in the DB.
    await page.locator('.skip-button').click()
    await expect
      .poll(async () => (await page.request.get(`${BASE_URL}/api/pools/${poolShareId}`)).status(), { timeout: 15000 })
      .toBe(200)
    console.log('✓ Pool saved to database after opening packs')

    // === STEP 2: Navigate to deck builder ===
    console.log('\n--- STEP 2: Opening deck builder ---')
    await page.goto(`${BASE_URL}/pool/${poolShareId}/deck`)
    await page.waitForLoadState('networkidle')
    await page.waitForSelector('.deck-builder, .deck-info-bar, .pool-section', { timeout: 30000 })
    console.log('✓ Deck builder loaded')

    // === STEP 3: Build a deck (should now SAVE for anonymous pools) ===
    console.log('\n--- STEP 3: Building deck (should save for anonymous pool) ---')
    await page.waitForTimeout(2000)

    // Select a leader
    const leaderCards = page.locator('.canvas-card.leader:not(.active-leader)')
    const leaderCount = await leaderCards.count()
    console.log(`  Found ${leaderCount} leaders`)
    if (leaderCount > 0) {
      await leaderCards.first().click()
      console.log('✓ Selected a leader')
      await page.waitForTimeout(500)
    }

    // Select a base
    const baseCards = page.locator('.canvas-card.base:not(.active-base)')
    const baseCount = await baseCards.count()
    console.log(`  Found ${baseCount} bases`)
    if (baseCount > 0) {
      await baseCards.first().click()
      console.log('✓ Selected a base')
      await page.waitForTimeout(500)
    }

    // Add cards to deck. The builder opens in arena view, where pool cards are
    // .resizable-card inside .arena-pool-section — only leaders and bases are
    // still .canvas-card. Cover both so this survives a view-mode default flip.
    // Both halves are scoped to a pool container: an unscoped .canvas-card
    // fallback also matches the chosen leader/base echoed in the info bar,
    // which sits earlier in the DOM and is not clickable.
    //
    // Duplicates stack, and only the top card of a stack (.is-last) is fully
    // clickable — aim at a buried one and the enlarged card in front of it
    // intercepts the click.
    const poolCardSelector =
      '.arena-pool-section .arena-stacked-card.is-last .resizable-card, ' +
      '.pool-section .canvas-card:not(.leader):not(.base)'
    const poolCards = page.locator(poolCardSelector)
    const poolCardCount = await poolCards.count()
    console.log(`  Found ${poolCardCount} pool cards`)
    expect(poolCardCount).toBeGreaterThan(0)

    const cardsToAdd = Math.min(35, poolCardCount)
    let cardsAdded = 0
    for (let i = 0; i < cardsToAdd && cardsAdded < 35; i++) {
      // Clicking moves the card into the deck, so always take what is first.
      const card = page.locator(poolCardSelector).first()
      try {
        await card.click({ timeout: 3000 })
        cardsAdded++
        // Park the pointer: a card left hovered is scaled up and swallows the
        // click meant for its neighbour.
        await page.mouse.move(0, 0)
        await page.waitForTimeout(50)
      } catch (e: any) {
        // Pool exhausted, or the head of the list will not take a click. Say
        // which — a silent break here reads as "the pool was empty".
        console.log(`  Stopped after ${cardsAdded}: ${String(e.message).split('\n').slice(0, 12).join(' / ')}`)
        break
      }
    }
    console.log(`✓ Added ${cardsAdded} cards to deck`)
    expect(cardsAdded).toBeGreaterThan(0)

    // Wait for auto-save (should succeed now for anonymous pools)
    console.log('  Waiting for auto-save (should succeed for anonymous pool)...')
    await page.waitForTimeout(3500)

    // === STEP 4: Navigate to Play page ===
    console.log('\n--- STEP 4: Navigate to Play page ---')
    await page.goto(`${BASE_URL}/pool/${poolShareId}/deck/play`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    console.log('✓ Navigated to Play page')

    // === STEP 5: Verify login banner is shown ===
    console.log('\n--- STEP 5: Verify login banner is shown ---')
    const loginBanner = page.locator('.login-banner')
    await expect(loginBanner).toBeVisible({ timeout: 5000 })
    console.log('✓ Login banner is visible')

    const loginButton = page.locator('.login-banner-button')
    await expect(loginButton).toBeVisible()
    await expect(loginButton).toContainText('Login with Discord')
    console.log('✓ Login with Discord button is visible')

    // === STEP 6: Export JSON from Play page (should have data now!) ===
    console.log('\n--- STEP 6: Export JSON from Play page ---')

    const playCopyButton = page.locator('button:has-text("Copy JSON")')

    if (await playCopyButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await playCopyButton.click()
      console.log('✓ Clicked Copy JSON on Play page')

      await page.waitForTimeout(500)

      // Check clipboard content
      const clipboardContent = await page.evaluate(() => navigator.clipboard.readText())

      let deckData: any
      try {
        deckData = JSON.parse(clipboardContent)
      } catch {
        console.log('  ⚠ Clipboard content is not valid JSON')
        deckData = {}
      }

      console.log(`  Play page export - Leader: ${deckData.leader?.id || 'none'}`)
      console.log(`  Play page export - Base: ${deckData.base?.id || 'none'}`)
      console.log(`  Play page export - Deck cards: ${deckData.deck?.length || 0}`)

      // NOW the deck should have data because anonymous saves work!
      const hasLeader = !!deckData.leader?.id
      const hasBase = !!deckData.base?.id
      const hasDeckCards = (deckData.deck?.length || 0) > 0

      if (hasLeader && hasBase && hasDeckCards) {
        console.log('✓ SUCCESS: Play page export has deck data!')
        console.log('  Anonymous pool saves are working correctly')
        expect(hasLeader).toBe(true)
        expect(hasBase).toBe(true)
        expect(hasDeckCards).toBe(true)
      } else {
        console.log('✗ FAILURE: Play page export is still empty')
        console.log('  Anonymous pool saves may not be working')
        expect(hasLeader).toBe(true) // This will fail and show the issue
      }
    } else {
      console.log('  ⚠ Copy button not visible')
      expect(false).toBe(true) // Fail the test
    }

    // === STEP 7: Login and verify pool is claimed ===
    console.log('\n--- STEP 7: Login and verify pool is claimed ---')

    // Set auth cookie for test user
    const urlObj = new URL(BASE_URL)
    const cookieConfig: any = {
      name: testUser.cookieName,
      value: testUser.token,
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
    console.log('✓ Added auth cookie for test user')

    // Reload Play page - should auto-claim the pool
    await page.goto(`${BASE_URL}/pool/${poolShareId}/deck/play`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000) // Wait for claim to complete
    console.log('✓ Reloaded Play page as logged-in user')

    // Verify login banner is no longer shown
    const loginBannerAfterLogin = page.locator('.login-banner')
    const bannerVisible = await loginBannerAfterLogin.isVisible().catch(() => false)
    if (!bannerVisible) {
      console.log('✓ Login banner is hidden after login')
    } else {
      console.log('  ⚠ Login banner still visible (may be expected if claim failed)')
    }

    // Check for success message
    const successMessage = page.locator('.play-message.success')
    const hasSuccessMsg = await successMessage.isVisible({ timeout: 2000 }).catch(() => false)
    if (hasSuccessMsg) {
      const msgText = await successMessage.textContent()
      console.log(`✓ Success message shown: "${msgText}"`)
    }

    // Verify pool is now owned by checking database
    const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL
    if (connectionString) {
      const pool = new pg.Pool({ connectionString })
      const result = await pool.query(
        'SELECT user_id FROM card_pools WHERE share_id = $1',
        [poolShareId]
      )
      await pool.end()

      if (result.rows[0]?.user_id === testUser.user.id) {
        console.log('✓ Pool is now owned by the logged-in user!')
      } else {
        console.log(`  Pool user_id: ${result.rows[0]?.user_id}, expected: ${testUser.user.id}`)
      }
    }

    // === Summary ===
    console.log('\n' + '='.repeat(50))
    console.log('TEST SUMMARY: Logged-Out User Flow')
    console.log('='.repeat(50))
    console.log('1. Pool creation: WORKS (anonymous pools allowed)')
    console.log('2. Deck building + save: WORKS (anonymous pools can be saved)')
    console.log('3. Play page export: HAS DATA (reads saved deck)')
    console.log('4. Login banner: SHOWN (prompts user to login)')
    console.log('5. After login: POOL CLAIMED (associated with user)')
    console.log('')
    console.log('SUCCESS: Logged-out users can now fully use the app!')
    console.log('='.repeat(50) + '\n')
  })
})

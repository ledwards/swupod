// @ts-nocheck
/**
 * Kick Player E2E Tests
 *
 * Tests host ability to remove players from draft and sealed lobbies:
 * - Host sees remove X on hover over other players' seats
 * - Clicking X shows confirmation modal
 * - Confirming removes player and they get redirected with removed banner
 * - Host cannot see X on their own seat
 * - Non-host cannot see X on any seat
 */
import { test, expect, chromium, Browser, BrowserContext, Page } from '@playwright/test'
import { createTestUser, cleanupTestUsers, closeDb } from './test-utils.ts'
import { shouldIgnoreError } from './helpers.ts'

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000'
const TEST_ID = `kick_${Date.now()}`

test.describe.configure({ mode: 'serial' })
test.skip(({ browserName, isMobile }) =>
  browserName !== 'chromium' || isMobile,
  'Skipped: Desktop Chromium only'
)
test.setTimeout(120_000) // 2 minutes

test.describe('Kick Player - Draft Lobby', () => {
  let browser: Browser
  let hostContext: BrowserContext
  let playerContext: BrowserContext
  let hostPage: Page
  let playerPage: Page
  let hostUser: any
  let playerUser: any
  let shareId: string

  test.beforeAll(async () => {
    browser = await chromium.launch()

    // Create host
    hostUser = await createTestUser('KickHost', TEST_ID)
    hostContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    })
    await hostContext.addCookies([{
      name: hostUser.cookieName,
      value: hostUser.token,
      url: BASE_URL,
    }])
    hostPage = await hostContext.newPage()

    // Create player
    playerUser = await createTestUser('KickTarget', TEST_ID)
    playerContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    })
    await playerContext.addCookies([{
      name: playerUser.cookieName,
      value: playerUser.token,
      url: BASE_URL,
    }])
    playerPage = await playerContext.newPage()

    // Track errors
    for (const page of [hostPage, playerPage]) {
      page.on('console', msg => {
        if (msg.type() === 'error' && !shouldIgnoreError(msg.text())) {
          console.log(`  [Error]:`, msg.text().slice(0, 100))
        }
      })
    }
  })

  test.afterAll(async () => {
    await cleanupTestUsers(TEST_ID)
    await browser?.close()
    await closeDb()
  })

  test('host creates a draft', async () => {
    // Navigate to draft creation
    await hostPage.goto(`${BASE_URL}/draft/new`)
    await hostPage.waitForLoadState('networkidle')

    // Select a set and create. /draft/new renders the shared SetSelection, so
    // the tiles are .set-card — there is no .set-option anywhere in the app.
    const setButton = hostPage.locator('.set-card').first()
    await setButton.click()

    // Wait for draft creation and redirect. Exclude "new": we are already on
    // /draft/new, so a pattern that accepts it resolves immediately and the
    // share id comes out as the literal string "new".
    await hostPage.waitForURL(/\/draft\/(?!new)[a-zA-Z0-9_-]+/, { timeout: 30000 })
    const url = hostPage.url()
    shareId = url.split('/draft/')[1]
    expect(shareId).toBeTruthy()
    console.log(`  ✓ Draft created: ${shareId}`)
  })

  test('player joins the draft', async () => {
    await playerPage.goto(`${BASE_URL}/draft/${shareId}`)
    await playerPage.waitForLoadState('networkidle')

    // Wait for player to appear in lobby
    await hostPage.waitForTimeout(2000) // Wait for socket broadcast
    console.log(`  ✓ Player joined`)
  })

  test('host sees remove button on hover over player seat', async () => {
    // Find player seats (non-empty, not current user)
    const playerSeats = hostPage.locator('.player-seat:not(.empty):not(.current-user)')
    const count = await playerSeats.count()
    expect(count).toBeGreaterThan(0)

    // The remove button should exist but be invisible initially
    const removeBtn = playerSeats.first().locator('.seat-remove-btn')
    await expect(removeBtn).toBeAttached()

    // On hover, it should become visible (opacity: 1)
    await playerSeats.first().hover()
    await expect(removeBtn).toBeVisible()
    console.log(`  ✓ Remove button visible on hover`)
  })

  test('host does NOT see remove button on own seat', async () => {
    const ownSeat = hostPage.locator('.player-seat.current-user')
    const count = await ownSeat.count()
    if (count > 0) {
      const removeBtn = ownSeat.locator('.seat-remove-btn')
      await expect(removeBtn).toHaveCount(0)
      console.log(`  ✓ No remove button on own seat`)
    }
  })

  test('non-host does NOT see remove button on any seat', async () => {
    const removeBtns = playerPage.locator('.seat-remove-btn')
    await expect(removeBtns).toHaveCount(0)
    console.log(`  ✓ Non-host sees no remove buttons`)
  })

  test('clicking remove shows confirmation modal', async () => {
    const playerSeats = hostPage.locator('.player-seat:not(.empty):not(.current-user)')
    await playerSeats.first().hover()

    const removeBtn = playerSeats.first().locator('.seat-remove-btn')
    await removeBtn.click()

    // Modal should appear
    const modal = hostPage.locator('.modal-overlay')
    await expect(modal).toBeVisible()

    const modalTitle = hostPage.locator('.modal-title')
    await expect(modalTitle).toContainText('Remove Player')
    console.log(`  ✓ Confirmation modal shown`)
  })

  test('confirming removal kicks the player', async () => {
    // Confirm with the modal's danger button. It is the shared Button
    // component, whose modifier class is .btn--danger (not .btn-danger).
    const confirmBtn = hostPage.locator('.modal-overlay .btn--danger')
    await confirmBtn.click()

    // Modal should close
    await expect(hostPage.locator('.modal-overlay')).toBeHidden({ timeout: 5000 })

    // Player should be redirected to draft LFG with removed banner
    await playerPage.waitForURL(/\/draft\?removed=1/, { timeout: 10000 })
    const banner = playerPage.locator('.removed-banner')
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('removed')
    console.log(`  ✓ Player kicked and redirected with banner`)
  })
})

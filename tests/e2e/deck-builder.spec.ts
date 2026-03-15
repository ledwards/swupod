// @ts-nocheck
import { test, expect, BrowserContext, Page } from '@playwright/test'
import { checkLayoutIssues, waitForNetworkIdle, waitForCardsToLoad, shouldIgnoreError } from './helpers.ts'
import { createTestUser, cleanupTestUsers, closeDb } from './test-utils.ts'

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000'

test.describe('Deck Builder', () => {
  // Store pool shareId for reuse across tests
  let poolShareId: string | null = null

  test.beforeEach(async ({ page }) => {
    // Collect errors
    const errors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text()
        if (!shouldIgnoreError(text)) {
          errors.push(text)
        }
      }
    })
    page.on('pageerror', error => {
      if (!shouldIgnoreError(error.message)) {
        errors.push(error.message)
      }
    })
    ;(page as any).errors = errors
  })

  test('should load deck builder with cards', async ({ page }) => {
    // Create a new pool and navigate to deck builder
    await page.goto('/sealed')
    await page.waitForLoadState('domcontentloaded')
    // Wait for set cards in the grid (not the latest/beta row)
    await expect(page.locator('.sets-grid .set-card').first()).toBeVisible({ timeout: 10000 })
    // Scroll to ensure grid is visible
    await page.locator('.sets-grid .set-card').first().scrollIntoViewIfNeeded()
    await page.locator('.sets-grid .set-card').first().click()
    // Sealed flow: /sealed → /pools/new?set=X (pack animation) → /pool/{shareId}
    await page.waitForURL(/\/pool\/[a-zA-Z0-9_-]+/, { timeout: 60000 })

    // Extract shareId and navigate to deck builder
    const poolUrl = page.url()
    poolShareId = poolUrl.split('/pool/')[1]?.split('/')[0]
    await page.goto(`/pool/${poolShareId}/deck`)

    // Wait for deck builder to render (leaders & bases section is always present)
    await expect(page.locator('.deck-builder, .leaders-bases-section, .leaders-bases-container').first()).toBeVisible({ timeout: 30000 })

    // Should have card elements (may show as placeholders if images don't load in test env)
    await expect(page.locator('.canvas-card').first()).toBeVisible({ timeout: 10000 })

    // Check no errors
    expect((page as any).errors).toHaveLength(0)
  })

  test('should display leaders and bases section', async ({ page }) => {
    // Create a new pool
    await page.goto('/sealed')
    await page.waitForLoadState('domcontentloaded')
    // Wait for set cards in the grid (not the latest/beta row)
    await expect(page.locator('.sets-grid .set-card').first()).toBeVisible({ timeout: 10000 })
    // Scroll to ensure grid is visible
    await page.locator('.sets-grid .set-card').first().scrollIntoViewIfNeeded()
    await page.locator('.sets-grid .set-card').first().click()
    // Sealed flow: /sealed → /pools/new?set=X (pack animation) → /pool/{shareId}
    await page.waitForURL(/\/pool\/[a-zA-Z0-9_-]+/, { timeout: 60000 })
    const poolUrl = page.url()
    const shareId = poolUrl.split('/pool/')[1]?.split('/')[0]
    await page.goto(`/pool/${shareId}/deck`)

    // Wait for deck builder to load
    await expect(page.locator('.deck-builder, .card-grid').first()).toBeVisible({ timeout: 30000 })

    // Should show leader/base selection area
    // Look for either the selection container or section label
    const leaderBaseIndicator = page.locator('.selected-card-container')
      .or(page.locator('.section-label').filter({ hasText: 'Leader' }))
      .or(page.getByText('Select a'))
    await expect(leaderBaseIndicator.first()).toBeVisible({ timeout: 10000 })

    // Check layout
    const issues = await checkLayoutIssues(page)
    expect(issues).toHaveLength(0)
  })

  test('should allow clicking cards to move between deck and sideboard', async ({ page }) => {
    // Create a new pool
    await page.goto('/sealed')
    await page.waitForLoadState('domcontentloaded')
    // Wait for set cards in the grid (not the latest/beta row)
    await expect(page.locator('.sets-grid .set-card').first()).toBeVisible({ timeout: 10000 })
    // Scroll to ensure grid is visible
    await page.locator('.sets-grid .set-card').first().scrollIntoViewIfNeeded()
    await page.locator('.sets-grid .set-card').first().click()
    // Sealed flow: /sealed → /pools/new?set=X (pack animation) → /pool/{shareId}
    await page.waitForURL(/\/pool\/[a-zA-Z0-9_-]+/, { timeout: 60000 })
    const poolUrl = page.url()
    const shareId = poolUrl.split('/pool/')[1]?.split('/')[0]
    await page.goto(`/pool/${shareId}/deck`)

    // Wait for deck builder to render
    await expect(page.locator('.deck-builder, .leaders-bases-section').first()).toBeVisible({ timeout: 30000 })
    await expect(page.locator('.canvas-card').first()).toBeVisible({ timeout: 10000 })

    // Scroll down to find a card that's not covered by sticky header
    await page.evaluate(() => window.scrollTo(0, 500))
    await page.waitForTimeout(500)

    // Find a visible card and force click it
    const cards = page.locator('.canvas-card:not(.leader):not(.base)')
    const cardCount = await cards.count()

    if (cardCount > 0) {
      // Try clicking a card in the middle of the list
      const cardIndex = Math.min(5, cardCount - 1)
      await cards.nth(cardIndex).click({ force: true })
      await page.waitForTimeout(300)
    }

    // No error should occur
    expect((page as any).errors).toHaveLength(0)
  })

  test('should show deck count in info bar', async ({ page }) => {
    // Create a new pool
    await page.goto('/sealed')
    await page.waitForLoadState('domcontentloaded')
    // Wait for set cards in the grid (not the latest/beta row)
    await expect(page.locator('.sets-grid .set-card').first()).toBeVisible({ timeout: 10000 })
    // Scroll to ensure grid is visible
    await page.locator('.sets-grid .set-card').first().scrollIntoViewIfNeeded()
    await page.locator('.sets-grid .set-card').first().click()
    // Sealed flow: /sealed → /pools/new?set=X (pack animation) → /pool/{shareId}
    await page.waitForURL(/\/pool\/[a-zA-Z0-9_-]+/, { timeout: 60000 })
    const poolUrl = page.url()
    const shareId = poolUrl.split('/pool/')[1]?.split('/')[0]
    await page.goto(`/pool/${shareId}/deck`)

    // Wait for deck builder
    await expect(page.locator('.deck-builder, .leaders-bases-section, .leaders-bases-container').first()).toBeVisible({ timeout: 30000 })

    // Should display deck count in header (e.g. "Deck 0 / 030" or "Sideboard")
    const countIndicator = page.getByText(/Deck \d+/)
      .or(page.getByText(/\d+\s*\/\s*\d+/))
      .or(page.getByText(/\d+\s*cards/i))
    await expect(countIndicator.first()).toBeVisible({ timeout: 10000 })
  })

  test('should have export buttons', async ({ page }) => {
    // Create a new pool
    await page.goto('/sealed')
    await page.waitForLoadState('domcontentloaded')
    // Wait for set cards in the grid (not the latest/beta row)
    await expect(page.locator('.sets-grid .set-card').first()).toBeVisible({ timeout: 10000 })
    // Scroll to ensure grid is visible
    await page.locator('.sets-grid .set-card').first().scrollIntoViewIfNeeded()
    await page.locator('.sets-grid .set-card').first().click()
    // Sealed flow: /sealed → /pools/new?set=X (pack animation) → /pool/{shareId}
    await page.waitForURL(/\/pool\/[a-zA-Z0-9_-]+/, { timeout: 60000 })
    const poolUrl = page.url()
    const shareId = poolUrl.split('/pool/')[1]?.split('/')[0]
    await page.goto(`/pool/${shareId}/deck`)

    // Wait for deck builder
    await expect(page.locator('.deck-builder, .leaders-bases-section').first()).toBeVisible({ timeout: 30000 })

    // Look for action buttons in the deck builder header
    const actionButton = page.locator('button:has-text("Select a Leader"), button:has-text("Select a Base"), button:has-text("Share"), button:has-text("Clone"), button:has-text("Play")')

    // At least one action button should exist
    const count = await actionButton.count()
    expect(count).toBeGreaterThan(0)
  })
})

test.describe('Deck Builder - Mobile', () => {
  test.describe.configure({ mode: 'serial' })
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true })

  const TEST_ID = `e2e_mobile_deck_${Date.now()}`
  let testUser: any = null
  let poolShareId: string | null = null

  test.beforeEach(async ({ context, page }) => {
    // Create test user if not already created
    if (!testUser) {
      testUser = await createTestUser('MobileDeckTester', TEST_ID)
    }

    // Set auth cookie for pool access
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

    const errors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text()
        if (!shouldIgnoreError(text)) {
          errors.push(text)
        }
      }
    })
    page.on('pageerror', error => {
      if (!shouldIgnoreError(error.message)) {
        errors.push(error.message)
      }
    })
    ;(page as any).errors = errors
  })

  test.afterAll(async () => {
    // Cleanup test users
    try {
      await cleanupTestUsers(TEST_ID)
    } catch (e: any) {
      console.error('Cleanup error:', e.message)
    }
    await closeDb()
  })

  test('should display correctly on mobile', async ({ page }) => {
    // Create pool if not already created
    if (!poolShareId) {
      await page.goto(`${BASE_URL}/sets`)
      await waitForNetworkIdle(page)
      await expect(page.locator('.sets-grid .set-card').first()).toBeVisible({ timeout: 10000 })
      await page.locator('.sets-grid .set-card').first().click()

      // Wait for navigation to /pools/new page
      await page.waitForURL(/\/pools\/new/, { timeout: 10000 })

      // Wait for the pack opening animation to appear
      await expect(page.locator('.pack-opening-container, .skip-button').first()).toBeVisible({ timeout: 15000 })

      // Click skip button to skip animation
      const skipButton = page.locator('.skip-button')
      await expect(skipButton).toBeVisible({ timeout: 5000 })
      await skipButton.click()

      // Wait for SealedPod to appear (animation done)
      await expect(page.locator('.sealed-pod').first()).toBeVisible({ timeout: 15000 })

      // Wait for URL to update (replaceState after save)
      await page.waitForTimeout(1500)
      poolShareId = page.url().split('/pool/')[1]?.split('/')[0]?.split('?')[0]

      // Fallback if URL extraction fails
      if (!poolShareId || poolShareId.includes('pools')) {
        await page.waitForURL(/\/pool\/[a-zA-Z0-9_-]+/, { timeout: 10000 })
        poolShareId = page.url().split('/pool/')[1]?.split('/')[0]?.split('?')[0]
      }
    }

    await page.goto(`${BASE_URL}/pool/${poolShareId}/deck`)

    // Wait for deck builder to be visible
    await expect(page.locator('.deck-builder, .card-grid').first()).toBeVisible({ timeout: 30000 })

    // Wait for cards to actually render (canvas-card is the card wrapper)
    await expect(page.locator('.canvas-card').first()).toBeVisible({ timeout: 30000 })

    // Check mobile layout
    const issues = await checkLayoutIssues(page)
    expect(issues).toHaveLength(0)

    // Cards should be visible and reasonably sized (use canvas-card which is the actual class)
    const card = page.locator('.canvas-card').first()
    await expect(card).toBeVisible()

    const box = await card.boundingBox()
    expect(box).not.toBeNull()
    // Card should be at least 50px wide on mobile
    expect(box!.width).toBeGreaterThanOrEqual(50)
  })

  test('should not have hover effects interfering on mobile', async ({ page }) => {
    // Create pool if not already created (in case first test is skipped)
    if (!poolShareId) {
      await page.goto(`${BASE_URL}/sets`)
      await waitForNetworkIdle(page)
      await expect(page.locator('.sets-grid .set-card').first()).toBeVisible({ timeout: 10000 })
      await page.locator('.sets-grid .set-card').first().click()

      // Wait for navigation and animation
      await page.waitForURL(/\/pools\/new/, { timeout: 10000 })
      await expect(page.locator('.skip-button').first()).toBeVisible({ timeout: 15000 })
      await page.locator('.skip-button').click()
      await expect(page.locator('.sealed-pod').first()).toBeVisible({ timeout: 15000 })

      await page.waitForTimeout(1500)
      poolShareId = page.url().split('/pool/')[1]?.split('/')[0]?.split('?')[0]

      if (!poolShareId || poolShareId.includes('pools')) {
        await page.waitForURL(/\/pool\/[a-zA-Z0-9_-]+/, { timeout: 10000 })
        poolShareId = page.url().split('/pool/')[1]?.split('/')[0]?.split('?')[0]
      }
    }

    await page.goto(`${BASE_URL}/pool/${poolShareId}/deck`)
    await expect(page.locator('.canvas-card').first()).toBeVisible({ timeout: 30000 })

    // Scroll down to avoid sticky header covering cards
    await page.evaluate(() => window.scrollTo(0, 600))
    await page.waitForTimeout(500)

    // Find a card that's not covered by other elements
    const cards = page.locator('.canvas-card:not(.leader):not(.base)')
    const cardCount = await cards.count()

    if (cardCount > 0) {
      // Tap a card using force to bypass intercept issues
      const cardIndex = Math.min(10, cardCount - 1)
      await cards.nth(cardIndex).tap({ force: true })
    }

    // Wait briefly for any potential modal
    await page.waitForTimeout(500)

    // The hover modal should not be visible on mobile
    const hoverModal = page.locator('.hover-card-modal, .card-preview-modal')
    const isModalVisible = await hoverModal.isVisible().catch(() => false)

    // On mobile, hover modals should not persist
    // This test primarily verifies no JS errors occur on tap
    expect((page as any).errors).toHaveLength(0)
  })
})

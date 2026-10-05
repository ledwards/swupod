// @ts-nocheck
import { test, expect, Page } from '@playwright/test'
import { checkLayoutIssues, waitForNetworkIdle, waitForCardsToLoad, shouldIgnoreError } from './helpers.ts'

test.describe('Sealed Pool Flow', () => {
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

  test('should display set selection page with all sets', async ({ page }) => {
    await page.goto('/sets')
    await waitForNetworkIdle(page)

    // Check page structure
    await expect(page.locator('h1')).toContainText('Select a Set')
    await expect(page.locator('.sets-grid')).toBeVisible()

    // Should have multiple set cards
    const setCards = page.locator('.sets-grid .set-card')
    await expect(setCards.first()).toBeVisible({ timeout: 10000 })

    const count = await setCards.count()
    expect(count).toBeGreaterThanOrEqual(4) // Should have at least 4 sets

    // Check no errors
    expect((page as any).errors).toHaveLength(0)
  })

  test('should create a sealed pool when clicking a set', async ({ page }) => {
    await page.goto('/sets')
    await waitForNetworkIdle(page)

    // Wait for sets to load
    await expect(page.locator('.sets-grid .set-card').first()).toBeVisible({ timeout: 10000 })

    // Click on first set (usually the newest)
    await page.locator('.sets-grid .set-card').first().click()

    // Should navigate to pool creation and then to the pool page
    // URL should eventually be /pools/[shareId]
    await page.waitForURL(/\/pools\/(?!new(?:[/?#]|$))[a-zA-Z0-9_-]+/, { timeout: 30000 })

    // Wait for cards to load
    await waitForCardsToLoad(page)

    // Should show sealed pod interface with packs
    await expect(page.locator('.pack-grid, .sealed-pod, .card-image').first()).toBeVisible({ timeout: 30000 })

    // Check no errors
    expect((page as any).errors).toHaveLength(0)
  })

  test('should display pack contents correctly', async ({ page }) => {
    // Create a new sealed pool
    await page.goto('/sets')
    await waitForNetworkIdle(page)
    await expect(page.locator('.sets-grid .set-card').first()).toBeVisible({ timeout: 10000 })
    await page.locator('.sets-grid .set-card').first().click()
    await page.waitForURL(/\/pools\/(?!new(?:[/?#]|$))[a-zA-Z0-9_-]+/, { timeout: 30000 })

    // Wait for cards to appear
    await waitForCardsToLoad(page)

    // Should have multiple cards displayed
    const cards = page.locator('.card-image')
    await expect(cards.first()).toBeVisible({ timeout: 30000 })

    const cardCount = await cards.count()
    // Sealed pool should have 6 packs * 16 cards = 96 cards total
    expect(cardCount).toBeGreaterThanOrEqual(16) // At least one pack's worth

    // Check layout
    const issues = await checkLayoutIssues(page)
    expect(issues).toHaveLength(0)
  })

  test('should navigate to deck builder', async ({ page }) => {
    // Create a new sealed pool
    await page.goto('/sets')
    await waitForNetworkIdle(page)
    await expect(page.locator('.sets-grid .set-card').first()).toBeVisible({ timeout: 10000 })
    await page.locator('.sets-grid .set-card').first().click()
    await page.waitForURL(/\/pools\/(?!new(?:[/?#]|$))[a-zA-Z0-9_-]+/, { timeout: 30000 })
    await waitForCardsToLoad(page)

    // Get the current URL to extract shareId
    const poolUrl = page.url()
    const shareId = poolUrl.split('/pools/')[1]?.split('/')[0]

    // Click Build Deck button
    const buildDeckButton = page.locator('button:has-text("Build Deck"), .build-deck-button')
    if (await buildDeckButton.isVisible()) {
      await buildDeckButton.click()
    } else {
      // Navigate directly to deck builder
      await page.goto(`/pools/${shareId}/deck`)
    }

    // Should be on deck builder page
    await page.waitForURL(/\/deck/, { timeout: 15000 })

    // Wait for deck builder to load
    await expect(page.locator('.deck-builder, .deck-info-bar').first()).toBeVisible({ timeout: 30000 })

    // Check no errors
    expect((page as any).errors).toHaveLength(0)
  })
})

test.describe('Sealed Pool Flow - Mobile', () => {
  test.use({ viewport: { width: 375, height: 667 } })

  test('should work correctly on mobile', async ({ page }) => {
    await page.goto('/sets')
    await waitForNetworkIdle(page)

    // Check layout
    const issues = await checkLayoutIssues(page)
    expect(issues).toHaveLength(0)

    // Click on a set
    await expect(page.locator('.sets-grid .set-card').first()).toBeVisible({ timeout: 10000 })
    await page.locator('.sets-grid .set-card').first().click()

    // Wait for pool to load
    await page.waitForURL(/\/pools\/(?!new(?:[/?#]|$))[a-zA-Z0-9_-]+/, { timeout: 30000 })
    await waitForCardsToLoad(page)

    // Check mobile layout
    const mobileIssues = await checkLayoutIssues(page)
    expect(mobileIssues).toHaveLength(0)
  })
})

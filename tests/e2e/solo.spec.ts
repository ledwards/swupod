// @ts-nocheck
import { test, expect } from '@playwright/test'
import { checkLayoutIssues, waitForNetworkIdle, shouldIgnoreError } from './helpers.ts'

test.describe('Solo Page', () => {
  test.beforeEach(async ({ page }) => {
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

  test('should load solo page with all format cards', async ({ page }) => {
    await page.goto('/solo')
    await waitForNetworkIdle(page)

    // Check page title and subtitle
    await expect(page.locator('h1')).toContainText('Solo')
    await expect(page.locator('.solo-subtitle')).toContainText('Practice on your own')

    // Check main format cards are visible (use exact text to avoid matching "Chaos Sealed" etc.)
    await expect(page.locator('.format-mode-card h3', { hasText: /^Sealed$/ })).toBeVisible()
    await expect(page.locator('.format-mode-card h3', { hasText: /^Draft$/ })).toBeVisible()

    // Check Other Formats section exists
    await expect(page.locator('.solo-section-heading')).toContainText('Other Formats')

    // Check Chaos Draft and Chaos Sealed cards appear
    await expect(page.locator('.format-mode-card h3', { hasText: /^Chaos Draft$/ })).toBeVisible()
    await expect(page.locator('.format-mode-card h3', { hasText: /^Chaos Sealed$/ })).toBeVisible()

    // Check no JS errors
    expect((page as any).errors).toHaveLength(0)
  })

  test('should have no layout issues', async ({ page }) => {
    await page.goto('/solo')
    await waitForNetworkIdle(page)

    const issues = await checkLayoutIssues(page)
    expect(issues).toHaveLength(0)
  })

  test('should navigate to sealed set selection', async ({ page }) => {
    await page.goto('/solo')
    await waitForNetworkIdle(page)

    // Click the Sealed card (first one, not Chaos Sealed)
    await page.locator('.format-mode-card', { hasText: /^Sealed/ }).first().click()

    // Should navigate to /sets
    await page.waitForURL('/sets', { timeout: 10000 })
  })

  test('should navigate to solo draft', async ({ page }) => {
    // /solo redirects to /formats, so go there directly
    await page.goto('/formats')
    await waitForNetworkIdle(page)

    // Click the Chaos Draft card (contains "Draft" in its text)
    await page.locator('.format-mode-card', { hasText: /Chaos Draft/ }).first().click()

    // Should navigate to /formats/chaos-draft or /solo/chaos-draft
    await page.waitForURL(/chaos-draft/, { timeout: 10000 })
  })

  test('should navigate to solo chaos draft', async ({ page }) => {
    await page.goto('/solo')
    await waitForNetworkIdle(page)

    // Click the Chaos Draft card
    await page.locator('.format-mode-card', { hasText: /^Chaos Draft/ }).click()

    // Should navigate to /solo/chaos-draft
    await page.waitForURL('/solo/chaos-draft', { timeout: 10000 })
  })

  test('should navigate to chaos sealed', async ({ page }) => {
    await page.goto('/solo')
    await waitForNetworkIdle(page)

    // Click the Chaos Sealed card
    await page.locator('.format-mode-card', { hasText: /^Chaos Sealed/ }).click()

    // Should navigate to /formats/chaos-sealed
    await page.waitForURL('/formats/chaos-sealed', { timeout: 10000 })
  })

  test('should navigate back to home', async ({ page }) => {
    await page.goto('/solo')
    await waitForNetworkIdle(page)

    // Click back button
    await page.locator('button:has-text("Back")').click()

    await page.waitForURL('/', { timeout: 10000 })
  })

  test('should show beta-locked formats for non-beta users', async ({ page }) => {
    await page.goto('/solo')
    await waitForNetworkIdle(page)

    // Pack Wars and Pack Blitz should be visible but disabled (beta-locked)
    const packWarsCard = page.locator('.format-mode-card:has(h3:has-text("Pack Wars"))')
    const packBlitzCard = page.locator('.format-mode-card:has(h3:has-text("Pack Blitz"))')
    await expect(packWarsCard).toBeVisible()
    await expect(packBlitzCard).toBeVisible()

    // Should have beta badges
    await expect(packWarsCard.locator('.beta-badge-overlay')).toBeVisible()
    await expect(packBlitzCard.locator('.beta-badge-overlay')).toBeVisible()

    // Should be disabled
    await expect(packWarsCard).toBeDisabled()
    await expect(packBlitzCard).toBeDisabled()
  })
})

test.describe('Solo Page - Mobile', () => {
  test.use({ viewport: { width: 375, height: 667 } })

  test('should display correctly on mobile', async ({ page }) => {
    await page.goto('/solo')
    await waitForNetworkIdle(page)

    const issues = await checkLayoutIssues(page)
    expect(issues).toHaveLength(0)

    // Main cards should be visible (use exact text match)
    await expect(page.locator('.format-mode-card h3', { hasText: /^Sealed$/ })).toBeVisible()
    await expect(page.locator('.format-mode-card h3', { hasText: /^Draft$/ })).toBeVisible()
  })
})

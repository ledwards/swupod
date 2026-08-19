// @ts-nocheck
import { test, expect } from '@playwright/test'
import { checkLayoutIssues, shouldIgnoreError } from './helpers.ts'

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

  test('should load formats page with all format cards', async ({ page }) => {
    await page.goto('/formats')
    await page.waitForLoadState('domcontentloaded')

    // Wait for format cards to render
    await expect(page.locator('.format-mode-card').first()).toBeVisible({ timeout: 10000 })

    // Check page title and subtitle
    await expect(page.locator('h1')).toContainText('Casual Formats')
    await expect(page.locator('.formats-subtitle')).toContainText('Alternative ways to play limited')

    // Check format cards are visible
    await expect(page.locator('.format-mode-card h3', { hasText: /^Chaos Sealed$/ })).toBeVisible()
    await expect(page.locator('.format-mode-card h3', { hasText: /^Solo Chaos Draft$/ })).toBeVisible()

    // Check Pack Wars and Pack Blitz cards appear
    await expect(page.locator('.format-mode-card h3', { hasText: /^Pack Wars$/ })).toBeVisible()
    await expect(page.locator('.format-mode-card h3', { hasText: /^Pack Blitz$/ })).toBeVisible()

    // Check Rotisserie Draft card appears
    await expect(page.locator('.format-mode-card h3', { hasText: /^Rotisserie Draft$/ })).toBeVisible()

    // Check no JS errors
    expect((page as any).errors).toHaveLength(0)
  })

  test('should have no layout issues', async ({ page }) => {
    await page.goto('/formats')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('.format-mode-card').first()).toBeVisible({ timeout: 10000 })

    const issues = await checkLayoutIssues(page)
    expect(issues).toHaveLength(0)
  })

  test('should redirect /solo to /formats', async ({ page }) => {
    await page.goto('/solo')
    await page.waitForURL('/formats', { timeout: 10000 })
    await expect(page.locator('h1')).toContainText('Casual Formats')
  })

  test('should navigate to chaos sealed', async ({ page }) => {
    await page.goto('/formats')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('.format-mode-card').first()).toBeVisible({ timeout: 10000 })

    // Click the Chaos Sealed card
    await page.locator('.format-mode-card', { hasText: /^Chaos Sealed/ }).click()

    // Should navigate to /formats/chaos-sealed
    await page.waitForURL('/formats/chaos-sealed', { timeout: 10000 })
  })

  test('should navigate to chaos draft', async ({ page }) => {
    await page.goto('/formats')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('.format-mode-card').first()).toBeVisible({ timeout: 10000 })

    // Click the Solo Chaos Draft card
    await page.locator('.format-mode-card', { hasText: /^Solo Chaos Draft/ }).click()

    // Should navigate to /formats/chaos-draft
    await page.waitForURL('/formats/chaos-draft', { timeout: 10000 })
  })

  test('should navigate back to home', async ({ page }) => {
    await page.goto('/formats')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('.format-mode-card').first()).toBeVisible({ timeout: 10000 })

    // Click back button
    await page.locator('button:has-text("Back")').click()

    await page.waitForURL('/', { timeout: 10000 })
  })

  test('should show beta-locked formats for non-beta users', async ({ page }) => {
    await page.goto('/formats')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('.format-mode-card').first()).toBeVisible({ timeout: 10000 })

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
    await page.goto('/formats')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('.format-mode-card').first()).toBeVisible({ timeout: 10000 })

    const issues = await checkLayoutIssues(page)
    expect(issues).toHaveLength(0)

    // Format cards should be visible
    await expect(page.locator('.format-mode-card h3', { hasText: /^Chaos Sealed$/ })).toBeVisible()
    await expect(page.locator('.format-mode-card h3', { hasText: /^Solo Chaos Draft$/ })).toBeVisible()
  })
})

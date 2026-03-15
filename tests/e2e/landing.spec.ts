// @ts-nocheck
import { test, expect } from '@playwright/test'
import { checkLayoutIssues, waitForNetworkIdle, shouldIgnoreError } from './helpers.ts'

test.describe('Landing Page', () => {
  test.beforeEach(async ({ page }) => {
    // Collect console errors throughout the test
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

    // Store errors for later assertion
    ;(page as any).errors = errors
  })

  test('should load landing page successfully', async ({ page }) => {
    await page.goto('/')

    // Wait for page to be fully loaded
    await waitForNetworkIdle(page)

    // Check logo is visible
    await expect(page.locator('.landing-logo')).toBeVisible()

    // Check Solo and Live Pod section headers are visible
    await expect(page.locator('.mode-section-header').nth(0)).toContainText('Solo')
    await expect(page.locator('.mode-section-header').nth(1)).toContainText('Live Pod')

    // Check mode buttons exist (Sealed, Draft, Other in each column)
    const modeButtons = page.locator('.mode-button')
    await expect(modeButtons).toHaveCount(6)

    // Check for subtitle text
    await expect(page.locator('.subtitle')).toContainText('Star Wars Unlimited')

    // Check no JS errors
    expect((page as any).errors).toHaveLength(0)
  })

  test('should have no layout issues', async ({ page }) => {
    await page.goto('/')
    await waitForNetworkIdle(page)

    const issues = await checkLayoutIssues(page)
    expect(issues).toHaveLength(0)
  })

  test('should navigate to solo sealed page', async ({ page }) => {
    await page.goto('/')
    await waitForNetworkIdle(page)

    // Click the first Sealed button (Solo column)
    const soloColumn = page.locator('.mode-section').nth(0)
    await soloColumn.locator('.mode-button', { hasText: 'Sealed' }).click()

    // Should navigate to sealed page
    await expect(page).toHaveURL('/sealed')
  })

  test('should navigate to live pod draft page', async ({ page }) => {
    await page.goto('/')
    await waitForNetworkIdle(page)

    // Click the Draft button in Live Pod column
    const liveColumn = page.locator('.mode-section').nth(1)
    await liveColumn.locator('.mode-button', { hasText: 'Draft' }).click()

    // Should navigate to draft page
    await expect(page).toHaveURL('/draft')
  })

  test('should show login button when not authenticated', async ({ page }) => {
    await page.goto('/')
    await waitForNetworkIdle(page)

    // Should show Discord login button
    await expect(page.locator('.discord-cta')).toBeVisible()
    await expect(page.locator('.discord-cta')).toContainText(/Login with Discord|Join the Discord/)
  })

  test('should display disclaimer', async ({ page }) => {
    await page.goto('/')
    await waitForNetworkIdle(page)

    // Check disclaimer is present
    const disclaimer = page.locator('.landing-disclaimer').or(page.locator('.disclaimer')).or(page.getByText(/not affiliated/i))
    await expect(disclaimer.first()).toBeVisible()
  })
})

test.describe('Landing Page - Mobile', () => {
  test.use({ viewport: { width: 375, height: 667 } })

  test('should display correctly on mobile', async ({ page }) => {
    await page.goto('/')
    await waitForNetworkIdle(page)

    // Check layout issues specific to mobile
    const issues = await checkLayoutIssues(page)
    expect(issues).toHaveLength(0)

    // Mode buttons should still be visible
    const modeButtons = page.locator('.mode-button')
    await expect(modeButtons.first()).toBeVisible()

    // Section headers should be visible
    await expect(page.locator('.mode-section-header').first()).toBeVisible()

    // Logo should be visible
    await expect(page.locator('.landing-logo')).toBeVisible()
  })
})

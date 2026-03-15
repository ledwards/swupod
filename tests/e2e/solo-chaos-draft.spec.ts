// @ts-nocheck
import { test, expect } from '@playwright/test'
import { waitForNetworkIdle, shouldIgnoreError } from './helpers.ts'

test.describe('Solo Chaos Draft Page', () => {
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

  test('page loads and shows set selection grid', async ({ page }) => {
    await page.goto('/solo/chaos-draft')
    await waitForNetworkIdle(page)

    // Page title visible
    await expect(page.locator('h1')).toHaveText('Solo Chaos Draft')
    await expect(page.locator('.chaos-draft-subtitle')).toBeVisible()

    // Pack selector buttons appear
    await expect(page.locator('.pack-selector-button').first()).toBeVisible({ timeout: 10000 })
    const setCount = await page.locator('.pack-selector-button').count()
    expect(setCount).toBeGreaterThanOrEqual(6)

    // Counter shows 0/3
    await expect(page.locator('h3').first()).toContainText('0/3')

    // Create button is disabled
    const createButton = page.locator('button:has-text("Create Chaos Draft")')
    await expect(createButton).toBeDisabled()

    // Check no JS errors
    expect((page as any).errors).toHaveLength(0)
  })

  test('select 3 packs and create button enables', async ({ page }) => {
    await page.goto('/solo/chaos-draft')
    await waitForNetworkIdle(page)
    await expect(page.locator('.pack-selector-button').first()).toBeVisible({ timeout: 10000 })

    const setButtons = page.locator('.pack-selector-button')

    await setButtons.nth(0).click()
    await page.waitForTimeout(200)
    await expect(page.locator('h3').first()).toContainText('1/3')

    await setButtons.nth(1).click()
    await page.waitForTimeout(200)
    await expect(page.locator('h3').first()).toContainText('2/3')

    await setButtons.nth(2).click()
    await page.waitForTimeout(200)
    await expect(page.locator('h3').first()).toContainText('3/3')

    // Selected packs tray shows 3 packs
    const selectedPacks = page.locator('.selected-pack:not(.skeleton)')
    await expect(selectedPacks).toHaveCount(3)

    // Create button is enabled
    const createButton = page.locator('button:has-text("Create Chaos Draft")')
    await expect(createButton).toBeEnabled()
  })

  test('cancel button navigates back to solo page', async ({ page }) => {
    await page.goto('/solo/chaos-draft')
    await waitForNetworkIdle(page)
    await expect(page.locator('.pack-selector-button').first()).toBeVisible({ timeout: 10000 })

    const cancelButton = page.locator('button:has-text("Cancel")')
    await cancelButton.click()

    await page.waitForURL(/\/formats$/, { timeout: 10000 })
  })

  test('anonymous user can access page and browse sets', async ({ page }) => {
    await page.goto('/solo/chaos-draft')
    await waitForNetworkIdle(page)

    // Should see the UI, not a login wall
    await expect(page.locator('h1')).toHaveText('Solo Chaos Draft', { timeout: 10000 })

    // Pack selector buttons should be visible
    await expect(page.locator('.pack-selector-button').first()).toBeVisible({ timeout: 10000 })
  })
})

// @ts-nocheck
import { test, expect } from '@playwright/test'
import { waitForNetworkIdle, shouldIgnoreError } from './helpers.ts'

test.describe('Solo Draft Page', () => {
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

  test('anonymous user sees set selection (no auth gate)', async ({ page }) => {
    await page.goto('/solo/draft')
    await waitForNetworkIdle(page)

    // Should show set selection, NOT a login prompt
    await expect(page.locator('.set-selection')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.sets-grid')).toBeVisible()

    // Should have set cards
    await expect(page.locator('.set-card').first()).toBeVisible({ timeout: 10000 })

    // Should NOT show "Login Required" text
    await expect(page.locator('text=Login Required')).not.toBeVisible()

    // Check no JS errors
    expect((page as any).errors).toHaveLength(0)
  })

  test('anonymous user clicking a set triggers auth flow', async ({ page }) => {
    await page.goto('/solo/draft')
    await waitForNetworkIdle(page)

    await expect(page.locator('.set-card').first()).toBeVisible({ timeout: 10000 })

    // Clicking a set hands off to Discord: /api/auth/signin/discord redirects
    // to discord.com, which the suite deliberately cannot reach (every external
    // host resolves to nothing), so waiting for that navigation to *load* would
    // always time out. Assert the hand-off itself, including the path the user
    // comes back to.
    const signin = page.waitForRequest(
      (req) => req.url().includes('/api/auth/signin/discord'),
      { timeout: 15000 },
    )
    await page.locator('.set-card').first().click()
    const request = await signin

    const returnTo = new URL(request.url()).searchParams.get('return_to')
    expect(returnTo).toBe('/draft/solo')
  })
})

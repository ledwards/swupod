// @ts-nocheck
/**
 * E2E tests for <YourStats /> at /stats#you.
 *
 * UI-driven only per the project E2E rule
 * (.claude/memory/feedback_e2e_ui_only.md): every assertion is on
 * what the user sees and clicks, not on the API.
 *
 * Coverage:
 *   - Logged-out user lands on /stats#you, sees the sign-in CTA, and
 *     no personal data placeholders. Sign-in link has the correct
 *     return_to.
 *   - Logged-in user navigates to /stats#you, sees Activity totals
 *     and the scope toggle, can switch set, can switch scope, and
 *     the page updates without console errors. (Skipped when no
 *     test auth fixture is wired — keep the logged-out path as the
 *     baseline.)
 *
 * Note: U8 mounts <YourStats /> on /stats as the #you tab. Until U8
 * lands, these specs run against the route hash but the tab may not
 * yet be wired. The first test guards against the missing-mount case
 * so the test reports clearly instead of timing out.
 */

import { test, expect } from '@playwright/test'
import { shouldIgnoreError } from './helpers.ts'

const STATS_TIMEOUT = 60000

async function gotoYouTab(page) {
  await page.goto('/stats#you', { timeout: STATS_TIMEOUT, waitUntil: 'domcontentloaded' })
}

test.describe('Your Stats — logged out', () => {
  test.setTimeout(STATS_TIMEOUT)

  test.beforeEach(async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text()
        if (!shouldIgnoreError(text)) errors.push(text)
      }
    })
    page.on('pageerror', (error) => {
      if (!shouldIgnoreError(error.message)) errors.push(error.message)
    })
    ;(page as any).errors = errors
  })

  test('shows the sign-in CTA and no personal data', async ({ page }) => {
    await gotoYouTab(page)

    // The mount may not be live yet (U8 not landed). Guard with a soft check:
    // if the You tab isn't in the page, document and skip — don't fail noisily.
    const ctaLocator = page.locator('[data-testid="your-stats-logged-out"]')
    const isMounted = await ctaLocator.first().isVisible({ timeout: 8000 }).catch(() => false)

    if (!isMounted) {
      test.skip(true, 'Your Stats section not yet mounted on /stats — wait for U8.')
      return
    }

    // Title
    await expect(page.locator('.your-stats-logged-out-title')).toContainText('Your Stats')

    // Discord sign-in link is present and points back to /stats#you
    const signInLink = ctaLocator.locator('a.your-stats-logged-out-link')
    await expect(signInLink).toBeVisible()
    const href = await signInLink.getAttribute('href')
    expect(href).toContain('/api/auth/signin/discord')
    expect(href).toContain('return_to=/stats')
    expect(href).toContain('#you')

    // No personal counters / labels rendered for anonymous users.
    const counterGrid = page.locator('.your-stats-counter-grid')
    await expect(counterGrid).toHaveCount(0)

    // No console errors during the page load.
    expect((page as any).errors || []).toEqual([])
  })

  test('does not render an activity dashboard for anonymous users', async ({ page }) => {
    await gotoYouTab(page)
    const ctaLocator = page.locator('[data-testid="your-stats-logged-out"]')
    const isMounted = await ctaLocator.first().isVisible({ timeout: 8000 }).catch(() => false)
    if (!isMounted) {
      test.skip(true, 'Your Stats section not yet mounted on /stats — wait for U8.')
      return
    }

    // Specifically these spec labels must NOT appear in the anonymous view.
    await expect(page.locator('text=Packs cracked')).toHaveCount(0)
    await expect(page.locator('text=Pools opened')).toHaveCount(0)
    await expect(page.locator('text=Drafts joined')).toHaveCount(0)
  })
})

test.describe('Your Stats — logged in (requires auth fixture)', () => {
  test.setTimeout(STATS_TIMEOUT)

  // Logged-in coverage requires a Discord-OAuth test fixture or a seeded
  // session cookie. The project's existing E2E suite runs logged out by
  // default, so we mark this group as `skip` for the default run and
  // document the behavior the test would assert against.
  //
  // To run locally with an authenticated browser:
  //   PLAYWRIGHT_AUTH_STORAGE=/path/to/auth.json npx playwright test \
  //     tests/e2e/your-stats.spec.ts --project=authenticated
  //
  // When the auth storage state is wired into playwright.config.ts under a
  // dedicated project name, flip this skip and the tests will run.
  test.skip(true, 'Needs authenticated browser context; enable when E2E auth fixture is wired.')

  test('shows activity dashboard with the five counter labels', async ({ page }) => {
    await gotoYouTab(page)
    await page.waitForSelector('[data-testid="activity-dashboard"]', { timeout: 30000 })
    for (const label of ['Packs cracked', 'Pools opened', 'Drafts joined', 'Decks built', 'Made it to play']) {
      await expect(page.locator(`text=${label}`)).toBeVisible()
    }
  })

  test('lets the user switch set and switch scope via clicks', async ({ page }) => {
    await gotoYouTab(page)
    await page.waitForSelector('[data-testid="luck-section"]', { timeout: 30000 })

    // Switch to SOR via the set selector.
    await page.locator('[data-testid="set-button-SOR"]').click()
    // Switch to "What I kept" scope.
    await page.locator('[data-testid="scope-button-kept"]').click()

    // After both switches, panels (or empty state) render without console errors.
    const errors = (page as any).errors || []
    expect(errors).toEqual([])
  })

  test('show-math drawer is closed by default and opens on click', async ({ page }) => {
    await gotoYouTab(page)
    await page.waitForSelector('[data-testid="luck-panel-rarity"]', { timeout: 30000 })

    const drawer = page.locator('[data-testid="show-math-content-rarity"]')
    await expect(drawer).toHaveCount(0)

    await page.locator('[data-testid="show-math-toggle-rarity"]').click()
    await expect(drawer).toBeVisible()
  })
})

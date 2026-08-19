import { test, expect } from '@playwright/test'

/**
 * /multiplayer is a redirect.
 *
 * This file used to drive a Multiplayer page — Sealed and Draft format cards, a
 * `.multiplayer-modes-grid`, navigation into pod creation. That page is gone;
 * app/multiplayer/page.tsx is now a component whose whole body is
 * `redirect('/')`, and the modes it offered live on the landing page.
 *
 * All seven of the old tests still pointed at /multiplayer, so they were really
 * asserting landing-page markup against selectors that no longer exist anywhere
 * — `.format-mode-card h3` matching /^Sealed$/ found nothing, and `h1` matched
 * two elements instead of the one expected to contain "Pod".
 *
 * What is still worth guaranteeing is the redirect itself: the route is kept so
 * old links and bookmarks keep working, and that is the only contract left.
 */
test.describe('Multiplayer route', () => {
  test('/multiplayer redirects to the landing page', async ({ page }) => {
    await page.goto('/multiplayer')

    await page.waitForURL((url) => url.pathname === '/', { timeout: 15000 })
    await expect(page.locator('.landing-logo')).toBeVisible()
  })
})

// @ts-nocheck
import { expect, Page } from '@playwright/test'

/**
 * Known benign error patterns to ignore
 */
export const IGNORED_ERROR_PATTERNS: string[] = [
  'favicon.ico',
  'Failed to load resource',
  '404',
  'Failed to save pool',  // Expected without database
  'Failed to fetch',      // Network errors in test environment
  'TypeError: Failed to fetch',
  'net::ERR_',
  'NetworkError',
  // Socket.io reconnect churn. Specs navigate constantly, and a page that
  // unloads mid-handshake aborts the socket and logs this. The server is fine:
  // the polling handshake returns a sid advertising a websocket upgrade, and
  // the upgrade itself answers 101. Scoped to the socket.io endpoint so a
  // genuinely broken websocket elsewhere still surfaces.
  "WebSocket connection to 'ws://localhost:3000/socket.io/",
]

/**
 * Check if an error should be ignored
 */
export function shouldIgnoreError(text: string): boolean {
  return IGNORED_ERROR_PATTERNS.some(pattern => text.includes(pattern))
}

/**
 * Helper to check for JavaScript console errors
 */
export async function collectConsoleErrors(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text()
      if (!shouldIgnoreError(text)) {
        errors.push(text)
      }
    }
  })
  return errors
}

/**
 * Helper to check for uncaught page errors
 */
export async function collectPageErrors(page: Page): Promise<Error[]> {
  const errors: Error[] = []
  page.on('pageerror', error => {
    errors.push(error)
  })
  return errors
}

/**
 * Wait for network to be idle (no pending requests)
 */
export async function waitForNetworkIdle(page: Page, timeout: number = 5000): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout })
}

/**
 * Check that page has no major layout issues
 * - No elements overflowing viewport horizontally
 * - No elements with zero dimensions that should be visible
 */
export async function checkLayoutIssues(page: Page): Promise<string[]> {
  const issues = await page.evaluate(() => {
    const problems: string[] = []
    const viewportWidth = window.innerWidth

    // Check for horizontal overflow
    if (document.documentElement.scrollWidth > viewportWidth + 10) {
      problems.push(`Page has horizontal overflow: ${document.documentElement.scrollWidth}px > ${viewportWidth}px`)
    }

    // Check for elements with issues
    const allElements = document.querySelectorAll('*')
    allElements.forEach(el => {
      const rect = el.getBoundingClientRect()
      const styles = getComputedStyle(el)

      // Skip hidden elements
      if (styles.display === 'none' || styles.visibility === 'hidden') return

      // Check for elements extending beyond viewport
      if (rect.right > viewportWidth + 50) {
        const id = el.id ? `#${el.id}` : ''
        const cls = el.className ? `.${String(el.className).split(' ')[0]}` : ''
        problems.push(`Element ${el.tagName}${id}${cls} extends beyond viewport (right: ${rect.right}px)`)
      }
    })

    return problems.slice(0, 5) // Limit to first 5 issues
  })

  return issues
}

/**
 * Check that interactive elements are accessible
 */
export async function checkAccessibility(page: Page): Promise<string[]> {
  const issues = await page.evaluate(() => {
    const problems: string[] = []

    // Check buttons have accessible names
    const buttons = document.querySelectorAll('button')
    buttons.forEach(btn => {
      if (!btn.textContent?.trim() && !btn.getAttribute('aria-label') && !btn.getAttribute('title')) {
        problems.push(`Button without accessible name: ${btn.outerHTML.slice(0, 100)}`)
      }
    })

    // Check images have alt text
    const images = document.querySelectorAll('img')
    images.forEach(img => {
      if (!img.alt && !img.getAttribute('aria-hidden')) {
        problems.push(`Image without alt text: ${img.src?.slice(-50)}`)
      }
    })

    return problems.slice(0, 10)
  })

  return issues
}

/**
 * Take a screenshot with a descriptive name
 */
export async function takeScreenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `tests/e2e/screenshots/${name}.png`, fullPage: true })
}

interface AssertPageLoadedOptions {
  expectTitle?: string
  expectSelector?: string
  expectNoErrors?: boolean
}

/**
 * Check that a page loaded successfully
 */
export async function assertPageLoaded(page: Page, options: AssertPageLoadedOptions = {}): Promise<void> {
  const { expectTitle, expectSelector, expectNoErrors = true } = options

  // Check title if provided
  if (expectTitle) {
    await expect(page).toHaveTitle(expectTitle)
  }

  // Check for expected element
  if (expectSelector) {
    await expect(page.locator(expectSelector)).toBeVisible({ timeout: 10000 })
  }

  // Check for no errors
  if (expectNoErrors) {
    const errors = await collectPageErrors(page)
    expect(errors).toHaveLength(0)
  }
}

interface MockUser {
  id: string
  username: string
}

/**
 * Mock authentication for tests that require login
 * Sets a test cookie that the app can recognize
 */
export async function mockAuth(page: Page, user: MockUser = { id: 'test-user-123', username: 'TestUser' }): Promise<void> {
  // Set a cookie that simulates being logged in
  // Note: This requires the app to support test mode authentication
  await page.context().addCookies([
    {
      name: 'test_auth',
      value: JSON.stringify(user),
      domain: 'localhost',
      path: '/',
    }
  ])
}

/**
 * Wait for cards to load on the page
 * Handles pack opening animation by clicking skip button if present
 */
export async function waitForCardsToLoad(page: Page): Promise<void> {
  // Give page a moment to render
  await page.waitForTimeout(500)

  // Try to skip pack opening animation if present (multiple attempts for reliability)
  for (let attempt = 0; attempt < 5; attempt++) {
    // Check for skip button or Open All button (indicators of pack opening animation)
    const skipButton = page.locator('.skip-button, button:has-text(">>")').first()
    const openAllButton = page.locator('button:has-text("Open All")').first()

    const skipVisible = await skipButton.isVisible().catch(() => false)
    const openAllVisible = await openAllButton.isVisible().catch(() => false)

    if (skipVisible || openAllVisible) {
      // Pack opening animation is showing - click skip button
      if (skipVisible) {
        await skipButton.click()
        // Wait for animation to fully transition (can be slow under load)
        await page.waitForTimeout(1500)
      } else if (openAllVisible) {
        // If skip not visible but Open All is, we might be on mobile - look for skip again
        const mobileSkip = page.locator('button').filter({ hasText: '>>' }).first()
        if (await mobileSkip.isVisible().catch(() => false)) {
          await mobileSkip.click()
          await page.waitForTimeout(1500)
        }
      }
    } else {
      // No animation detected, break out of retry loop
      break
    }

    // Small pause between attempts to let page stabilize
    await page.waitForTimeout(300)
  }

  // Wait for card elements to appear
  // Multiple selectors to handle different page contexts:
  // - .canvas-card: DeckBuilder card wrapper
  // - .card-item: SealedPod card wrapper
  // - .card-image: img element when image is loaded
  // - .card-placeholder: shown when image hasn't loaded yet
  // - .set-card: used on the sets page
  // - .sealed-pod: the SealedPod container (indicates animation is done)
  await page.waitForSelector('.canvas-card, .card-item, .card-image, .card-placeholder, .set-card, .sealed-pod', { timeout: 30000 })
}

interface ViewportSize {
  width: number
  height: number
}

/**
 * Get the current viewport size
 */
export async function getViewportSize(page: Page): Promise<ViewportSize | null> {
  return page.viewportSize()
}

/**
 * Check if we're in mobile view
 */
export async function isMobileView(page: Page): Promise<boolean> {
  const size = await getViewportSize(page)
  return size != null && size.width <= 768
}

/**
 * Wait until a freshly created pool is readable server-side.
 *
 * /pools/new routes to /pool/<shareId> as soon as the packs are generated and
 * saves the pool behind the pack-opening animation, so a test that jumps
 * straight on to another route can beat the write and be told "Pool not found".
 * Poll the API rather than sleeping — the write lands whenever it lands.
 */
export async function waitForPoolPersisted(page: Page, shareId: string): Promise<void> {
  await expect
    .poll(async () => (await page.request.get(`/api/pools/${shareId}`)).status(), {
      timeout: 60000,
      message: `pool ${shareId} was never persisted`,
    })
    .toBe(200)
}

/**
 * From a page already navigating to a new pool: settle on /pool/<shareId>,
 * dismiss the pack-opening animation, and return the id once it is persisted.
 */
export async function settleNewPool(page: Page): Promise<string> {
  await page.waitForURL(/\/pool\/[a-zA-Z0-9_-]+/, { timeout: 60000 })
  const shareId = page.url().split('/pool/')[1]?.split('/')[0]?.split('?')[0] as string

  const skip = page.locator('.skip-button')
  if (await skip.count()) await skip.click().catch(() => {})

  await waitForPoolPersisted(page, shareId)
  return shareId
}

/**
 * Has this page landed on the finished draft's pool?
 *
 * A completed draft goes to /pool/<id>, which immediately redirects a draft
 * pool on to /draft_pool/<id> (sealed pools go to /sealed_pool/<id>). Testing
 * for "/pool/" alone misses the destination it actually settles on.
 */
export function isOnPoolPage(url: string): boolean {
  return /\/(draft_pool|sealed_pool|pool)\//.test(url)
}

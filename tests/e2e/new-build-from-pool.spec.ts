import { test, expect, chromium, Browser, BrowserContext, Page } from '@playwright/test'
import { settleNewPool } from './helpers.ts'
import { launchOptions } from './browser-launch'
import { createTestUser, cleanupTestUsers, closeDb } from './test-utils.ts'

/**
 * "Create your build from this pool" (the + chip) on the deck builder.
 *
 * WHY THIS EXISTS: 2dfeeed1 deleted the `draftLimitedMode` state declaration
 * from the build page while its setter was still called in an effect. Every
 * /pools/<root>/deck/<build> page threw `setDraftLimitedMode is not defined`
 * on mount and showed "Something Went Wrong" — so the + chip, which always
 * lands on a fresh build, was broken for every player. The file is
 * @ts-nocheck, so the type checker never saw it.
 *
 * Driven as a plain (non-alpha, non-beta) player through an 8-pack sealed
 * pool, which is how the players who reported it got there.
 */

const TEST_ID = `e2e_newbuild_${Date.now()}`
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000'

test.describe.configure({ mode: 'serial' })
test.skip(({ browserName, isMobile }) =>
  browserName !== 'chromium' || isMobile,
  'Skipped: Desktop Chromium only'
)
test.setTimeout(180000)

test.describe('Deck builder — new build from pool', () => {
  let browser: Browser
  let context: BrowserContext
  let page: Page
  const pageErrors: string[] = []

  test.beforeAll(async () => {
    const user = await createTestUser('NewBuildPlayer', TEST_ID)
    browser = await chromium.launch({ ...launchOptions })
    context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
    await context.addCookies([{
      name: user.cookieName,
      value: user.token,
      httpOnly: true,
      sameSite: 'Lax',
      url: BASE_URL,
    }])
    page = await context.newPage()
    // React's error boundary catches the throw, so it never reaches
    // `pageerror` — it only shows up as a console error.
    page.on('pageerror', err => pageErrors.push(err.message))
    page.on('console', msg => {
      if (msg.type() === 'error' && /ReferenceError|is not defined/.test(msg.text())) pageErrors.push(msg.text())
    })
  })

  test.afterAll(async () => {
    try { await cleanupTestUsers(TEST_ID) } catch (e: any) { console.error('Cleanup error:', e.message) }
    await closeDb()
    if (context) await context.close()
    if (browser) await browser.close()
  })

  test('the + chip opens a fresh, working build', async () => {
    await page.goto('/sealed')
    await page.getByTestId('sealed-pack-count-8').click()
    const firstSet = page.locator('.sets-grid .set-card').first()
    await expect(firstSet).toBeVisible({ timeout: 15000 })
    await firstSet.click()

    const poolShareId = await settleNewPool(page)
    await page.goto(`/pools/${poolShareId}/deck`)
    await expect(page.locator('.deck-builder, .leaders-bases-container').first())
      .toBeVisible({ timeout: 30000 })

    await page.getByRole('button', { name: 'Create your build from this pool' }).click()

    await page.waitForURL(new RegExp(`/pools/${poolShareId}/deck/(?!play)[a-zA-Z0-9_-]+`), { timeout: 30000 })
    await expect(page.locator('.deck-builder-header')).toBeVisible({ timeout: 30000 })
    await page.waitForLoadState('networkidle').catch(() => {})
    await expect(page.getByText('Something Went Wrong')).toHaveCount(0)
    await expect(page.locator('.deck-builder-header')).toBeVisible()
    expect(pageErrors).toEqual([])
  })
})

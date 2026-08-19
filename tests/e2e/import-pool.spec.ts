// @ts-nocheck
import { test, expect, chromium, Browser, BrowserContext, Page } from '@playwright/test'
import { createTestUser, cleanupTestUsers, closeDb } from './test-utils.ts'
import { launchOptions } from './browser-launch'

/**
 * Import Pool E2E (U11) — smoke test.
 *
 * Coverage:
 *   - Import Pool is gated out of the user menu for logged-out visitors, and
 *     reachable from it for an entitled (admin/allowlisted) user
 *   - Logged-out users see the auth-prompt screen on /import-pool
 *   - Non-patron logged-in users hit the patron gate at the API level (server-side)
 *   - Admin users (who bypass the patron gate) see the wizard
 *
 * Deferred (covered by follow-up E2E + synthetic fixture):
 *   - Full happy-path: upload → mock Anthropic 200 → resolve → confirm → land on
 *     /pool/[shareId]/deck. Requires synthetic registration-sheet fixture image
 *     (gitignored under tests/fixtures/import-pool/) and Playwright route mock
 *     for POST /api/import/extract.
 *   - Edge case: ambiguous row → user picks → Continue enables.
 *   - Edge case: pool != 96 → Continue disabled with tooltip.
 */

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000'
const TEST_ID = `e2e_import_pool_${Date.now()}`

test.describe.configure({ mode: 'serial' })
test.skip(
  ({ browserName, isMobile }) => browserName !== 'chromium' || isMobile,
  'Skipped: Desktop Chromium only',
)
test.setTimeout(60000)

test.describe('Import Pool', () => {
  let browser: Browser

  test.beforeAll(async () => {
    browser = await chromium.launch(launchOptions)
  })

  test.afterAll(async () => {
    await cleanupTestUsers(TEST_ID)
    await closeDb()
    await browser.close()
  })

  async function newPageAs(user: any | null): Promise<{ context: BrowserContext; page: Page }> {
    const urlObj = new URL(BASE_URL)
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    })
    if (user) {
      await context.addCookies([
        {
          name: user.cookieName,
          value: user.token,
          domain: urlObj.hostname,
          path: '/',
          httpOnly: true,
          secure: urlObj.protocol === 'https:',
        },
      ])
    }
    const page = await context.newPage()
    return { context, page }
  }

  test('Import Pool is not offered to a logged-out visitor', async () => {
    const { context, page } = await newPageAs(null)
    try {
      await page.goto(BASE_URL)
      await expect(page.locator('.mode-button-deckbuilder')).toBeVisible({ timeout: 10000 })
      // The entry point lives in the user menu behind the admin/allowlist gate,
      // so an anonymous visitor has no way in. (The words "Import Pool" can
      // still appear in the release-notes panel, hence the specific locator.)
      await expect(page.locator('.auth-widget-import-pool-item')).toHaveCount(0)
    } finally {
      await context.close()
    }
  })

  test('an entitled user reaches /import from the user menu', async () => {
    const user = await createTestUser('ImportPoolMenuTester', TEST_ID, { isAdmin: true })
    const { context, page } = await newPageAs(user)
    try {
      await page.goto(BASE_URL)
      await page.getByRole('button', { name: 'User menu' }).click()

      const item = page.locator('.auth-widget-import-pool-item')
      await expect(item).toBeVisible({ timeout: 10000 })
      await item.click()

      await expect(page).toHaveURL(/\/import/, { timeout: 10000 })
    } finally {
      await context.close()
    }
  })

  test('logged-out users see the auth prompt on /import', async () => {
    const { context, page } = await newPageAs(null)
    try {
      await page.goto(`${BASE_URL}/import`)
      // The phrase appears twice — in the explanatory note and on the button.
      await expect(page.getByRole('button', { name: 'Sign in with Discord' }))
        .toBeVisible({ timeout: 10000 })
      await expect(page.getByText('Friends of the Pod')).toBeVisible()
    } finally {
      await context.close()
    }
  })

  test('non-patron logged-in users get 403 from extract route', async () => {
    const user = await createTestUser('NonPatronTester', TEST_ID)
    const { context, page } = await newPageAs(user)
    try {
      // Patron gate is enforced at the API level. Logged-in non-patron sees
      // the wizard but extraction will return 403.
      const response = await page.request.post(`${BASE_URL}/api/import/extract`, {
        data: {
          images: [
            {
              data:
                'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
              mediaType: 'image/png',
            },
          ],
        },
      })
      expect(response.status()).toBe(403)
      // jsonResponse wraps every payload as { success, data, message }, so the
      // gate's code sits under data.
      const body = await response.json()
      expect(body.data?.code ?? body.code).toBe('PATRON_REQUIRED')
    } finally {
      await context.close()
    }
  })

  test('non-patron logged-in users get 403 from create route (gate-bypass guard)', async () => {
    // This is the regression guard for the security finding. The wizard never
    // POSTs to /api/pools directly; the only persistence path for imported
    // pools is /api/import/create, which re-checks is_patron.
    const user = await createTestUser('NonPatronGateTester', TEST_ID)
    const { context, page } = await newPageAs(user)
    try {
      const response = await page.request.post(`${BASE_URL}/api/import/create`, {
        data: {
          setCode: 'LAW',
          resolvedRows: [],
          activeLeaderId: 'fake',
          activeBaseId: 'fake',
          title: 'Should be rejected',
        },
      })
      expect(response.status()).toBe(403)
      // jsonResponse wraps every payload as { success, data, message }, so the
      // gate's code sits under data.
      const body = await response.json()
      expect(body.data?.code ?? body.code).toBe('PATRON_REQUIRED')
    } finally {
      await context.close()
    }
  })

  test('admin users (bypass patron gate) see the wizard', async () => {
    const user = await createTestUser('AdminTester', TEST_ID, { isAdmin: true })
    const { context, page } = await newPageAs(user)
    try {
      await page.goto(`${BASE_URL}/import`)
      // Should see the upload step, not the auth prompt
      await expect(page.getByText('Upload your registration sheet')).toBeVisible({ timeout: 10000 })
      await expect(page.getByText('Add photo')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Import Pool' })).toBeVisible()
    } finally {
      await context.close()
    }
  })
})

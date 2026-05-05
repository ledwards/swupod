// @ts-nocheck
import { test, expect, chromium, Browser, BrowserContext, Page } from '@playwright/test'
import { createTestUser, cleanupTestUsers, closeDb } from './test-utils.ts'

/**
 * Import Pool E2E (U11) — smoke test.
 *
 * Coverage:
 *   - Homepage Import Pool button is visible and navigates to /import-pool
 *   - Logged-out users see the auth-prompt screen on /import-pool
 *   - Non-patron logged-in users hit the patron gate at the API level (server-side)
 *   - Admin users (who bypass the patron gate) see the wizard
 *
 * Deferred (covered by follow-up E2E + synthetic fixture):
 *   - Full happy-path: upload → mock Anthropic 200 → resolve → confirm → land on
 *     /pool/[shareId]/deck. Requires synthetic registration-sheet fixture image
 *     (gitignored under tests/fixtures/import-pool/) and Playwright route mock
 *     for POST /api/import-pool/extract.
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
    browser = await chromium.launch({ headless: false, slowMo: 50 })
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

  test('homepage shows Import Pool button on the bottom row', async () => {
    const { context, page } = await newPageAs(null)
    try {
      await page.goto(BASE_URL)
      await expect(page.getByText('Import Pool', { exact: true })).toBeVisible({ timeout: 10000 })
      await expect(page.getByText('Limited Deckbuilder')).toBeVisible()
    } finally {
      await context.close()
    }
  })

  test('clicking Import Pool navigates to /import-pool', async () => {
    const { context, page } = await newPageAs(null)
    try {
      await page.goto(BASE_URL)
      await page.getByText('Import Pool', { exact: true }).click()
      await expect(page).toHaveURL(/\/import-pool/, { timeout: 10000 })
    } finally {
      await context.close()
    }
  })

  test('logged-out users see the auth prompt on /import-pool', async () => {
    const { context, page } = await newPageAs(null)
    try {
      await page.goto(`${BASE_URL}/import-pool`)
      await expect(page.getByText('Sign in with Discord')).toBeVisible({ timeout: 10000 })
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
      const response = await page.request.post(`${BASE_URL}/api/import-pool/extract`, {
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
      const body = await response.json()
      expect(body.code).toBe('PATRON_REQUIRED')
    } finally {
      await context.close()
    }
  })

  test('non-patron logged-in users get 403 from create route (gate-bypass guard)', async () => {
    // This is the regression guard for the security finding. The wizard never
    // POSTs to /api/pools directly; the only persistence path for imported
    // pools is /api/import-pool/create, which re-checks is_patron.
    const user = await createTestUser('NonPatronGateTester', TEST_ID)
    const { context, page } = await newPageAs(user)
    try {
      const response = await page.request.post(`${BASE_URL}/api/import-pool/create`, {
        data: {
          setCode: 'LAW',
          resolvedRows: [],
          activeLeaderId: 'fake',
          activeBaseId: 'fake',
          title: 'Should be rejected',
        },
      })
      expect(response.status()).toBe(403)
      const body = await response.json()
      expect(body.code).toBe('PATRON_REQUIRED')
    } finally {
      await context.close()
    }
  })

  test('admin users (bypass patron gate) see the wizard', async () => {
    const user = await createTestUser('AdminTester', TEST_ID, { isAdmin: true })
    const { context, page } = await newPageAs(user)
    try {
      await page.goto(`${BASE_URL}/import-pool`)
      // Should see the upload step, not the auth prompt
      await expect(page.getByText('Upload your registration sheet')).toBeVisible({ timeout: 10000 })
      await expect(page.getByText('Add photo')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Extract Pool' })).toBeVisible()
    } finally {
      await context.close()
    }
  })
})

// E2E for the GC 2026 promo-packs giveaway (plan U8). Every user action goes through the
// real UI — the only non-UI steps are test-user creation + cookie auth (server-to-server
// setup), per .claude/rules/testing.md.
//
// REQUIRES a Postgres with migration 078 applied. Easiest run:
//   npm run test:promo:e2e     (boots its own server on :3099 with the claim window open)
import { test, expect, type BrowserContext } from '@playwright/test'
import { createTestUser, cleanupTestUsers, closeDb } from './test-utils.ts'

const TEST_ID = 'gc-promo'
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000'

async function login(context: BrowserContext, user: Awaited<ReturnType<typeof createTestUser>>) {
  await context.addCookies([{ name: user.cookieName, value: user.token, url: BASE_URL }])
}

test.afterAll(async () => {
  await cleanupTestUsers(TEST_ID) // ON DELETE CASCADE cleans promo_entitlements too
  await closeDb()
})

test.describe('GC 2026 Promo Packs', () => {
  // One retry locally (CI already retries) to absorb the Next dev "first compile of a
  // route" navigation race (net::ERR_ABORTED) that only bites the very first hit.
  test.describe.configure({ retries: process.env.CI ? 2 : 1 })

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    for (const path of ['/gift/gc2026', '/gift/gc2026/black', '/formats/chaos-sealed']) {
      await page.goto(path, { waitUntil: 'commit' }).catch(() => {})
    }
    await ctx.close()
  })

  // AE1 — Silver unlock: gift page → claim → opening → confirmation, and the Event Pack is
  // then offered in Chaos Sealed's pack selector like any other pack.
  test('unlocks the Silver Pack and it becomes selectable in Chaos Sealed', async ({ browser }) => {
    const context = await browser.newContext()
    const user = await createTestUser('GcSilver', TEST_ID)
    await login(context, user)
    const page = await context.newPage()

    await page.goto('/gift/gc2026')
    const unlock = page.getByRole('button', { name: /Unlock Event Packs/i })
    await expect(unlock).toBeVisible()
    await unlock.click()

    // One-time gift moment (reused PackOpeningAnimation).
    await expect(page.locator('.pack-opening-container')).toBeVisible()

    // The entitlement persisted: the Event Pack is now a normal pack in the selector.
    await page.goto('/formats/chaos-sealed')
    await expect(page.locator('button[aria-label="Add one 2026 GC Silver Pack pack"]')).toBeVisible()

    await context.close()
  })

  // AE2 / F2 — idempotent: returning owner lands on the confirmation, no replay.
  test('re-visiting shows the unlocked confirmation with no second gift animation', async ({ browser }) => {
    const context = await browser.newContext()
    const user = await createTestUser('GcRepeat', TEST_ID)
    await login(context, user)
    const page = await context.newPage()

    await page.goto('/gift/gc2026')
    await page.getByRole('button', { name: /Unlock Event Packs/i }).click()
    await expect(page.locator('.pack-opening-container')).toBeVisible()

    await page.goto('/gift/gc2026')
    await expect(page.getByText(/Silver Pack is unlocked/i)).toBeVisible()
    await expect(page.locator('.pack-opening-container')).toHaveCount(0)

    await context.close()
  })

  // AE3 / F3 — locked Event Packs stay visible in the selector so you can see what's on
  // offer; they just aren't addable, and they say what's needed.
  test('shows locked Event Packs to a non-patron without making them addable', async ({ browser }) => {
    const context = await browser.newContext()
    const user = await createTestUser('GcNonPatron', TEST_ID)
    await login(context, user)
    const page = await context.newPage()

    await page.goto('/formats/chaos-sealed')

    // Silver: visible but locked behind the GC card.
    await expect(
      page.getByRole('link', { name: /2026 GC Silver Pack — Unlock it with your GC 2026 card/i })
    ).toBeVisible()
    await expect(page.locator('button[aria-label="Add one 2026 GC Silver Pack pack"]')).toHaveCount(0)

    // Black: visible but reserved for Friends of the Pod.
    await expect(
      page.getByRole('link', { name: /2026 GC Black Pack — Available to Friends of the Pod/i })
    ).toBeVisible()
    await expect(page.locator('button[aria-label="Add one 2026 GC Black Pack pack"]')).toHaveCount(0)

    // And the Black surface explains it.
    await page.goto('/gift/gc2026/black')
    await expect(page.getByText(/exclusive for Friends of the Pod/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /Become a Friend of the Pod/i })).toBeVisible()

    await context.close()
  })

  // AE4 — a Friend of the Pod unlocks Black, and it becomes selectable too.
  test('a Friend of the Pod unlocks the Black Pack and it becomes selectable', async ({ browser }) => {
    const context = await browser.newContext()
    const user = await createTestUser('GcPatron', TEST_ID, { isPatron: true })
    await login(context, user)
    const page = await context.newPage()

    await page.goto('/gift/gc2026/black')
    const unlock = page.getByRole('button', { name: /Unlock Black Pack/i })
    await expect(unlock).toBeVisible()
    await unlock.click()
    await expect(page.locator('.pack-opening-container')).toBeVisible()

    await page.goto('/formats/chaos-sealed')
    await expect(page.locator('button[aria-label="Add one 2026 GC Black Pack pack"]')).toBeVisible()

    await context.close()
  })

  // A pool needs at least one Leader-bearing pack. Event Packs are Units only, so an
  // all-Event-Pack pool would be unbuildable — the UI must say so and refuse to create it.
  test('refuses to create a pool with no Leader-bearing pack', async ({ browser }) => {
    const context = await browser.newContext()
    const user = await createTestUser('GcNoLeader', TEST_ID)
    await login(context, user)
    const page = await context.newPage()

    await page.goto('/gift/gc2026')
    await page.getByRole('button', { name: /Unlock Event Packs/i }).click()
    await expect(page.locator('.pack-opening-container')).toBeVisible()

    await page.goto('/formats/chaos-sealed')
    const addSilver = page.locator('button[aria-label="Add one 2026 GC Silver Pack pack"]')
    for (let i = 0; i < 6; i++) await addSilver.click()

    await expect(page.getByText(/no Leader\. Add at least one set pack/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /Create Chaos/i })).toBeDisabled()

    // Swapping one Event Pack for a set pack clears it.
    await page.locator('button[aria-label="Remove one 2026 GC Silver Pack pack"]').click()
    await page.locator('button[aria-label^="Add one "]').first().click()
    await expect(page.getByText(/no Leader\. Add at least one set pack/i)).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Create Chaos/i })).toBeEnabled()

    await context.close()
  })

  // An owned Event Pack fills a pool slot exactly like a set pack.
  test('an owned Event Pack fills a Chaos Sealed slot like any other pack', async ({ browser }) => {
    const context = await browser.newContext()
    const user = await createTestUser('GcSelect', TEST_ID)
    await login(context, user)
    const page = await context.newPage()

    await page.goto('/gift/gc2026')
    await page.getByRole('button', { name: /Unlock Event Packs/i }).click()
    await expect(page.locator('.pack-opening-container')).toBeVisible()

    await page.goto('/formats/chaos-sealed')
    // 5 regular set packs (Event Packs sort last in the grid) + 1 Event Pack = the 6 required.
    const addButtons = page.locator('button[aria-label^="Add one "]')
    for (let i = 0; i < 5; i++) await addButtons.nth(i).click()
    await page.locator('button[aria-label="Add one 2026 GC Silver Pack pack"]').click()

    const createBtn = page.getByRole('button', { name: /Create Chaos/i })
    await expect(createBtn).toBeEnabled()
    await createBtn.click()

    await expect(page.locator('.pack-opening-container')).toBeVisible({ timeout: 25000 })

    // ...and the finished pool actually opens. Regression guard for the sealed_pool
    // existence gate: it INNER JOINed pods, but every pool created outside a pod
    // (chaos sealed, pack blitz, pack wars, rotisserie) has a NULL pod_id, so the
    // join dropped it and the page 404'd with "Pool not found".
    await page.locator('.skip-button').click()
    await page.waitForURL(/\/(sealed_)?pool\/[a-zA-Z0-9_-]+/, { timeout: 30000 })
    await expect(page.getByText(/Pool not found/i)).toHaveCount(0)
    await expect(page.locator('.packs-container .card-item').first()).toBeVisible({ timeout: 20000 })

    await context.close()
  })
})

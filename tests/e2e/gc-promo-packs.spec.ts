// E2E for the GC 2026 promo-packs giveaway (plan U8). Every user action goes through the
// real UI — the only non-UI steps are test-user creation + cookie auth (server-to-server
// setup) and reading entitlement state, per .claude/rules/testing.md.
//
// REQUIRES, to run:
//   - a Postgres with migration 078 applied (promo_entitlements),
//   - the dev server started with PROMO_CLAIM_WINDOW_OVERRIDE=1 so the GC-weekend claim
//     window is open outside Jul 24–26 (the non-prod test seam from U2/U4), e.g.:
//       PROMO_CLAIM_WINDOW_OVERRIDE=1 npm run dev
//     then:  npm run test:e2e -- --grep "GC 2026 Promo Packs"
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
  // AE1 — Silver unlock happy path: gift page → claim → gift animation → packs live in Chaos.
  test('unlocks the Silver Pack from the gift page and it appears in Chaos Sealed', async ({ browser }) => {
    const context = await browser.newContext()
    const user = await createTestUser('GcSilver', TEST_ID)
    await login(context, user)
    const page = await context.newPage()

    await page.goto('/gift/gc2026')
    const unlock = page.getByRole('button', { name: /Unlock Event Packs/i })
    await expect(unlock).toBeVisible()
    await unlock.click()

    // The one-time gift moment mounts (full-screen PackOpeningAnimation).
    await expect(page.locator('.pack-opening-container')).toBeVisible()

    // The entitlement persisted: Chaos Sealed's Promo Packs section now shows Silver openable.
    await page.goto('/formats/chaos-sealed')
    await expect(page.getByRole('heading', { name: 'GC 2026 Promo Packs' })).toBeVisible()
    const silverTile = page.locator('.promo-pack-tile--silver')
    await expect(silverTile).toContainText('Silver Pack')
    await expect(silverTile).toContainText('Open pack')

    await context.close()
  })

  // AE2 / F2 — idempotent re-claim: re-visiting the gift page shows "already unlocked", no replay.
  test('re-visiting shows already-unlocked with no second gift animation', async ({ browser }) => {
    const context = await browser.newContext()
    const user = await createTestUser('GcRepeat', TEST_ID)
    await login(context, user)
    const page = await context.newPage()

    await page.goto('/gift/gc2026')
    await page.getByRole('button', { name: /Unlock Event Packs/i }).click()
    await expect(page.locator('.pack-opening-container')).toBeVisible()

    await page.goto('/gift/gc2026')
    await expect(page.getByText(/already unlocked/i)).toBeVisible()
    await expect(page.locator('.pack-opening-container')).toHaveCount(0)

    await context.close()
  })

  // AE3 / F3 — non-patron: Black tile is a locked tease → Black surface shows the soft CTA.
  test('a non-patron sees the Black Pack locked and the Friends-of-the-Pod CTA', async ({ browser }) => {
    const context = await browser.newContext()
    const user = await createTestUser('GcNonPatron', TEST_ID)
    await login(context, user)
    const page = await context.newPage()

    await page.goto('/formats/chaos-sealed')
    const blackTile = page.locator('.promo-pack-tile--black')
    await expect(blackTile).toContainText('Friends of the Pod unlocks this')
    await blackTile.click()

    await expect(page).toHaveURL(/\/gift\/gc2026\/black/)
    await expect(page.getByText(/exclusive for Friends of the Pod/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /Become a Friend of the Pod/i })).toBeVisible()

    await context.close()
  })

  // AE4 — patron can unlock the Black Pack, and it then appears openable in Chaos Sealed.
  test('a Friend of the Pod unlocks the Black Pack', async ({ browser }) => {
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
    const blackTile = page.locator('.promo-pack-tile--black')
    await expect(blackTile).toContainText('Open pack')

    await context.close()
  })
})

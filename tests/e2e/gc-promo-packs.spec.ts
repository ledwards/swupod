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
    await expect(page.getByText(/ten alt-art event promos/i)).toBeVisible()
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

  // Event Packs augment the pool: they don't consume one of its slots, and you can stack
  // several — capped at 8 total across both tiers.
  test('Event Packs do not count against the pool pack count and stack up to 8', async ({ browser }) => {
    const context = await browser.newContext()
    const user = await createTestUser('GcAugment', TEST_ID)
    await login(context, user)
    const page = await context.newPage()

    await page.goto('/gift/gc2026')
    await page.getByRole('button', { name: /Unlock Event Packs/i }).click()
    await expect(page.locator('.pack-opening-container')).toBeVisible()

    await page.goto('/formats/chaos-sealed')
    const addSilver = page.locator('button[aria-label="Add one 2026 GC Silver Pack pack"]')
    await addSilver.click()

    // The Event Pack shows in its own row and the pool is still empty.
    await expect(page.locator('.chaos-sealed-promo-row')).toBeVisible()
    await expect(page.getByRole('heading', { name: /Your Chaos Sealed \(0\/6\)/ })).toBeVisible()

    // Stack up to 8 — the add control stays available through the 8th, then hides.
    for (let i = 1; i < 8; i++) await addSilver.click()
    await expect(page.locator('.chaos-sealed-promo-row img')).toHaveCount(8)
    await expect(addSilver).not.toBeVisible()

    // Event Packs never consume pool slots: six set packs still fill the pool.
    const addSetPack = page.locator('button[aria-label^="Add one "]')
    for (let i = 0; i < 6; i++) await addSetPack.first().click()
    await expect(page.getByRole('heading', { name: /Your Chaos Sealed \(6\/6\)/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Create Chaos/i })).toBeEnabled()

    await context.close()
  })

  // Chaos Draft offers opt-in Event Packs in the same selector row; they don't count toward the
  // set-pack count (each is drafted as its own bonus round instead).
  test('Chaos Draft offers opt-in Event Packs that do not count against the draft pack count', async ({ browser }) => {
    const context = await browser.newContext()
    const user = await createTestUser('CdAugment', TEST_ID)
    await login(context, user)
    const page = await context.newPage()

    await page.goto('/gift/gc2026')
    await page.getByRole('button', { name: /Unlock Event Packs/i }).click()
    await expect(page.locator('.pack-opening-container')).toBeVisible()

    await page.goto('/formats/chaos-draft')
    const addSilver = page.locator('button[aria-label="Add one 2026 GC Silver Pack pack"]')
    await addSilver.click()

    // Event Pack rides along in its own row; the draft slots are still empty.
    await expect(page.locator('.chaos-draft-promo-row')).toBeVisible()
    await expect(page.getByRole('heading', { name: /Your Chaos Draft \(0\/3\)/ })).toBeVisible()

    // Three set packs fill the draft; the Event Pack didn't consume a slot.
    const addSetPack = page.locator('button[aria-label^="Add one "]')
    for (let i = 0; i < 3; i++) await addSetPack.first().click()
    await expect(page.getByRole('heading', { name: /Your Chaos Draft \(3\/3\)/ })).toBeVisible()
    await expect(page.locator('.chaos-draft-promo-row')).toBeVisible()
    await expect(page.getByRole('button', { name: /Create Chaos/i })).toBeEnabled()

    await context.close()
  })

  // The Leader rule is now unreachable through the UI (six set packs are always required),
  // but the API must still refuse a hand-rolled all-Event-Pack payload.
  test('the API refuses a pool with no Leader-bearing pack', async ({ browser }) => {
    const context = await browser.newContext()
    const user = await createTestUser('GcNoLeader', TEST_ID)
    await login(context, user)

    const res = await context.request.post('/api/formats/chaos-sealed', {
      data: { setCodes: ['GC2026_SILVER'], packCount: 1 },
    })
    expect(res.status()).toBe(400)
    expect((await res.json()).message).toMatch(/no Leader\. Add at least one set pack/i)

    await context.close()
  })

  // An owned Event Pack is generated into the pool on top of the six set packs.
  test('an owned Event Pack is added to the generated pool on top of the set packs', async ({ browser }) => {
    const context = await browser.newContext()
    const user = await createTestUser('GcSelect', TEST_ID)
    await login(context, user)
    const page = await context.newPage()

    await page.goto('/gift/gc2026')
    await page.getByRole('button', { name: /Unlock Event Packs/i }).click()
    await expect(page.locator('.pack-opening-container')).toBeVisible()

    await page.goto('/formats/chaos-sealed')
    // The 6 required set packs, plus 2 Event Packs that augment rather than replace them.
    const addSetPack = page.locator('button[aria-label^="Add one "]')
    for (let i = 0; i < 6; i++) await addSetPack.first().click()
    await page.locator('button[aria-label="Add one 2026 GC Silver Pack pack"]').click()
    await page.locator('button[aria-label="Add one 2026 GC Silver Pack pack"]').click()

    const createBtn = page.getByRole('button', { name: /Create Chaos/i })
    await expect(createBtn).toBeEnabled()
    await createBtn.click()

    await expect(page.locator('.pack-opening-container')).toBeVisible({ timeout: 25000 })

    // Every generated pack opens, not just the set-pack slot count — 6 set + 2 Event = 8.
    // (Regression: the animation was told to open only `packCount` packs, so the Event
    // Packs — which sort first — were the only ones you got to open.)
    await expect(page.locator('.pack-counter')).toHaveText(/\/\s*8/)

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

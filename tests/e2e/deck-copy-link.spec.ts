import { test, expect, chromium, Browser, BrowserContext, Page } from '@playwright/test'
import { settleNewPool } from './helpers.ts'
import { launchOptions } from './browser-launch'

/**
 * Copy Link on the deck pages — the header row and the sticky nav bar.
 *
 * WHY THIS EXISTS: this control has been deleted twice by refactors that looked
 * harmless (1bbb2029 took it out of the header, f68065d2 out of the sticky bar)
 * and nothing in the suite noticed either time. It is the only way to hand
 * someone a link to a specific build, so losing it is silent and expensive.
 *
 * What it pins down:
 *  1. The header row is Ready to Play → Copy Link → Stats, in that order.
 *  2. Copy Link copies the DECK page, not /pool/<id> — that path is a redirect
 *     to the pool's card view, so it used to send people to a build's pool
 *     instead of the deck they were looking at.
 *  3. The sticky bar carries the same action once the header scrolls away.
 *  4. The sticky bar releases again on the way back up.
 *
 * Scope note: (4) guards the round trip, not the specific rAF starvation that
 * broke it — headless Chromium runs requestAnimationFrame normally, so this
 * would have passed against the old code. The build-URL branch of
 * resolveDeckShareUrl is covered in src/utils/deckBuilderSharing.test.ts;
 * driving a second build through the UI here would cost an auth round trip for
 * a case the unit spec already states.
 */

const TEST_ID = `e2e_copylink_${Date.now()}`

test.describe.configure({ mode: 'serial' })
test.skip(({ browserName, isMobile }) =>
  browserName !== 'chromium' || isMobile,
  'Skipped: Desktop Chromium only (clipboard permissions + sticky bar are desktop)'
)
test.setTimeout(180000)

test.describe('Deck builder — Copy Link', () => {
  let browser: Browser
  let context: BrowserContext
  let page: Page
  let poolShareId: string | null = null
  let deckUrl: string | null = null

  /** Read the clipboard, having first proven the click is what put it there. */
  const readClipboard = () => page.evaluate(() => navigator.clipboard.readText())
  const clearClipboard = () => page.evaluate(() => navigator.clipboard.writeText(''))

  test.beforeAll(async () => {
    console.log(`\n${'='.repeat(50)}`)
    console.log('Starting Deck Copy Link Test')
    console.log(`Test ID: ${TEST_ID}`)
    console.log(`${'='.repeat(50)}\n`)

    browser = await chromium.launch({ ...launchOptions })
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      permissions: ['clipboard-read', 'clipboard-write'],
    })
    page = await context.newPage()

    // Open a sealed pool the way a player does: pick a set, sit through the
    // pack opening, then walk into the deck builder.
    console.log('Creating a sealed pool through the UI...')
    await page.goto('/sealed')
    await page.waitForLoadState('domcontentloaded')
    const firstSet = page.locator('.sets-grid .set-card').first()
    await expect(firstSet).toBeVisible({ timeout: 15000 })
    await firstSet.scrollIntoViewIfNeeded()
    await firstSet.click()

    // settleNewPool polls /api/pools to know the write landed. That is a
    // synchronisation wait, not a stand-in for a user action — the pool is
    // created by the clicks above.
    poolShareId = await settleNewPool(page)
    console.log(`✓ Pool ${poolShareId} created`)

    await page.goto(`/pool/${poolShareId}/deck`)
    await expect(page.locator('.deck-builder, .leaders-bases-container').first())
      .toBeVisible({ timeout: 30000 })

    deckUrl = `${new URL(page.url()).origin}/pool/${poolShareId}/deck`
    console.log(`✓ Deck builder open at ${deckUrl}\n`)
  })

  test.afterAll(async () => {
    await context?.close()
    await browser?.close()
  })

  test('header row is Ready to Play → Copy Link → Stats', async () => {
    const headerButtons = page.locator('.header-buttons')
    await expect(headerButtons).toBeVisible({ timeout: 30000 })

    // The play button renders its "not legal yet" copy on a fresh pool, so
    // match either wording — the point of this assertion is the ORDER.
    await expect
      .poll(
        () => headerButtons.locator('button').evaluateAll(
          btns => btns.map(b => b.textContent?.trim() ?? '')
        ),
        { timeout: 20000, message: 'header buttons never settled' },
      )
      .toHaveLength(3)

    const labels = await headerButtons.locator('button').evaluateAll(
      btns => btns.map(b => b.textContent?.trim() ?? '')
    )
    expect(labels[0]).toMatch(/Ready to Play|Finish Deckbuilding to Play/)
    expect(labels[1]).toBe('Copy Link')
    expect(labels[2]).toBe('Stats')
  })

  test('header Copy Link copies this deck page, not the pool redirect', async () => {
    await clearClipboard()

    await page.locator('.header-buttons button', { hasText: 'Copy Link' }).click()

    // The inline status confirms the handler ran rather than the click missing.
    await expect(page.locator('.share-button-group .inline-status')).toHaveText('Copied!')

    expect(await readClipboard()).toBe(deckUrl)
  })

  test('sticky bar carries Copy Link once the header scrolls away', async () => {
    await clearClipboard()

    // A real wheel gesture, not window.scrollTo — the sticky bar is driven by
    // scroll events and this is the input a player actually produces.
    await page.mouse.move(640, 400)
    await page.mouse.wheel(0, 1400)

    await expect(page.locator('.deck-info-bar.sticky')).toBeVisible({ timeout: 10000 })
    const nav = page.locator('.header-buttons-in-nav')
    await expect(nav).toBeVisible()

    // Icon-only in this row: the label lives in the tooltip span.
    const stickyCopy = nav.locator('button:has(.button-tooltip:text-is("Copy Link"))')
    await expect(stickyCopy).toHaveCount(1)

    await stickyCopy.click()
    expect(await readClipboard()).toBe(deckUrl)
  })

  test('sticky bar releases on the way back up', async () => {
    await page.mouse.move(640, 400)
    await page.mouse.wheel(0, -2000)

    await expect(page.locator('.deck-info-bar.sticky')).toHaveCount(0, { timeout: 10000 })
    await expect(page.locator('.header-buttons-in-nav')).toHaveCount(0)
    // The full header row is back, Copy Link included.
    await expect(page.locator('.header-buttons button', { hasText: 'Copy Link' })).toBeVisible()
  })
})

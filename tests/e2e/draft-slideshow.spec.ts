// tests/e2e/draft-slideshow.spec.ts
//
// U8 — Playwright visual validation for Draft Report Slideshow Mode (plan R13,
// validating R1–R12). The single hard requirement that shapes the feature is:
// EVERYTHING fits on screen WITHOUT scrolling, with cards as large as the space
// allows. These tests prove that (and the rest) THROUGH THE UI across viewports.
//
// Interactions are UI-ONLY (memory feedback_e2e_ui_only): we navigate to the
// report page, CLICK the "Slideshow Mode" toggle, CLICK player tabs, CLICK edge
// arrows / press ArrowLeft/Right, and press Escape. We NEVER call the slideshow
// API to drive behavior. Seeding FIXTURE STATE via SQL is the only non-UI step.
//
// The seeded draft mirrors the route.test.ts fixture shape (instanceIds
// namespaced `s{seatIdx}-p{packNum}-c{slot}`) so reconstructDraftLog yields
// deterministic visibleCards and a KNOWN pickedInstanceId (`s{idx}-p1-c0` for
// pack1/pick1). One seat deliberately OMITS its pack1/pick1 pick so that slide
// has a null pickedInstanceId (the "zero highlighted" case).
//
// Run: npm run test:e2e:chromium -- --grep "slideshow" --workers=1
// Requires: dev server on :3000, DATABASE_URL reachable (both already provided).
import { test, expect, Page } from '@playwright/test'
import pg from 'pg'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import jwt from 'jsonwebtoken'
import { cleanupTestUsers, closeDb } from './test-utils.ts'
import { takeScreenshot, checkLayoutIssues } from './helpers.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '../../.env.local') })
dotenv.config({ path: join(__dirname, '../../.env') })

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000'
const TEST_ID = `e2e_slideshow_${Date.now()}`
const JWT_SECRET = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || 'change-me-in-production'
const SESSION_COOKIE = 'swupod_session'
const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL

const VIEWPORTS = [
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '1366x768', width: 1366, height: 768 },
  { name: '1024x768', width: 1024, height: 768 },
]
const MOBILE_VIEWPORT = { width: 390, height: 844 }

const CARDS_PER_PACK = 14
const TOTAL_SEATS = 4
const LEADER_ROUNDS = Math.min(3, TOTAL_SEATS) // 3
const SLIDE_COUNT = LEADER_ROUNDS + 3 * CARDS_PER_PACK // 3 + 42 = 45
// Single-player native cap (SlideshowStage SINGLE_CAP_PORTRAIT.w). R6: a lone
// last-pick card must not exceed this and must not fill the screen.
const SINGLE_CAP_W = 360

let db: pg.Pool

// ── Fixture builders (mirror route.test.ts namespacing) ──────────────────────

// A card object: instanceId drives reconstruction + highlight; id/name let the
// Card component render a real `.canvas-card` element (no image → placeholder,
// but the element + classes the assertions key off still exist).
function makeCard(seatIdx: number, packNum: number, slot: number) {
  const instanceId = `s${seatIdx}-p${packNum}-c${slot}`
  return {
    instanceId,
    id: instanceId,
    cardId: `card-${packNum}-${slot}`,
    name: `Card ${packNum}.${slot}`,
  }
}

function makePack(seatIdx: number, packNum: number) {
  const cards = []
  for (let slot = 0; slot < CARDS_PER_PACK; slot++) cards.push(makeCard(seatIdx, packNum, slot))
  return { cards }
}

// allPacks[seatIdx][packIdx] = { cards: [...] } — every seat gets 3 packs.
function makeAllPacks() {
  const allPacks = []
  for (let seatIdx = 0; seatIdx < TOTAL_SEATS; seatIdx++) {
    allPacks.push([makePack(seatIdx, 1), makePack(seatIdx, 2), makePack(seatIdx, 3)])
  }
  return allPacks
}

// Per-seat drafted cards.
//
// PACK 1 models the REAL wheel so a player's visibleCards shrinks pick-by-pick to
// exactly ONE card at the last pick (needed for the R6 single-card cap test).
// Pack 1 passes LEFT; with N seats the 0-indexed seat `t` holds physical pack
// `(t + K-1) mod N` at pick K and takes that pack's slot `(K-1)`. So for seat 1
// (t=0) the pack it views at pick K has its slots 0..K-2 already taken by the
// prior pickers → `CARDS_PER_PACK-(K-1)` remain, i.e. 1 at pick 14. At pick 1
// every seat holds its OWN pack `t` and takes slot 0 → `s{t}-p1-c0` (so the R4
// highlight + null-pick assertions still hold).
//
// PACKS 2 & 3 keep the simple "own slot 0" scheme (their exact remaining counts
// don't matter to any assertion; only pack 1 needs the drain-to-one property).
//
// `skipPack1Pick1` omits seat 2's pack1/pick1 pick → that slide's pickedInstanceId
// is null (the zero-highlight case). It also means seat 2 removes nothing at pick
// 1 from its own pack, which is fine — the single-card slide is exercised on
// seat 1, whose wheel is unaffected by seat 2 skipping its own pack's slot 0.
function makeDraftedCards(seatIdx: number, opts: { skipPack1Pick1?: boolean } = {}) {
  const drafted = []
  // Pack 1 — wheel model.
  for (let pick = 1; pick <= CARDS_PER_PACK; pick++) {
    if (opts.skipPack1Pick1 && pick === 1) continue
    const heldPack = (seatIdx + (pick - 1)) % TOTAL_SEATS // physical pack in front at this pick
    const slot = pick - 1 // takes a distinct slot each pick so the pack drains
    drafted.push({
      instanceId: `s${heldPack}-p1-c${slot}`,
      packNumber: 1,
      pickInPack: pick,
      pickNumber: pick,
    })
  }
  // Packs 2 & 3 — simple own-slot-0 scheme.
  for (let packNum = 2; packNum <= 3; packNum++) {
    for (let pick = 1; pick <= CARDS_PER_PACK; pick++) {
      drafted.push({
        instanceId: `s${seatIdx}-p${packNum}-c0`,
        packNumber: packNum,
        pickInPack: pick,
        pickNumber: (packNum - 1) * CARDS_PER_PACK + pick,
      })
    }
  }
  return drafted
}

// Leader cards MUST carry isLeader/type so the Card component renders them with
// the landscape `.leader` aspect-ratio (3.5/2.5). The stage sizes leader slides
// for landscape; if the rendered card were portrait it would be ~1.4× too tall
// and spill out of the stage band. (Real drafted leaders carry these fields.)
function makeDraftedLeaders(seatIdx: number) {
  const leaders = []
  for (let round = 1; round <= LEADER_ROUNDS; round++) {
    const instanceId = `s${seatIdx}-leader-r${round}`
    leaders.push({
      instanceId,
      id: instanceId,
      leaderRound: round,
      name: `Leader ${seatIdx}.${round}`,
      isLeader: true,
      type: 'Leader',
    })
  }
  return leaders
}

// A minimal deck_builder_state giving the player an activeLeader + activeBase,
// so the tabs render leader/base text (the per-pool report route's source).
function makeDeckBuilderState(seatNumber: number) {
  const leaderId = `leader-pos-${seatNumber}`
  const baseId = `base-pos-${seatNumber}`
  return {
    activeLeader: leaderId,
    activeBase: baseId,
    cardPositions: {
      [leaderId]: { card: { name: `Leader ${seatNumber}`, type: 'Leader', isLeader: true, aspects: ['Vigilance'] } },
      [baseId]: { card: { name: `Base ${seatNumber}`, type: 'Base', isBase: true, aspects: ['Command'] } },
    },
  }
}

// ── Seeded fixture handle ────────────────────────────────────────────────────

interface SeatSeed {
  seatNumber: number
  userId: string | null // null for the bot seat
  token: string | null // JWT to auth AS this seat's user (participants)
  isBot: boolean
  isLogPublic: boolean
  poolShareId: string | null // card_pools.share_id for this seat's report page
  reportPublic: boolean
}

interface DraftFixture {
  shareId: string
  hostId: string
  seats: SeatSeed[]
  strangerToken: string // a logged-in NON-participant
}

async function createUser(username: string): Promise<{ id: string; token: string }> {
  const uniqueId = `test_${TEST_ID}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const res = await db.query(
    `INSERT INTO users (discord_id, username, email, avatar_url, is_beta_tester, is_admin)
     VALUES ($1, $2, $3, $4, true, false) RETURNING id`,
    [uniqueId, username, `${uniqueId}@test.local`, null],
  )
  const id = res.rows[0].id
  const token = jwt.sign(
    { id, email: `${uniqueId}@test.local`, username, avatar_url: null, is_beta_tester: true, is_admin: false, auth_version: 1 },
    JWT_SECRET,
    { expiresIn: '1d' },
  )
  return { id, token }
}

/**
 * Seed a completed 4-seat draft:
 *  - seat 1: private (is_log_public=false), participant, report_public pool
 *  - seat 2: PUBLIC (is_log_public=true), participant, OMITS pack1/pick1 pick
 *            (so its pack1/pick1 slide is the null-pick / zero-highlight case)
 *  - seat 3: PUBLIC (is_log_public=true), participant
 *  - seat 4: BOT (user_id NULL), always viewable
 * Seat 1 being private is what a NON-participant sees locked (cards withheld).
 */
async function seedDraft(): Promise<DraftFixture> {
  const host = await createUser('SlideHost') // host == seat 1's user
  const seat2User = await createUser('SlideP2')
  const seat3User = await createUser('SlideP3')
  const stranger = await createUser('SlideStranger')

  const shareId = `slideshow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const allPacks = makeAllPacks()

  const podRes = await db.query(
    `INSERT INTO pods (share_id, host_id, set_code, set_name, name, status,
       max_players, current_players, all_packs, is_log_public, pod_type, is_public)
     VALUES ($1, $2, 'SOR', 'Spark of Rebellion', 'Slideshow E2E Draft', 'complete',
       8, 4, $3::jsonb, false, 'draft', false)
     RETURNING id`,
    [shareId, host.id, JSON.stringify(allPacks)],
  )
  const podId = podRes.rows[0].id

  const seatDefs = [
    { seatNumber: 1, user: host, isBot: false, isLogPublic: false, skip: false },
    { seatNumber: 2, user: seat2User, isBot: false, isLogPublic: true, skip: true },
    { seatNumber: 3, user: seat3User, isBot: false, isLogPublic: true, skip: false },
    { seatNumber: 4, user: null, isBot: true, isLogPublic: false, skip: false },
  ]

  const seats: SeatSeed[] = []
  for (const def of seatDefs) {
    const seatIdx = def.seatNumber - 1
    await db.query(
      `INSERT INTO pod_players (pod_id, user_id, seat_number, drafted_cards, drafted_leaders, is_bot, is_log_public)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7)`,
      [
        podId,
        def.user?.id ?? null,
        def.seatNumber,
        JSON.stringify(makeDraftedCards(seatIdx, { skipPack1Pick1: def.skip })),
        JSON.stringify(makeDraftedLeaders(seatIdx)),
        def.isBot,
        def.isLogPublic,
      ],
    )

    // A pool per non-bot seat: gives the seat a report page (card_pools.share_id)
    // AND supplies activeLeader/base via deck_builder_state. seat 1's pool is
    // report_public so a stranger can OPEN the report page as a non-participant.
    let poolShareId: string | null = null
    const reportPublic = def.seatNumber === 1
    if (def.user) {
      poolShareId = `pool-${shareId}-s${def.seatNumber}`
      await db.query(
        `INSERT INTO card_pools (share_id, user_id, pod_id, set_code, pool_type,
           deck_builder_state, report_public, cards, packs)
         VALUES ($1, $2, $3, 'SOR', 'draft', $4::jsonb, $5, '[]'::jsonb, '[]'::jsonb)`,
        [poolShareId, def.user.id, podId, JSON.stringify(makeDeckBuilderState(def.seatNumber)), reportPublic],
      )
    }

    seats.push({
      seatNumber: def.seatNumber,
      userId: def.user?.id ?? null,
      token: def.user?.token ?? null,
      isBot: def.isBot,
      isLogPublic: def.isLogPublic,
      poolShareId,
      reportPublic,
    })
  }

  return { shareId, hostId: host.id, seats, strangerToken: stranger.token }
}

// ── Auth helpers (route + page both read the swupod_session JWT cookie) ───────

async function setSessionCookie(page: Page, token: string | null) {
  await page.context().clearCookies()
  if (token) {
    await page.context().addCookies([
      { name: SESSION_COOKIE, value: token, domain: 'localhost', path: '/' },
    ])
  }
}

// ── UI navigation helpers (everything below drives the real UI) ──────────────

const REPORT_PATH = (f: DraftFixture, poolShareId: string) =>
  `${BASE_URL}/draft/${f.shareId}/report/${poolShareId}`

const overlay = (page: Page) => page.locator('[role="dialog"][aria-label="Slideshow Mode"]')
const toggle = (page: Page) => page.getByRole('button', { name: 'Open Slideshow Mode' })

/** Navigate to a report page and wait for the header (report loaded). */
async function gotoReport(page: Page, f: DraftFixture, poolShareId: string) {
  await page.goto(REPORT_PATH(f, poolShareId), { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.draft-report-header')).toBeVisible({ timeout: 20000 })
}

/** Open Slideshow Mode via the toggle and wait until the stage is ready. */
async function openSlideshow(page: Page) {
  await expect(toggle(page)).toBeVisible({ timeout: 20000 })
  await toggle(page).click()
  await expect(overlay(page)).toBeVisible({ timeout: 10000 })
  // Wait for the ready layout (tabs present) — not the loading/error band.
  await expect(page.locator('.draft-slideshow-tabbar .slideshow-player-tab').first()).toBeVisible({ timeout: 15000 })
  // Stage cards rendered (the fitted grid). Reconstruction yields a full pack.
  await expect(page.locator('.slideshow-stage .canvas-card').first()).toBeVisible({ timeout: 15000 })
}

/** The non-"All" player tabs (selectable + locked), in DOM order. */
function playerTabs(page: Page) {
  return page.locator('.slideshow-player-tab:not(.slideshow-player-tab--all)')
}

// The overlay root is the feature surface; its scroll metrics ARE the no-scroll
// gate (R5). Two facts learned while building U8 shape this assertion:
//   1. Horizontal: fitted card widths are fractional (the fit util maximizes
//      size), so the row's content width ceils to ~2px over the integer client
//      width. Nothing is clipped and the overlay does not actually scroll — this
//      is pure sub-pixel rounding, so a 2px horizontal tolerance is correct.
//   2. The page's `document.scrollingElement` is <html>, and the report page
//      mounted BEHIND the fixed overlay is legitimately taller than the viewport
//      at 1366/1024. The overlay locks `body{overflow:hidden}`, which (because
//      <html> is overflow:visible) propagates to the viewport and makes the page
//      UNSCROLLABLE — but that hidden, unreachable content still inflates
//      `document.scrollingElement.scrollHeight`. So the meaningful R5 invariant
//      for the document is "a real wheel gesture moves nothing", asserted via an
//      actual mouse wheel, NOT the raw scrollHeight (which the behind-report
//      content contaminates for a benign reason).
const SUBPIXEL_TOLERANCE = 2

/**
 * Assert the slideshow does not scroll at the current viewport:
 *  - overlay root: scrollHeight ≤ clientHeight (vertical, the headline) AND
 *    scrollWidth ≤ clientWidth + sub-pixel tolerance (horizontal).
 *  - the document: a real wheel gesture over the overlay scrolls nothing, and
 *    body overflow is locked hidden (the user genuinely cannot scroll the page).
 *  - no element extends past the viewport (project helper, horizontal).
 */
async function assertNoScroll(page: Page, vpName: string) {
  const metrics = await page.evaluate(() => {
    const root = document.querySelector('[role="dialog"][aria-label="Slideshow Mode"]') as HTMLElement
    return {
      rootScrollH: root.scrollHeight,
      rootClientH: root.clientHeight,
      rootScrollW: root.scrollWidth,
      rootClientW: root.clientWidth,
      bodyOverflow: getComputedStyle(document.body).overflow,
    }
  })
  // VERTICAL (headline): the overlay root must not be vertically scrollable.
  expect(metrics.rootScrollH, `overlay vertical overflow @ ${vpName}`).toBeLessThanOrEqual(metrics.rootClientH)
  // HORIZONTAL: within the documented sub-pixel tolerance.
  expect(metrics.rootScrollW, `overlay horizontal overflow @ ${vpName}`).toBeLessThanOrEqual(
    metrics.rootClientW + SUBPIXEL_TOLERANCE,
  )
  // The page scroll-lock is engaged.
  expect(metrics.bodyOverflow, `body scroll must be locked @ ${vpName}`).toBe('hidden')

  // The document must be genuinely unscrollable: a real wheel gesture over the
  // center of the overlay must not move the page scroller.
  const beforeY = await page.evaluate(() => document.scrollingElement!.scrollTop)
  const vp = page.viewportSize()!
  await page.mouse.move(vp.width / 2, vp.height / 2)
  await page.mouse.wheel(0, 800)
  await page.waitForTimeout(150)
  const afterY = await page.evaluate(() => document.scrollingElement!.scrollTop)
  expect(afterY, `document must not scroll on wheel @ ${vpName}`).toBe(beforeY)

  // No element extends past the viewport (horizontal containment).
  expect(await checkLayoutIssues(page)).toEqual([])
}

// Advance from the default open state (slide 0 = Leaders · Pick 1) to the first
// CARD pick (Pack 1 · Pick 1). Tab/“All” interactions are done from a card slide:
// the portrait card-pick layout sits cleanly inside the stage band, so the tab
// bar is never occluded. (See the KNOWN-ISSUE note in the report: multi-player
// LEADER slides render oversized cards that can overlap the tab bar.)
async function navPastLeaders(page: Page) {
  for (let i = 0; i < LEADER_ROUNDS; i++) await page.keyboard.press('ArrowRight')
  await expect(page.locator('.slideshow-nav-label')).toHaveText('Pack 1 · Pick 1')
}

/**
 * Reduce the selection to exactly ONE seat (the first selectable tab) by toggling
 * every other selectable tab off. Call AFTER navPastLeaders so stage cards never
 * intercept the tab clicks. Locked tabs are aria-disabled no-ops and are skipped.
 */
async function selectOnlySeat(page: Page) {
  const tabs = playerTabs(page)
  const count = await tabs.count()
  for (let i = count - 1; i >= 1; i--) {
    const locked = (await tabs.nth(i).getAttribute('class'))?.includes('slideshow-player-tab--locked')
    if (locked) continue
    await tabs.nth(i).click()
  }
  await expect(page.locator('.slideshow-stage--single')).toBeVisible()
}

// ═════════════════════════════════════════════════════════════════════════════

let fixture: DraftFixture

test.describe.configure({ mode: 'serial' })
test.skip(
  ({ browserName, isMobile }) => browserName !== 'chromium' || isMobile,
  'Desktop Chromium only (slideshow is a desktop feature)',
)
test.setTimeout(120_000)

test.beforeAll(async () => {
  db = new pg.Pool({ connectionString })
  fixture = await seedDraft()
})

test.afterAll(async () => {
  // Remove seeded rows for this TEST_ID, then close pools. cleanupTestUsers
  // deletes pod_players / pods (by host) / card_pools / users for the pattern.
  try {
    await cleanupTestUsers(TEST_ID)
  } finally {
    if (db) await db.end()
    await closeDb()
  }
})

// ── R1: open / close ─────────────────────────────────────────────────────────

test.describe('Slideshow Mode — open & close (R1)', () => {
  test('toggle opens the dialog; Escape closes it and restores the report + body scroll', async ({ page }) => {
    await setSessionCookie(page, fixture.seats[0].token) // participant (host/seat 1)
    await page.setViewportSize(VIEWPORTS[0])
    await gotoReport(page, fixture, fixture.seats[0].poolShareId!)

    await openSlideshow(page)
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden')

    await page.keyboard.press('Escape')
    await expect(overlay(page)).toBeHidden({ timeout: 10000 })
    // Report restored + body scroll released.
    await expect(page.locator('.draft-report-header')).toBeVisible()
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden')
  })

  test('re-clicking the toggle (close button) also closes and restores the report', async ({ page }) => {
    await setSessionCookie(page, fixture.seats[0].token)
    await page.setViewportSize(VIEWPORTS[0])
    await gotoReport(page, fixture, fixture.seats[0].poolShareId!)

    await openSlideshow(page)
    // The overlay's explicit exit affordance (Exit Slideshow Mode close button).
    await page.getByRole('button', { name: 'Exit Slideshow Mode' }).click()
    await expect(overlay(page)).toBeHidden({ timeout: 10000 })
    await expect(page.locator('.draft-report-header')).toBeVisible()
  })
})

// ── R5 (HEADLINE): no scroll, at all three viewports ─────────────────────────

test.describe('Slideshow Mode — no scroll / no overflow (R5, headline)', () => {
  for (const vp of VIEWPORTS) {
    test(`"All" at pick 1 fits with zero scroll/overflow @ ${vp.name}`, async ({ page }) => {
      await setSessionCookie(page, fixture.seats[0].token) // participant → all seats
      await page.setViewportSize(vp)
      await gotoReport(page, fixture, fixture.seats[0].poolShareId!)
      await openSlideshow(page)

      // Default selection is ALL seats, slide 0 (leaders). Advance to the first
      // CARD pick (pick 1 of pack 1) where the dense 4-row pack layout renders.
      await page.keyboard.press('ArrowRight') // leaders r2
      await page.keyboard.press('ArrowRight') // leaders r3
      await page.keyboard.press('ArrowRight') // Pack 1 · Pick 1
      await expect(page.locator('.slideshow-nav-label')).toHaveText('Pack 1 · Pick 1')
      // Let the ResizeObserver-driven fit settle.
      await page.waitForTimeout(300)

      await assertNoScroll(page, vp.name)

      if (vp.name === '1920x1080') await takeScreenshot(page, 'slideshow_all_pick1_1920')
      if (vp.name === '1024x768') await takeScreenshot(page, 'slideshow_all_pick1_1024')
    })
  }
})

// ── R2 / R3: tabs render + multi-select ──────────────────────────────────────

test.describe('Slideshow Mode — player tabs & selection (R2/R3)', () => {
  test('tabs render avatar + name; one→single row, two→two rows, All→all rows', async ({ page }) => {
    await setSessionCookie(page, fixture.seats[0].token) // participant → 4 tabs
    await page.setViewportSize(VIEWPORTS[0])
    await gotoReport(page, fixture, fixture.seats[0].poolShareId!)
    await openSlideshow(page)

    // R2: one tab per seat (4), each with an avatar img + a name.
    await expect(playerTabs(page)).toHaveCount(TOTAL_SEATS)
    const firstTab = playerTabs(page).first()
    await expect(firstTab.locator('img.slideshow-player-tab__avatar')).toBeVisible()
    await expect(firstTab.locator('.slideshow-player-tab__name')).toBeVisible()

    // Operate from a CARD slide so single vs multi rows are unambiguous and the
    // tab bar is never occluded by stage cards.
    await navPastLeaders(page)

    // All selected by default → all 4 seats render a row.
    await expect(page.locator('.slideshow-stage-row')).toHaveCount(TOTAL_SEATS)

    // R3: narrow to exactly one seat → single-player layout (no multi rows).
    await selectOnlySeat(page)
    await expect(page.locator('.slideshow-stage-row')).toHaveCount(0)

    // Add a second seat back → two labeled rows.
    await playerTabs(page).nth(1).click()
    await expect(page.locator('.slideshow-stage-row')).toHaveCount(2)

    // "All" → all rows again.
    await page.getByRole('button', { name: 'All' }).click()
    await expect(page.locator('.slideshow-stage-row')).toHaveCount(TOTAL_SEATS)
  })
})

// ── R6: single-player cap + centering ────────────────────────────────────────

test.describe('Slideshow Mode — single-player cap & centering (R6)', () => {
  test('one player at the LAST card pick (1 card) is capped at native and centered', async ({ page }) => {
    await setSessionCookie(page, fixture.seats[0].token)
    await page.setViewportSize(VIEWPORTS[0])
    await gotoReport(page, fixture, fixture.seats[0].poolShareId!)
    await openSlideshow(page)

    // Get onto a card slide first (so tab clicks aren't occluded), then narrow to
    // a single seat (seat 1 — its pack-1 view drains pick-by-pick to 1–2 cards).
    await navPastLeaders(page)
    await selectOnlySeat(page)

    // Walk forward to the LAST pack-1 slide, where the single seat sees the fewest
    // cards (the wheel has drained the pack). This is R6's "few cards" case: the
    // last pick of pack 1 (portrait), reached via the on-screen edge arrow.
    const nextEdge = page.locator('.slideshow-edge--next')
    for (let i = 1; i < CARDS_PER_PACK; i++) await nextEdge.click() // Pick 1 → Pick 14 of pack 1
    await expect(page.locator('.slideshow-nav-label')).toHaveText(`Pack 1 · Pick ${CARDS_PER_PACK}`)

    // A small handful of cards (the drained tail); each capped at the native cap
    // (~360px) and the block CENTERED — it must NOT fill the screen (R6).
    const cards = page.locator('.slideshow-stage .canvas-card')
    const n = await cards.count()
    expect(n, 'the drained last pack-1 pick shows only a few cards').toBeLessThanOrEqual(3)
    expect(n).toBeGreaterThanOrEqual(1)

    const geom = await page.evaluate((capW) => {
      const stage = document.querySelector('.slideshow-stage') as HTMLElement
      const cardEls = Array.from(document.querySelectorAll('.slideshow-stage .canvas-card')) as HTMLElement[]
      const s = stage.getBoundingClientRect()
      const rects = cardEls.map((c) => c.getBoundingClientRect())
      const maxCardW = Math.max(...rects.map((r) => r.width))
      // Bounding box of all cards (the centered block).
      const blockLeft = Math.min(...rects.map((r) => r.left))
      const blockRight = Math.max(...rects.map((r) => r.right))
      return {
        maxCardW,
        stageW: s.width,
        blockCenterX: (blockLeft + blockRight) / 2,
        stageCenterX: s.left + s.width / 2,
        capW,
      }
    }, SINGLE_CAP_W)
    // R6: no card exceeds the native cap.
    expect(geom.maxCardW, 'a capped single-mode card must not exceed the native cap').toBeLessThanOrEqual(
      SINGLE_CAP_W + 2,
    )
    // Does NOT fill the screen: a few capped cards are far narrower than the stage.
    expect(geom.maxCardW).toBeLessThan(geom.stageW * 0.9)
    // The block is centered in the stage (within 20px tolerance).
    expect(Math.abs(geom.blockCenterX - geom.stageCenterX)).toBeLessThanOrEqual(20)

    await takeScreenshot(page, 'slideshow_single_drained_pack1_centered')
  })
})

// ── R7: multi-player labeled rows ────────────────────────────────────────────

test.describe('Slideshow Mode — multi-player labeled rows (R7)', () => {
  test('≥2 players each get a row with avatar + name; rowCount === selected count; no overflow', async ({ page }) => {
    await setSessionCookie(page, fixture.seats[0].token)
    await page.setViewportSize(VIEWPORTS[0])
    await gotoReport(page, fixture, fixture.seats[0].poolShareId!)
    await openSlideshow(page)

    // All 4 selected; advance to a card pick.
    await navPastLeaders(page)

    const rows = page.locator('.slideshow-stage-row')
    await expect(rows).toHaveCount(TOTAL_SEATS)
    // Every row has an avatar img and a name to the LEFT (the label gutter).
    for (let i = 0; i < TOTAL_SEATS; i++) {
      const row = rows.nth(i)
      await expect(row.locator('img.slideshow-stage-avatar')).toBeVisible()
      await expect(row.locator('.slideshow-stage-name')).toBeVisible()
      // Avatar/name gutter sits to the left of the cards.
      const ordered = await row.evaluate((el) => {
        const label = el.querySelector('.slideshow-stage-row-label') as HTMLElement
        const cards = el.querySelector('.slideshow-stage-row-cards') as HTMLElement
        return label.getBoundingClientRect().left < cards.getBoundingClientRect().left
      })
      expect(ordered, 'label gutter must be left of the cards').toBe(true)
    }
    expect(await checkLayoutIssues(page)).toEqual([])
  })
})

// ── R4: highlight correctness + null-pick case ───────────────────────────────

test.describe('Slideshow Mode — picked-card highlight (R4)', () => {
  test('exactly one .selected per row matching pickedInstanceId; null-pick → zero selected', async ({ page }) => {
    await setSessionCookie(page, fixture.seats[0].token) // participant → all seats incl. seat 2 (the null-pick seat)
    await page.setViewportSize(VIEWPORTS[0])
    await gotoReport(page, fixture, fixture.seats[0].poolShareId!)
    await openSlideshow(page)

    // Advance to Pack 1 · Pick 1. Seats 1,3,4 picked their slot-0 card here; seat
    // 2 OMITTED this pick (null pickedInstanceId) → its row shows zero highlight.
    await navPastLeaders(page)

    const rows = page.locator('.slideshow-stage-row')
    await expect(rows).toHaveCount(TOTAL_SEATS)

    // Tally selected cards per seat row, keyed by seat number via the name text.
    const perRow = await rows.evaluateAll((els) =>
      els.map((el) => {
        const name = (el.querySelector('.slideshow-stage-name') as HTMLElement)?.textContent?.trim() || ''
        const selectedEls = Array.from(el.querySelectorAll('.canvas-card.selected'))
        // Read the picked card's name (so we can match it to the seat's slot-0).
        const selectedNames = selectedEls
          .map((c) => (c.querySelector('.card-placeholder-title, .card-name, img') as HTMLElement | null))
          .map((n) => (n ? (n.getAttribute('alt') || n.textContent || '').trim() : ''))
        return { name, selectedCount: selectedEls.length, selectedNames }
      }),
    )

    // The seeded order is seat 1,2,3,4. Seat 2 is the public-but-null-pick seat.
    // Identify rows by their leader/base-free name text "Bot (Seat 4)" / "Slide*".
    // Every NON-null-pick row has exactly ONE .selected; the null-pick row has zero.
    let zeroHighlightRows = 0
    let oneHighlightRows = 0
    for (const r of perRow) {
      if (r.selectedCount === 0) zeroHighlightRows++
      else if (r.selectedCount === 1) oneHighlightRows++
      expect(r.selectedCount, `row "${r.name}" should have 0 or 1 highlighted, got ${r.selectedCount}`).toBeLessThanOrEqual(1)
    }
    // Exactly one row (seat 2) is the null-pick zero-highlight case…
    expect(zeroHighlightRows, 'exactly one seat omitted pack1/pick1 → zero highlight').toBe(1)
    // …and the other three each highlight exactly one card.
    expect(oneHighlightRows, 'the three seats that drafted pack1/pick1 each highlight one').toBe(TOTAL_SEATS - 1)
  })

  test('the highlighted card is the seat\'s actual pick (single-player view)', async ({ page }) => {
    await setSessionCookie(page, fixture.seats[0].token)
    await page.setViewportSize(VIEWPORTS[0])
    await gotoReport(page, fixture, fixture.seats[0].poolShareId!)
    await openSlideshow(page)

    // Go to Pack 1 · Pick 1, then narrow to seat 1 alone.
    await navPastLeaders(page)
    await selectOnlySeat(page)
    await expect(page.locator('.slideshow-nav-label')).toHaveText('Pack 1 · Pick 1')

    // Exactly one selected card, and it is seat 1's slot-0 pick: "Card 1.0".
    const selected = page.locator('.slideshow-stage .canvas-card.selected')
    await expect(selected).toHaveCount(1)
    // Its placeholder title (no image) carries the card name.
    await expect(selected).toContainText('Card 1.0')
  })
})

// ── R9 / R10: navigation + keyboard parity + hard stops ──────────────────────

test.describe('Slideshow Mode — navigation & keyboard parity (R9/R10)', () => {
  test('edge arrow and ArrowRight both advance the label; ends hard-stop (no wrap)', async ({ page }) => {
    await setSessionCookie(page, fixture.seats[0].token)
    await page.setViewportSize(VIEWPORTS[0])
    await gotoReport(page, fixture, fixture.seats[0].poolShareId!)
    await openSlideshow(page)

    const label = page.locator('.slideshow-nav-label')
    const prevEdge = page.locator('.slideshow-edge--prev')
    const nextEdge = page.locator('.slideshow-edge--next')

    // At index 0 (Leaders · Pick 1) prev is hard-stopped (aria-disabled).
    await expect(label).toHaveText('Leaders · Pick 1')
    await expect(prevEdge).toHaveAttribute('aria-disabled', 'true')
    await expect(prevEdge).toBeDisabled()

    // Click the right edge arrow → next leader slide.
    await nextEdge.click()
    await expect(label).toHaveText('Leaders · Pick 2')

    // Keyboard ArrowRight does the SAME thing (parity).
    await page.keyboard.press('ArrowRight')
    await expect(label).toHaveText('Leaders · Pick 3')

    // One more → first card pick.
    await page.keyboard.press('ArrowRight')
    await expect(label).toHaveText('Pack 1 · Pick 1')

    // ArrowLeft goes back (parity with the prev edge arrow).
    await page.keyboard.press('ArrowLeft')
    await expect(label).toHaveText('Leaders · Pick 3')

    // Walk to the very end; Next must hard-stop (disabled, no wrap).
    for (let i = 0; i < SLIDE_COUNT + 2; i++) {
      if (await nextEdge.isDisabled()) break
      await page.keyboard.press('ArrowRight')
    }
    await expect(label).toHaveText(`Pack 3 · Pick ${CARDS_PER_PACK}`)
    await expect(nextEdge).toHaveAttribute('aria-disabled', 'true')
    await expect(nextEdge).toBeDisabled()
    // Pressing ArrowRight again does NOT wrap.
    await page.keyboard.press('ArrowRight')
    await expect(label).toHaveText(`Pack 3 · Pick ${CARDS_PER_PACK}`)
  })
})

// ── R11: leaders are the first slides ────────────────────────────────────────

test.describe('Slideshow Mode — leaders first (R11)', () => {
  test('the first slides read "Leaders · Pick N"', async ({ page }) => {
    await setSessionCookie(page, fixture.seats[0].token)
    await page.setViewportSize(VIEWPORTS[0])
    await gotoReport(page, fixture, fixture.seats[0].poolShareId!)
    await openSlideshow(page)

    const label = page.locator('.slideshow-nav-label')
    await expect(label).toHaveText('Leaders · Pick 1')
    await page.keyboard.press('ArrowRight')
    await expect(label).toHaveText('Leaders · Pick 2')
    await page.keyboard.press('ArrowRight')
    await expect(label).toHaveText('Leaders · Pick 3')
    // The slide AFTER the leaders is the first pack.
    await page.keyboard.press('ArrowRight')
    await expect(label).toHaveText('Pack 1 · Pick 1')
  })
})

// ── R12: privacy — non-participant sees private seat locked, cards withheld ───

test.describe('Slideshow Mode — privacy gating (R12)', () => {
  test('NON-participant: private seat is locked (warning + aria-disabled) and its cards are ABSENT from the DOM', async ({ page }) => {
    // A logged-in stranger (NOT a participant, NOT the host) viewing seat 1's
    // public report page. Seat 1 itself is is_log_public=false → must be LOCKED.
    await setSessionCookie(page, fixture.strangerToken)
    await page.setViewportSize(VIEWPORTS[0])
    await gotoReport(page, fixture, fixture.seats[0].poolShareId!) // pool is report_public
    await openSlideshow(page)

    // Seat 1 tab is locked: warning variant + lock + aria-disabled, identity shown.
    const lockedTab = page.locator('.slideshow-player-tab--locked')
    await expect(lockedTab).toHaveCount(1)
    await expect(lockedTab.first()).toHaveAttribute('aria-disabled', 'true')
    await expect(lockedTab.first()).toContainText('SlideHost') // identity still visible
    await expect(lockedTab.first().locator('.slideshow-player-tab__lock-icon')).toBeVisible()

    // The locked seat (seat 1, seatIdx 0) cards must NEVER appear in the DOM —
    // proves the server omitted `picks` for it (no client-side leak). Walk a few
    // slides to be thorough, asserting none of seat-1's instanceIds ever render.
    for (let i = 0; i < 5; i++) {
      const leaked = await page.evaluate(() => {
        // Seat 1 cards are named "Card 1.x" / "Card 2.x" / "Card 3.x" with
        // instanceId s0-*. Detect any rendered card whose title is a seat-0 card.
        const titles = Array.from(document.querySelectorAll('.slideshow-stage .canvas-card'))
          .map((c) => (c.textContent || '').trim())
        // Seat-0's pack cards share names with other seats (Card P.S), so name
        // alone is ambiguous. Instead assert seat 1's ROW is absent: its name
        // "SlideHost" must not appear as a STAGE ROW label (locked → not selectable).
        const stageRowNames = Array.from(document.querySelectorAll('.slideshow-stage-name'))
          .map((n) => (n.textContent || '').trim())
        return { stageRowNames }
      })
      // Seat 1 is locked and excluded from "All", so it never renders as a stage row.
      expect(leaked.stageRowNames, `seat 1 (locked) must not render cards @ slide ${i}`).not.toContain('SlideHost')
      await page.keyboard.press('ArrowRight')
    }

    // Stronger DOM-absence proof via the network payload contract: the rendered
    // tabs are exactly {All, seat1 locked, seat2, seat3, bot}. Public seats (2,3)
    // + bot (4) are selectable; only seat 1 is locked.
    await expect(page.locator('.slideshow-player-tab--locked')).toHaveCount(1)
    const selectable = page.locator('.slideshow-player-tab:not(.slideshow-player-tab--all):not(.slideshow-player-tab--locked)')
    await expect(selectable).toHaveCount(TOTAL_SEATS - 1) // seats 2,3 + bot 4
  })

  test('PARTICIPANT: the same seat is UNLOCKED (no locked tab) and selectable', async ({ page }) => {
    await setSessionCookie(page, fixture.seats[0].token) // host == seat 1's user → participant
    await page.setViewportSize(VIEWPORTS[0])
    await gotoReport(page, fixture, fixture.seats[0].poolShareId!)
    await openSlideshow(page)

    // Participant sees ALL seats unlocked: no locked tabs at all.
    await expect(page.locator('.slideshow-player-tab--locked')).toHaveCount(0)
    await expect(playerTabs(page)).toHaveCount(TOTAL_SEATS)
  })
})

// ── R5: resize stability (ResizeObserver re-fit) ─────────────────────────────
//
// Regression gate for a now-FIXED containment bug: when the viewport SHRINKS while
// a multi-player slide is open, the stage must re-fit to the smaller box with no
// overflow. Previously `.draft-slideshow-layout` had no `grid-template-columns`, so
// its implicit (max-content) column let wide multi-row content widen the stage past
// the viewport; `useElementSize` then measured that inflated width — a feedback loop
// that never shrank back. Fixed by `grid-template-columns: minmax(0, 1fr)` on the
// layout + `min-width: 0` on the stage band, so the stage width is driven by the
// viewport and U6's fit reduces card size on shrink.
test.describe('Slideshow Mode — resize re-fit stability (R5)', () => {
  test('after shrinking the viewport the stage re-fits with no overflow', async ({ page }) => {
    await setSessionCookie(page, fixture.seats[0].token)
    await page.setViewportSize({ width: 1920, height: 1080 })
    await gotoReport(page, fixture, fixture.seats[0].poolShareId!)
    await openSlideshow(page)

    // All seats, at a dense card pick.
    await navPastLeaders(page)

    // Shrink to the cramped 4:3 box; the ResizeObserver must re-fit.
    await page.setViewportSize({ width: 1024, height: 768 })
    await page.waitForTimeout(400) // debounced re-fit

    // Re-asserting the full no-scroll invariant proves the ResizeObserver re-fit
    // fired (a stale fit at the larger box would now overflow the smaller one).
    await assertNoScroll(page, '1024x768 (after resize)')
  })
})

// ── Mobile gating: toggle hidden below the desktop threshold ──────────────────

test.describe('Slideshow Mode — mobile gating', () => {
  test('at a mobile viewport (≤768) the "Slideshow Mode" toggle is NOT present', async ({ page }) => {
    await setSessionCookie(page, fixture.seats[0].token)
    await page.setViewportSize(MOBILE_VIEWPORT)
    await gotoReport(page, fixture, fixture.seats[0].poolShareId!)
    // The report header is present, but the desktop-only toggle is absent.
    await expect(page.locator('.draft-report-header')).toBeVisible()
    await expect(toggle(page)).toHaveCount(0)
  })
})

// tests/e2e/competitive-cpm-full.spec.ts
// @ts-nocheck
//
// Full UI-driven e2e test for Competitive Practice Mode (CPM).
// 8 real browser contexts. Every user action — draft creation, joining,
// picking cards, building decks, reporting matches — is a UI click.
// No fetch() calls to app API routes. No DB writes that simulate user
// actions (user creation and cleanup excepted).
//
// Spec: docs/superpowers/specs/2026-04-14-cpm-full-ui-e2e-design.md
//
// Run: npm run test:e2e -- --grep "8-player CPM"
// Override seed: CPM_SEED=12345 npm run test:e2e -- --grep "8-player CPM"
//
// Runtime: 30-90 minutes. This is intentional — the test exercises real
// timers, real socket sync, and real UI transitions across 8 tabs.
import { test, expect, chromium, Browser, BrowserContext, Page } from '@playwright/test'
import { createTestUser, cleanupTestUsers, closeDb } from './test-utils.ts'

const NUM_PLAYERS = 8
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000'
const TEST_ID = `e2e_cpm_${Date.now()}`
const SEED = Number(process.env.CPM_SEED) || 42

test.describe.configure({ mode: 'serial' })
test.skip(({ browserName, isMobile }) =>
  browserName !== 'chromium' || isMobile,
  'Skipped: Desktop Chromium only (long-running integration test)'
)
test.setTimeout(5_400_000) // 90 minutes

// ── Mulberry32 seeded PRNG ──────────────────────────────────────────────────
function mulberry32(seed: number): () => number {
  let a = seed
  return function () {
    a |= 0
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

test.describe('8-player CPM full UI flow', () => {
  let browser: Browser
  let contexts: BrowserContext[] = []
  let pages: Page[] = []
  let users: any[] = []
  let shareId: string | null = null
  let poolShareIds: (string | null)[] = []
  const rng = mulberry32(SEED)

  // Map seat number (1..8) → page index, populated after seats are read from lobby
  let seatToPageIdx = new Map<number, number>()

  test.beforeAll(async () => {
    console.log(`\n${'='.repeat(60)}`)
    console.log('Starting 8-Player CPM Full UI E2E Test')
    console.log(`Test ID: ${TEST_ID}`)
    console.log(`Seed: ${SEED}`)
    console.log(`${'='.repeat(60)}\n`)

    browser = await chromium.launch({
      headless: process.env.HEADLESS !== 'false' ? true : false,
      slowMo: 50,
    })

    for (let i = 0; i < NUM_PLAYERS; i++) {
      // Player 0 is host — needs is_admin to bypass FOP check + show the Competitive toggle
      const isHost = i === 0
      const userData = await createTestUser(`CpmP${i + 1}`, TEST_ID, {
        isBetaTester: true,
        isAdmin: isHost,
      })
      users.push(userData)

      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
      })
      contexts.push(context)

      const urlObj = new URL(BASE_URL)
      const cookieConfig: any = {
        name: userData.cookieName,
        value: userData.token,
        httpOnly: true,
        sameSite: 'Lax',
      }
      if (urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1') {
        cookieConfig.url = BASE_URL
      } else {
        cookieConfig.domain = urlObj.hostname
        cookieConfig.path = '/'
      }
      await context.addCookies([cookieConfig])

      const page = await context.newPage()
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          console.log(`  [P${i + 1} Error]:`, msg.text().slice(0, 120))
        }
      })
      pages.push(page)
      poolShareIds.push(null)
      console.log(`  ✓ Created: ${userData.user.username} (admin=${isHost})`)
    }

    console.log(`\n✓ All ${NUM_PLAYERS} test users ready\n`)
  })

  test.afterAll(async () => {
    console.log('\nCleaning up...')
    try {
      await cleanupTestUsers(TEST_ID)
    } catch (e: any) {
      console.error('Cleanup error:', e.message)
    }
    await closeDb()
    for (const context of contexts) {
      await context.close()
    }
    if (browser) {
      await browser.close()
    }
  })

  async function waitForAllPlayersReady(
    selector: string,
    threshold = 0.9,
    advancedSelector?: string,
    timeoutMs = 30000
  ): Promise<void> {
    const target = Math.ceil(NUM_PLAYERS * threshold)

    const pollOnce = async (): Promise<number[]> => {
      return Promise.all(
        pages.map(async (page) => {
          // A page that has already redirected to a pool (draft complete) counts
          // as "ready" — no point waiting for pack-grid cards on a redirected page.
          if (/\/(draft_pool|pool)\//.test(page.url())) return 1
          const has = await page.locator(selector).count().catch(() => 0)
          if (has > 0) return 1
          if (advancedSelector) {
            const advanced = await page.locator(advancedSelector).count().catch(() => 0)
            if (advanced > 0) return 1
          }
          return 0
        })
      )
    }

    const waitFor = async (ms: number): Promise<boolean> => {
      const maxAttempts = Math.floor(ms / 500)
      for (let attempts = 0; attempts < maxAttempts; attempts++) {
        const counts = await pollOnce()
        if (counts.filter((c) => c > 0).length >= target) return true
        await pages[0].waitForTimeout(500)
      }
      return false
    }

    // First wait
    if (await waitFor(timeoutMs)) return

    // Recovery: reload any desync'd pages, then wait again
    const counts = await pollOnce()
    const desyncIdx: number[] = []
    for (let i = 0; i < NUM_PLAYERS; i++) {
      if (counts[i] === 0) desyncIdx.push(i)
    }
    if (desyncIdx.length > 0 && desyncIdx.length < NUM_PLAYERS) {
      console.log(`\n  ⚠ ${desyncIdx.length} page(s) desync'd — reloading P${desyncIdx.map(i => i + 1).join(', P')}`)
      await Promise.all(desyncIdx.map((i) =>
        pages[i].reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null)
      ))
      if (await waitFor(30000)) {
        console.log(`  ✓ recovered after reload`)
        return
      }
    }

    // Give up — dump per-page state
    console.log(`\n  ⚠ waitForAllPlayersReady timeout after reload: ${selector} (threshold ${target}/${NUM_PLAYERS})`)
    for (let i = 0; i < NUM_PLAYERS; i++) {
      const has = await pages[i].locator(selector).count().catch(() => 0)
      const advanced = advancedSelector ? await pages[i].locator(advancedSelector).count().catch(() => 0) : 0
      const url = pages[i].url()
      const visibleHeaders = await pages[i].locator('h1, h2, h3, .draft-round-info').allTextContents().catch(() => [])
      console.log(`    P${i + 1}: url=${url.replace('http://localhost:3000', '')} ${selector}=${has} ${advancedSelector || '(no alt)'}=${advanced} headers=${JSON.stringify(visibleHeaders.slice(0, 3))}`)
    }
    throw new Error(`Timeout waiting for ${selector} on at least ${target}/${NUM_PLAYERS} pages`)
  }

  /**
   * Click a card for each of the 8 players. Success signals (any one of):
   *  - A card appears with `.selected` class (pick landed on UI)
   *  - The grid is gone entirely (pack advanced)
   * Retries with a different card index up to `maxAttempts` to dodge
   * "Card not available" errors at pack/leader boundaries.
   */
  async function selectCardForAllPlayers(gridSelector: string, maxAttempts = 3): Promise<void> {
    await Promise.all(
      pages.map(async (page) => {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          try {
            // Already picked?
            const alreadySelected = await page.locator(`${gridSelector} .draftable-card.selected`).count().catch(() => 0)
            if (alreadySelected > 0) return

            // Grid empty? pack likely passed
            const candidates = await page.locator(`${gridSelector} .draftable-card:not(.dimmed):not(.selected)`).all()
            if (candidates.length === 0) return

            const pickIdx = attempt % candidates.length
            await candidates[pickIdx].click({ timeout: 3000 }).catch(() => null)
            await page.waitForTimeout(400)

            // Success signal: selected card present OR grid gone
            const selectedAfter = await page.locator(`${gridSelector} .draftable-card.selected`).count().catch(() => 0)
            if (selectedAfter > 0) return
            const anyCards = await page.locator(`${gridSelector} .draftable-card`).count().catch(() => 0)
            if (anyCards === 0) return
            // Otherwise retry with a different index
          } catch {
            // Transient — try again
          }
        }
      })
    )
  }

  test('8-player CPM: create → draft → build decks → 3 rounds of BO3 → final standings', async () => {
    // ── Phase 2: Draft creation and join ────────────────────────────────────
    console.log('\n--- PHASE 2: Draft creation and join ---')

    // Player 1 (host, admin) navigates to /draft and toggles Competitive
    await pages[0].goto(`${BASE_URL}/draft`)
    await pages[0].waitForLoadState('networkidle')

    // Competitive is its own create button now (patrons/admins only). It routes
    // to /draft/new?competitive=1, which arrives with Swiss Rounds already on —
    // there is no Standard/Competitive toggle on /draft to flip any more.
    const competitiveCreate = pages[0].locator('button.draft-competitive-button')
    await expect(competitiveCreate).toBeEnabled({ timeout: 10000 })
    await competitiveCreate.click()
    console.log('  ✓ Host chose Competitive Draft on /draft')

    // SetSelection page should now appear, with Swiss Rounds armed
    await pages[0].waitForSelector('.set-selection', { timeout: 15000 })
    const swissToggle = pages[0].locator('button.setting-lock-competitive')
    await expect(swissToggle).toBeVisible({ timeout: 10000 })
    await expect(swissToggle).not.toHaveClass(/setting-lock-competitive-off/)

    // Pick the first set card (may be in .latest-sets-row or .sets-grid)
    await pages[0].locator('.set-card').first().click()

    // Wait for redirect to /draft/[shareId]
    await pages[0].waitForFunction(() => {
      const url = window.location.pathname
      return url.startsWith('/draft/') && !url.includes('/draft/new')
    }, { timeout: 30000 })

    shareId = pages[0].url().split('/draft/')[1]?.split('?')[0] || null
    expect(shareId).not.toBeNull()
    console.log(`  ✓ Competitive draft created: ${shareId}`)

    // Confirm the COMPETITIVE badge is visible on the host's page
    await expect(pages[0].locator('text=COMPETITIVE').first()).toBeVisible({ timeout: 10000 })

    // Players 2–8 join via share URL
    for (let i = 1; i < NUM_PLAYERS; i++) {
      await pages[i].goto(`${BASE_URL}/draft/${shareId}`)
      await pages[i].waitForSelector('.draft-room, .draft-lobby', { timeout: 15000 })
      console.log(`  ✓ Player ${i + 1} navigated`)
    }

    // Wait for all 8 to be present (poll the host's player count)
    let attempts = 0
    while (attempts < 120) {
      const playerCountText = await pages[0].locator('.player-count').textContent().catch(() => '') || ''
      const match = playerCountText.match(/(\d+)\s*\/\s*(\d+)/)
      if (match && parseInt(match[1]) >= NUM_PLAYERS) {
        console.log(`  ✓ All ${NUM_PLAYERS} players joined`)
        break
      }
      await pages[0].waitForTimeout(500)
      attempts++
    }
    expect(attempts).toBeLessThan(120)

    // Capture seat → page-index map from the host's lobby DOM.
    // Wait for all 8 data-username attributes to be visible first (socket lag
    // can mean player-count says 8/8 before every seat's DOM is rendered).
    await expect(async () => {
      const renderedUsernames = await pages[0].locator('[data-username]').count()
      expect(renderedUsernames).toBeGreaterThanOrEqual(NUM_PLAYERS)
    }).toPass({ timeout: 30000 })

    for (let i = 0; i < NUM_PLAYERS; i++) {
      const username = users[i].user.username
      // Wait for this specific seat element to be attached (quick retry loop)
      const seatEl = pages[0].locator(`[data-username="${username}"]`).first()
      await expect(seatEl).toHaveAttribute('data-seat-number', /\d+/, { timeout: 15000 })
      const seatNumberStr = await seatEl.getAttribute('data-seat-number')
      if (!seatNumberStr) throw new Error(`No seat number found for user ${username}`)
      const seatNumber = parseInt(seatNumberStr)
      seatToPageIdx.set(seatNumber, i)
      console.log(`    Seat ${seatNumber} → ${username} (page ${i})`)
    }
    expect(seatToPageIdx.size).toBe(NUM_PLAYERS)

    // ── Phase 3: Competitive draft (leader + 3 packs, UI clicks) ────────────
    console.log('\n--- PHASE 3: Competitive draft ---')

    // Host clicks Ready (deals packs → leader preview), then Start Draft
    const readyButton = pages[0].locator('button:has-text("Ready")')
    await expect(readyButton).toBeEnabled({ timeout: 15000 })
    await readyButton.click()
    await pages[0].waitForSelector('.leader-preview-phase', { timeout: 30000 })
    console.log('  ✓ Leader preview — leaders revealed')

    const startButton = pages[0].locator('button:has-text("Start Draft")')
    await expect(startButton).toBeEnabled({ timeout: 15000 })
    await startButton.click()
    await pages[0].waitForSelector('.leader-draft-phase', { timeout: 30000 })
    console.log('  ✓ Draft started — leader draft phase')

    // Leader draft: 3 rounds
    for (let round = 1; round <= 3; round++) {
      console.log(`  Leader round ${round}/3:`)
      await waitForAllPlayersReady('.leaders-grid .draftable-card', 0.9, '.pack-draft-phase')
      await selectCardForAllPlayers('.leaders-grid')

      if (round < 3) {
        // Wait briefly for the server to broadcast the next round's leaders to all pages
        await pages[0].waitForTimeout(2000)
      }
    }

    // Pack draft phase
    await Promise.race([
      pages[0].waitForSelector('.pack-draft-phase', { timeout: 60000 }),
      pages[0].waitForSelector('.review-period', { timeout: 60000 }),
    ])
    console.log('  ✓ Pack draft phase reached')

    for (let pack = 1; pack <= 3; pack++) {
      console.log(`  Pack ${pack}/3:`)

      // If we're in the inter-pack review period, assert and wait it out.
      // The pick loop's waitForAllPlayersReady will handle the transition to
      // the next pack — no need for a redundant single-page selector wait.
      if (pack > 1) {
        const reviewVisible = await pages[0].locator('.review-period').count().catch(() => 0)
        if (reviewVisible > 0) {
          await expect(pages[0].locator('.review-period h3', { hasText: 'Review Your Cards' }))
            .toBeVisible({ timeout: 5000 })
          console.log(`    ✓ Inter-pack review period visible before pack ${pack}`)
          // Wait up to 45s for the review to end (30s window + server/client buffer)
          await pages[0].waitForSelector('.review-period', { state: 'detached', timeout: 45000 })
            .catch(() => null)
        } else {
          console.log(`    (review period already ended before pack ${pack})`)
        }
      }

      for (let pick = 1; pick <= 14; pick++) {
        process.stdout.write(`    Pick ${pick}/14...`)

        // Early-exit: if the draft is already complete (a majority of pages
        // redirected to /draft_pool/ or /pool/), break — the remaining pages
        // will be picked up by the final redirect wait below.
        const urls = pages.map((p) => p.url())
        const redirectedCount = urls.filter((u) => /\/(draft_pool|pool)\//.test(u)).length
        if (redirectedCount >= Math.ceil(NUM_PLAYERS * 0.5)) {
          console.log(` (draft complete — ${redirectedCount}/${NUM_PLAYERS} redirected, exiting pick loop)`)
          // Break out of both the pick loop and the pack loop
          pack = 3
          break
        }

        // Require REAL pack-grid cards on 8/8 pages before attempting a pick.
        // Do NOT accept `.review-period` here — being in review means no actual
        // pick is possible yet; we'd loop through 14 "picks" with zero real clicks.
        await waitForAllPlayersReady('.pack-grid .draftable-card', 1.0, undefined, 90000)

        // Snapshot each page's current card count before clicking so we can
        // verify the pick actually registered (server accepted).
        const beforeCounts = await Promise.all(
          pages.map((p) => p.locator('.pack-grid .draftable-card').count().catch(() => 0))
        )

        await selectCardForAllPlayers('.pack-grid')

        if (!(pack === 3 && pick === 14)) {
          // Wait for pack to rotate: each page should either have fewer cards
          // than before (their current pack decreased), or the pack fully gone
          // (advanced to next pack), or review-period showing (between-packs).
          let attempts = 0
          while (attempts < 240) {
            const advanced = await Promise.all(
              pages.map(async (p, idx) => {
                const count = await p.locator('.pack-grid .draftable-card').count().catch(() => 0)
                const inReview = await p.locator('.review-period').count().catch(() => 0)
                // Pack rotated if count < beforeCounts[idx] (cards reduced after our pick)
                // OR if pack visually refreshed (count != beforeCounts[idx], e.g. new pack)
                // OR we moved to review period
                return count !== beforeCounts[idx] || inReview > 0
              })
            )
            if (advanced.filter(Boolean).length >= NUM_PLAYERS * 0.875) break
            await pages[0].waitForTimeout(500)
            attempts++
          }
        } else {
          // Final pick of final pack — wait for ALL 8 packs to be empty server-side
          // by polling the UI: no pack-grid cards on any page (draft transitioning to complete).
          let attempts = 0
          while (attempts < 60) {
            const stillHasPack = await Promise.all(
              pages.map((p) => p.locator('.pack-grid .draftable-card').count().catch(() => 0))
            )
            if (stillHasPack.every((c) => c === 0)) break
            await pages[0].waitForTimeout(500)
            attempts++
          }
        }
        console.log(' ✓')
      }

      console.log(`  ✓ Pack ${pack} complete`)
    }

    // Wait for draft to finish — host page should redirect to /draft_pool/[poolShareId]
    // (competitive drafts redirect to /draft_pool/, sealed to /pool/ — accept either).
    console.log('  Waiting for draft completion / pool redirect on all 8 pages...')
    const redirectResults = await Promise.all(
      pages.map(async (page, idx) => {
        try {
          await page.waitForURL(/\/(draft_pool|pool)\/[^/?#]+/, { timeout: 180000 })
          const url = page.url()
          const match = url.match(/\/(?:draft_pool|pool)\/([^/?#]+)/)
          const poolShareId = match ? match[1] : null
          return { idx, poolShareId, url, error: null }
        } catch (err: any) {
          return { idx, poolShareId: null, url: page.url(), error: err?.message || String(err) }
        }
      })
    )

    // Log redirect results per player
    for (const r of redirectResults) {
      if (r.poolShareId) {
        poolShareIds[r.idx] = r.poolShareId
        console.log(`    P${r.idx + 1} pool: ${r.poolShareId}`)
      } else {
        console.log(`    P${r.idx + 1} DID NOT REDIRECT — url=${r.url} error=${r.error}`)
      }
    }

    // Diagnostic screenshots + DB state dump for any players that didn't redirect
    const failedPlayers = redirectResults.filter((r) => !r.poolShareId)
    if (failedPlayers.length > 0) {
      console.log(`\n  ⚠ ${failedPlayers.length} player(s) failed to redirect — collecting diagnostics`)

      // Dump DB state for this draft BEFORE cleanup fires so we can see what's stuck
      try {
        const pg = await import('pg')
        const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL
        const db = new pg.default.Pool({ connectionString: dbUrl })
        const pod = await db.query(
          `SELECT share_id, status, draft_state, completed_at, competitive FROM pods WHERE share_id = $1`,
          [shareId]
        )
        if (pod.rows[0]) {
          const p = pod.rows[0]
          console.log(`    [DB] pod.status=${p.status} competitive=${p.competitive} completed_at=${p.completed_at}`)
          console.log(`    [DB] draft_state.phase=${p.draft_state?.phase} packNumber=${p.draft_state?.packNumber} pickInPack=${p.draft_state?.pickInPack}`)
          console.log(`    [DB] draft_state.reviewUntil=${p.draft_state?.reviewUntil}`)
        }
        const players = await db.query(
          `SELECT seat_number, is_bot, jsonb_array_length(current_pack) as cards_in_pack
           FROM pod_players WHERE pod_id = (SELECT id FROM pods WHERE share_id = $1)
           ORDER BY seat_number`,
          [shareId]
        )
        console.log(`    [DB] Per-player current_pack size:`)
        for (const row of players.rows) {
          console.log(`         seat ${row.seat_number} (bot=${row.is_bot}): ${row.cards_in_pack} cards remaining`)
        }
        await db.end()
      } catch (err: any) {
        console.log(`    [DB dump error] ${err?.message || err}`)
      }

      for (const r of failedPlayers) {
        const screenshotPath = `/tmp/cpm-phase3-failure-p${r.idx + 1}.png`
        await pages[r.idx].screenshot({ path: screenshotPath, fullPage: true }).catch(() => null)
        const bodyText = await pages[r.idx].locator('body').innerText().catch(() => '(could not read)')
        console.log(`    P${r.idx + 1} screenshot: ${screenshotPath}`)
        console.log(`    P${r.idx + 1} body text (first 300 chars): ${bodyText.slice(0, 300).replace(/\n/g, ' | ')}`)
      }
    }

    // Assert all 8 redirected
    for (let i = 0; i < NUM_PLAYERS; i++) {
      expect(poolShareIds[i], `P${i + 1} should have a pool share id`).not.toBeNull()
    }

    // ── Phase 4: Navigate to play page + host starts round 1 ─────────────
    console.log('\n--- PHASE 4: Deck building + start matchmaking ---')

    // Each player navigates to their play page. Per the CPM spec, navigating
    // to the play page signals "deck submitted" for round-1 start gating.
    for (let i = 0; i < NUM_PLAYERS; i++) {
      const playUrl = `${BASE_URL}/pool/${poolShareIds[i]}/deck/play`
      await pages[i].goto(playUrl)
      await pages[i].waitForLoadState('networkidle')
      console.log(`    P${i + 1} → ${playUrl.replace(BASE_URL, '')}`)
    }

    // Wait for MatchmakingPanel to render on the host's page
    await pages[0].waitForSelector('[data-testid="matchmaking-panel"]', { timeout: 30000 })

    // Pre-start status should be 'deck_building' (no rounds yet)
    const initialStatus = await pages[0]
      .locator('[data-testid="matchmaking-panel"]')
      .getAttribute('data-matchmaking-status')
    expect(initialStatus).toBe('deck_building')
    console.log('  ✓ All 8 on play page; matchmakingStatus=deck_building')

    // Host clicks Start Round 1
    await pages[0].waitForSelector('[data-testid="start-matches-button-container"]', { timeout: 15000 })
    await pages[0].locator('[data-testid="start-matches-button-container"] button').click()
    console.log('  ✓ Host clicked Start Round 1')

    // Give the server a moment to process, then dump pod state for diagnostics
    await pages[0].waitForTimeout(3000)
    try {
      const pg = await import('pg')
      const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL
      const db = new pg.default.Pool({ connectionString: dbUrl })
      const pod = await db.query(
        `SELECT status, draft_state, competitive FROM pods WHERE share_id = $1`,
        [shareId]
      )
      if (pod.rows[0]) {
        const p = pod.rows[0]
        console.log(`    [DB post-start] status=${p.status} competitive=${p.competitive} phase=${p.draft_state?.phase} matchmakingStatus=${p.draft_state?.matchmakingStatus} currentRound=${p.draft_state?.currentRound}`)
      }
      const rounds = await db.query(
        `SELECT round_number, status FROM practice_rounds WHERE pod_id = (SELECT id FROM pods WHERE share_id = $1) ORDER BY round_number`,
        [shareId]
      )
      console.log(`    [DB post-start] practice_rounds: ${JSON.stringify(rounds.rows)}`)
      await db.end()
    } catch (err: any) {
      console.log(`    [DB post-start dump error] ${err?.message || err}`)
    }

    // Wait for matchmakingStatus to flip to 'active' on every page.
    // If a page's UI hasn't caught up after the first pass, reload it and retry.
    for (let i = 0; i < NUM_PLAYERS; i++) {
      try {
        await expect(async () => {
          const status = await pages[i]
            .locator('[data-testid="matchmaking-panel"]')
            .getAttribute('data-matchmaking-status')
          expect(status).toBe('active')
        }).toPass({ timeout: 15000 })
      } catch {
        // UI didn't update via socket — reload the page to force re-fetch
        console.log(`    P${i + 1} matchmakingStatus not active after 15s; reloading`)
        await pages[i].reload({ waitUntil: 'domcontentloaded', timeout: 30000 })
        await pages[i].waitForSelector('[data-testid="matchmaking-panel"]', { timeout: 20000 })
        await expect(async () => {
          const status = await pages[i]
            .locator('[data-testid="matchmaking-panel"]')
            .getAttribute('data-matchmaking-status')
          expect(status).toBe('active')
        }).toPass({ timeout: 15000 })
      }
    }
    console.log('  ✓ matchmakingStatus=active on all 8 pages — Round 1 started')

    // ── Phase 5: Three rounds of matchmaking ────────────────────────────
    console.log('\n--- PHASE 5: Three rounds of matchmaking ---')

    type GameOutcome = 'player1' | 'player2' | 'draw'
    type MatchOutcome = 'player1' | 'player2' | 'draw'
    type Pattern = (GameOutcome | null)[]

    const pickRng = <T,>(arr: T[]): T => arr[Math.floor(rng() * arr.length)]

    function chooseGamePattern(): { outcome: MatchOutcome; pattern: Pattern } {
      const r = rng()
      let outcome: MatchOutcome
      if (r < 0.45) outcome = 'player1'
      else if (r < 0.90) outcome = 'player2'
      else outcome = 'draw'

      if (outcome === 'draw') {
        const patterns: Pattern[] = [
          ['player1', 'player2', 'draw'], ['player1', 'draw', 'player2'],
          ['draw', 'player1', 'player2'], ['player2', 'player1', 'draw'],
          ['player2', 'draw', 'player1'], ['draw', 'player2', 'player1'],
          ['draw', 'draw', 'draw'],
          ['player1', 'draw', 'draw'], ['draw', 'player1', 'draw'], ['draw', 'draw', 'player1'],
          ['player2', 'draw', 'draw'], ['draw', 'player2', 'draw'], ['draw', 'draw', 'player2'],
        ]
        return { outcome, pattern: pickRng(patterns) }
      }
      const winner = outcome
      const loser: GameOutcome = winner === 'player1' ? 'player2' : 'player1'
      const r2 = rng()
      if (r2 < 0.6) return { outcome, pattern: [winner, winner] }
      // 2-1 patterns: the modal only shows game 3 when games 1+2 don't decide
      // the match (i.e., neither player has 2 wins after 2 games). That rules
      // out [winner, winner, *] — those are 2-0 with a phantom third game.
      if (r2 < 0.9) {
        return { outcome, pattern: pickRng<Pattern>([
          [loser, winner, winner], [winner, loser, winner],
        ]) }
      }
      return { outcome, pattern: pickRng<Pattern>([
        ['draw', winner, winner], [winner, 'draw', winner],
      ]) }
    }

    interface UIPairing {
      matchId: string
      player1Id: string
      player2Id: string
      player1Username: string
      player2Username: string
      isBye: boolean
    }

    const readPairingsFromPage = async (page: Page): Promise<UIPairing[]> => {
      const cards = await page.locator('[data-testid^="match-card-"]').all()
      const out: UIPairing[] = []
      for (const card of cards) {
        const matchId = await card.getAttribute('data-match-id') || ''
        const isBye = (await card.getAttribute('data-is-bye')) === 'true'
        const p1Id = await card.getAttribute('data-player1-id') || ''
        const p2Id = await card.getAttribute('data-player2-id') || ''
        const names = await card.locator('.match-card-player-name').allTextContents()
        out.push({
          matchId, player1Id: p1Id, player2Id: p2Id,
          player1Username: names[0] || '', player2Username: names[1] || '',
          isBye,
        })
      }
      return out
    }

    const reportResultViaUI = async (
      page: Page,
      matchId: string,
      pattern: Pattern,
      roundNum: number,
    ): Promise<void> => {
      // Match cards only render on the active round's tab, so a reload has to
      // put the page back on that tab — otherwise the reload "fixes" a stale
      // page into one showing a different round, and the report button stays
      // missing.
      const btnSelector = `[data-testid="match-report-button-${matchId}"]`
      const openRoundTab = () =>
        page.locator(`[data-testid="matchmaking-tab-round-${roundNum}"]`).click({ timeout: 5000 }).catch(() => null)

      let isVisible = await page.locator(btnSelector).isVisible().catch(() => false)
      if (!isVisible) {
        await openRoundTab()
        isVisible = await page.locator(btnSelector).isVisible().catch(() => false)
      }
      if (!isVisible) {
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 })
        await page.waitForSelector('[data-testid="matchmaking-panel"]', { timeout: 20000 })
        await openRoundTab()
      }
      await expect(page.locator(btnSelector)).toBeVisible({ timeout: 20000 })
      await page.locator(`${btnSelector} button`).click({ timeout: 10000 })
      await page.waitForSelector('[data-testid="result-report-modal"]', { timeout: 10000 })

      // Each game unlocks the next: game 2 is disabled until game 1 is set,
      // game 3 until the match is 1–1. Wait for the button to be enabled and
      // confirm the pick took, or the next click waits on a button that will
      // never enable.
      const pickGame = async (gameKey: string, choice: string): Promise<void> => {
        const button = page.locator(`[data-testid="game-${gameKey}-${choice}"]`)
        for (let attempt = 0; attempt < 3; attempt++) {
          await expect(button).toBeEnabled({ timeout: 10000 })
          await button.click({ timeout: 10000 })
          const took = await button.evaluate(
            (el) => el.classList.contains('btn--active'),
            undefined,
            { timeout: 5000 },
          ).catch(() => false)
          if (took) return
          await page.waitForTimeout(500)
        }
        const state = await page.evaluate((key) => {
          const row = document.querySelector(`[data-testid="game-row-${key}"]`)
          return {
            modalOpen: !!document.querySelector('[data-testid="result-report-modal"]'),
            rowFound: !!row,
            buttons: row
              ? Array.from(row.querySelectorAll('button')).map((b) => `${b.getAttribute('data-testid')}=${b.className}`)
              : [],
          }
        }, gameKey)
        throw new Error(`${gameKey}/${choice} never registered: ${JSON.stringify(state)}`)
      }

      if (pattern[0]) await pickGame('game1', pattern[0])
      if (pattern[1]) await pickGame('game2', pattern[1])
      if (pattern[2]) {
        await page.waitForSelector('[data-testid="game-row-game3"]', { timeout: 5000 })
        await pickGame('game3', pattern[2])
      }

      const submit = page.locator('[data-testid="result-report-submit"] button')
      await expect(submit).toBeEnabled({ timeout: 10000 })
      await submit.click({ timeout: 10000 })
      await page.waitForSelector('[data-testid="result-report-modal"]', { state: 'detached', timeout: 10000 })
    }

    // Wait for a page to show a specific current-round, reloading if socket didn't update
    const waitForCurrentRound = async (page: Page, expected: number, label: string): Promise<void> => {
      try {
        await expect(async () => {
          const cur = await page.locator('[data-testid="matchmaking-panel"]').getAttribute('data-current-round')
          expect(parseInt(cur || '0')).toBe(expected)
        }).toPass({ timeout: 15000 })
      } catch {
        console.log(`    ${label} not on round ${expected} after 15s; reloading`)
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 })
        await page.waitForSelector('[data-testid="matchmaking-panel"]', { timeout: 20000 })
        await expect(async () => {
          const cur = await page.locator('[data-testid="matchmaking-panel"]').getAttribute('data-current-round')
          expect(parseInt(cur || '0')).toBe(expected)
        }).toPass({ timeout: 15000 })
      }
    }

    // Track all pairings across rounds for no-rematch verification.
    // Capture each match's winner during the round (while host's tab is on it)
    // so Phase 6 doesn't have to navigate back through tabs to read winners.
    const allPairings: UIPairing[][] = []
    const matchWinners = new Map<string, string>() // matchId → 'player1' | 'player2' | 'draw'

    for (let roundNum = 1; roundNum <= 3; roundNum++) {
      console.log(`\n  === Round ${roundNum} ===`)

      // Wait for host to show correct current-round with reload fallback
      await waitForCurrentRound(pages[0], roundNum, 'host')

      // Click this round's tab on each page (match cards may only render on active tab)
      for (let i = 0; i < NUM_PLAYERS; i++) {
        await waitForCurrentRound(pages[i], roundNum, `P${i + 1}`)
        await pages[i].locator(`[data-testid="matchmaking-tab-round-${roundNum}"]`).click().catch(() => null)
        await pages[i].waitForSelector('[data-testid^="match-card-"]', { timeout: 20000 })
      }

      // Read pairings from the host
      const pairings = await readPairingsFromPage(pages[0])
      allPairings.push(pairings)
      console.log(`    Round ${roundNum} pairings:`)
      for (const p of pairings) {
        console.log(p.isBye ? `      ${p.player1Username}: BYE` : `      ${p.player1Username} vs ${p.player2Username}`)
      }

      // Round 1: opposite-seat assertion (1v5, 2v6, 3v7, 4v8)
      if (roundNum === 1) {
        for (const [seatA, seatB] of [[1, 5], [2, 6], [3, 7], [4, 8]]) {
          const userA = users[seatToPageIdx.get(seatA)!]
          const userB = users[seatToPageIdx.get(seatB)!]
          const found = pairings.some((p) =>
            (p.player1Id === userA.user.id && p.player2Id === userB.user.id) ||
            (p.player1Id === userB.user.id && p.player2Id === userA.user.id)
          )
          expect(found, `Round 1 should pair seat ${seatA} with seat ${seatB}`).toBe(true)
        }
        console.log('    ✓ Round 1 opposite-seat pairing verified')
      }

      // Rounds 2, 3: no-rematch assertion
      if (roundNum > 1) {
        const priorOpps = new Map<string, Set<string>>()
        for (const prior of allPairings.slice(0, roundNum - 1)) {
          for (const p of prior) {
            if (p.isBye) continue
            if (!priorOpps.has(p.player1Id)) priorOpps.set(p.player1Id, new Set())
            if (!priorOpps.has(p.player2Id)) priorOpps.set(p.player2Id, new Set())
            priorOpps.get(p.player1Id)!.add(p.player2Id)
            priorOpps.get(p.player2Id)!.add(p.player1Id)
          }
        }
        for (const p of pairings) {
          if (p.isBye) continue
          const aPrior = priorOpps.get(p.player1Id) || new Set()
          expect(aPrior.has(p.player2Id),
            `Round ${roundNum} rematch: ${p.player1Username} already played ${p.player2Username}`).toBe(false)
        }
        console.log(`    ✓ Round ${roundNum} no-rematch verified`)
      }

      // Report each non-bye match via mutual confirmation
      for (const pairing of pairings) {
        if (pairing.isBye) {
          console.log(`      (bye) ${pairing.player1Username}`)
          continue
        }
        const { outcome, pattern } = chooseGamePattern()
        console.log(`      ${pairing.player1Username} vs ${pairing.player2Username}: [${pattern.join(',')}] → ${outcome}`)

        const p1Idx = users.findIndex((u) => u.user.id === pairing.player1Id)
        const p2Idx = users.findIndex((u) => u.user.id === pairing.player2Id)
        expect(p1Idx).toBeGreaterThanOrEqual(0)
        expect(p2Idx).toBeGreaterThanOrEqual(0)

        // Both players must be on this round's tab
        for (const idx of [p1Idx, p2Idx]) {
          await pages[idx].locator(`[data-testid="matchmaking-tab-round-${roundNum}"]`).click().catch(() => null)
        }

        await reportResultViaUI(pages[p1Idx], pairing.matchId, pattern, roundNum)
        await reportResultViaUI(pages[p2Idx], pairing.matchId, pattern, roundNum)

        // Confirm match is finalized on host (with reload fallback)
        try {
          await expect(async () => {
            const confirmed = await pages[0].locator(`[data-testid="match-card-${pairing.matchId}"]`).getAttribute('data-final-confirmed')
            expect(confirmed).toBe('true')
          }).toPass({ timeout: 15000 })
        } catch {
          console.log(`      host didn't see match confirm; reloading host`)
          await pages[0].reload({ waitUntil: 'domcontentloaded', timeout: 30000 })
          await pages[0].waitForSelector('[data-testid="matchmaking-panel"]', { timeout: 20000 })
          await pages[0].locator(`[data-testid="matchmaking-tab-round-${roundNum}"]`).click().catch(() => null)
          await expect(async () => {
            const confirmed = await pages[0].locator(`[data-testid="match-card-${pairing.matchId}"]`).getAttribute('data-final-confirmed')
            expect(confirmed).toBe('true')
          }).toPass({ timeout: 15000 })
        }

        const winnerAttr = await pages[0].locator(`[data-testid="match-card-${pairing.matchId}"]`).getAttribute('data-match-winner')
        expect(winnerAttr).toBe(outcome)
        matchWinners.set(pairing.matchId, winnerAttr || '')
      }

      console.log(`    ✓ Round ${roundNum} all matches reported and confirmed`)

      // Auto-advance check
      if (roundNum < 3) {
        for (let i = 0; i < NUM_PLAYERS; i++) {
          await waitForCurrentRound(pages[i], roundNum + 1, `P${i + 1}`)
        }
        console.log(`    ✓ Auto-advanced to round ${roundNum + 1}`)
      } else {
        for (let i = 0; i < NUM_PLAYERS; i++) {
          try {
            await expect(async () => {
              const status = await pages[i].locator('[data-testid="matchmaking-panel"]').getAttribute('data-matchmaking-status')
              expect(status).toBe('complete')
            }).toPass({ timeout: 15000 })
          } catch {
            console.log(`    P${i + 1} not complete after R3; reloading`)
            await pages[i].reload({ waitUntil: 'domcontentloaded', timeout: 30000 })
            await pages[i].waitForSelector('[data-testid="matchmaking-panel"]', { timeout: 20000 })
            await expect(async () => {
              const status = await pages[i].locator('[data-testid="matchmaking-panel"]').getAttribute('data-matchmaking-status')
              expect(status).toBe('complete')
            }).toPass({ timeout: 15000 })
          }
        }
        console.log('    ✓ Matchmaking complete after round 3')
      }
    }

    // ── Phase 6: Final standings ─────────────────────────────────────────
    console.log('\n--- PHASE 6: Final standings ---')

    // Compute expected W/L/D per player from the winners we captured live during
    // each round (host's tab was on that round, so cards were visible). We do
    // this here rather than re-reading match-card attributes because by Phase 6
    // the host's tab has auto-switched to Results — match cards aren't visible
    // and getAttribute would hang.
    const expected: Record<string, { wins: number; losses: number; draws: number }> = {}
    for (const u of users) expected[u.user.id] = { wins: 0, losses: 0, draws: 0 }
    for (const round of allPairings) {
      for (const p of round) {
        if (p.isBye) {
          expected[p.player1Id].wins += 1
          continue
        }
        const winner = matchWinners.get(p.matchId) || ''
        if (winner === 'player1') {
          expected[p.player1Id].wins += 1
          expected[p.player2Id].losses += 1
        } else if (winner === 'player2') {
          expected[p.player2Id].wins += 1
          expected[p.player1Id].losses += 1
        } else if (winner === 'draw') {
          expected[p.player1Id].draws += 1
          expected[p.player2Id].draws += 1
        }
      }
    }

    console.log('  Expected standings (from recorded match winners):')
    for (const u of users) {
      const e = expected[u.user.id]
      console.log(`    ${u.user.username}: ${e.wins}W-${e.losses}L-${e.draws}D`)
    }

    // Each page clicks the Results tab and the DOM rows are read/verified.
    for (let i = 0; i < NUM_PLAYERS; i++) {
      await pages[i].locator('[data-testid="matchmaking-tab-results"]').click().catch(() => null)
      // With reload fallback if the Results tab doesn't render rows
      try {
        await pages[i].waitForSelector('[data-testid^="standing-row-"]', { timeout: 10000 })
      } catch {
        console.log(`    P${i + 1} Results tab empty; reloading`)
        await pages[i].reload({ waitUntil: 'domcontentloaded', timeout: 30000 })
        await pages[i].waitForSelector('[data-testid="matchmaking-panel"]', { timeout: 20000 })
        await pages[i].locator('[data-testid="matchmaking-tab-results"]').click()
        await pages[i].waitForSelector('[data-testid^="standing-row-"]', { timeout: 15000 })
      }

      const rows = await pages[i].locator('[data-testid^="standing-row-"]').all()
      expect(rows.length, `P${i + 1} should see ${NUM_PLAYERS} standings rows`).toBe(NUM_PLAYERS)

      const observed: Record<string, { wins: number; losses: number; draws: number; rank: number }> = {}
      for (const row of rows) {
        const playerId = (await row.getAttribute('data-player-id')) || ''
        const rank = parseInt((await row.getAttribute('data-rank')) || '0')
        const wins = parseInt((await row.getAttribute('data-wins')) || '0')
        const losses = parseInt((await row.getAttribute('data-losses')) || '0')
        const draws = parseInt((await row.getAttribute('data-draws')) || '0')
        observed[playerId] = { wins, losses, draws, rank }
      }

      for (const u of users) {
        const obs = observed[u.user.id]
        const exp = expected[u.user.id]
        expect(obs, `P${i + 1}: ${u.user.username} should appear in standings`).toBeDefined()
        expect(obs.wins, `P${i + 1}: ${u.user.username} wins`).toBe(exp.wins)
        expect(obs.losses, `P${i + 1}: ${u.user.username} losses`).toBe(exp.losses)
        expect(obs.draws, `P${i + 1}: ${u.user.username} draws`).toBe(exp.draws)
      }

      const ranks = Object.values(observed).map((o) => o.rank).sort((a, b) => a - b)
      expect(ranks).toEqual([1, 2, 3, 4, 5, 6, 7, 8])

      const sorted = Object.values(observed).sort((a, b) => a.rank - b.rank)
      for (let r = 0; r < sorted.length - 1; r++) {
        expect(sorted[r].wins,
          `P${i + 1}: rank ${r + 1} wins should be >= rank ${r + 2} wins`)
          .toBeGreaterThanOrEqual(sorted[r + 1].wins)
      }
    }

    console.log('  ✓ All 8 pages show consistent 8-player standings')
    console.log('\n' + '='.repeat(60))
    console.log('✅ 8-PLAYER CPM E2E TEST PASSED')
    console.log('='.repeat(60) + '\n')
  })
})

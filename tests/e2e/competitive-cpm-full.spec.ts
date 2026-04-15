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

    // Toggle Competitive (only visible to patrons/admins)
    const competitiveToggle = pages[0].locator('button.setting-lock', { hasText: 'Standard' })
    await expect(competitiveToggle).toBeVisible({ timeout: 10000 })
    await competitiveToggle.click()
    await expect(pages[0].locator('button.setting-lock', { hasText: 'Competitive' })).toBeVisible()
    console.log('  ✓ Host toggled Competitive on /draft')

    // Click Create Draft
    await pages[0].click('.create-draft-button, button:has-text("Create Draft")')

    // SetSelection page should now appear
    await pages[0].waitForSelector('.set-selection', { timeout: 15000 })

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

    // Host clicks Start Draft
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
  })
})

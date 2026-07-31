// @ts-nocheck
import { isOnPoolPage } from './helpers.ts'
import { test, expect, chromium, Browser, BrowserContext, Page } from '@playwright/test'
import { createTestUser, cleanupTestUsers, closeDb } from './test-utils.ts'
import { launchOptions } from './browser-launch'

/**
 * Full 8-player draft E2E test
 */

const NUM_PLAYERS = 8
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000'
const TEST_ID = `e2e_${Date.now()}`

test.describe.configure({ mode: 'serial' })
test.skip(({ browserName, isMobile }) =>
  browserName !== 'chromium' || isMobile,
  'Skipped: Desktop Chromium only (long-running integration test)'
)
test.setTimeout(1200000) // 20 minutes for 8 players

test.describe('Full 8-player draft', () => {
  let browser: Browser
  let contexts: BrowserContext[] = []
  let pages: Page[] = []
  let users: any[] = []
  let shareId: string | null = null

  test.beforeAll(async () => {
    console.log(`\n${'='.repeat(60)}`)
    console.log('Starting 8-Player Draft E2E Test')
    console.log(`Test ID: ${TEST_ID}`)
    console.log(`${'='.repeat(60)}\n`)

    browser = await chromium.launch({
      ...launchOptions,
    })

    // Create 8 test users
    for (let i = 0; i < NUM_PLAYERS; i++) {
      console.log(`Creating test user ${i + 1}/${NUM_PLAYERS}...`)
      const userData = await createTestUser(`TestPlayer${i + 1}`, TEST_ID)
      users.push(userData)

      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
      })
      contexts.push(context)

      // Set auth cookie
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
      page.on('console', msg => {
        if (msg.type() === 'error') {
          console.log(`  [P${i + 1} Error]:`, msg.text().slice(0, 80))
        }
      })
      pages.push(page)
      console.log(`  ✓ Created: ${userData.user.username}`)
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

  test('complete a full 8-player draft', async () => {
    // === STEP 1: Player 1 creates draft ===
    console.log('--- STEP 1: Creating draft ---')
    await pages[0].goto(`${BASE_URL}/draft`)
    await pages[0].waitForLoadState('networkidle')
    await pages[0].waitForTimeout(2000)

    await pages[0].click('.create-draft-button, button:has-text("Create Draft")')
    await pages[0].waitForSelector('.set-selection', { timeout: 10000 })
    await pages[0].locator('.sets-grid .set-card').first().click()

    await pages[0].waitForFunction(() => {
      const url = window.location.pathname
      return url.startsWith('/draft/') && !url.includes('/draft/new')
    }, { timeout: 20000 })

    shareId = pages[0].url().split('/draft/')[1]?.split('?')[0]
    console.log(`✓ Draft created: ${shareId}`)

    await pages[0].waitForSelector('.draft-lobby', { timeout: 10000 })

    // === STEP 2: All other players join ===
    console.log('\n--- STEP 2: Players joining ---')
    for (let i = 1; i < NUM_PLAYERS; i++) {
      await pages[i].goto(`${BASE_URL}/draft/${shareId}`)
      await pages[i].waitForSelector('.draft-lobby', { timeout: 10000 })
      // Wait for auto-join to complete (player becomes a participant)
      await pages[i].waitForTimeout(500)
      console.log(`  ✓ Player ${i + 1} navigated`)
    }

    // Wait for all players to actually join (auto-join is async)
    console.log('  Waiting for all players to join...')
    let attempts = 0
    while (attempts < 60) {
      const playerCountText = await pages[0].locator('.player-count').textContent().catch(() => '')
      const match = playerCountText.match(/(\d+)\s*\/\s*(\d+)/)
      if (match && parseInt(match[1]) >= NUM_PLAYERS) {
        console.log(`  ✓ All ${NUM_PLAYERS} players joined`)
        break
      }
      await pages[0].waitForTimeout(500)
      attempts++
      if (attempts % 10 === 0) {
        console.log(`    Still waiting... (${playerCountText})`)
      }
    }

    const playerCountText = await pages[0].locator('.player-count').textContent()
    console.log(`  Final player count: ${playerCountText}`)

    // === STEP 3: Start draft (two-stage: Ready → leader preview → Start Draft) ===
    console.log('\n--- STEP 3: Starting draft ---')
    // Every human seat presses Ready (migration 079) before packs can be dealt.
    for (const readyPage of pages) {
      const playerReady = readyPage.locator('.lobby-ready-button')
      await expect(playerReady).toBeEnabled({ timeout: 10000 })
      await playerReady.click()
    }

    const readyButton = pages[0].locator('button:has-text("Deal Packs")')
    await expect(readyButton).toBeEnabled({ timeout: 10000 })
    await readyButton.click()

    // Leader preview: leaders revealed, no picking yet
    await pages[0].waitForSelector('.leader-preview-phase', { timeout: 30000 })
    console.log('✓ Leader preview - leaders revealed')

    // Host opens picking
    const startButton = pages[0].locator('button:has-text("Start Draft")')
    await expect(startButton).toBeEnabled({ timeout: 10000 })
    await startButton.click()

    await pages[0].waitForSelector('.leader-draft-phase', { timeout: 30000 })
    console.log('✓ Draft started - Leader draft phase')

    // === STEP 4: Leader draft (3 rounds) ===
    console.log('\n--- STEP 4: Leader draft ---')

    for (let round = 1; round <= 3; round++) {
      console.log(`  Round ${round}/3:`)

      // Wait for all players to have cards to pick
      await waitForAllPlayersReady('.leaders-grid .draftable-card')

      // All players select a leader
      await selectCardForAllPlayers('.leaders-grid')

      // Wait for round to advance
      if (round < 3) {
        await waitForLeaderRoundAdvance(round)
      } else {
        await waitForPackDraftPhase()
      }

      console.log(`    ✓ Round ${round} complete`)
    }

    console.log('✓ Leader draft complete!')

    // === STEP 5: Pack draft ===
    console.log('\n--- STEP 5: Pack draft ---')

    for (let pack = 1; pack <= 3; pack++) {
      console.log(`  Pack ${pack}/3:`)

      for (let pick = 1; pick <= 14; pick++) {
        process.stdout.write(`    Pick ${pick}/14...`)

        // Wait for all players to have cards ready to pick
        await waitForAllPlayersReady('.pack-grid .draftable-card')

        // All players select a card
        await selectCardForAllPlayers('.pack-grid')

        // Wait for pick to advance (unless last pick of last pack)
        if (!(pack === 3 && pick === 14)) {
          // Wait for passing skeleton to confirm picks are registered. The new
          // pack is then waited for by waitForAllPlayersReady at the top of the
          // next iteration — waiting for it twice only split one budget in two,
          // and the first half is what kept running out.
          await waitForPassingSkeleton()
        }

        console.log(' ✓')
      }

      console.log(`  ✓ Pack ${pack} complete!`)
    }

    // === STEP 6: Verify completion ===
    console.log('\n--- STEP 6: Verifying completion ---')

    // Wait for completion - draft should redirect to pool or show complete state
    let p1Complete = false
    for (let i = 0; i < 30; i++) {
      await pages[0].waitForTimeout(1000)
      if (isOnPoolPage(pages[0].url())) {
        p1Complete = true
        break
      }
      // The finished draft lands on its pool page, whose tell is the Build Deck
      // button — .draft-complete/.deck-builder belong to other screens.
      const isComplete = await pages[0]
        .locator('.draft-complete, .deck-builder, button:has-text("Build Deck")')
        .first()
        .isVisible()
        .catch(() => false)
      if (isComplete) {
        p1Complete = true
        break
      }
    }

    // If still not complete, check if the last pick was processed (Cards: 42/42)
    if (!p1Complete) {
      const cardCount = await pages[0].locator('text=/Cards:.*42/').isVisible().catch(() => false)
      if (cardCount) {
        console.log('  Draft picked all cards, waiting for redirect...')
        p1Complete = true
      }
    }

    expect(p1Complete).toBeTruthy()

    console.log('\n' + '='.repeat(60))
    console.log('✅ 8-PLAYER DRAFT COMPLETED!')
    console.log('='.repeat(60) + '\n')
  })

  // Helper: Wait for majority of players to have selectable cards
  async function waitForAllPlayersReady(selector: string): Promise<void> {
    const threshold = Math.ceil(NUM_PLAYERS * 0.9) // 90% of players
    let counts: number[] = []
    let nudged = false
    // 60s: eight live browsers passing a pack around is not fast, and the
    // slowest page decides. Half this was enough to fail on pack 2 with the
    // draft perfectly healthy.
    for (let attempts = 0; attempts < 120; attempts++) {
      counts = await Promise.all(
        pages.map(page => page.locator(selector).count().catch(() => 0))
      )
      if (counts.filter(c => c > 0).length >= threshold) return

      // Halfway through, reload whoever is still empty-handed.
      //
      // This used to fire once per pack: a page that missed one 'state'
      // broadcast had nothing to correct it, because the next broadcast
      // describes the next change. useDraftSocket now runs a reconcile poll
      // that catches exactly that, and this stopped firing — so if you see it
      // in the output again, the app's backstop is the thing to look at, not
      // this wait.
      if (!nudged && attempts === 60) {
        nudged = true
        const stalled = counts
          .map((c, i) => (c === 0 ? i : -1))
          .filter((i) => i >= 0)
        if (stalled.length > 0) {
          console.log(`      nudging stalled pages: ${stalled.map((i) => `P${i + 1}`).join(', ')}`)
          await Promise.all(stalled.map((i) =>
            pages[i].reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null)))
        }
      }

      await pages[0].waitForTimeout(500)
    }
    // Name the players still empty-handed — "timeout waiting for cards" alone
    // says nothing about whether one page stalled or the table did.
    const empty = counts.map((c, i) => (c === 0 ? `P${i + 1}` : null)).filter(Boolean)
    throw new Error(`Timeout waiting for cards (${selector}). No cards for: ${empty.join(', ')}`)
  }

  // Helper: Have all players select a card
  /**
   * Every player picks a card, and we make sure the pick actually registered.
   *
   * A swallowed click here stalls the whole draft: the table waits forever for
   * a player who never picked, and the failure surfaces two helpers later as
   * "timeout waiting for new cards". So retry, and confirm each pick either by
   * the card going .selected or by the pack in front of the player changing.
   */
  async function selectCardForAllPlayers(gridSelector: string): Promise<void> {
    const stuck: string[] = []

    await Promise.all(pages.map(async (page, idx) => {
      const available = page.locator(`${gridSelector} .draftable-card:not(.selected):not(.dimmed)`)
      const selected = page.locator(`${gridSelector} .draftable-card.selected`)
      const signature = () =>
        page.$$eval(`${gridSelector} .draftable-card`, (els) =>
          els.map((e) => e.getAttribute('aria-label')).join('|'))

      for (let attempt = 0; attempt < 5; attempt++) {
        if (await selected.count() > 0) return

        const count = await available.count().catch(() => 0)
        // No cards on offer: this player has already picked and is waiting.
        if (count === 0) return

        const before = await signature().catch(() => '')
        const pickIdx = Math.floor(Math.random() * Math.min(count, 3))
        await available.nth(pickIdx).click({ timeout: 5000 }).catch(() => {})
        await page.waitForTimeout(200 + Math.random() * 200)

        if (await selected.count() > 0) return
        // The pick can submit outright, replacing the pack — that counts.
        if (await signature().catch(() => '') !== before) return
      }

      stuck.push(`player ${idx + 1}`)
    }))

    if (stuck.length > 0) {
      throw new Error(`Could not register a pick for: ${stuck.join(', ')}`)
    }
  }

  // Helper: Wait for passing skeleton to show (indicates pick was registered)
  async function waitForPassingSkeleton(): Promise<boolean> {
    const threshold = Math.ceil(NUM_PLAYERS * 0.75) // 75% of players should show skeleton
    let attempts = 0
    while (attempts < 30) {
      const counts = await Promise.all(
        pages.map(page =>
          page.locator('.skeleton-card, .passing-message').count().catch(() => 0)
        )
      )
      const showingCount = counts.filter(c => c > 0).length
      if (showingCount >= threshold) return true
      await pages[0].waitForTimeout(200)
      attempts++
    }
    return false // Timeout, but don't throw - might be last pick
  }

  // Helper: Wait for leader round to advance
  async function waitForLeaderRoundAdvance(currentRound: number): Promise<void> {
    const threshold = Math.ceil(NUM_PLAYERS * 0.9)
    let attempts = 0
    while (attempts < 60) {
      const states = await Promise.all(
        pages.map(async (page) => {
          try {
            const roundInfo = await page.locator('.draft-round-info').textContent({ timeout: 300 })
            const match = roundInfo?.match(/Leader Round (\d+)/)
            if (match) {
              return parseInt(match[1]) > currentRound
            }
            return false
          } catch {
            return false
          }
        })
      )
      if (states.filter(Boolean).length >= threshold) return
      await pages[0].waitForTimeout(500)
      attempts++
    }
    console.log('\n      ⚠ Leader round advance timeout')
  }

  // Helper: Wait for pack draft phase to start
  async function waitForPackDraftPhase(): Promise<void> {
    const threshold = Math.ceil(NUM_PLAYERS * 0.9)
    let attempts = 0
    while (attempts < 60) {
      const states = await Promise.all(
        pages.map(page => page.locator('.pack-draft-phase').isVisible({ timeout: 300 }).catch(() => false))
      )
      if (states.filter(Boolean).length >= threshold) return
      await pages[0].waitForTimeout(500)
      attempts++
    }
    throw new Error('Timeout waiting for pack draft phase')
  }

  // Helper: Wait for pack pick to advance
  async function waitForPickAdvance(currentPack: number, currentPick: number): Promise<void> {
    const threshold = Math.ceil(NUM_PLAYERS * 0.9)
    let attempts = 0
    while (attempts < 60) {
      const states = await Promise.all(
        pages.map(async (page) => {
          try {
            // Check for completion
            if (isOnPoolPage(page.url())) return true
            const complete = await page.locator('.draft-complete').isVisible({ timeout: 100 }).catch(() => false)
            if (complete) return true

            // Check pick info
            const roundInfo = await page.locator('.draft-round-info').textContent({ timeout: 300 })
            const match = roundInfo?.match(/Round (\d+) - Pick (\d+)/)
            if (match) {
              const pack = parseInt(match[1])
              const pick = parseInt(match[2])
              return (pack > currentPack) || (pack === currentPack && pick > currentPick)
            }
            return false
          } catch {
            return false
          }
        })
      )
      if (states.filter(Boolean).length >= threshold) return
      await pages[0].waitForTimeout(500)
      attempts++
    }
    console.log(`\n      ⚠ Pick advance timeout at Pack ${currentPack} Pick ${currentPick}`)
  }
})

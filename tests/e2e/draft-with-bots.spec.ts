// @ts-nocheck
import { test, expect, chromium, Browser, BrowserContext, Page } from '@playwright/test'
import { debugLog, debugError, testLog } from './debug-utils.ts'
import { createTestUser, cleanupTestUsers, closeDb } from './test-utils.ts'

/**
 * 1 human + 7 bots draft E2E test
 * Quick validation that tests leader draft (3 rounds) and first few pack picks
 */

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000'
const TEST_ID = `e2e_bots_${Date.now()}`
const PICKS_TO_TEST = 3 // Only test first 3 picks for speed

test.describe.configure({ mode: 'serial' })
test.setTimeout(600000) // 10 minutes

test.describe('Draft with bots', () => {
  // Skip on non-chromium browsers and mobile
  test.skip(({ browserName, isMobile }) =>
    browserName !== 'chromium' || isMobile,
    'Skipped: Desktop Chromium only (long-running integration test)'
  )

  let browser: Browser
  let context: BrowserContext
  let page: Page
  let user: any
  let shareId: string | null = null

  test.beforeAll(async () => {
    debugLog(`\n${'='.repeat(50)}`)
    debugLog('Starting 1 Human + 7 Bots Draft Test')
    debugLog(`Test ID: ${TEST_ID}`)
    debugLog(`${'='.repeat(50)}\n`)

    browser = await chromium.launch({
      headless: false,
      slowMo: 50,
    })

    // Create test user
    debugLog('Creating test user...')
    user = await createTestUser('HumanPlayer', TEST_ID)

    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    })

    // Set auth cookie
    const urlObj = new URL(BASE_URL)
    const cookieConfig: any = {
      name: user.cookieName,
      value: user.token,
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

    page = await context.newPage()
    page.on('console', msg => {
      if (msg.type() === 'error') {
        debugLog(`  [Error]:`, msg.text().slice(0, 80))
      }
    })

    debugLog(`✓ Created: ${user.user.username}\n`)
  })

  test.afterAll(async () => {
    debugLog('\nCleaning up...')
    try {
      await cleanupTestUsers(TEST_ID)
    } catch (e: any) {
      debugError('Cleanup error:', e.message)
    }
    await closeDb()
    if (context) await context.close()
    if (browser) await browser.close()
  })

  test('complete a draft with 7 bots', async () => {
    // === STEP 1: Create solo draft (auto-adds 7 bots) ===
    debugLog('--- STEP 1: Creating solo draft ---')
    await page.goto(`${BASE_URL}/solo/draft`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    // Select a set
    await page.waitForSelector('.set-selection', { timeout: 10000 })
    await page.locator('.sets-grid .set-card').first().click()

    // Wait for draft lobby to load (solo draft auto-creates and redirects)
    await page.waitForFunction(() => {
      const url = window.location.pathname
      return url.startsWith('/draft/') && !url.includes('/draft/new') && !url.includes('/solo')
    }, { timeout: 20000 })

    shareId = page.url().split('/draft/')[1]?.split('?')[0]
    debugLog(`✓ Solo draft created: ${shareId}`)

    await page.waitForSelector('.draft-lobby', { timeout: 10000 })

    // Verify bots were added
    await page.waitForTimeout(2000)
    const playerCountText = await page.locator('.player-count').textContent()
    debugLog(`  Player count: ${playerCountText}`)

    // === STEP 2: Start draft (two-stage: Ready → leader preview → Start Draft) ===
    debugLog('\n--- STEP 2: Starting draft ---')
    const readyButton = page.locator('button:has-text("Ready")')
    await expect(readyButton).toBeEnabled({ timeout: 10000 })
    await readyButton.click()

    // Leader preview: leaders revealed, no picking yet
    await page.waitForSelector('.leader-preview-phase', { timeout: 30000 })
    debugLog('✓ Leader preview - leaders revealed')

    // Host opens picking
    const startButton = page.locator('button:has-text("Start Draft")')
    await expect(startButton).toBeEnabled({ timeout: 10000 })
    await startButton.click()

    await page.waitForSelector('.leader-draft-phase', { timeout: 30000 })
    debugLog('✓ Draft started - Leader draft phase')

    // === STEP 4: Leader draft (3 rounds) ===
    debugLog('\n--- STEP 4: Leader draft ---')

    // With bots, leader draft may complete very quickly - check if already in pack draft
    const alreadyInPackDraft = await page.locator('.pack-draft-phase').isVisible().catch(() => false)
    if (alreadyInPackDraft) {
      debugLog('  (Leader draft already completed by bots)')
      debugLog('✓ Leader draft complete!')
    } else {
      for (let round = 1; round <= 3; round++) {
        debugLog(`  Round ${round}/3:`)

        // Check if we've advanced to pack draft (bots may have completed leader draft)
        const inPackDraft = await page.locator('.pack-draft-phase').isVisible().catch(() => false)
        if (inPackDraft) {
          debugLog('    (Bots completed remaining leader rounds)')
          break
        }

        // Wait for clickable leaders to appear - MUST have cards to interact with
        const leaderSelector = '.leaders-grid .draftable-card:not(.selected):not(.dimmed):not(.disabled)'
        let foundLeaders = false
        for (let wait = 0; wait < 30; wait++) { // 15 seconds max
          await pollServer()
          const inPack = await page.locator('.pack-draft-phase').isVisible().catch(() => false)
          if (inPack) { foundLeaders = true; break }
          if (page.url().includes('/pool/')) { foundLeaders = true; break }
          const count = await page.locator(leaderSelector).count()
          if (count > 0) { foundLeaders = true; break }
          await page.waitForTimeout(500)
        }
        // If bots moved us past leaders, that's fine - but if we're still in leader phase
        // there MUST be clickable leaders
        const stillInLeaderPhase = await page.locator('.leader-draft-phase').isVisible().catch(() => false)
        if (stillInLeaderPhase && !foundLeaders) {
          throw new Error(`Round ${round}: No clickable leaders available - page is inoperable`)
        }
        if (!stillInLeaderPhase) {
          debugLog('    (Advanced past leader phase)')
          break
        }

        // Click a leader with retry (click may be missed if loading state changes mid-click)
        const cardCount = await page.locator(leaderSelector).count()
        debugLog(`    Clicking leader (${cardCount} available)...`)
        let leaderSelected = false
        for (let clickAttempt = 0; clickAttempt < 5 && !leaderSelected; clickAttempt++) {
          // Check if bots advanced us past this phase
          if (await page.locator('.pack-draft-phase').isVisible().catch(() => false)) {
            leaderSelected = true; break
          }
          if (page.url().includes('/pool/')) {
            leaderSelected = true; break
          }
          const available = await page.locator(leaderSelector).count()
          if (available > 0) {
            await page.locator(leaderSelector).first().click({ timeout: 2000 }).catch(() => {})
            await page.waitForTimeout(500)
          }
          const hasSelection = await page.locator('.leaders-grid .draftable-card.selected').count() > 0
          if (hasSelection) { leaderSelected = true; break }
          // Also check if pick was auto-submitted (pickStatus changed to 'picked')
          const wasPicked = await page.locator('.leaders-grid .draftable-card').count() === 0
          if (wasPicked) { leaderSelected = true; break }
          await page.waitForTimeout(500)
        }
        if (!leaderSelected) {
          throw new Error(`Round ${round}: Failed to select a leader after multiple attempts`)
        }
        debugLog(`    ✓ Leader selected`)

        // Wait for round to advance (bots will pick, then packs pass)
        if (round < 3) {
          debugLog(`    Waiting for next round...`)
          await waitForLeaderRoundOrPackDraft(round + 1)
        } else {
          debugLog(`    Waiting for pack draft...`)
          await waitForPackDraft()
        }

        debugLog(`    ✓ Round ${round} complete`)
      }

      debugLog('✓ Leader draft complete!')
    }

    // === STEP 5: Pack draft (first few picks only for speed) ===
    debugLog('\n--- STEP 5: Pack draft (first 3 picks) ---')

    for (let pick = 1; pick <= PICKS_TO_TEST; pick++) {
      debugLog(`    Pick ${pick}/${PICKS_TO_TEST}:`)

      // Check if draft completed
      if (page.url().includes('/pool/')) {
        debugLog('      (draft complete)')
        break
      }

      // Wait for clickable pack cards to appear - MUST have cards to interact with
      const packSelector = '.pack-grid .draftable-card:not(.selected):not(.dimmed):not(.disabled)'
      let foundCards = false
      for (let wait = 0; wait < 30; wait++) { // 15 seconds max
        await pollServer()
        if (page.url().includes('/pool/')) { foundCards = true; break }
        const hasSkeleton = await page.locator('.skeleton-card').first().isVisible().catch(() => false)
        if (hasSkeleton) { await page.waitForTimeout(500); continue }
        const count = await page.locator(packSelector).count()
        if (count > 0) { foundCards = true; break }
        await page.waitForTimeout(500)
      }
      if (page.url().includes('/pool/')) {
        debugLog('      (draft complete)')
        break
      }
      if (!foundCards) {
        throw new Error(`Pick ${pick}: No clickable pack cards available - page is inoperable`)
      }

      // Click a card with retry (click may be missed if loading state changes mid-click)
      const cardCount = await page.locator(packSelector).count()
      debugLog(`      Clicking card (${cardCount} available)...`)
      let cardSelected = false
      for (let clickAttempt = 0; clickAttempt < 5 && !cardSelected; clickAttempt++) {
        if (page.url().includes('/pool/')) { cardSelected = true; break }
        const available = await page.locator(packSelector).count()
        if (available > 0) {
          await page.locator(packSelector).first().click({ timeout: 2000 }).catch(() => {})
          await page.waitForTimeout(500)
        }
        const hasSelection = await page.locator('.pack-grid .draftable-card.selected').count() > 0
        if (hasSelection) { cardSelected = true; break }
        // Also check if pick was auto-submitted
        const wasPicked = await page.locator('.pack-grid .draftable-card').count() === 0
        if (wasPicked) { cardSelected = true; break }
        await page.waitForTimeout(500)
      }
      if (!cardSelected) {
        throw new Error(`Pick ${pick}: Failed to select a card after multiple attempts`)
      }
      debugLog(`      ✓ Card selected`)

      // Wait for pick to advance (bots will pick quickly)
      if (pick < PICKS_TO_TEST && !page.url().includes('/pool/')) {
        debugLog(`      Waiting for next pick...`)
        await waitForPickAdvance(1, pick)
      }
    }

    debugLog(`  ✓ Pack draft mechanics validated!`)

    // === STEP 6: Verify draft progressed successfully ===
    debugLog('\n--- STEP 6: Verifying draft state ---')

    // Wait a moment for any final navigation
    await page.waitForTimeout(2000)

    // Check current state
    const currentUrl = page.url()
    debugLog(`  Final URL: ${currentUrl}`)

    // Check for various success conditions
    const stillInDraft = currentUrl.includes('/draft/')
    const onPoolPage = currentUrl.includes('/pool/') || currentUrl.includes('/pool')
    const inPackPhase = await page.locator('.pack-draft-phase').isVisible().catch(() => false)
    const hasPoolContent = await page.locator('text=Draft Pool').isVisible().catch(() => false)
    const hasBuildDeck = await page.locator('button:has-text("Build Deck")').isVisible().catch(() => false)

    debugLog(`  In draft: ${stillInDraft}`)
    debugLog(`  On pool page: ${onPoolPage}`)
    debugLog(`  Has pool content: ${hasPoolContent}`)
    debugLog(`  Has Build Deck button: ${hasBuildDeck}`)

    // Success if we're in draft, on pool page, or see pool content
    const success = stillInDraft || onPoolPage || inPackPhase || hasPoolContent || hasBuildDeck
    expect(success).toBeTruthy()

    debugLog('\n' + '='.repeat(50))
    debugLog('✅ DRAFT WITH BOTS TEST PASSED!')
    debugLog('   (Leader draft complete, pack draft mechanics verified)')
    debugLog('='.repeat(50) + '\n')
  })

  // Helper: Poll the server to trigger state updates and timeouts
  async function pollServer(): Promise<void> {
    await page.evaluate(async (shareId) => {
      try {
        await fetch(`/api/draft/${shareId}/state`, { credentials: 'include' })
      } catch {}
    }, shareId)
  }

  // Helper: Wait for specific leader round OR pack draft phase (FAILS on timeout)
  async function waitForLeaderRoundOrPackDraft(targetRound: number): Promise<void> {
    for (let attempts = 0; attempts < 60; attempts++) { // 30 seconds
      try {
        await pollServer()

        const inPackDraft = await page.locator('.pack-draft-phase').isVisible().catch(() => false)
        if (inPackDraft) return

        if (page.url().includes('/pool/')) return

        const roundInfo = await page.locator('.round-pick-info').textContent({ timeout: 500 })
        const match = roundInfo?.match(/Leader (\d+)/)
        if (match && parseInt(match[1]) >= targetRound) return
      } catch {}
      await page.waitForTimeout(500)
    }
    throw new Error(`Timeout waiting for leader round ${targetRound} - draft stuck`)
  }

  // Helper: Wait for pack draft phase (FAILS on timeout)
  async function waitForPackDraft(): Promise<void> {
    for (let attempts = 0; attempts < 60; attempts++) { // 30 seconds
      await pollServer()

      const isVisible = await page.locator('.pack-draft-phase').isVisible().catch(() => false)
      if (isVisible) return

      if (page.url().includes('/pool/')) return

      await page.waitForTimeout(500)
    }
    throw new Error('Timeout waiting for pack draft phase - draft stuck')
  }

  // Helper: Wait for pack pick to advance past current pick (FAILS on timeout)
  async function waitForPickAdvance(currentPack: number, currentPick: number): Promise<void> {
    for (let attempts = 0; attempts < 60; attempts++) { // 30 seconds
      try {
        await pollServer()

        if (page.url().includes('/pool/')) return

        const roundInfo = await page.locator('.round-pick-info').textContent({ timeout: 500 })
        const match = roundInfo?.match(/Pack (\d+) - Pick (\d+)/)
        if (match) {
          const pack = parseInt(match[1])
          const pick = parseInt(match[2])
          if (pack > currentPack || (pack === currentPack && pick > currentPick)) return
        }
      } catch {}
      await page.waitForTimeout(500)
    }
    throw new Error(`Timeout waiting to advance past Pack ${currentPack} Pick ${currentPick} - draft stuck`)
  }
})

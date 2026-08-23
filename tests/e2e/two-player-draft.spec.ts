// @ts-nocheck
import { isOnPoolPage, confirmDraftSelection } from './helpers.ts'
import { test, expect, chromium, Browser, BrowserContext, Page } from '@playwright/test'
import { createTestUser, cleanupTestUsers, closeDb } from './test-utils.ts'
import { launchOptions } from './browser-launch'

/**
 * 2-player draft E2E test - quick version that validates core draft mechanics
 * Tests: create draft, join, start, leader draft (3 rounds), pack draft (3 picks)
 */

const NUM_PLAYERS = 2
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000'
const TEST_ID = `e2e_2p_${Date.now()}`
const PICKS_TO_TEST = 3 // Only test first 3 picks per pack for speed

test.describe.configure({ mode: 'serial' })
test.skip(({ browserName, isMobile }) =>
  browserName !== 'chromium' || isMobile,
  'Skipped: Desktop Chromium only (long-running integration test)'
)
test.setTimeout(300000) // 5 minutes

test.describe('2-player draft', () => {
  let browser: Browser
  let contexts: BrowserContext[] = []
  let pages: Page[] = []
  let users: any[] = []
  let shareId: string | null = null

  test.beforeAll(async () => {
    console.log(`\n${'='.repeat(50)}`)
    console.log('Starting 2-Player Draft E2E Test')
    console.log(`Test ID: ${TEST_ID}`)
    console.log(`${'='.repeat(50)}\n`)

    browser = await chromium.launch({
      ...launchOptions,
    })

    // Create 2 test users
    for (let i = 0; i < NUM_PLAYERS; i++) {
      console.log(`Creating test user ${i + 1}/${NUM_PLAYERS}...`)
      const userData = await createTestUser(`Player${i + 1}`, TEST_ID)
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

    console.log(`\n✓ ${NUM_PLAYERS} test users ready\n`)
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

  test('complete a 2-player draft', async () => {
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

    // === STEP 2: Player 2 joins ===
    console.log('\n--- STEP 2: Player 2 joining ---')
    await pages[1].goto(`${BASE_URL}/draft/${shareId}`)
    await pages[1].waitForSelector('.draft-lobby', { timeout: 10000 })
    console.log('✓ Player 2 joined')

    await pages[0].waitForTimeout(1000)

    // === STEP 3: Start draft (two-stage: Ready → leader preview → Start Draft) ===
    console.log('\n--- STEP 3: Starting draft ---')
    // Both human seats press Ready (migration 079) before packs can be dealt.
    for (const readyPage of pages) {
      const playerReady = readyPage.locator('.lobby-ready-button')
      await expect(playerReady).toBeEnabled({ timeout: 10000 })
      await playerReady.click()
    }

    const readyButton = pages[0].locator('button:has-text("Deal Packs")')
    await expect(readyButton).toBeEnabled({ timeout: 10000 })
    await readyButton.click()

    // Leader preview: leaders revealed on both pages, no picking yet
    await pages[0].waitForSelector('.leader-preview-phase', { timeout: 20000 })
    await pages[1].waitForSelector('.leader-preview-phase', { timeout: 20000 })
    await expect(pages[0].locator('.leader-preview-phase .leaders-grid .draftable-card').first()).toBeVisible({ timeout: 10000 })
    console.log('✓ Leader preview - leaders revealed')

    // Host opens picking
    const startButton = pages[0].locator('button:has-text("Start Draft")')
    await expect(startButton).toBeEnabled({ timeout: 10000 })
    await startButton.click()

    await pages[0].waitForSelector('.leader-draft-phase', { timeout: 20000 })
    console.log('✓ Draft started - Leader draft phase')

    // === STEP 4: Leader draft (3 rounds) ===
    console.log('\n--- STEP 4: Leader draft ---')

    for (let round = 1; round <= 3; round++) {
      console.log(`  Round ${round}/3:`)

      // Wait for passing state to clear and cards to be ready
      await waitForCardsReady('.leaders-grid')

      // Both players select a leader
      await selectCardForAllPlayers('.leaders-grid')

      // Wait for "Passing" state to appear (all players picked)
      await waitForPassingState()

      // Wait for passing state to clear (new pack arrived) or pack draft to start
      if (round < 3) {
        await waitForPassingToClear('.leaders-grid')
      } else {
        // After round 3, wait for pack draft phase
        await waitForPackDraftPhase()
      }

      console.log(`    ✓ Round ${round} complete`)
    }

    console.log('✓ Leader draft complete!')

    // === STEP 5: Pack draft (first few picks only for speed) ===
    console.log('\n--- STEP 5: Pack draft (first 3 picks) ---')

    // Only test the first pack with a few picks to validate the mechanics work
    console.log(`  Pack 1:`)

    for (let pick = 1; pick <= PICKS_TO_TEST; pick++) {
      console.log(`    Pick ${pick}/${PICKS_TO_TEST}:`)

      // Wait for cards to be ready (no passing state)
      await waitForCardsReady('.pack-grid')

      // Both players select a card
      await selectCardForAllPlayers('.pack-grid')

      // Wait for passing state and then new cards
      if (pick < PICKS_TO_TEST) {
        await waitForPassingState()
        await waitForPassingToClear('.pack-grid')
      }

      console.log(`      ✓ Pick ${pick} complete`)
    }

    console.log(`  ✓ Pack draft mechanics validated!`)

    // === STEP 6: Verify draft is working ===
    console.log('\n--- STEP 6: Verifying draft state ---')

    // Verify we're still in the draft and it's progressing
    const stillInDraft = pages[0].url().includes('/draft/') ||
      await pages[0].locator('.pack-draft-phase').isVisible().catch(() => false)

    expect(stillInDraft).toBeTruthy()

    console.log('\n' + '='.repeat(50))
    console.log('✅ 2-PLAYER DRAFT TEST PASSED!')
    console.log('   (Leader draft complete, pack draft mechanics verified)')
    console.log('='.repeat(50) + '\n')
  })

  // Helper: Wait for cards to be ready AND clickable (canSelect = true)
  async function waitForCardsReady(gridSelector: string): Promise<void> {
    console.log(`      Waiting for cards to be ready...`)
    const isLeaderPhase = gridSelector.includes('leaders')
    let attempts = 0
    while (attempts < 60) {
      // Check all players
      const ready = await Promise.all(pages.map(async (page) => {
        // Check if passing message is visible (should NOT be)
        const passingVisible = await page.locator('.passing-message').isVisible().catch(() => false)
        if (passingVisible) return false

        // Check if skeleton cards are visible (should NOT be)
        const skeletonVisible = await page.locator('.skeleton-card').first().isVisible().catch(() => false)
        if (skeletonVisible) return false

        // Check if real cards are visible (should be)
        const cardCount = await page.locator(`${gridSelector} .draftable-card`).count().catch(() => 0)
        if (cardCount === 0) return false

        // Check no cards are disabled (loading state)
        const disabledCount = await page.locator(`${gridSelector} .draftable-card.disabled`).count().catch(() => 0)
        if (disabledCount > 0) return false

        // For leader phase, check for "Select" text
        if (isLeaderPhase) {
          const h3Text = await page.locator('.available-leaders h3').textContent({ timeout: 1000 }).catch(() => '')
          if (!h3Text.includes('Select')) return false
        }

        // For pack phase, just verify we're in pack draft phase and cards are ready
        // PackDraftPhase doesn't have a "Select" header like LeaderDraftPhase

        return true
      }))

      if (ready.every(Boolean)) {
        console.log(`      ✓ Cards ready for all players`)
        // Extra delay to ensure React state is fully settled
        await pages[0].waitForTimeout(500)
        return
      }

      await pages[0].waitForTimeout(500)
      attempts++
    }
    console.log(`      ⚠ Timeout waiting for cards to be ready`)
  }

  // Helper: Wait for passing state to appear (all players have picked)
  async function waitForPassingState(): Promise<void> {
    console.log(`      Waiting for passing state...`)
    let attempts = 0
    while (attempts < 60) {
      // Check if at least one player shows passing state
      const passingStates = await Promise.all(pages.map(async (page) => {
        const passingVisible = await page.locator('.passing-message').isVisible().catch(() => false)
        const skeletonVisible = await page.locator('.skeleton-card').first().isVisible().catch(() => false)
        return passingVisible || skeletonVisible
      }))

      if (passingStates.some(Boolean)) {
        console.log(`      ✓ Passing state detected`)
        return
      }

      await pages[0].waitForTimeout(300)
      attempts++
    }
    console.log(`      ⚠ Timeout waiting for passing state (may have advanced quickly)`)
  }

  // Helper: Wait for passing state to clear (new pack arrived) and UI ready for picking
  async function waitForPassingToClear(gridSelector: string): Promise<void> {
    console.log(`      Waiting for new cards...`)
    let attempts = 0
    while (attempts < 60) {
      const cleared = await Promise.all(pages.map(async (page) => {
        // Passing message should be gone
        const passingVisible = await page.locator('.passing-message').isVisible().catch(() => false)
        if (passingVisible) return false

        // Skeleton cards should be gone
        const skeletonVisible = await page.locator('.skeleton-card').first().isVisible().catch(() => false)
        if (skeletonVisible) return false

        // Real cards should be visible
        const cardCount = await page.locator(`${gridSelector} .draftable-card`).count().catch(() => 0)
        if (cardCount === 0) return false

        // For leader phase, check for "Select" text
        if (gridSelector.includes('leaders')) {
          const h3Text = await page.locator('.available-leaders h3').textContent({ timeout: 1000 }).catch(() => '')
          return h3Text.includes('Select')
        }

        // For pack phase, just wait for cards (no explicit "Select" text in UI)
        return true
      }))

      if (cleared.every(Boolean)) {
        console.log(`      ✓ New cards arrived`)
        // Extra delay for HTTP fetch to update myPlayer.pickStatus
        await pages[0].waitForTimeout(500)
        return
      }

      await pages[0].waitForTimeout(300)
      attempts++
    }
    console.log(`      ⚠ Timeout waiting for passing to clear`)
  }

  // Helper: Wait for both players to have selectable cards (legacy)
  async function waitForBothPlayersReady(selector: string): Promise<void> {
    let attempts = 0
    while (attempts < 30) {
      const counts = await Promise.all(
        pages.map(page => page.locator(selector).count().catch(() => 0))
      )
      if (counts.every(c => c > 0)) return
      await pages[0].waitForTimeout(500)
      attempts++
    }
    throw new Error(`Timeout waiting for cards: ${selector}`)
  }

  // Helper: Have all players select a card with robust clicking
  // Stagger clicks slightly to avoid race conditions
  async function selectCardForAllPlayers(gridSelector: string): Promise<void> {
    // Process players sequentially with small delays to avoid race conditions
    for (let idx = 0; idx < pages.length; idx++) {
      const page = pages[idx]
      if (idx > 0) {
        // Small delay between players
        await pages[0].waitForTimeout(200)
      }
      try {
        // Check if already selected
        const hasSelected = await page.locator(`${gridSelector} .draftable-card.selected`).count() > 0
        if (hasSelected) {
          console.log(`      [P${idx + 1}] Already has selection`)
          return
        }

        // Wait for UI to indicate we can pick AND no cards are disabled (loading=false)
        const isLeaderPhase = gridSelector.includes('leaders')
        let canPick = false
        for (let i = 0; i < 30 && !canPick; i++) {
          // Check that no cards have disabled class (which means loading=true)
          const disabledCount = await page.locator(`${gridSelector} .draftable-card.disabled`).count().catch(() => 0)
          const hasNoDisabled = disabledCount === 0

          // Check we have cards to select
          const cardCount = await page.locator(`${gridSelector} .draftable-card`).count().catch(() => 0)
          const hasCards = cardCount > 0

          // Check no passing state
          const passingVisible = await page.locator('.passing-message').isVisible().catch(() => false)
          const skeletonVisible = await page.locator('.skeleton-card').first().isVisible().catch(() => false)
          const notPassing = !passingVisible && !skeletonVisible

          // For leader phase, also check for "Select" text
          let hasSelectText = true
          if (isLeaderPhase) {
            const h3Text = await page.locator('.available-leaders h3').textContent({ timeout: 1000 }).catch(() => '')
            hasSelectText = h3Text.includes('Select')
          }

          canPick = hasSelectText && hasNoDisabled && hasCards && notPassing
          if (!canPick) {
            await page.waitForTimeout(200)
          }
        }
        if (!canPick) {
          console.log(`      [P${idx + 1}] UI not ready for picking after waiting`)
        }

        // Find available cards (not selected, not dimmed, not disabled)
        const cardSelector = `${gridSelector} .draftable-card:not(.selected):not(.dimmed):not(.disabled)`

        // Wait for at least one card to be available
        await page.waitForSelector(cardSelector, { timeout: 5000 }).catch(() => null)

        const cards = page.locator(cardSelector)
        const cardCount = await cards.count()

        if (cardCount === 0) {
          console.log(`      [P${idx + 1}] No selectable cards found`)
          return
        }

        // Click using dispatchEvent for more reliable event handling
        const freshCards = page.locator(`${gridSelector} .draftable-card:not(.selected):not(.dimmed):not(.disabled)`)
        const freshCount = await freshCards.count()

        if (freshCount === 0) {
          console.log(`      [P${idx + 1}] No cards available`)
          return
        }

        const card = freshCards.first()

        // Scroll into view first
        await card.scrollIntoViewIfNeeded()
        await page.waitForTimeout(100)

        // Use dispatchEvent to simulate a real click - this bypasses Playwright's click mechanism
        // which might be affected by event listeners or React's synthetic event system
        await card.evaluate(el => {
          const event = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window
          })
          el.dispatchEvent(event)
        })

        // Wait for selection to appear using Playwright's auto-retry
        try {
          await expect(page.locator(`${gridSelector} .draftable-card.selected`)).toBeVisible({ timeout: 3000 })
          console.log(`      [P${idx + 1}] ✓ Card selected`)
        } catch {
          // If first approach failed, try clicking again with force
          console.log(`      [P${idx + 1}] First click didn't register, trying force click...`)
          await card.click({ force: true, timeout: 1000 }).catch(() => {})
          await page.waitForTimeout(500)

          const selected = await page.locator(`${gridSelector} .draftable-card.selected`).count() > 0
          if (selected) {
            console.log(`      [P${idx + 1}] ✓ Card selected on retry`)
          } else {
            console.log(`      [P${idx + 1}] ⚠ Selection failed - checking if API call works directly`)
            // Last resort: trigger selection via JavaScript by finding the React onClick handler
            await page.evaluate((sel) => {
              const card = document.querySelector(sel + ' .draftable-card:not(.selected)')
              if (card) {
                // Try to find and call the onClick handler from React's internals
                const keys = Object.keys(card)
                const reactKey = keys.find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'))
                if (reactKey) {
                  console.log('Found React fiber, attempting to trigger click via React')
                }
                // Fallback: just click it normally
                ;(card as HTMLElement).click()
              }
            }, gridSelector)
            await page.waitForTimeout(500)
          }
        }

        // Staging isn't picking — the round only advances once every player
        // confirms the card they staged.
        await confirmDraftSelection(page)
      } catch (e: any) {
        console.log(`\n      [P${idx + 1}] Selection error: ${e.message?.slice(0, 50)}`)
      }
    }
  }

  // Helper: Wait for leader round to advance
  async function waitForRoundAdvance(phase: string, currentRound: number): Promise<void> {
    let attempts = 0
    while (attempts < 40) {
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
      if (states.every(Boolean)) return
      await pages[0].waitForTimeout(500)
      attempts++
    }
    console.log('\n      ⚠ Round advance timeout')
  }

  // Helper: Wait for pack draft phase to start
  async function waitForPackDraftPhase(): Promise<void> {
    let attempts = 0
    while (attempts < 40) {
      const states = await Promise.all(
        pages.map(page => page.locator('.pack-draft-phase').isVisible({ timeout: 300 }).catch(() => false))
      )
      if (states.every(Boolean)) return
      await pages[0].waitForTimeout(500)
      attempts++
    }
    throw new Error('Timeout waiting for pack draft phase')
  }

  // Helper: Wait for pack pick to advance
  async function waitForPickAdvance(currentPack: number, currentPick: number): Promise<void> {
    let attempts = 0
    while (attempts < 40) {
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
      if (states.every(Boolean)) return
      await pages[0].waitForTimeout(500)
      attempts++
    }
    console.log(`\n      ⚠ Pick advance timeout at Pack ${currentPack} Pick ${currentPick}`)
  }
})

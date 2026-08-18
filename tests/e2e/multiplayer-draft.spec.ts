// @ts-nocheck
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
    const readyButton = pages[0].locator('button:has-text("Ready")')
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
          // Wait for passing skeleton to confirm picks are registered
          await waitForPassingSkeleton()

          // Wait for new cards to appear (pack passed)
          await waitForNewCardsAfterPassing('.pack-grid')
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
      if (pages[0].url().includes('/pool/')) {
        p1Complete = true
        break
      }
      const isComplete = await pages[0].locator('.draft-complete, .deck-builder').isVisible().catch(() => false)
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
    let attempts = 0
    while (attempts < 60) {
      const counts = await Promise.all(
        pages.map(page => page.locator(selector).count().catch(() => 0))
      )
      const readyCount = counts.filter(c => c > 0).length
      if (readyCount >= threshold) return
      await pages[0].waitForTimeout(500)
      attempts++
    }
    throw new Error(`Timeout waiting for cards: ${selector}`)
  }

  // Helper: Have all players select a card
  async function selectCardForAllPlayers(gridSelector: string): Promise<void> {
    await Promise.all(pages.map(async (page, idx) => {
      try {
        // Check if already selected
        const hasSelected = await page.locator(`${gridSelector} .draftable-card.selected`).count() > 0
        if (hasSelected) return

        // Find available cards (not selected, not dimmed)
        const cards = await page.locator(`${gridSelector} .draftable-card:not(.selected):not(.dimmed)`).all()
        if (cards.length > 0) {
          // Pick randomly from first few
          const pickIdx = Math.floor(Math.random() * Math.min(cards.length, 3))
          await cards[pickIdx].click()
          await page.waitForTimeout(100 + Math.random() * 200)
        }
      } catch (e) {
        // Ignore - player might be in transition
      }
    }))
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

  // Helper: Wait for new cards to appear after passing
  async function waitForNewCardsAfterPassing(gridSelector: string): Promise<void> {
    const threshold = Math.ceil(NUM_PLAYERS * 0.9) // 90% of players should have cards
    let attempts = 0
    while (attempts < 60) {
      const counts = await Promise.all(
        pages.map(page => page.locator(`${gridSelector} .draftable-card`).count().catch(() => 0))
      )
      const readyCount = counts.filter(c => c > 0).length
      if (readyCount >= threshold) return
      await pages[0].waitForTimeout(500)
      attempts++
    }
    throw new Error(`Timeout waiting for new cards: ${gridSelector}`)
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
            if (page.url().includes('/pool/')) return true
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

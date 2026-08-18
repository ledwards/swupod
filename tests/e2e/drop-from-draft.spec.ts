// @ts-nocheck
import { test, expect, chromium, Browser, BrowserContext, Page } from '@playwright/test'
import { createTestUser, cleanupTestUsers, closeDb } from './test-utils.ts'
import { launchOptions } from './browser-launch'

/**
 * Drop from Draft E2E test
 * Tests:
 * - Player can drop from an active draft
 * - Player's slot is converted to a bot
 * - Organizer sees the player replaced with a bot
 * - Dropped player doesn't see the draft in their history
 */

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000'
const TEST_ID = `e2e_drop_${Date.now()}`

test.describe.configure({ mode: 'serial' })
test.skip(({ browserName, isMobile }) =>
  browserName !== 'chromium' || isMobile,
  'Skipped: Desktop Chromium only'
)
test.setTimeout(180000) // 3 minutes

test.describe('Drop from Draft', () => {
  let browser: Browser
  let contexts: BrowserContext[] = []
  let pages: Page[] = []
  let users: any[] = []
  let shareId: string | null = null

  test.beforeAll(async () => {
    console.log(`\n${'='.repeat(50)}`)
    console.log('Starting Drop from Draft E2E Test')
    console.log(`Test ID: ${TEST_ID}`)
    console.log(`${'='.repeat(50)}\n`)

    browser = await chromium.launch({
      ...launchOptions,
    })

    // Create 2 test users: Organizer and Player
    const userNames = ['Organizer', 'Player']
    for (let i = 0; i < 2; i++) {
      console.log(`Creating test user ${i + 1}/2: ${userNames[i]}...`)
      const userData = await createTestUser(userNames[i], TEST_ID)
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
          console.log(`  [${userNames[i]} Error]:`, msg.text().slice(0, 80))
        }
      })
      pages.push(page)
      console.log(`  ✓ Created: ${userData.user.username}`)
    }

    console.log(`\n✓ Test users ready\n`)
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

  test('player can drop from active draft and organizer sees bot replacement', async () => {
    const organizerPage = pages[0]
    const playerPage = pages[1]

    // === STEP 1: Organizer creates draft ===
    console.log('--- STEP 1: Organizer creates draft ---')
    await organizerPage.goto(`${BASE_URL}/draft`)
    await organizerPage.waitForLoadState('networkidle')
    await organizerPage.waitForTimeout(2000)

    await organizerPage.click('.create-draft-button, button:has-text("Create Draft")')
    await organizerPage.waitForSelector('.set-selection', { timeout: 10000 })
    await organizerPage.locator('.sets-grid .set-card').first().click()

    await organizerPage.waitForFunction(() => {
      const url = window.location.pathname
      return url.startsWith('/draft/') && !url.includes('/draft/new')
    }, { timeout: 20000 })

    shareId = organizerPage.url().split('/draft/')[1]?.split('?')[0]
    console.log(`✓ Draft created: ${shareId}`)

    await organizerPage.waitForSelector('.draft-lobby', { timeout: 10000 })

    // === STEP 2: Player joins ===
    console.log('\n--- STEP 2: Player joins draft ---')
    await playerPage.goto(`${BASE_URL}/draft/${shareId}`)
    await playerPage.waitForSelector('.draft-lobby', { timeout: 10000 })
    console.log('✓ Player joined')

    // Wait for organizer to see the player
    await organizerPage.waitForTimeout(1500)

    // Verify player count is 2
    const playerCountBefore = await organizerPage.locator('.player-seat:not(.empty)').count()
    console.log(`  Players in lobby: ${playerCountBefore}`)
    expect(playerCountBefore).toBe(2)

    // === STEP 3: Organizer starts draft (two-stage: Ready → preview → Start Draft) ===
    console.log('\n--- STEP 3: Organizer starts draft ---')
    const readyButton = organizerPage.locator('button:has-text("Ready")')
    await expect(readyButton).toBeEnabled({ timeout: 10000 })
    await readyButton.click()

    // Leader preview: leaders revealed on both pages, no picking yet
    await organizerPage.waitForSelector('.leader-preview-phase', { timeout: 20000 })
    await playerPage.waitForSelector('.leader-preview-phase', { timeout: 20000 })
    console.log('✓ Leader preview - leaders revealed')

    // Organizer opens picking
    const startButton = organizerPage.locator('button:has-text("Start Draft")')
    await expect(startButton).toBeEnabled({ timeout: 10000 })
    await startButton.click()

    await organizerPage.waitForSelector('.leader-draft-phase', { timeout: 20000 })
    await playerPage.waitForSelector('.leader-draft-phase', { timeout: 20000 })
    console.log('✓ Draft started - Leader draft phase')

    // === STEP 4: Complete 1 round of leader draft ===
    console.log('\n--- STEP 4: Complete 1 leader pick ---')

    // Wait for cards to be ready
    await waitForCardsReady(organizerPage, '.leaders-grid')
    await waitForCardsReady(playerPage, '.leaders-grid')

    // Both players select a leader
    await selectCard(organizerPage, '.leaders-grid', 'Organizer')
    await selectCard(playerPage, '.leaders-grid', 'Player')

    // Wait for selection to process
    await organizerPage.waitForTimeout(2000)
    console.log('✓ Leader picks made')

    // === STEP 5: Player drops from draft ===
    console.log('\n--- STEP 5: Player drops from draft ---')

    // Look for the drop button
    const dropButton = playerPage.locator('.draft-drop-button, button:has-text("Drop from Draft")')
    await expect(dropButton).toBeVisible({ timeout: 10000 })
    await dropButton.click()

    // Confirm the drop
    const confirmButton = playerPage.locator('.draft-drop-confirm, button:has-text("Drop from Draft")').last()
    await expect(confirmButton).toBeVisible({ timeout: 5000 })
    await confirmButton.click()

    // Wait for redirect to /draft
    await playerPage.waitForFunction(() => {
      return window.location.pathname === '/draft'
    }, { timeout: 10000 })
    console.log('✓ Player dropped and redirected to /draft')

    // === STEP 6: Verify organizer sees bot ===
    console.log('\n--- STEP 6: Verify organizer sees bot replacement ---')

    // Wait for state update
    await organizerPage.waitForTimeout(2000)

    // Refresh to ensure we have latest state
    await organizerPage.reload()
    await organizerPage.waitForSelector('.leader-draft-phase, .pack-draft-phase', { timeout: 10000 })

    // Check for bot indicator in player circle
    // Bots are shown with "(Bot)" suffix or have is_bot class
    const botIndicator = await organizerPage.locator('.player-seat').filter({ hasText: /Bot|🤖/ }).count()
    const playerCircleText = await organizerPage.locator('.player-circle, .players-section').textContent().catch(() => '')

    console.log(`  Bot indicators found: ${botIndicator}`)
    console.log(`  Player circle contains "Bot": ${playerCircleText.includes('Bot')}`)

    // The player should now be a bot - verify by checking player data
    // The UI may show bots differently, so we verify via API
    const response = await organizerPage.evaluate(async (shareId) => {
      const res = await fetch(`/api/draft/${shareId}`, { credentials: 'include' })
      return res.json()
    }, shareId)

    const players = response.data?.players || response.players || []
    const botPlayers = players.filter((p: any) => p.isBot || p.is_bot)
    console.log(`  Bot players in API response: ${botPlayers.length}`)
    expect(botPlayers.length).toBeGreaterThanOrEqual(1)
    console.log('✓ Organizer can see bot replacement')

    // === STEP 7: Verify dropped player doesn't see draft in history ===
    console.log('\n--- STEP 7: Verify player history ---')

    // Navigate player to history page
    await playerPage.goto(`${BASE_URL}/history`)
    await playerPage.waitForLoadState('networkidle')
    await playerPage.waitForTimeout(2000)

    // Click on Draft tab
    const draftTab = playerPage.locator('.history-tab:has-text("Draft"), button:has-text("Draft")')
    if (await draftTab.isVisible()) {
      await draftTab.click()
      await playerPage.waitForTimeout(1000)
    }

    // Check if the draft is listed - it should NOT be there (user dropped)
    const draftRows = await playerPage.locator('.history-table tbody tr, .history-item').count()
    const pageContent = await playerPage.content()
    const draftInHistory = pageContent.includes(shareId!)

    console.log(`  Draft rows found: ${draftRows}`)
    console.log(`  Draft ${shareId} in history: ${draftInHistory}`)

    // The dropped draft should not appear in history
    // (The API filters it out because user's player record has is_bot=true)
    expect(draftInHistory).toBe(false)
    console.log('✓ Dropped player does not see draft in history')

    // === STEP 8: Verify draft can continue (bot picks) ===
    console.log('\n--- STEP 8: Verify draft can continue with bot ---')

    // The organizer should still be able to continue the draft
    // The bot will auto-pick, so the draft should advance
    await organizerPage.waitForTimeout(3000) // Give bot time to pick

    const stillInDraft = await organizerPage.locator('.leader-draft-phase, .pack-draft-phase').isVisible().catch(() => false)
    console.log(`  Organizer still in draft: ${stillInDraft}`)
    expect(stillInDraft).toBe(true)

    console.log('\n' + '='.repeat(50))
    console.log('✅ DROP FROM DRAFT TEST PASSED!')
    console.log('='.repeat(50) + '\n')
  })

  // Helper: Wait for cards to be ready
  async function waitForCardsReady(page: Page, gridSelector: string): Promise<void> {
    let attempts = 0
    while (attempts < 30) {
      const passingVisible = await page.locator('.passing-message').isVisible().catch(() => false)
      if (passingVisible) {
        await page.waitForTimeout(500)
        attempts++
        continue
      }

      const skeletonVisible = await page.locator('.skeleton-card').first().isVisible().catch(() => false)
      if (skeletonVisible) {
        await page.waitForTimeout(500)
        attempts++
        continue
      }

      const cardCount = await page.locator(`${gridSelector} .draftable-card`).count().catch(() => 0)
      if (cardCount > 0) {
        await page.waitForTimeout(500)
        return
      }

      await page.waitForTimeout(500)
      attempts++
    }
  }

  // Helper: Select a card
  async function selectCard(page: Page, gridSelector: string, playerName: string): Promise<void> {
    const cardSelector = `${gridSelector} .draftable-card:not(.selected):not(.dimmed):not(.disabled)`

    await page.waitForSelector(cardSelector, { timeout: 5000 }).catch(() => null)

    const cards = page.locator(cardSelector)
    const cardCount = await cards.count()

    if (cardCount === 0) {
      console.log(`      [${playerName}] No selectable cards found`)
      return
    }

    const card = cards.first()
    await card.scrollIntoViewIfNeeded()
    await page.waitForTimeout(100)

    await card.evaluate(el => {
      const event = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window
      })
      el.dispatchEvent(event)
    })

    await page.waitForTimeout(500)
    console.log(`      [${playerName}] ✓ Card selected`)
  }
})

// @ts-nocheck
/**
 * Import Pool — Resolve step UI iteration harness.
 *
 * Mocks /api/import/extract with realistic LAW data so we can drive the
 * wizard through Upload → Resolve without burning Anthropic API calls and
 * iterate on the table layout. Saves a screenshot to /tmp/import-pool-resolve.png
 * after every run.
 *
 * Run: npx playwright test tests/e2e/import-pool-resolve-ui.spec.ts --project=chromium --headed
 *      (or omit --headed for headless)
 */

import { test, expect, chromium, Browser, BrowserContext, Page } from '@playwright/test'
import { createTestUser, cleanupTestUsers, closeDb } from './test-utils.ts'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000'
const TEST_ID = `e2e_ip_resolve_ui_${Date.now()}`

test.describe.configure({ mode: 'serial' })
test.skip(
  ({ browserName, isMobile }) => browserName !== 'chromium' || isMobile,
  'Desktop Chromium only',
)
test.setTimeout(60000)

// === Build a realistic LAW extraction fixture from cards.json ===

interface ExtractedRowOut {
  name: string
  type: string
  subtitle: string | null
  poolQty: number
  deckQty: number
  aspectGroup: string | null
}

interface MatchedRowOut {
  extracted: ExtractedRowOut
  matched: any
  candidates: any[]
  confidence: 'exact' | 'high' | 'ambiguous' | 'fuzzy' | 'unmatched'
}

function buildMockExtractResponse() {
  const cardData = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../../src/data/cards.json'), 'utf8'),
  )
  const all = cardData.cards || cardData
  const lawNormal = all.filter((c: any) => c.set === 'LAW' && c.variantType === 'Normal')

  // Synthesize a realistic player pool: pick 6 leaders, 6 bases, and ~80 unique
  // non-leader/non-base cards totaling 84 copies. The remaining ~250 cards
  // have poolQty=0 — they appear on the sheet but the player doesn't own them.
  const leaders = lawNormal.filter((c: any) => c.isLeader)
  const bases = lawNormal.filter((c: any) => c.isBase)
  const others = lawNormal.filter((c: any) => !c.isLeader && !c.isBase)

  const selectedLeaderIds = new Set(leaders.slice(0, 6).map((c: any) => c.id))
  const selectedBaseIds = new Set(bases.slice(0, 6).map((c: any) => c.id))
  const activeLeader = leaders[0]
  const activeBase = bases[0]

  // Distribute 84 copies across ~70 unique others
  const otherCounts = new Map<string, number>()
  let remaining = 84
  let i = 0
  while (remaining > 0 && i < 70) {
    const card = others[(i * 7) % others.length] // pseudo-shuffle
    const qty = Math.min(remaining, 1 + (i % 3 === 0 ? 1 : 0)) // mostly 1s, some 2s
    otherCounts.set(card.id, (otherCounts.get(card.id) || 0) + qty)
    remaining -= qty
    i++
  }

  const rowsOut: MatchedRowOut[] = []

  // Add every LAW card to the rows (sheet lists all of them)
  for (const card of lawNormal) {
    let poolQty = 0
    let deckQty = 0
    if (card.isLeader) {
      poolQty = selectedLeaderIds.has(card.id) ? 1 : 0
      // Active leader marked "in deck" with deckQty=1 by convention
      deckQty = card.id === activeLeader.id ? 1 : 0
    } else if (card.isBase) {
      poolQty = selectedBaseIds.has(card.id) ? 1 : 0
      deckQty = card.id === activeBase.id ? 1 : 0
    } else {
      poolQty = otherCounts.get(card.id) || 0
      // Roughly 60% of pool cards make the deck
      deckQty = poolQty > 0 ? Math.min(poolQty, Math.random() < 0.6 ? poolQty : 0) : 0
    }

    const matched = {
      id: card.id,
      cardId: card.cardId,
      name: card.name,
      subtitle: card.subtitle,
      type: card.type,
      aspects: card.aspects,
      imageUrl: card.imageUrl,
      isLeader: !!card.isLeader,
      isBase: !!card.isBase,
    }

    rowsOut.push({
      extracted: {
        name: card.name,
        type: card.type,
        subtitle: card.subtitle,
        poolQty,
        deckQty,
        aspectGroup: card.aspects?.[0] || (card.isLeader ? 'Leader' : card.isBase ? 'Base' : 'Neutral'),
      },
      matched,
      candidates: [],
      confidence: 'exact',
    })
  }

  return {
    success: true,
    data: {
      header: {
        setCode: 'LAW',
        setName: 'A Lawless Time',
        eventName: 'Star City Games — A Lawless Time',
        eventDate: '2026-04-26',
        playerName: 'Tom Barbour',
        leader: { name: activeLeader.name, subtitle: activeLeader.subtitle },
        base: { name: activeBase.name, subtitle: activeBase.subtitle },
      },
      warnings: [],
      rows: rowsOut,
    },
    message: null,
  }
}

// 1×1 transparent PNG so the upload step accepts an image
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

test.describe('Import Pool — Resolve UI', () => {
  let browser: Browser
  let context: BrowserContext
  let page: Page
  let user: any

  test.beforeAll(async () => {
    browser = await chromium.launch({ headless: true })
    user = await createTestUser('IPResolveUITester', TEST_ID, { isAdmin: true })

    const urlObj = new URL(BASE_URL)
    context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    })
    await context.addCookies([
      {
        name: user.cookieName,
        value: user.token,
        domain: urlObj.hostname,
        path: '/',
        httpOnly: true,
        secure: urlObj.protocol === 'https:',
      },
    ])
    page = await context.newPage()
  })

  test.afterAll(async () => {
    await context?.close()
    await cleanupTestUsers(TEST_ID)
    await closeDb()
    await browser.close()
  })

  test('Drive Upload → Resolve and screenshot', async () => {
    const mockResponse = buildMockExtractResponse()

    // Intercept extract calls — return the LAW fixture immediately
    await page.route('**/api/import/extract', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockResponse),
      })
    })

    // Clear any persisted state from prior runs
    await page.goto(`${BASE_URL}/import`)
    await page.evaluate(() => localStorage.removeItem('import-pool-wizard-v1'))
    await page.reload()

    // Step 1 — upload tiny PNG via the file input
    await page.waitForSelector('input[type="file"]', { state: 'attached', timeout: 10000 })
    const tinyPng = Buffer.from(TINY_PNG_BASE64, 'base64')
    await page.setInputFiles('input[type="file"]', {
      name: 'sheet.png',
      mimeType: 'image/png',
      buffer: tinyPng,
    })

    // Wait for image processing then click Extract
    await page.waitForSelector('button:has-text("Import Pool"):not([disabled])', { timeout: 5000 })
    await page.click('button:has-text("Import Pool")')

    // Step 2 — Resolve
    await page.waitForSelector('h2:has-text("Review Pool Registration")', { timeout: 10000 })
    await expect(page.locator('table.ip-table').first()).toBeVisible()

    // Wait a beat so all card images load before screenshot
    await page.waitForTimeout(1500)

    const fullScreenshotPath = '/tmp/import-pool-resolve.png'
    await page.screenshot({ path: fullScreenshotPath, fullPage: true })
    console.log(`\n  Full-page screenshot: ${fullScreenshotPath}`)

    // First-screen capture
    const firstScreen = '/tmp/import-pool-resolve-firstscreen.png'
    await page.screenshot({ path: firstScreen, fullPage: false })
    console.log(`  First screen: ${firstScreen}\n`)

    // Sanity checks. Default view hides poolQty=0 rows ("show only my pool"),
    // so we should see ~70-90 rows: 6 leaders + 6 bases + ~70 unique others.
    const rowCount = await page.locator('tbody tr.ip-row').count()
    console.log(`  Rendered row count (pool-only): ${rowCount}`)
    expect(rowCount).toBeGreaterThan(50)
    expect(rowCount).toBeLessThan(120)

    // Toggle "show all rows" and re-count
    // Click the "All" filter button in the segmented row-filter group
    await page.click('.ip-toggle-group button:has-text("All")')
    await page.waitForTimeout(200)
    const allRowCount = await page.locator('tbody tr.ip-row').count()
    console.log(`  Rendered row count (all): ${allRowCount}`)
    expect(allRowCount).toBeGreaterThan(200)

    const sectionCount = await page.locator('.ip-section').count()
    console.log(`  Aspect sections: ${sectionCount}`)
    expect(sectionCount).toBeGreaterThan(5)

    // Confirm the FIRST section is "Leaders"
    const firstSectionTitle = await page
      .locator('.ip-section .ip-section__title')
      .first()
      .innerText()
    console.log(`  First section: "${firstSectionTitle.trim()}"`)
    expect(firstSectionTitle.trim().toLowerCase()).toBe('leaders')

    const secondSectionTitle = await page
      .locator('.ip-section .ip-section__title')
      .nth(1)
      .innerText()
    console.log(`  Second section: "${secondSectionTitle.trim()}"`)
    expect(secondSectionTitle.trim().toLowerCase()).toBe('bases')

    // === Persistence test: reload mid-Resolve must keep us on Resolve ===
    // Inspect what we wrote to localStorage
    const storedRaw = await page.evaluate(() => localStorage.getItem('import-pool-wizard-v1'))
    console.log(`  localStorage size: ${storedRaw?.length || 0} chars`)
    const storedPhase = await page.evaluate(() => {
      const raw = localStorage.getItem('import-pool-wizard-v1')
      if (!raw) return null
      try { return JSON.parse(raw).phase } catch { return 'parse-error' }
    })
    console.log(`  localStorage phase: ${storedPhase}`)
    expect(storedPhase).toBe('resolving')

    // Reload the page
    await page.reload()

    // After reload: should still be on Resolve step (not Upload)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(500)

    const visibleH2 = await page.locator('h2').first().innerText()
    console.log(`  Post-reload H2: "${visibleH2}"`)
    expect(visibleH2).toContain('Review')

    const postReloadRows = await page.locator('tbody tr.ip-row').count()
    console.log(`  Post-reload row count: ${postReloadRows}`)
    expect(postReloadRows).toBeGreaterThan(50)
  })
})

// @ts-nocheck
import { test, expect } from '@playwright/test'
import { shouldIgnoreError } from './helpers.ts'

/**
 * Stats page E2E tests
 *
 * Tests the /stats page UI: stacked You/All/Top cells, legend toggles,
 * filter checkboxes, Aspects + Rarity columns, set tabs, and sub-tabs.
 *
 * These tests run against the live page (logged out) so "You" rows show "—".
 * All/Top checkboxes are disabled (paywall) unless logged in as patron/admin.
 */

// Stats page loads slowly due to 9+ parallel API calls — use longer timeout
const STATS_TIMEOUT = 60000

/** Navigate to /stats and wait for tables or empty state to render */
async function gotoStats(page) {
  await page.goto('/stats', { timeout: STATS_TIMEOUT, waitUntil: 'domcontentloaded' })
  // Wait for content, not networkidle (9 API calls may keep connections open)
  await page.waitForSelector('.stats-table, .stats-empty, .stats-legend-bar', { timeout: 45000 })
}

test.describe('Stats Page', () => {
  test.setTimeout(STATS_TIMEOUT)
  test.describe.configure({ retries: 1 })

  test.beforeEach(async ({ page }) => {
    const errors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text()
        if (!shouldIgnoreError(text)) {
          errors.push(text)
        }
      }
    })
    page.on('pageerror', error => {
      if (!shouldIgnoreError(error.message)) {
        errors.push(error.message)
      }
    })
    ;(page as any).errors = errors
  })

  test('should load stats page with header and tabs', async ({ page }) => {
    await gotoStats(page)

    // Header
    await expect(page.locator('.stats-header h1')).toHaveText('Stats')

    // Set tabs should be visible
    const tabs = page.locator('.stats-tab')
    await expect(tabs).toHaveCount(7)
    await expect(tabs.first()).toHaveText('LAW')

    // Sub-tabs (Draft / Sealed) should be visible
    await expect(page.locator('.stats-subtab').first()).toHaveText('Draft')
    await expect(page.locator('.stats-subtab').last()).toHaveText('Sealed')
  })

  test('should show legend bar with You/All/Top toggles', async ({ page }) => {
    await gotoStats(page)
    await page.waitForSelector('.stats-legend-bar', { timeout: 30000 })

    const legendBar = page.locator('.stats-legend-bar').first()

    // When logged out, should show "Log in" link instead of "You" toggle
    const loginLink = legendBar.locator('.stats-legend-login')
    const youToggle = legendBar.locator('.stats-legend-you')
    const loginVisible = await loginLink.isVisible().catch(() => false)
    const youVisible = await youToggle.isVisible().catch(() => false)
    expect(loginVisible || youVisible).toBeTruthy()

    // "All" toggle should always be visible
    await expect(legendBar.locator('.stats-legend-all')).toBeVisible()

    // "Top" toggle should always be visible
    await expect(legendBar.locator('.stats-legend-top')).toBeVisible()

    // Info icon on Top
    await expect(legendBar.locator('.stats-filter-info')).toBeVisible()
  })

  test('should show Humans/Bots filter checkboxes in legend bar', async ({ page }) => {
    await gotoStats(page)
    await page.waitForSelector('.stats-legend-bar', { timeout: 30000 })

    const legendBar = page.locator('.stats-legend-bar').first()
    const filters = legendBar.locator('.stats-legend-filter')

    // Draft tab should show Humans, Bots
    const filterTexts = await filters.allTextContents()
    expect(filterTexts.some(t => t.includes('Humans'))).toBeTruthy()
    expect(filterTexts.some(t => t.includes('Bots'))).toBeTruthy()
  })

  test('should show stacked cells with All/Top rows', async ({ page }) => {
    await gotoStats(page)
    await page.waitForSelector('.stats-stacked-cell', { timeout: 30000 })

    // Should have stacked cells
    const stackedCells = page.locator('.stats-stacked-cell')
    expect(await stackedCells.count()).toBeGreaterThan(0)

    // Each stacked cell should have row labels
    const firstCell = stackedCells.first()
    const allRow = firstCell.locator('.stats-row-all')
    await expect(allRow).toBeVisible()
    await expect(allRow.locator('.stats-row-label')).toHaveText('All:')

    const topRow = firstCell.locator('.stats-row-top')
    await expect(topRow).toBeVisible()
    await expect(topRow.locator('.stats-row-label')).toHaveText('Top:')
  })

  test('should have Aspects column in card tables', async ({ page }) => {
    await gotoStats(page)
    await page.waitForSelector('.stats-table', { timeout: 30000 })

    // Check that Aspects header exists
    const aspectsHeaders = page.locator('.stats-table th:text("Aspects")')
    expect(await aspectsHeaders.count()).toBeGreaterThan(0)

    // Check that aspect icons are rendered
    const aspectIcons = page.locator('.aspect-icon')
    expect(await aspectIcons.count()).toBeGreaterThan(0)
  })

  test('should have Rarity column in card tables', async ({ page }) => {
    await gotoStats(page)
    await page.waitForSelector('.stats-table', { timeout: 30000 })

    // Rarity header in Cards table (sortable)
    const rarityHeader = page.locator('.stats-table th.sortable:text("Rarity")')
    expect(await rarityHeader.count()).toBeGreaterThan(0)

    // Rarity values should be rendered with color classes
    const raritySpans = page.locator('[class^="rarity-"]')
    expect(await raritySpans.count()).toBeGreaterThan(0)
  })

  test('should show All/Top checkboxes as checked (may be locked when logged out)', async ({ page }) => {
    await gotoStats(page)
    await page.waitForSelector('.stats-legend-bar', { timeout: 30000 })

    // All and Top checkboxes should be checked by default
    const allToggle = page.locator('.stats-legend-all input[type="checkbox"]').first()
    await expect(allToggle).toBeChecked()

    const topToggle = page.locator('.stats-legend-top input[type="checkbox"]').first()
    await expect(topToggle).toBeChecked()

    // All rows should be visible
    const allRows = page.locator('.stats-row-all')
    expect(await allRows.count()).toBeGreaterThan(0)

    const topRows = page.locator('.stats-row-top')
    expect(await topRows.count()).toBeGreaterThan(0)
  })

  test('should switch between set tabs', async ({ page }) => {
    await gotoStats(page)

    // LAW should be active by default
    await expect(page.locator('.stats-tab.active')).toHaveText('LAW')

    // Click SEC tab
    await page.locator('.stats-tab:text("SEC")').click()
    await expect(page.locator('.stats-tab.active')).toHaveText('SEC')

    // URL hash should update
    expect(page.url()).toContain('#SEC')
  })

  test('should switch between Draft and Sealed sub-tabs', async ({ page }) => {
    await gotoStats(page)

    // Draft should be active by default
    await expect(page.locator('.stats-subtab.active')).toHaveText('Draft')

    // Click Sealed
    await page.locator('.stats-subtab:text("Sealed")').click()
    await expect(page.locator('.stats-subtab.active')).toHaveText('Sealed')

    // Wait for sealed data to load (table, empty state, or loading skeleton to resolve)
    await page.waitForSelector('.stats-table, .stats-empty, .stats-legend-bar', { timeout: 30000 })
  })

  test('should show card subtitle below card name', async ({ page }) => {
    await gotoStats(page)
    await page.waitForSelector('.card-name-cell', { timeout: 30000 })

    // Check for subtitle elements (block-level, not inline comma)
    const subtitles = page.locator('.card-subtitle')
    if (await subtitles.count() > 0) {
      // Subtitle should be its own block element, not start with comma
      const firstSubtitle = await subtitles.first().textContent()
      expect(firstSubtitle).not.toMatch(/^,/)
    }
  })

  test('should sort tables by clicking column headers', async ({ page }) => {
    await gotoStats(page)
    await page.waitForSelector('.stats-table th.sortable', { timeout: 30000 })

    // Click "# Drafted" header to sort descending
    const draftedHeader = page.locator('.stats-table th.sortable:text("# Drafted")').first()
    await draftedHeader.click()

    // Should show sort indicator
    await expect(draftedHeader.locator('.sort-indicator')).toBeVisible()

    // Click again to reverse
    await draftedHeader.click()
    const indicator = await draftedHeader.locator('.sort-indicator').textContent()
    expect(indicator).toBeTruthy()
  })

  test('should not have horizontal scroll on stats tables', async ({ page }) => {
    await gotoStats(page)
    await page.waitForSelector('.stats-table-container', { timeout: 30000 })

    const container = page.locator('.stats-table-container').first()
    const scrollWidth = await container.evaluate(el => el.scrollWidth)
    const clientWidth = await container.evaluate(el => el.clientWidth)

    // Allow small tolerance (2px) for borders
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2)
  })

  test('should not have console errors', async ({ page }) => {
    await gotoStats(page)

    // Wait for content to load
    await page.waitForSelector('.stats-table, .stats-empty', { timeout: 30000 })

    const errors = (page as any).errors || []
    expect(errors).toEqual([])
  })
})

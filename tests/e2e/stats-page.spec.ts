// @ts-nocheck
import { test, expect } from '@playwright/test'
import { shouldIgnoreError } from './helpers.ts'

/**
 * Stats page E2E tests
 *
 * Tests the /stats page UI: stacked You/All/Tournament/Top cells, legend toggles,
 * filter checkboxes, Aspects + Rarity columns, set tabs, and sub-tabs.
 *
 * These tests run against the live page (logged out) so "You" rows show "Log in".
 * Tournament/Top checkboxes are disabled (paywall) unless logged in as patron/admin.
 *
 * The page's default sub-tab is Cards (the tier list); gotoStats selects Sealed
 * Decks, which is the view these assertions describe.
 */

// Stats page loads slowly due to 9+ parallel API calls — use longer timeout
const STATS_TIMEOUT = 60000

/** Navigate to /stats, open the Sealed Decks sub-tab, and wait for real data. */
async function gotoStats(page) {
  await page.goto('/stats', { timeout: STATS_TIMEOUT, waitUntil: 'domcontentloaded' })

  // The default sub-tab is Cards, which is the tier-list view and has no legend
  // bar — everything below asserts on the legend, its You/All/Tournament/Top
  // toggles and the card tables, all of which live in the Sealed and Draft
  // views. The default used to be Sealed (this file's own header still says so),
  // so these tests silently began asserting against a page that no longer had
  // any of it. Select the tab the tests are actually about.
  await page.getByRole('button', { name: 'Sealed Decks' }).click()

  // Wait for actual content — .stats-legend-toggle only appears in the real StatsLegend, not the skeleton.
  // Also accept .stats-empty for sets with no data.
  await page.waitForSelector('.stats-legend-toggle, .stats-empty', { timeout: 45000 })
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

    // Sub-tabs (Sealed / Draft) should be visible — Sealed is first
    await expect(page.locator('.stats-subtab').first()).toHaveText('Sealed')
    await expect(page.locator('.stats-subtab').last()).toHaveText('Draft')
  })

  test('should show legend bar with You/All/Tournament/Top toggles', async ({ page }) => {
    await gotoStats(page)

    // Find a real legend bar (one with actual toggle elements, not skeleton)
    const legendBar = page.locator('.stats-legend-bar:has(.stats-legend-toggle)').first()
    await expect(legendBar).toBeVisible({ timeout: 30000 })

    // When logged out, should show "Log in" link instead of "You" toggle
    const loginLink = legendBar.locator('.stats-legend-login')
    const youToggle = legendBar.locator('.stats-legend-you')
    const loginVisible = await loginLink.isVisible().catch(() => false)
    const youVisible = await youToggle.isVisible().catch(() => false)
    expect(loginVisible || youVisible).toBeTruthy()

    // "All" toggle should always be visible
    await expect(legendBar.locator('.stats-legend-all')).toBeVisible()

    // "Tournament" toggle should always be visible
    await expect(legendBar.locator('.stats-legend-tournament')).toBeVisible()

    // "Top" toggle should always be visible
    await expect(legendBar.locator('.stats-legend-top')).toBeVisible()

    // Info icons on Tournament and Top
    const infoIcons = legendBar.locator('.stats-filter-info')
    expect(await infoIcons.count()).toBeGreaterThanOrEqual(2)
  })

  test('should show Humans/Bots filter checkboxes in legend bar', async ({ page }) => {
    await gotoStats(page)

    // Find a real legend bar with toggles (not skeleton)
    const legendBar = page.locator('.stats-legend-bar:has(.stats-legend-toggle)').first()
    await expect(legendBar).toBeVisible({ timeout: 30000 })

    const filters = legendBar.locator('.stats-legend-filter')

    // Should show Humans, Bots
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
    // Wait for real table data (not skeleton) — aspect-icon only appears in real data rows
    await page.waitForSelector('.aspect-icon', { timeout: 30000 })

    // Check that Aspects header exists
    const aspectsHeaders = page.locator('.stats-table th:text("Aspects")')
    expect(await aspectsHeaders.count()).toBeGreaterThan(0)

    // Check that aspect icons are rendered
    const aspectIcons = page.locator('.aspect-icon')
    expect(await aspectIcons.count()).toBeGreaterThan(0)
  })

  test('should have Rarity column in card tables', async ({ page }) => {
    await gotoStats(page)
    // Wait for real data to load — rarity spans only appear in real data rows
    await page.waitForSelector('[class^="rarity-"]', { timeout: 30000 })

    // Rarity header in tables (sortable)
    const rarityHeader = page.locator('.stats-table th.sortable:text("Rarity")')
    expect(await rarityHeader.count()).toBeGreaterThan(0)

    // Rarity values should be rendered with color classes
    const raritySpans = page.locator('[class^="rarity-"]')
    expect(await raritySpans.count()).toBeGreaterThan(0)
  })

  test('should show All/Top checkboxes as checked (may be locked when logged out)', async ({ page }) => {
    await gotoStats(page)

    // Wait for real legend bar with toggles
    await page.waitForSelector('.stats-legend-toggle', { timeout: 30000 })

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

    // Click SEC tab and wait for it to become active
    await page.locator('.stats-tab:text("SEC")').click()
    await expect(page.locator('.stats-tab.active')).toHaveText('SEC', { timeout: 10000 })

    // URL hash should update
    expect(page.url()).toContain('#SEC')
  })

  test('should switch between Sealed and Draft sub-tabs', async ({ page }) => {
    await gotoStats(page)

    // Sealed should be active by default
    await expect(page.locator('.stats-subtab.active')).toHaveText('Sealed')

    // Click Draft sub-tab and wait for it to become active
    await page.locator('.stats-subtab:text("Draft")').click()
    await expect(page.locator('.stats-subtab.active')).toHaveText('Draft', { timeout: 10000 })

    // Wait for draft data to load (table, empty state, or real legend toggle)
    await page.waitForSelector('.stats-table, .stats-empty, .stats-legend-toggle', { timeout: 30000 })
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

    // Click a sortable header — default tab is Sealed which has sortable columns
    const sortableHeader = page.locator('.stats-table th.sortable').first()
    await sortableHeader.click()

    // Should show sort indicator
    await expect(sortableHeader.locator('.sort-indicator')).toBeVisible()

    // Click again to reverse
    await sortableHeader.click()
    const indicator = await sortableHeader.locator('.sort-indicator').textContent()
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

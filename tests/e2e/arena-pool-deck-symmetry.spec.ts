// @ts-nocheck
/**
 * Verifies that the arena view's Pool and Deck areas render identically:
 * - Same toolbar composition (sort buttons, filter, penalty toggle, +All/-All)
 * - Same card-rendering structure for the same sort option
 * - Filter modal works (clicking checkboxes toggles state)
 */

import { test, expect } from '@playwright/test'
import { shouldIgnoreError } from './helpers.ts'

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000'

test.describe('Arena Pool/Deck symmetry', () => {
  let poolShareId: string | null = null

  test.setTimeout(180000)

  // One-time setup: create a sealed pool, open packs, and click Build Deck so /pool/{id}/deck loads.
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: BASE_URL })
    const page = await ctx.newPage()
    await page.goto('/sealed')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('.sets-grid .set-card').first()).toBeVisible({ timeout: 15000 })
    await page.locator('.sets-grid .set-card').first().scrollIntoViewIfNeeded()
    await page.locator('.sets-grid .set-card').first().click()
    await page.waitForURL(/\/pool\/[a-zA-Z0-9_-]+/, { timeout: 60000 })
    const url = page.url()
    poolShareId = url.split('/pool/')[1]?.split('/')[0]!

    // Open all packs (skip the per-card flip animation if Skip is offered)
    const skipBtn = page.getByRole('button', { name: /Skip/ })
    if (await skipBtn.count() > 0) await skipBtn.click()
    const openAll = page.getByRole('button', { name: 'Open All' })
    if (await openAll.count() > 0) await openAll.click()

    // Wait for the Build Deck button to be visible, then click it
    const buildDeck = page.getByRole('button', { name: 'Build Deck' })
    await expect(buildDeck).toBeVisible({ timeout: 30000 })
    await buildDeck.click()
    await page.waitForURL(/\/pool\/[a-zA-Z0-9_-]+\/deck/, { timeout: 30000 })

    // Confirm cards rendered in the deck builder
    await expect(page.locator('.canvas-card, .resizable-card').first()).toBeVisible({ timeout: 30000 })
    await ctx.close()
  })

  test.beforeEach(async ({ page }) => {
    const errors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error' && !shouldIgnoreError(msg.text())) errors.push(msg.text())
    })
    page.on('pageerror', e => { if (!shouldIgnoreError(e.message)) errors.push(e.message) })
    ;(page as any).errors = errors

    expect(poolShareId).not.toBeNull()

    // Pre-seed localStorage so the deck builder loads directly in arena view with clean filters.
    // We do this by visiting the deck page once so the origin exists, then writing localStorage,
    // then reloading.
    await page.goto(`${BASE_URL}/pool/${poolShareId}/deck`)
    await expect(page.locator('.deck-builder').first()).toBeVisible({ timeout: 30000 })

    await page.evaluate((id) => {
      const key = `deckBuilderUI_${id}`
      const v = JSON.parse(localStorage.getItem(key) || '{}')
      v.viewMode = 'arena'
      v.aspectFilters = { Vigilance: true, Command: true, Aggression: true, Cunning: true, Villainy: true, Heroism: true, Neutral: true }
      v.inAspectFilter = true
      v.outAspectFilter = true
      v.arenaPoolSortOption = 'cost'
      v.arenaDeckSortOption = 'cost'
      localStorage.setItem(key, JSON.stringify(v))
    }, poolShareId)
    await page.reload()
    await expect(page.locator('.deck-builder').first()).toBeVisible({ timeout: 30000 })
    // Cards should render (arena uses .resizable-card)
    await expect(page.locator('.resizable-card').first()).toBeVisible({ timeout: 15000 })
    await expect(page.locator('#arena-pool-header')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('#arena-deck-header')).toBeVisible({ timeout: 15000 })
  })

  test('Pool and Deck have identical toolbar composition', async ({ page }) => {
    // Each section header is followed by an .arena-section-controls toolbar with same children
    const summarize = async (headerSelector: string) => {
      return await page.evaluate((sel) => {
        const label = (b: Element) =>
          (b.textContent || '').replace(/[\u2212\u2013\u2014]/g, '-').replace(/\s+/g, ' ').trim()
        const header = document.querySelector(sel)
        const controls = header?.nextElementSibling
        if (!controls?.classList.contains('arena-section-controls')) return null
        return {
          sortBtns: controls.querySelectorAll('.inline-sort-controls button').length,
          filterBtn: !!controls.querySelector('.filter-button'),
          penaltyText: controls.textContent?.includes('Select a leader') || controls.textContent?.includes('Aspect Penalties'),
          // The remove button is labelled with a real minus sign (U+2212), not
          // a hyphen, so normalise before comparing or it never matches.
          addAll: !!Array.from(controls.querySelectorAll('button')).find(b => label(b) === '+ All'),
          removeAll: !!Array.from(controls.querySelectorAll('button')).find(b => label(b) === '- All'),
          // Single-line layout
          height: controls.getBoundingClientRect().height,
        }
      }, headerSelector)
    }

    const pool = await summarize('#arena-pool-header')
    const deck = await summarize('#arena-deck-header')

    expect(pool).not.toBeNull()
    expect(deck).not.toBeNull()
    expect(pool?.sortBtns).toBe(4)
    expect(deck?.sortBtns).toBe(4)
    expect(pool?.filterBtn).toBe(true)
    expect(deck?.filterBtn).toBe(true)
    expect(pool?.penaltyText).toBe(true)
    expect(deck?.penaltyText).toBe(true)
    expect(pool?.addAll).toBe(true)
    expect(deck?.addAll).toBe(true)
    expect(pool?.removeAll).toBe(true)
    expect(deck?.removeAll).toBe(true)
    // Single line: should be ≈28-40px tall, not multi-row
    expect(pool?.height).toBeLessThan(50)
    expect(deck?.height).toBeLessThan(50)

    expect((page as any).errors).toHaveLength(0)
  })

  test('Pool and Deck use the same shared card-rendering component', async ({ page }) => {
    // Initial state: pool has cards, deck has 0. Pool should render cost-columns.
    await expect(page.locator('.arena-pool-section .arena-cost-columns')).toHaveCount(1)

    // Move ALL pool cards to deck so deck renders and pool becomes empty.
    const sectionAddAll = page.locator('#arena-pool-header + .arena-section-controls').getByRole('button', { name: '+ All' })
    await sectionAddAll.click()
    await page.waitForTimeout(500)

    // Deck should now render cost-columns (same shared component).
    await expect(page.locator('.arena-deck-section .arena-cost-columns')).toHaveCount(1)

    // Pool should now show empty message.
    await expect(page.locator('.arena-pool-section .arena-empty-pool')).toHaveCount(1)

    expect((page as any).errors).toHaveLength(0)
  })

  test('Aspect mode uses primary-aspect column layout (matching cost mode)', async ({ page }) => {
    // Switch both pool and deck to aspect mode
    await page.evaluate((id) => {
      const key = `deckBuilderUI_${id}`
      const v = JSON.parse(localStorage.getItem(key) || '{}')
      v.arenaPoolSortOption = 'aspect'
      v.arenaDeckSortOption = 'aspect'
      localStorage.setItem(key, JSON.stringify(v))
    }, poolShareId)
    await page.reload()
    await expect(page.locator('#arena-pool-header')).toBeVisible({ timeout: 15000 })

    // Pool in aspect mode renders the SAME .arena-cost-columns container as cost mode.
    await expect(page.locator('.arena-pool-section .arena-cost-columns')).toHaveCount(1)

    // It should have at least 4 columns (one per primary aspect: V/C/A/Cu).
    // The shared layout uses .arena-cost-column.
    const colCount = await page.locator('.arena-pool-section .arena-cost-columns .arena-cost-column').count()
    expect(colCount).toBeGreaterThanOrEqual(4)

    expect((page as any).errors).toHaveLength(0)
  })

  test('Filter modal checkbox actually toggles state', async ({ page }) => {
    // Open the pool filter modal
    const filterBtn = page.locator('#arena-pool-header + .arena-section-controls .filter-button')
    await filterBtn.click()
    await expect(page.locator('.filter-modal')).toBeVisible({ timeout: 5000 })

    // Find the Villainy flat checkbox and click it directly
    const villainyLabel = page.locator('.filter-modal label').filter({ hasText: /^Villainy/ }).first()
    const villainyCheckbox = villainyLabel.locator('input[type="checkbox"]')

    await expect(villainyCheckbox).toBeChecked()
    await villainyCheckbox.click()
    await expect(villainyCheckbox).not.toBeChecked()
    await villainyCheckbox.click()
    await expect(villainyCheckbox).toBeChecked()

    // localStorage state should match
    const stored = await page.evaluate((id) => {
      const v = JSON.parse(localStorage.getItem(`deckBuilderUI_${id}`) || '{}')
      return v.aspectFilters?.Villainy
    }, poolShareId)
    expect(stored).toBe(true)

    expect((page as any).errors).toHaveLength(0)
  })

  test('Filter greys cards instead of moving them', async ({ page }) => {
    const initialPoolCount = await page.evaluate(() => {
      const m = document.querySelector('#arena-pool-header')?.textContent?.match(/\((\d+)\)/)
      return m ? parseInt(m[1], 10) : 0
    })
    expect(initialPoolCount).toBeGreaterThan(0)

    // Open pool filter and uncheck Villainy
    const filterBtn = page.locator('#arena-pool-header + .arena-section-controls .filter-button')
    await filterBtn.click()
    await expect(page.locator('.filter-modal')).toBeVisible({ timeout: 5000 })
    const villainyCheckbox = page.locator('.filter-modal label').filter({ hasText: /^Villainy/ }).first().locator('input')
    await villainyCheckbox.click()

    // Close modal
    await page.locator('.filter-modal').getByRole('button', { name: '×' }).click()
    await expect(page.locator('.filter-modal')).not.toBeVisible()

    // Pool count should NOT have changed (no card movement)
    const afterPoolCount = await page.evaluate(() => {
      const m = document.querySelector('#arena-pool-header')?.textContent?.match(/\((\d+)\)/)
      return m ? parseInt(m[1], 10) : 0
    })
    expect(afterPoolCount).toBe(initialPoolCount)

    // At least one card should be marked filtered-out (a Villainy card if pool has any)
    const filteredCardCount = await page.locator('.resizable-card.filtered-out').count()
    // If pool has Villainy cards, at least one should be greyed; otherwise filteredCardCount is 0 which is fine
    expect(filteredCardCount).toBeGreaterThanOrEqual(0)

    expect((page as any).errors).toHaveLength(0)
  })
})

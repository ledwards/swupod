// @ts-nocheck
import { test, expect } from '@playwright/test'
import { waitForNetworkIdle, shouldIgnoreError } from './helpers.ts'

/**
 * Pack Opening Animation - Mobile Layout Test
 *
 * Verifies that the pack opening animation fits within 100vh on various
 * mobile screen sizes without clipping or scrolling. Takes screenshots
 * at each viewport size for visual verification.
 *
 * Tested viewports:
 *   - Small Android: 360x640 (shortest common mobile screen)
 *   - iPhone SE: 375x667
 *   - iPhone 14: 390x844 (tall phone)
 */

const MOBILE_VIEWPORTS = [
  { name: 'small-android', width: 360, height: 640 },
  { name: 'iphone-se', width: 375, height: 667 },
  { name: 'iphone-14', width: 390, height: 844 },
]

for (const vp of MOBILE_VIEWPORTS) {
  test.describe(`Pack Opening Mobile Layout - ${vp.name} (${vp.width}x${vp.height})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } })

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

    test('cards and packs fit within viewport without clipping', async ({ page }) => {
      // Navigate to sets and create a sealed pool
      await page.goto('/sets')
      await waitForNetworkIdle(page)
      await expect(page.locator('.sets-grid .set-card').first()).toBeVisible({ timeout: 10000 })
      await page.locator('.sets-grid .set-card').first().click()
      await page.waitForURL(/\/pools\/(?!new(?:[/?#]|$))[a-zA-Z0-9_-]+/, { timeout: 30000 })

      // Wait for pack opening animation to appear
      await expect(page.locator('.pack-opening-container')).toBeVisible({ timeout: 10000 })

      // Screenshot: initial state with packs before opening
      await page.screenshot({ path: `tests/e2e/screenshots/pack-opening-${vp.name}-initial.png` })

      // Open a pack by clicking it (carousel shows active pack)
      const activePack = page.locator('.pack-item-mobile.active, .pack-item.visible').first()
      await expect(activePack).toBeVisible({ timeout: 5000 })
      await activePack.click()

      // Wait for cards to fly out and reveal
      await page.waitForTimeout(1500)

      // Screenshot: cards laid out after opening a pack
      await page.screenshot({ path: `tests/e2e/screenshots/pack-opening-${vp.name}-cards.png` })

      // ---- ASSERTIONS: everything fits in 100vh ----

      const viewportHeight = vp.height

      // 1. Container is exactly 100vh with overflow hidden (no scrolling)
      const containerOverflow = await page.evaluate(() => {
        const container = document.querySelector('.pack-opening-container')
        if (!container) return { found: false }
        const style = getComputedStyle(container)
        return {
          found: true,
          overflow: style.overflow,
          height: container.getBoundingClientRect().height,
          scrollHeight: (container as HTMLElement).scrollHeight,
        }
      })
      expect(containerOverflow.found).toBe(true)
      expect(containerOverflow.overflow).toBe('hidden')

      // 2. No flying card's bottom edge extends below the viewport
      const cardPositions = await page.evaluate((vh: number) => {
        const cards = document.querySelectorAll('.flying-card')
        const results: { id: string; bottom: number; clipped: boolean }[] = []
        cards.forEach((card, i) => {
          const rect = card.getBoundingClientRect()
          results.push({
            id: `card-${i}`,
            bottom: Math.round(rect.bottom),
            clipped: rect.bottom > vh,
          })
        })
        return results
      }, viewportHeight)

      const clippedCards = cardPositions.filter(c => c.clipped)
      expect(clippedCards, `Cards clipped below viewport on ${vp.name}: ${JSON.stringify(clippedCards)}`).toHaveLength(0)

      // 3. Pack carousel (remaining packs) is fully within viewport (not clipped)
      const carouselPosition = await page.evaluate((vh: number) => {
        const carousel = document.querySelector('.packs-carousel')
        if (!carousel) return null
        const rect = carousel.getBoundingClientRect()
        // Check the active pack image specifically
        const activePack = carousel.querySelector('.pack-item-mobile.active')
        const activeRect = activePack ? activePack.getBoundingClientRect() : null
        return {
          top: Math.round(rect.top),
          bottom: Math.round(rect.bottom),
          clippedBottom: rect.bottom > vh,
          clippedTop: rect.top < 0,
          activePackBottom: activeRect ? Math.round(activeRect.bottom) : null,
          activePackClipped: activeRect ? activeRect.bottom > vh : null,
        }
      }, viewportHeight)

      if (carouselPosition) {
        expect(carouselPosition.clippedBottom, `Pack carousel clipped at bottom on ${vp.name}: bottom=${carouselPosition.bottom}px > ${viewportHeight}px`).toBe(false)
        if (carouselPosition.activePackBottom !== null) {
          expect(carouselPosition.activePackClipped, `Active pack clipped on ${vp.name}: bottom=${carouselPosition.activePackBottom}px > ${viewportHeight}px`).toBe(false)
        }
      }

      // 4. Pack counter is fully within viewport
      const counterPosition = await page.evaluate((vh: number) => {
        const counter = document.querySelector('.pack-counter')
        if (!counter) return null
        const rect = counter.getBoundingClientRect()
        return { top: Math.round(rect.top), bottom: Math.round(rect.bottom), clipped: rect.bottom > vh }
      }, viewportHeight)

      if (counterPosition) {
        expect(counterPosition.clipped, `Pack counter clipped on ${vp.name}: bottom=${counterPosition.bottom}px > ${viewportHeight}px`).toBe(false)
      }

      // 5. No vertical scrollbar — document doesn't scroll
      const hasVerticalScroll = await page.evaluate(() => {
        return document.documentElement.scrollHeight > window.innerHeight + 5
      })
      expect(hasVerticalScroll, `Page has vertical scroll on ${vp.name}`).toBe(false)

      // 6. Cards don't overlap with pack carousel
      if (carouselPosition && cardPositions.length > 0) {
        const lowestCardBottom = Math.max(...cardPositions.map(c => c.bottom))
        expect(
          lowestCardBottom <= carouselPosition.top + 10, // 10px tolerance
          `Cards overlap carousel on ${vp.name}: lowest card bottom=${lowestCardBottom}px, carousel top=${carouselPosition.top}px`
        ).toBe(true)
      }

      // 7. Skip button is visible and within viewport
      const skipButtonPosition = await page.evaluate((vh: number) => {
        const btn = document.querySelector('.skip-button')
        if (!btn) return null
        const rect = btn.getBoundingClientRect()
        const style = getComputedStyle(btn)
        return {
          visible: style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0,
          top: Math.round(rect.top),
          bottom: Math.round(rect.bottom),
          right: Math.round(rect.right),
          clipped: rect.bottom > vh || rect.top < 0 || rect.right > window.innerWidth,
        }
      }, viewportHeight)

      expect(skipButtonPosition, `Skip button not found on ${vp.name}`).not.toBeNull()
      expect(skipButtonPosition!.visible, `Skip button not visible on ${vp.name}`).toBe(true)
      expect(skipButtonPosition!.clipped, `Skip button clipped on ${vp.name}: top=${skipButtonPosition!.top} bottom=${skipButtonPosition!.bottom} right=${skipButtonPosition!.right}`).toBe(false)

      // 8. Open All / Continue button is visible and within viewport
      const openAllPosition = await page.evaluate((vh: number) => {
        const container = document.querySelector('.open-all-container')
        if (!container) return null
        // Find the actual button inside (Open All or Continue)
        const btn = container.querySelector('button')
        if (!btn) return null
        const rect = btn.getBoundingClientRect()
        const style = getComputedStyle(btn)
        return {
          visible: style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0,
          top: Math.round(rect.top),
          bottom: Math.round(rect.bottom),
          clipped: rect.bottom > vh || rect.top < 0,
          text: btn.textContent?.trim(),
        }
      }, viewportHeight)

      expect(openAllPosition, `Open All button not found on ${vp.name}`).not.toBeNull()
      expect(openAllPosition!.visible, `Open All button not visible on ${vp.name}`).toBe(true)
      expect(openAllPosition!.clipped, `Open All button clipped on ${vp.name}: top=${openAllPosition!.top} bottom=${openAllPosition!.bottom}`).toBe(false)

      // Check no JS errors
      expect((page as any).errors).toHaveLength(0)
    })
  })
}

// @ts-nocheck
import { test, expect } from '@playwright/test'
import { checkLayoutIssues, waitForNetworkIdle, checkAccessibility, shouldIgnoreError } from './helpers.ts'

/**
 * Regression tests to catch common issues
 * These tests verify that major features work and common bugs don't reappear
 */

test.describe('Global Regression Tests', () => {
  const pagesToTest = [
    { url: '/', name: 'Landing Page' },
    { url: '/sets', name: 'Set Selection' },
    { url: '/draft', name: 'Draft Landing' },
    { url: '/terms-of-service', name: 'Terms of Service' },
    { url: '/privacy-policy', name: 'Privacy Policy' },
  ]

  for (const { url, name } of pagesToTest) {
    test(`${name} - should have no JS errors`, async ({ page }) => {
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

      await page.goto(url)
      await waitForNetworkIdle(page)

      expect(errors).toHaveLength(0)
    })

    test(`${name} - should have no layout overflow`, async ({ page }) => {
      await page.goto(url)
      await waitForNetworkIdle(page)

      const issues = await checkLayoutIssues(page)
      expect(issues).toHaveLength(0)
    })

    test(`${name} - should load within reasonable time`, async ({ page }) => {
      const startTime = Date.now()
      await page.goto(url)
      await waitForNetworkIdle(page)
      const loadTime = Date.now() - startTime

      // Page should load within 10 seconds
      expect(loadTime).toBeLessThan(10000)
    })
  }
})

test.describe('Mobile Regression Tests', () => {
  test.use({ viewport: { width: 375, height: 667 } })

  const mobilePagesToTest = [
    { url: '/', name: 'Landing Page' },
    { url: '/sets', name: 'Set Selection' },
    { url: '/draft', name: 'Draft Landing' },
  ]

  for (const { url, name } of mobilePagesToTest) {
    test(`${name} - mobile layout should have no overflow`, async ({ page }) => {
      await page.goto(url)
      await waitForNetworkIdle(page)

      const issues = await checkLayoutIssues(page)
      expect(issues).toHaveLength(0)
    })

    test(`${name} - mobile should have clickable buttons`, async ({ page }) => {
      await page.goto(url)
      await waitForNetworkIdle(page)

      // Main action buttons should be clickable (not covered by other elements)
      // Use more specific selectors for important buttons
      const importantButtons = page.locator('.mode-button, .create-draft-button, .primary-button')
      const count = await importantButtons.count()

      for (let i = 0; i < count; i++) {
        const button = importantButtons.nth(i)
        if (await button.isVisible()) {
          const isClickable = await button.evaluate(el => {
            const rect = el.getBoundingClientRect()
            const centerX = rect.left + rect.width / 2
            const centerY = rect.top + rect.height / 2
            // Skip buttons that are scrolled out of the viewport
            if (centerY < 0 || centerY > window.innerHeight || centerX < 0 || centerX > window.innerWidth) {
              return true
            }
            const topElement = document.elementFromPoint(centerX, centerY)
            // Allow for child elements (like icons, text spans, or inner content divs)
            return el.contains(topElement) || el === topElement || topElement?.closest('button') === el || topElement?.closest('.mode-button') === el
          })
          expect(isClickable).toBe(true)
        }
      }
    })
  }
})

test.describe('CSS Loading Regression', () => {
  test('should load all CSS files', async ({ page }) => {
    const cssErrors: string[] = []

    page.on('response', response => {
      if (response.url().includes('.css') && !response.ok()) {
        cssErrors.push(response.url())
      }
    })

    await page.goto('/')
    await waitForNetworkIdle(page)

    expect(cssErrors).toHaveLength(0)
  })

  test('critical elements should have expected styles', async ({ page }) => {
    await page.goto('/')
    await waitForNetworkIdle(page)

    // Logo should be centered
    const logo = page.locator('.landing-logo')
    await expect(logo).toBeVisible()

    // Mode buttons should have visible background
    const modeButton = page.locator('.mode-button').first()
    await expect(modeButton).toBeVisible()

    const bgColor = await modeButton.evaluate(el => {
      const style = getComputedStyle(el)
      return style.backgroundColor
    })

    // Should not be transparent or white
    expect(bgColor).not.toBe('rgba(0, 0, 0, 0)')
    expect(bgColor).not.toBe('rgb(255, 255, 255)')
  })
})

test.describe('Image Loading Regression', () => {
  test('set selection images should load or show fallback', async ({ page }) => {
    await page.goto('/sets')
    await waitForNetworkIdle(page)

    // Wait for sets to load
    await expect(page.locator('.set-card').first()).toBeVisible({ timeout: 10000 })

    // Each set card should have either an image or a placeholder
    const setCards = page.locator('.set-card')
    const count = await setCards.count()

    for (let i = 0; i < count; i++) {
      const card = setCards.nth(i)
      const hasImage = await card.locator('img.set-image').isVisible().catch(() => false)
      const hasPlaceholder = await card.locator('.set-image-placeholder').isVisible().catch(() => false)

      // Should have either image or placeholder
      expect(hasImage || hasPlaceholder).toBe(true)
    }
  })
})

test.describe('Navigation Regression', () => {
  test('back navigation should work correctly', async ({ page }) => {
    // Start at landing
    await page.goto('/')
    await waitForNetworkIdle(page)

    // Click the first mode button (Solo Sealed -> /sealed)
    await page.locator('.mode-button').first().click()
    await expect(page).toHaveURL('/sealed')

    // Use browser back
    await page.goBack()
    await expect(page).toHaveURL('/')
  })

  test('direct URL navigation should work', async ({ page }) => {
    // Navigate directly to sets
    await page.goto('/sets')
    await expect(page.locator('.set-selection')).toBeVisible()

    // Navigate directly to draft
    await page.goto('/draft')
    await expect(page.locator('h1')).toContainText('Draft')

    // Navigate directly to landing
    await page.goto('/')
    await expect(page.locator('.landing-page')).toBeVisible()
  })
})

test.describe('Responsive Breakpoints', () => {
  const breakpoints = [
    { width: 1920, height: 1080, name: 'Desktop Large' },
    { width: 1366, height: 768, name: 'Desktop Medium' },
    { width: 1024, height: 768, name: 'Tablet Landscape' },
    { width: 768, height: 1024, name: 'Tablet Portrait' },
    { width: 414, height: 896, name: 'Mobile Large' },
    { width: 375, height: 667, name: 'Mobile Medium' },
    { width: 320, height: 568, name: 'Mobile Small' },
  ]

  for (const { width, height, name } of breakpoints) {
    test(`Landing page at ${name} (${width}x${height})`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await page.goto('/')
      await waitForNetworkIdle(page)

      // Check no horizontal overflow
      const issues = await checkLayoutIssues(page)
      expect(issues).toHaveLength(0)

      // Logo and mode buttons should be visible
      await expect(page.locator('.landing-logo')).toBeVisible()
      await expect(page.locator('.mode-button').first()).toBeVisible()
      // Name the sections rather than counting them. This asserted a count of
      // 2 long after Deckbuilder made it 3, and a bare count says nothing about
      // which one went missing — it just breaks again the next time a section
      // is added, which is how it came to be wrong in the first place.
      for (const section of ['Solo', 'With Friends', 'Deckbuilder']) {
        await expect(
          page.locator('.mode-section .mode-section-header', { hasText: section })
        ).toBeVisible()
      }
    })
  }
})

test.describe('Error Handling Regression', () => {
  test('404 page should not crash', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => {
      if (!shouldIgnoreError(error.message)) {
        errors.push(error.message)
      }
    })

    await page.goto('/nonexistent-page-12345')

    // Should not have uncaught JS errors
    expect(errors).toHaveLength(0)
  })

  test('invalid pool ID should handle gracefully', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => {
      if (!shouldIgnoreError(error.message)) {
        errors.push(error.message)
      }
    })

    await page.goto('/pool/invalid-share-id-12345')
    await page.waitForTimeout(2000)

    // Should either show error message or redirect, but not crash
    expect(errors).toHaveLength(0)
  })

  test('invalid draft ID should handle gracefully', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => {
      if (!shouldIgnoreError(error.message)) {
        errors.push(error.message)
      }
    })

    await page.goto('/draft/invalid-share-id-12345')
    await page.waitForTimeout(2000)

    // Should not crash
    expect(errors).toHaveLength(0)
  })
})

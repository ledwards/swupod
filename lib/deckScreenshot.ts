/**
 * Server-side deck image generation using Playwright.
 * Navigates to the pool's play page, triggers the Deck Image export,
 * and captures the canvas-generated image from the modal.
 */

import { chromium } from 'playwright-core'

const APP_URL = process.env['APP_URL'] || process.env['NEXT_PUBLIC_APP_URL'] || 'http://localhost:3000'

/**
 * Generate a deck image for a pool by triggering the client-side canvas export.
 * Returns a PNG buffer, or null if generation fails.
 */
export async function captureDeckImage(poolShareId: string): Promise<Buffer | null> {
  let browser
  try {
    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
      viewport: { width: 1400, height: 900 },
    })
    const page = await context.newPage()

    // Navigate to the play page (where the Deck Image button lives)
    await page.goto(`${APP_URL}/pool/${poolShareId}/deck/play`, {
      waitUntil: 'networkidle',
      timeout: 30000,
    })

    // Wait for the page to fully render
    await page.waitForTimeout(3000)

    // Find and click the Deck Image button
    const buttons = page.locator('.play-instructions-action-button')
    const buttonCount = await buttons.count()

    let clicked = false
    // The deck image button is typically the last action button
    for (let i = buttonCount - 1; i >= 0; i--) {
      const btn = buttons.nth(i)
      const text = await btn.textContent()
      if (text?.includes('Deck Image') || text?.includes('Image')) {
        await btn.click()
        clicked = true
        break
      }
    }

    if (!clicked && buttonCount > 0) {
      // Try clicking the last button as fallback (deck image is usually last)
      await buttons.last().click()
      clicked = true
    }

    if (!clicked) {
      console.error('[DeckImage] Could not find Deck Image button')
      await context.close()
      return null
    }

    // Wait for the modal with the generated image to appear
    const modalImage = page.locator('.deck-image-modal-image')
    try {
      await modalImage.waitFor({ state: 'visible', timeout: 30000 })
    } catch {
      console.error('[DeckImage] Deck image modal did not appear')
      await context.close()
      return null
    }

    // Wait for the image to finish rendering
    await page.waitForTimeout(2000)

    // Extract the image as JPEG (compressed) by drawing to a resized canvas
    const imageBuffer = await page.evaluate(async () => {
      const img = document.querySelector('.deck-image-modal-image') as HTMLImageElement
      if (!img?.src) return null

      // Load the blob URL into a canvas for resizing/compression
      const response = await fetch(img.src)
      const blob = await response.blob()
      const bitmap = await createImageBitmap(blob)

      // Scale down to max 1600px wide (Discord-friendly size)
      const maxWidth = 1600
      const scale = bitmap.width > maxWidth ? maxWidth / bitmap.width : 1
      const w = Math.round(bitmap.width * scale)
      const h = Math.round(bitmap.height * scale)

      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(bitmap, 0, 0, w, h)

      // Export as JPEG at 85% quality for smaller file size
      const jpegBlob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.85)
      })

      const arrayBuffer = await jpegBlob.arrayBuffer()
      const bytes = new Uint8Array(arrayBuffer)
      let binary = ''
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]!)
      }
      return btoa(binary)
    })

    await context.close()

    if (!imageBuffer) {
      console.error('[DeckImage] Could not extract image from modal')
      return null
    }

    return Buffer.from(imageBuffer, 'base64')
  } catch (err) {
    console.error('[DeckImage] Error generating deck image:', err)
    return null
  } finally {
    if (browser) await browser.close()
  }
}

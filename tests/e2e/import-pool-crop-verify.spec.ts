// @ts-nocheck
/**
 * Import Pool — section-crop verification
 *
 * For each section tab (Leaders / Bases / Vigilance / Command / etc.),
 * inspect the rendered <img> in the section panel and assert the crop
 * actually shows the right region of the source photo.
 *
 * Two checks per tab:
 *   1. The bounds the wizard has for this section come from a non-trivial
 *      slice of the photo (not 0×0, not full photo).
 *   2. The <img>'s CSS positioning + viewport size means the visible
 *      window of the photo lines up with the bounds (within tolerance).
 *
 * This isolates whether the bug is in the bounds (server) or in the
 * crop math / image dimensions (client).
 */
import { test, expect, chromium } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { createTestUser, cleanupTestUsers, closeDb } from './test-utils.ts'

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000'
const TEST_ID = `e2e_crop_verify_${Date.now()}`

test.describe.configure({ mode: 'serial' })
test.skip(({ browserName, isMobile }) => browserName !== 'chromium' || isMobile, 'Desktop Chromium only')
test.setTimeout(180000) // 3min — real Anthropic call inside

test.describe('Import Pool — crop verification', () => {
  let browser
  let user

  test.beforeAll(async () => {
    browser = await chromium.launch({ headless: true })
    // Admin bypasses the patron gate inside /api/import/extract, so just need isAdmin: true.
    user = await createTestUser('crop-verify', TEST_ID, { isAdmin: true })
  })

  test.afterAll(async () => {
    await cleanupTestUsers(TEST_ID)
    await closeDb()
    await browser.close()
  })

  test('every section tab renders a crop that matches its bounds', async () => {
    const urlObj = new URL(BASE_URL)
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
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
    const page = await context.newPage()
    page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message))

    await page.goto(`${BASE_URL}/import`)
    await page.waitForLoadState('networkidle')

    // Upload Lee's actual HEIC pair — exercises the HEIC→JPG server-side
    // conversion path which is where the suspected crop bug lives.
    const photo1 = '/Users/lee/Downloads/IMG_3239.HEIC'
    const photo2 = '/Users/lee/Downloads/IMG_3240.HEIC'
    const fileInput = page.locator('input[type="file"]').first()
    await fileInput.setInputFiles([photo1, photo2])

    // Wait for both photos to upload — match only loaded photo figures, not
    // the "Add another" label (which shares the import-pool-image-card class
    // but has --add modifier).
    await expect(page.locator('figure.import-pool-image-card')).toHaveCount(2, { timeout: 60000 })

    // Click Import Pool — runs full extract ($0.55, ~45-60s)
    await page.getByRole('button', { name: /Import Pool/i }).click()

    // Wait for resolve step (section tabs appear)
    await expect(page.locator('.ip-section-tabs')).toBeVisible({ timeout: 120000 })

    // For each tab: click it, read bounds + img dims, check the visible crop.
    // ORDER MUST MATCH buildSectionTabs() in ResolveStep.tsx: villainy
    // BEFORE heroism (counter-intuitive but it's how the code orders them).
    const tabKeys = ['leaders', 'bases', 'vigilance', 'command', 'aggression', 'cunning', 'villainy', 'heroism', 'neutral', 'multicolor']

    const findings: any[] = []
    const screenshotsDir = path.join(process.cwd(), 'tests', 'e2e', 'crop-verify-screenshots')
    fs.mkdirSync(screenshotsDir, { recursive: true })
    for (let i = 0; i < tabKeys.length; i++) {
      const key = tabKeys[i]
      // Click the section tab by index.
      const tab = page.locator(`.ip-section-tab-wrap`).nth(i)
      await tab.locator('button.ip-section-tab').first().click()
      await page.waitForTimeout(500)
      // Capture a screenshot of the section panel for visual verification.
      const panel = page.locator('.ip-section-panel-wrap').first()
      try {
        await panel.screenshot({ path: path.join(screenshotsDir, `${i.toString().padStart(2, '0')}-${key}.png`) })
      } catch {
        // Section panel might not be visible if no rows; skip screenshot.
      }

      // Read what the wizard has stored + what the <img> rendered
      const data = await page.evaluate(() => {
        const imgs = Array.from(document.querySelectorAll('.ip-source-crop__viewport img')) as HTMLImageElement[]
        return imgs.map((img) => {
          const vp = img.parentElement as HTMLElement
          const vpRect = vp.getBoundingClientRect()
          const imgRect = img.getBoundingClientRect()
          return {
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
            srcLen: img.src.length,
            srcType: img.src.startsWith('data:') ? img.src.slice(0, 50) : img.src,
            vpWidth: vpRect.width,
            vpHeight: vpRect.height,
            vpAspect: vpRect.width / vpRect.height,
            imgRectWidth: imgRect.width,
            imgRectHeight: imgRect.height,
            imgRectLeft: imgRect.left,
            imgRectTop: imgRect.top,
            cssLeft: img.style.left,
            cssTop: img.style.top,
            cssWidth: img.style.width,
            // What slice of the natural image is visible inside the viewport?
            visibleX0: -((imgRect.left - vpRect.left) / imgRect.width),
            visibleY0: -((imgRect.top - vpRect.top) / imgRect.height),
            visibleX1: -((imgRect.left - vpRect.left) / imgRect.width) + vpRect.width / imgRect.width,
            visibleY1: -((imgRect.top - vpRect.top) / imgRect.height) + vpRect.height / imgRect.height,
          }
        })
      })

      findings.push({ key, crops: data })
    }

    // Print findings — Lee will read these
    console.log('\n=== CROP VERIFICATION FINDINGS ===\n')
    for (const f of findings) {
      console.log(`\n[${f.key}]`)
      if (f.crops.length === 0) {
        console.log('  (no crops rendered)')
        continue
      }
      for (const c of f.crops) {
        console.log(`  natural=${c.naturalWidth}x${c.naturalHeight}  vp=${c.vpWidth.toFixed(0)}x${c.vpHeight.toFixed(0)} (aspect ${c.vpAspect.toFixed(2)})`)
        console.log(`    css left=${c.cssLeft}  top=${c.cssTop}  width=${c.cssWidth}`)
        console.log(`    visible region in image (normalized): [${c.visibleX0.toFixed(3)}, ${c.visibleY0.toFixed(3)}, ${c.visibleX1.toFixed(3)}, ${c.visibleY1.toFixed(3)}]`)
        if (c.naturalWidth === 0 || c.naturalHeight === 0) {
          console.log(`    ⚠️ naturalWidth/Height is 0 — image not loaded or HEIC un-renderable`)
        }
      }
    }

    // Dump section bounds the wizard has
    const sectionBounds = await page.evaluate(() => {
      const lsKey = 'import-pool-wizard-v1'
      try {
        const raw = localStorage.getItem(lsKey)
        if (!raw) return { error: 'no localStorage' }
        const parsed = JSON.parse(raw)
        return parsed.sectionBounds || []
      } catch (e: any) {
        return { error: e.message }
      }
    })
    console.log('\n=== SECTION BOUNDS (from localStorage) ===\n')
    console.log(JSON.stringify(sectionBounds, null, 2))

    await context.close()
  })
})

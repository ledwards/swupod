import {test, expect, type Page} from '@playwright/test'
import {mkdirSync, writeFileSync} from 'node:fs'
import {alphaFixture} from './play-unify-fixture'

// One Play setup for alpha testers: /play opens the homepage bundle's Play dialog,
// and the alpha play pages share the table frame without overflowing a phone.
const out = process.env.PLAY_UNIFY_SHOTS ?? 'artifacts/unify'
// Compare against the device width, not innerWidth: a mobile browser widens its layout viewport to fit overflow.
async function overflow(page: Page, width: number) {
 return page.evaluate(width => {
  const offenders: string[] = []
  for (const el of Array.from(document.querySelectorAll('body *')) as HTMLElement[]) {
   const r = el.getBoundingClientRect(), s = getComputedStyle(el)
   if (!r.width || !r.height || s.visibility === 'hidden' || s.display === 'none') continue
   if (r.right > width + 1) {
    // Content clipped by a scrolling or hidden-overflow ancestor does not widen the page.
    let clipped = false
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p); if (/(hidden|auto|scroll|clip)/.test(o.overflowX) && p.getBoundingClientRect().right <= width + 1) { clipped = true; break } }
    if (!clipped) offenders.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 2).join('.')} → ${Math.round(r.right - width)}px`)
   }
  }
  return {scroll: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth, innerWidth) - width, offenders: offenders.slice(0, 8)}
 }, width)
}

// /play and its old aliases land on the homepage bundle's Play view with the format chosen; the format drawer's handle
// names it ("Eternal, change format"). Play opens on Sealed unless the address says otherwise.
const playSetup = (url: RegExp, format: string, locked = false) => async (page: Page) => {
 await expect(page).toHaveURL(url)
 const play = page.locator('section.ph-play-page')
 await expect(play).toBeVisible({timeout: 30000})
 const handle = play.locator('.ph-format-drawer .ph-drawer-handle')
 // A deck link fixes the format: the handle is a static tile naming it, not a button.
 if (locked) await expect(handle).toHaveClass(/is-static/), await expect(handle).toContainText(format)
 else await expect(handle).toHaveAttribute('aria-label', `${format}, change format`)
}

const pages: [string, string, (page: Page) => Promise<void>][] = [
 ['home', '/', async page => { await expect(page.locator('div[data-ready="true"]')).toBeVisible({timeout: 30000}) }],
 ['play', '/play', playSetup(/\/play$/, 'Sealed 6-pack')],
 ['play-eternal', '/play?format=eternal', playSetup(/format=eternal/, 'Eternal')],
 ['play-draft', '/play?format=draft&set=SOR', playSetup(/format=draft/, 'Draft')],
 ['play-sealed', '/play?format=sealed&set=SOR', playSetup(/format=sealed/, 'Sealed 6-pack')],
 // A pool link with no format goes to the native entry (saved pools keep their draft and results flows); with its
 // format, as lib/playSetup builds it, it opens the bundle's Play on that deck.
 ['play-pool', '/play?format=sealed&set=SOR&pool=sealed-fixture', async page => { await playSetup(/pool=sealed-fixture/, 'Sealed 6-pack', true)(page); await expect(page.locator('.ph-modal-deck').getByText('Sealed six').first()).toBeVisible({timeout: 30000}) }],
 ['lobbies', '/lobbies', playSetup(/\/play$/, 'Sealed 6-pack')],
 ['play-native', '/play/native', playSetup(/\/play$/, 'Sealed 6-pack')],
 ['draft', '/draft', async page => { await expect(page.locator('.sp-set').first()).toBeVisible({timeout: 30000}) }],
 ['sealed', '/sealed', async page => { await expect(page.locator('.sp-set').first()).toBeVisible({timeout: 30000}) }],
 ['lobby', '/lobby', async () => {}],
 ['history', '/history', async () => {}],
 ['me', '/me', async () => {}],
]

for (const [device, viewport] of [['desktop', {width: 1440, height: 900}], ['phone', {width: 390, height: 844}]] as const) {
 test.describe(device, () => {
  test.use({viewport, ...(device === 'phone' ? {isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1'} : {})})
  for (const [name, path, ready] of pages) test(`${name} ${device}`, async ({page, context, baseURL}) => {
   await alphaFixture(page, context, baseURL!)
   await page.goto(path)
   if (process.env.PLAY_UNIFY_CAPTURE_ONLY) await ready(page).catch(() => {}); else await ready(page)
   await page.waitForLoadState('networkidle', {timeout: 5000}).catch(() => {})
   await page.waitForTimeout(1500)
   mkdirSync(out, {recursive: true})
   await page.screenshot({path: `${out}/${name}-${device}.png`, fullPage: true})
   // The table art is fixed to the viewport; show it behind the bottom of long pages too.
   await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight))
   await page.waitForTimeout(300)
   await page.screenshot({path: `${out}/${name}-${device}-bottom.png`})
   const result = await overflow(page, viewport.width)
   writeFileSync(`${out}/${name}-${device}.json`, JSON.stringify({url: page.url(), ...result}, null, 1))
   if (!process.env.PLAY_UNIFY_CAPTURE_ONLY) expect(result.scroll, `${path} scrolls sideways: ${result.offenders.join(', ')}`).toBeLessThanOrEqual(0)
  })
 })
}

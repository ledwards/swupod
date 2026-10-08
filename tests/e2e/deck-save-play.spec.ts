import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

const catalog = JSON.parse(readFileSync('src/data/cards.json', 'utf8')).cards
const leader = catalog.find((c: any) => c.set === 'SOR' && c.isLeader)
const base = catalog.find((c: any) => c.set === 'SOR' && c.isBase)
const cards = [leader, base, ...catalog.filter((c: any) => c.set === 'SOR' && !c.isLeader && !c.isBase).slice(0, 30)]
const cardPositions = Object.fromEntries(cards.map((card: any, index: number) => [card.id, {
  card, x: 0, y: 0, visible: true, enabled: true,
  section: index === 0 ? 'leaders' : index === 1 ? 'bases' : 'deck',
}]))
const state = { cardPositions, activeLeader: leader.id, activeBase: base.id, poolName: 'Save test' }

for (const failFirst of [false, true]) {
  test(`Play waits for a single save${failFirst ? ' and recovers after a network error' : ''}`, async ({ page }) => {
    let release!: () => void
    const held = new Promise<void>(resolve => { release = resolve })
    let saves = 0
    let active = 0
    let peak = 0
    const pool = { shareId: 'save-fixture', setCode: 'SOR', poolType: 'sealed', cards,
      owner: { id: 'save-user', username: 'Save tester' }, deckBuilderState: state }
    // Every API is mocked: this regression test never writes a real pool or game.
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname
      if (path === '/api/auth/session') return route.fulfill({ json: { success: true, data: { user: { id: 'save-user', username: 'Save tester' } } } })
      if (path === '/api/pools/save-fixture' && route.request().method() === 'GET') return route.fulfill({ json: { success: true, data: pool } })
      if (path === '/api/pools/save-fixture' && route.request().method() === 'PUT' && route.request().postDataJSON().deckBuilderState) {
        const attempt = ++saves
        peak = Math.max(peak, ++active)
        if (attempt === 1) await held
        active--
        if (failFirst && attempt === 1) return route.abort('failed')
        return route.fulfill({ json: { success: true, data: { shareId: pool.shareId } } })
      }
      return route.fulfill({ json: { success: true, data: { builds: [], pools: [] } } })
    })
    await page.route('**/pool/save-fixture/deck/play', route => route.fulfill({ contentType: 'text/html', body: '<h1>Play destination</h1>' }))
    await page.goto('/pool/save-fixture/deck')
    const play = page.locator('.header-buttons .ready-to-play-button')
    await expect(play).toBeEnabled()
    await play.click()
    await expect(play).toBeDisabled()
    await expect(play).toContainText('Saving deck…')
    await expect.poll(() => saves).toBe(1)
    // Cover the debounce window while the network request is still unresolved.
    await page.waitForTimeout(2500)
    expect(saves).toBe(1)
    expect(page.url()).not.toContain('/deck/play')
    await page.mouse.wheel(0, 1400)
    const stickyPlay = page.locator('.header-buttons-in-nav .ready-to-play-icon')
    await expect(stickyPlay).toBeDisabled()
    await expect(stickyPlay).toContainText('Saving deck…')
    await page.mouse.wheel(0, -2000)
    release()
    if (failFirst) {
      await expect(play).toBeEnabled()
      await expect(page.getByText('Could not save your deck. Check your connection and try Play again.', { exact: true })).toBeVisible()
      await play.click()
    }
    await expect(page.getByRole('heading', { name: 'Play destination' })).toBeVisible()
    expect(peak).toBe(1)
    expect(saves).toBe(failFirst ? 2 : 1)
  })
}

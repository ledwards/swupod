import {test, expect, type Page} from '@playwright/test'
import {readFileSync} from 'node:fs'
const cardData = JSON.parse(readFileSync(new URL('../../src/data/cards.json', import.meta.url), 'utf8')) as {
  cards: Array<{id: string; set: string; type: string; variantType: string; [key: string]: unknown}>
}

// Exercise the actual draft page and controls; network doubles isolate the
// presentation contract from the engine, database and multiplayer sockets.
async function draftFixture(page: Page, {beta = true, admin = false, enabled = true, phase = 'pack_draft', theme = 'purrgil'} = {}) {
  if (theme) await page.addInitScript(value => {
    if (!localStorage.getItem('purrgil-table-v1')) localStorage.setItem('purrgil-table-v1', JSON.stringify({theme: value}))
  }, theme)
  const cards = cardData.cards.filter(card => card.set === 'SOR' && card.type === 'Unit' && card.variantType === 'Normal').slice(0, 14)
  const leaders = cardData.cards.filter(card => card.set === 'SOR' && card.type === 'Leader' && card.variantType === 'Normal').slice(0, 3)
  const me = {id: 'draft-player', userId: 'table-user', username: 'You', seatNumber: 1, pickStatus: phase === 'leader_preview' ? 'waiting' : 'picking', selectionConfirmed: false, currentPack: cards, draftedCards: cards.slice(0, 4), draftedLeaders: phase === 'leader_draft' || phase === 'leader_preview' ? [] : leaders, leaderPack: phase === 'leader_preview' ? leaders : [], leaders}
  const players = [me, ...Array.from({length: 7}, (_, i) => ({id: `bot-${i}`, username: `Drafter ${i + 2}`, seatNumber: i + 2, isBot: true, pickStatus: phase === 'leader_preview' ? 'waiting' : 'picking', draftedLeaders: phase === 'leader_preview' ? [] : leaders, leaderPack: phase === 'leader_preview' ? leaders : []}))]
  const draft = {id: 'draft-fixture', shareId: 'table-fixture', name: 'Purrgil draft table', setCode: 'SOR', setName: 'Spark of Rebellion', status: 'active', isHost: true, isPlayer: true, maxPlayers: 8, packSize: 14, players, myPlayer: me, draftState: {phase, packNumber: 1, pickInPack: 1, round: 1}, settings: {isSolo: true}, stateVersion: 1}
  let selected = 0
  let confirmed = 0
  let rollout = enabled
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    let data: unknown = {}
    if (path === '/api/auth/session') data = {user: {id: 'table-user', username: 'You', email: 'table@example.invalid', is_admin: admin, is_beta_tester: beta}}
    else if (path === '/api/play/native/presentation') return route.fulfill({json: {enabled: rollout}})
    else if (path === '/api/draft/table-fixture') data = draft
    else if (path === '/api/draft/table-fixture/state') data = {...draft, changed: true}
    else if (path.endsWith('/select')) { selected++; me.pickStatus = 'selected'; data = {success: true} }
    else if (path.endsWith('/confirm')) { confirmed++; me.selectionConfirmed = true; data = {success: true} }
    else if (path.endsWith('/patron-status')) data = {isPatron: false}
    else if (path.endsWith('/chat/history')) data = {messages: []}
    await route.fulfill({json: {success: true, data}})
  })
  await page.routeWebSocket('**/socket.io/**', () => {})
  await page.goto('/draft/table-fixture')
  await expect(page.locator('.pack-grid, .available-leaders').first()).toBeVisible()
  return {selections: () => selected, confirmations: () => confirmed, disable: () => { rollout = false }, setPhase: (phase: string) => { draft.draftState.phase = phase; players.forEach(player => { player.pickStatus = 'picking'; player.draftedLeaders = phase === 'pack_draft' ? leaders : [] }) }, shrinkPack: () => { me.currentPack = cards.slice(0, 2) }}
}

test('solo table selection is beside cancellation and updates the live table', async ({page}) => {
  await page.setViewportSize({width: 1600, height: 1100})
  const fixture = await draftFixture(page)
  const table = page.locator('.draft-table')
  await expect(table).toHaveAttribute('data-table-theme', 'purrgil')
  await expect(page.getByLabel('Your draft table', {exact: true})).toHaveCount(1)
  await expect(page.getByLabel('Your draft table', {exact: true}).locator('option')).toHaveCount(32)
  await page.getByLabel('Your draft table', {exact: true}).selectOption('hoth')
  await expect(table).toHaveAttribute('data-table-theme', 'hoth')
  await page.setViewportSize({width: 390, height: 844})
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({path: 'artifacts/draft-table-setup-phone.png', fullPage: true})
  await page.setViewportSize({width: 1600, height: 1100})
  await page.goto('/draft/table-fixture')
  await expect(table).toHaveAttribute('data-table-theme', 'hoth')
  await expect(page.getByLabel('Your draft table', {exact: true})).toHaveCount(1)
  await page.locator('.pack-grid .draftable-card').first().click()
  await expect(page.getByRole('button', {name: 'Confirm Pick', exact: true})).toBeEnabled()
  expect(fixture.confirmations()).toBe(0)
  await page.getByRole('button', {name: 'Confirm Pick', exact: true}).click()
  await expect.poll(fixture.confirmations).toBe(1)
  await page.evaluate(async () => { const image = new Image(); image.src = '/table-environments/hoth.webp'; await image.decode() })
  await page.screenshot({path: 'artifacts/draft-table-desktop.png', fullPage: true})
  await page.reload()
  await expect(table).toHaveAttribute('data-table-theme', 'hoth')
})

for (const scenario of [
  {name: 'non-beta', beta: false, enabled: true},
  {name: 'disabled rollout', beta: true, enabled: false},
]) test(`${scenario.name} retains the existing draft without loading table artwork`, async ({page}) => {
  const artwork: string[] = []
  page.on('request', request => {if (request.url().includes('/table-environments/')) artwork.push(request.url())})
  await draftFixture(page, scenario)
  await expect(page.locator('.draft-table')).toHaveCount(0)
  await expect(page.getByLabel('Your draft table', {exact: true})).toHaveCount(0)
  await page.locator('.pack-grid .draftable-card').first().click()
  await expect(page.getByRole('button', {name: 'Confirm Pick', exact: true})).toBeEnabled()
  expect(artwork).toEqual([])
})

test('rollout revocation preserves the staged selection and confirmation action', async ({page}) => {
  const fixture = await draftFixture(page)
  await expect(page.locator('.draft-table')).toBeVisible()
  await page.locator('.pack-grid .draftable-card').first().click()
  await expect(page.getByRole('button', {name: 'Confirm Pick', exact: true})).toBeEnabled()
  const count = fixture.selections()
  fixture.disable()
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await expect(page.locator('.draft-table')).toHaveCount(0)
  await expect(page.locator('.pack-grid .draftable-card.selected')).toHaveCount(1)
  expect(fixture.selections()).toBe(count)
  await page.getByRole('button', {name: 'Confirm Pick', exact: true}).click()
  await expect.poll(fixture.confirmations).toBe(1)
})

test('admin leader drafting fits a phone and remains usable with missing table art', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844})
  await page.route('**/table-environments/**', route => route.abort())
  await draftFixture(page, {beta: false, admin: true, phase: 'leader_draft'})
  await expect(page.locator('.draft-table')).toBeVisible()
  await expect(page.getByLabel('Your draft table', {exact: true})).toHaveCount(1)
  const width = await page.evaluate(() => ({scroll: document.documentElement.scrollWidth, viewport: innerWidth}))
  expect(width.scroll).toBeLessThanOrEqual(width.viewport)
  await expect(page.locator('.available-leaders .draftable-card').first()).toBeVisible()
  await page.locator('.available-leaders .draftable-card').first().click()
  await expect(page.getByRole('button', {name: 'Confirm Pick', exact: true})).toBeEnabled()
  await page.screenshot({path: 'artifacts/draft-table-phone-fallback.png', fullPage: true})
})

test('phone pack drafting keeps pick confirmation reachable with the header theme control', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844})
  await draftFixture(page)
  await expect(page.getByLabel('Your draft table', {exact: true})).toHaveCount(1)
  await page.locator('.pack-grid .draftable-card').first().click()
  await expect(page.getByRole('button', {name: 'Confirm Pick', exact: true})).toBeInViewport()
  const width = await page.evaluate(() => ({scroll: document.documentElement.scrollWidth, viewport: innerWidth}))
  expect(width.scroll).toBeLessThanOrEqual(width.viewport)
  await page.screenshot({path: 'artifacts/draft-table-phone.png', fullPage: true})
})


test('Default is the initial choice and restores the original table after a themed choice', async ({page}) => {
  await draftFixture(page, {theme: ''})
  await expect(page.locator('.draft-content')).toHaveAttribute('data-table-theme', 'default')
  await expect(page.locator('.draft-table-scene')).toHaveCount(0)
  const choice = page.getByLabel('Your draft table', {exact: true})
  await expect(choice).toHaveValue('default')
  await choice.selectOption('hoth')
  await choice.selectOption('default')
  await page.goto('/draft/table-fixture')
  await expect(page.locator('.draft-content')).toHaveAttribute('data-table-theme', 'default')
  await expect(page.locator('.draft-table')).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.draft-content')).toHaveAttribute('data-table-theme', 'default')
  await page.locator('.pack-grid .draftable-card').first().click()
  await expect(page.getByRole('button', {name: 'Confirm Pick', exact: true})).toBeEnabled()
})

for (const [width, height] of [[1024, 768], [1280, 720], [1600, 900]]) {
  test(`leader preview fits ${width}x${height} and clicks do not open the alternate modal`, async ({page}) => {
    await page.setViewportSize({width: width!, height: height!})
    await draftFixture(page, {phase: 'leader_preview'})
    await expect(page.getByRole('button', {name: 'Start Draft', exact: true})).toBeInViewport()
    await expect(page.getByRole('button', {name: 'Cancel Draft', exact: true})).toBeInViewport()
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(height! + 1)
    const card = page.locator('.available-leaders .draftable-card').first()
    await card.click({force: true})
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await card.hover()
    await expect(page.locator('.card-preview-enlarged')).toBeVisible()
    await page.mouse.move(0, 0)
    await page.screenshot({path: `artifacts/draft-preview-${width}.png`, fullPage: true})
  })
}

for (const [width, height] of [[1024, 768], [1280, 720], [1600, 1000], [1840, 1700]]) {
  test(`table stays fixed across phases and pack sizes at ${width}x${height}`, async ({page}) => {
    await page.setViewportSize({width: width!, height: height!})
    const fixture = await draftFixture(page, {phase: 'leader_preview'})
    const table = page.locator('.draft-content')
    const initial = await table.boundingBox()
    for (const phase of ['leader_draft', 'pack_draft']) {
      fixture.setPhase(phase)
      await page.reload()
      await expect(page.locator('.draft-layout')).toBeVisible()
      expect(await table.boundingBox()).toEqual(initial)
    }
    const checkFit = async () => {
      const left = await page.locator('.players-section').boundingBox()
      const right = await page.locator('.current-pack').boundingBox()
      expect(Math.abs(left!.x + left!.width / 2 - initial!.x - initial!.width / 2)).toBeLessThan(2)
      expect(right!.y).toBeGreaterThanOrEqual(left!.y + left!.height)
      const rows = await page.locator('.pack-grid .draftable-card').evaluateAll(cards => cards.map(card => Math.round(card.getBoundingClientRect().y)))
      expect(new Set(rows).size).toBe(1)
      expect(right!.y).toBeGreaterThanOrEqual(initial!.y)
      expect(right!.y + right!.height).toBeLessThanOrEqual(initial!.y + initial!.height)
      expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(height! + 1)
    }
    await checkFit()
    const topArea = await page.locator('.draft-player-area-top').boundingBox()
    const bottomArea = await page.locator('.draft-player-area-bottom').boundingBox()
    expect(topArea!.width).toBeLessThan(initial!.width)
    expect(bottomArea!.width).toBeLessThan(initial!.width)
    const circle = await page.locator('.circle-container').boundingBox()
    await page.locator('.pack-grid .draftable-card').first().click()
    await expect(page.getByRole('button', {name: 'Confirm Pick', exact: true})).toBeInViewport()
    expect(await table.boundingBox()).toEqual(initial)
    await checkFit()
    expect((await page.locator('.draft-player-area-top').boundingBox())!.y).toEqual(topArea!.y)
    expect((await page.locator('.draft-player-area-bottom').boundingBox())!.y).toEqual(bottomArea!.y)
    expect(await page.locator('.circle-container').boundingBox()).toEqual(circle)
    await page.mouse.move(0, 0)
    await page.locator('.pack-grid img').evaluateAll(images => Promise.all(images.map(image => (image as HTMLImageElement).decode().catch(() => {}))))
    await page.screenshot({path: `artifacts/fixed-table-${width}.png`, fullPage: true})
    fixture.shrinkPack()
    await page.reload()
    await expect(page.locator('.pack-grid .draftable-card')).toHaveCount(2)
    expect(await table.boundingBox()).toEqual(initial)
    await checkFit()
  })
}

for (const width of [1280, 1840]) {
  test(`expanded pack uses larger cards and multiple rows at ${width}`, async ({page}) => {
    await page.setViewportSize({width, height: 900})
    await draftFixture(page)
    const card = page.locator('.pack-grid .draftable-card').first()
    const normal = await card.boundingBox()
    const table = await page.locator('.draft-content').boundingBox()
    await page.getByTitle('Fullscreen', {exact: true}).click()
    await expect(page.locator('.players-section')).toBeHidden()
    const expanded = await card.boundingBox()
    expect(expanded!.width).toBeGreaterThan(normal!.width * 1.5)
    const positions = await page.locator('.pack-grid .draftable-card').evaluateAll(cards => cards.map(card => card.getBoundingClientRect().toJSON()))
    expect(new Set(positions.map(rect => Math.round(rect.y))).size).toBeGreaterThan(1)
    const pack = await page.locator('.current-pack').boundingBox()
    for (const rect of positions) {
      expect(rect.right).toBeLessThanOrEqual(pack!.x + pack!.width)
      expect(rect.bottom).toBeLessThanOrEqual(pack!.y + pack!.height)
    }
    expect(await page.locator('.draft-content').boundingBox()).toEqual(table)
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(901)
    await page.getByTitle('Exit fullscreen', {exact: true}).click()
    expect(await card.boundingBox()).toEqual(normal)
  })
}

test('leader selection preserves the orbit and separate leader panels', async ({page}) => {
  await page.setViewportSize({width: 1024, height: 768})
  await draftFixture(page, {phase: 'leader_draft'})
  const seats = page.locator('.seat-wrapper')
  const before = await seats.evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return {x: r.x, y: r.y} }))
  await page.locator('.available-leaders .draftable-card').first().click()
  await expect(page.getByRole('button', {name: 'Confirm Pick', exact: true})).toBeVisible()
  const after = await seats.evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return {x: r.x, y: r.y} }))
  expect(after).toEqual(before)
  const boxes = await page.locator('.drafted-leaders, .available-leaders').evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return {x: r.x, y: r.y, right: r.right, bottom: r.bottom} }))
  expect(Math.abs((boxes[0].y + boxes[0].bottom) / 2 - (boxes[1].y + boxes[1].bottom) / 2)).toBeLessThan(1)
  expect(boxes[0].right).toBeLessThan(boxes[1].x)
  expect(Math.max(...boxes.map(box => box.bottom))).toBeLessThan(768)
  await expect(page.locator('.seat-pass-direction')).toHaveCount(0)
  await expect(page.locator('.center-pass-label')).toBeVisible()
})

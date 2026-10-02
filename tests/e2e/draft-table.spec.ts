import {test, expect, type Page} from '@playwright/test'
import {readFileSync} from 'node:fs'
const cardData = JSON.parse(readFileSync(new URL('../../src/data/cards.json', import.meta.url), 'utf8')) as {
  cards: Array<{id: string; set: string; type: string; variantType: string; [key: string]: unknown}>
}

// Exercise the actual draft page and controls; network doubles isolate the
// presentation contract from the engine, database and multiplayer sockets.
async function draftFixture(page: Page, {beta = true, admin = false, enabled = true, phase = 'pack_draft', theme = 'purrgil', leaderCount = 3, host = true} = {}) {
  if (theme) await page.addInitScript(value => {
    if (!localStorage.getItem('purrgil-table-v1')) localStorage.setItem('purrgil-table-v1', JSON.stringify({theme: value}))
  }, theme)
  const cards = cardData.cards.filter(card => card.set === 'SOR' && card.type === 'Unit' && card.variantType === 'Normal').slice(0, 14)
  const leaders = cardData.cards.filter(card => card.set === 'SOR' && card.type === 'Leader' && card.variantType === 'Normal').slice(0, leaderCount)
  const me = {id: 'draft-player', userId: 'table-user', username: 'You', seatNumber: 1, pickStatus: phase === 'leader_preview' ? 'waiting' : 'picking', selectionConfirmed: false, currentPack: cards, draftedCards: cards.slice(0, 4), draftedLeaders: phase === 'leader_draft' || phase === 'leader_preview' ? [] : leaders, leaderPack: phase === 'leader_preview' ? leaders : [], leaders}
  const players = [me, ...Array.from({length: 7}, (_, i) => ({id: `bot-${i}`, username: `Drafter ${i + 2}`, seatNumber: i + 2, isBot: true, pickStatus: phase === 'leader_preview' ? 'waiting' : 'picking', draftedLeaders: phase === 'leader_preview' ? [] : leaders, leaderPack: phase === 'leader_preview' ? leaders : []}))]
  const draft = {id: 'draft-fixture', shareId: 'table-fixture', name: 'Spark of Rebellion Draft', setCode: 'SOR', setName: 'Spark of Rebellion', status: 'active', isHost: host, isPlayer: true, maxPlayers: 8, packSize: 14, players, myPlayer: me, draftState: {phase, packNumber: 1, pickInPack: 1, round: 1}, settings: {isSolo: true}, stateVersion: 1}
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
  return {selections: () => selected, confirmations: () => confirmed, disable: () => { rollout = false }, setPhase: (phase: string) => { draft.draftState.phase = phase; players.forEach(player => { player.pickStatus = 'picking'; player.draftedLeaders = phase === 'pack_draft' ? leaders : [] }) }, shrinkPack: (count = 2) => { me.currentPack = cards.slice(0, count) }}
}

test('solo table selection is beside cancellation and updates the live table', async ({page}) => {
  await page.setViewportSize({width: 1600, height: 1100})
  const fixture = await draftFixture(page)
  const table = page.locator('.draft-table')
  await expect(table).toHaveAttribute('data-table-theme', 'purrgil')
  await expect(page.getByRole('button', {name: 'Themes', exact: true})).toHaveCount(1)
  await page.getByRole('button', {name: 'Themes', exact: true}).click()
  const previewBeforeScroll = await page.locator('.draft-theme-detail').boundingBox()
  await page.locator('.draft-theme-list').evaluate(element => { element.scrollTop = element.scrollHeight })
  expect(await page.locator('.draft-theme-detail').boundingBox()).toEqual(previewBeforeScroll)
  await expect(page.locator('.draft-theme-detail .btn')).toBeInViewport()
  await page.locator('.draft-theme-list').getByRole('button', {name: 'Hoth Ice Table', exact: true}).click()
  await page.getByRole('button', {name: 'Use this table', exact: true}).click()
  await page.keyboard.press('Escape')
  await expect(table).toHaveAttribute('data-table-theme', 'hoth')
  await expect(page.locator('body')).toHaveAttribute('data-draft-theme', 'hoth')
  await page.setViewportSize({width: 390, height: 844})
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({path: 'artifacts/draft-table-setup-phone.png', fullPage: true})
  await page.setViewportSize({width: 1600, height: 1100})
  await page.goto('/draft/table-fixture')
  await expect(table).toHaveAttribute('data-table-theme', 'hoth')
  await expect(page.getByRole('button', {name: 'Themes', exact: true})).toHaveCount(1)
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
  await expect(page.locator('body')).not.toHaveAttribute('data-draft-theme')
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
  await expect(page.getByRole('button', {name: 'Themes', exact: true})).toHaveCount(1)
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
  await expect(page.getByRole('button', {name: 'Themes', exact: true})).toHaveCount(1)
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
      expect(new Set(rows).size).toBe(rows.length > 8 ? 2 : 1)
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
    expect(Math.abs((await page.locator('.draft-player-area-top').boundingBox())!.y - topArea!.y)).toBeLessThan(1)
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

for (const leaderCount of [1, 2, 3]) test(`leader picks retain landscape dimensions with ${leaderCount} cards`, async ({page}) => {
 await page.setViewportSize({width: 1024, height: 768})
 await draftFixture(page, {phase: 'leader_draft', leaderCount})
 const cards = page.locator('.available-leaders .draftable-card')
 await expect(cards).toHaveCount(leaderCount)
 const sizes = await cards.evaluateAll(nodes => nodes.map(node => {const r = node.getBoundingClientRect(); return {width: r.width, height: r.height}}))
 for (const size of sizes) {
  expect(size.width).toBeCloseTo(140, 0)
  expect(size.width / size.height).toBeCloseTo(1.4, 1)
 }
})


// Opt-in design capture: actual draft components, isolated API fixtures.
test('capture protected draft table study', async ({page}) => {
  test.skip(process.env.CAPTURE_DRAFT_STUDY !== '1', 'Design artifact capture only')
  test.setTimeout(240000)
  const {mkdirSync, writeFileSync} = await import('node:fs')
  const folder = 'public/mockups/draft-captures'
  mkdirSync(folder, {recursive: true})
  const results = []
  await page.setViewportSize({width: 1440, height: 900})
  await draftFixture(page, {theme: 'imperial'})
  const sizes = [[2560,1440], [1920,1080], [1440,900], [1024,768], [834,1194], [390,844]]
  for (const theme of ['imperial', 'hoth', 'canto-bight']) {
    await page.evaluate(theme => {
      localStorage.setItem('purrgil-table-v1', JSON.stringify({theme}))
    }, theme)
    for (const [width, height] of sizes) {
      await page.setViewportSize({width, height})
      await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('draft-selection-')).forEach(key => localStorage.removeItem(key)))
      await page.reload()
      await expect(page.locator('.pack-grid')).toBeVisible()
      await page.locator('.draft-content.draft-table').evaluate(element => {
        const art = getComputedStyle(element).getPropertyValue('--table-art')
        document.documentElement.style.setProperty('--study-table-art', art)
      })
      await page.addStyleTag({path: 'public/mockups/draft-protected-table.css'})
      await page.locator('.pack-grid .draftable-card').first().click({force: true})
      await expect(page.getByRole('button', {name:'Confirm Pick', exact:true})).toBeVisible()
      await page.mouse.move(0, 0)
      await page.locator('.pack-grid img, .leader-thumbnails img').evaluateAll(images => Promise.all(images.map(image => (image as HTMLImageElement).decode().catch(() => {}))))
      const overflow = await page.evaluate(() => ({vertical: Math.max(0, document.documentElement.scrollHeight - innerHeight), horizontal: Math.max(0, document.documentElement.scrollWidth - innerWidth)}))
      expect(overflow).toEqual({vertical: 0, horizontal: 0})
      const file = `${theme}-${width}x${height}.png`
      await page.screenshot({path: `${folder}/${file}`})
      results.push({theme, width, height, file, overflow})
    }
  }
  writeFileSync(`${folder}/manifest.json`, JSON.stringify(results, null, 2))
})

// Paired captures use identical fixture data, viewport and interactions.
test('capture draft polish comparison', async ({page}) => {
  test.skip(!process.env.CAPTURE_DRAFT_POLISH, 'Design comparison only')
  test.setTimeout(120000)
  const {mkdirSync} = await import('node:fs')
  const folder = `public/mockups/draft-polish/${process.env.CAPTURE_DRAFT_POLISH}`
  mkdirSync(folder, {recursive:true})
  await page.setViewportSize({width:1280,height:800})
  await draftFixture(page,{theme:'imperial'})
  const shot = async (name:string) => {
    await page.locator('img:visible').evaluateAll(images => Promise.all(images.map(i=>(i as HTMLImageElement).decode().catch(()=>{}))))
    await page.screenshot({path:`${folder}/${name}.png`})
  }
  await page.locator('.review-button').click()
  await page.getByRole('button',{name:'Aspect',exact:true}).click()
  await page.mouse.move(0,0)
  await shot('review')
  await page.locator('.review-leader').first().hover()
  await expect(page.locator('.card-preview-enlarged')).toBeVisible()
  await shot('leader-hover')
  await page.mouse.move(0,0)
  await page.locator('.draft-review-close').click()
  await page.getByRole('button',{name:'Themes',exact:true}).click()
  await page.locator('.draft-theme-list').evaluate(e=>{e.scrollTop=e.scrollHeight})
  await shot('themes')
  await page.setViewportSize({width:390,height:844})
  await shot('themes-phone')
  await page.keyboard.press('Escape')
  await page.setViewportSize({width:1280,height:800})
  await page.route('**/api/pools/polish-fixture**',()=>{})
  await page.route('**/api/play/native/solo/**',()=>{})
  await page.goto('/play/solo?pool=polish-fixture')
  await page.locator('.solo-skeleton').first().waitFor()
  await shot('solo-loading')
  await page.goto('/pool/polish-fixture/deck', {waitUntil:'domcontentloaded'})
  await page.locator('.skeleton-card').first().waitFor()
  await shot('deck-loading')
})

test('review previews stay centered and complete in a short viewport', async ({page}) => {
  await page.setViewportSize({width:1000,height:560})
  await draftFixture(page,{theme:'imperial'})
  await page.locator('.review-button').click()
  await page.locator('.review-leader').first().hover()
  const preview=page.locator('.review-hover-cards')
  await expect(preview).toBeVisible()
  const box=await preview.boundingBox()
  expect(box).not.toBeNull()
  expect(Math.abs(box!.x+box!.width/2-500)).toBeLessThan(2)
  expect(Math.abs(box!.y+box!.height/2-280)).toBeLessThan(2)
  for(const image of await preview.locator('img').all()) {
    const rect=await image.boundingBox()
    expect(rect!.x).toBeGreaterThanOrEqual(15)
    expect(rect!.y).toBeGreaterThanOrEqual(15)
    expect(rect!.x+rect!.width).toBeLessThanOrEqual(985)
    expect(rect!.y+rect!.height).toBeLessThanOrEqual(545)
  }
  await page.mouse.move(0,0)
  await page.locator('.draft-review-close').click()
  await page.getByRole('button',{name:'Themes',exact:true}).click()
  const action=page.locator('.draft-theme-sample .btn')
  await page.locator('.draft-theme-modal').evaluate(e=>Promise.all(e.getAnimations({subtree:true}).filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished)))
  const before=await action.boundingBox()
  await page.locator('.draft-theme-list').evaluate(e=>{e.scrollTop=e.scrollHeight})
  expect(await action.boundingBox()).toEqual(before)
  await expect(action).toBeInViewport({ratio:1})
})

test('draft artwork covers the viewport and card corners scale with the card', async ({page}) => {
  test.setTimeout(90000)
  const {mkdirSync}=await import('node:fs')
  mkdirSync('artifacts/draft-scene',{recursive:true})
  await page.setViewportSize({width:1440,height:900})
  await draftFixture(page,{theme:'canto-bight'})
  for(const theme of ['canto-bight','imperial','hoth']) {
    await page.evaluate(theme=>localStorage.setItem('purrgil-table-v1',JSON.stringify({theme})),theme)
    for(const [width,height] of [[1440,900],[1920,1080],[1024,768]]) {
      await page.setViewportSize({width,height})
      await page.reload()
      const scene=page.locator('.draft-viewport-scene')
      await expect(scene).toBeVisible()
      await scene.locator('img').evaluateAll(images=>Promise.all(images.map(i=>(i as HTMLImageElement).decode())))
      expect(await scene.boundingBox()).toEqual({x:0,y:0,width,height})
      const art=await scene.locator('img').first().boundingBox()
      expect(art!.x).toBeLessThanOrEqual(.1)
      expect(art!.y).toBeLessThanOrEqual(.1)
      expect(art!.x+art!.width).toBeGreaterThanOrEqual(width-.1)
      expect(art!.y+art!.height).toBeGreaterThanOrEqual(height-.1)
      const card=page.locator('.pack-grid .draftable-card').first()
      await expect(card).toBeVisible()
      expect(await card.evaluate(e=>getComputedStyle(e).borderTopLeftRadius)).toBe('3.5% 2.5%')
      expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight)).toBe(true)
      await page.mouse.move(0,0)
      await page.screenshot({path:`artifacts/draft-scene/${theme}-${width}.png`})
    }
  }
})

test('enlarged draft cards preserve proportional corners', async ({page}) => {
  await page.setViewportSize({width:1440,height:900})
  await draftFixture(page,{theme:'canto-bight'})
  await page.locator('.pack-grid .draftable-card').first().hover()
  const preview=page.locator('.card-preview-enlarged')
  await expect(preview).toBeVisible()
  await preview.locator('img').evaluateAll(images=>Promise.all(images.map(i=>(i as HTMLImageElement).decode())))
  expect(await preview.locator('img').first().evaluate(e=>getComputedStyle(e.parentElement!).borderTopLeftRadius)).toBe('3.5% 2.5%')
  await page.screenshot({path:'artifacts/draft-scene/canto-bight-hover.png'})
})


test('pack wraps only when its available width requires it', async ({page}) => {
  await page.setViewportSize({width:1920,height:1080})
  const fixture=await draftFixture(page,{theme:'canto-bight'})
  fixture.shrinkPack(9)
  await page.reload()
  const cards=page.locator('.pack-grid .draftable-card')
  await expect(cards).toHaveCount(9)
  await expect.poll(async()=> (await cards.last().boundingBox())!.y-(await cards.first().boundingBox())!.y).toBe(0)
  const first=await cards.first().boundingBox()
  await cards.first().click()
  expect((await cards.first().boundingBox())!.y).toBe(first!.y)
  await page.mouse.move(0,0)
  await page.locator('img:visible').evaluateAll(images=>Promise.all(images.map(i=>(i as HTMLImageElement).decode().catch(()=>{}))))
  await page.screenshot({path:'artifacts/draft-pack-nine-wide.png'})
  fixture.shrinkPack(14)
  await page.setViewportSize({width:1024,height:768})
  await page.reload()
  await expect(cards).toHaveCount(14)
  await expect.poll(async()=> (await cards.last().boundingBox())!.y>(await cards.first().boundingBox())!.y).toBe(true)
  expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight)).toBe(true)
  await page.screenshot({path:'artifacts/draft-pack-fourteen-narrow.png'})
})


for (const host of [true,false]) test(`draft title stays centered for ${host?'host':'participant'}`, async ({page})=>{
 await page.setViewportSize({width:1920,height:1080})
 await draftFixture(page,{theme:'canto-bight',host})
 const title=await page.locator('.draft-header-center').boundingBox()
 expect(Math.abs(title!.x+title!.width/2-960)).toBeLessThan(1)
 await expect(page.locator('.draft-header-actions .draft-round-info')).toHaveText('Drafting Phase')
 await expect(page.getByRole('button',{name:'Cancel Draft',exact:true})).toHaveCount(host?1:0)
 await expect(page.getByRole('button',{name:'Themes',exact:true})).toHaveCount(host?1:0)
 await page.locator('.draft-viewport-scene img').evaluateAll(images=>Promise.all(images.map(i=>(i as HTMLImageElement).decode())))
 await page.screenshot({path:`artifacts/draft-header-${host?'host':'participant'}.png`})
})

test('already-authenticated return opens the draft without a browser exception', async ({page})=>{
 const errors:string[]=[]
 page.on('pageerror',error=>errors.push(error.message))
 await draftFixture(page,{theme:'canto-bight'})
 await page.goto('/draft/table-fixture?auth=already_logged_in')
 await expect(page.locator('.pack-grid .draftable-card').first()).toBeVisible()
 await expect(page).toHaveURL(/\/draft\/table-fixture$/)
 await expect(page.locator('.draft-header-center')).toBeVisible()
 expect(errors).toEqual([])
})

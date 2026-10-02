import {test, expect, type Page} from '@playwright/test'
import {readFileSync} from 'node:fs'
const cardData = JSON.parse(readFileSync(new URL('../../src/data/cards.json', import.meta.url), 'utf8')) as {
  cards: Array<{id: string; set: string; type: string; variantType: string; [key: string]: unknown}>
}

// Exercise the actual draft page and controls; network doubles isolate the
// presentation contract from the engine, database and multiplayer sockets.
async function draftFixture(page: Page, {beta = true, admin = false, enabled = true, phase = 'pack_draft', theme = 'purrgil', leaderCount = 3} = {}) {
  if (theme) await page.addInitScript(value => {
    if (!localStorage.getItem('purrgil-table-v1')) localStorage.setItem('purrgil-table-v1', JSON.stringify({theme: value}))
  }, theme)
  const cards = cardData.cards.filter(card => card.set === 'SOR' && card.type === 'Unit' && card.variantType === 'Normal').slice(0, 14)
  const leaders = cardData.cards.filter(card => card.set === 'SOR' && card.type === 'Leader' && card.variantType === 'Normal').slice(0, leaderCount)
  const me = {id: 'draft-player', userId: 'table-user', username: 'You', seatNumber: 1, pickStatus: phase === 'leader_preview' ? 'waiting' : 'picking', selectionConfirmed: false, currentPack: cards, draftedCards: cards.slice(0, 4), draftedLeaders: phase === 'leader_draft' || phase === 'leader_preview' ? [] : leaders, leaderPack: phase === 'leader_preview' ? leaders : [], leaders}
  const players = [me, ...Array.from({length: 7}, (_, i) => ({id: `bot-${i}`, username: `Drafter ${i + 2}`, seatNumber: i + 2, isBot: true, pickStatus: phase === 'leader_preview' ? 'waiting' : 'picking', draftedLeaders: phase === 'leader_preview' ? [] : leaders, leaderPack: phase === 'leader_preview' ? leaders : []}))]
  const draft = {id: 'draft-fixture', shareId: 'table-fixture', name: 'Spark of Rebellion Draft', setCode: 'SOR', setName: 'Spark of Rebellion', status: 'active', isHost: true, isPlayer: true, maxPlayers: 8, packSize: 14, players, myPlayer: me, draftState: {phase, packNumber: 1, pickInPack: 1, round: 1}, settings: {isSolo: true}, stateVersion: 1}
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

test('compact leader tray moves to header and returns when resized',async({page})=>{
 await page.setViewportSize({width:800,height:900});
 await draftFixture(page,{theme:'kashyyyk',phase:'leader_draft'});
 await expect(page.locator('#draft-header-leaders .drafted-leaders')).toHaveCount(1);
 await expect(page.locator('.leader-draft-phase .drafted-leaders')).toHaveCount(0);
 await page.setViewportSize({width:1280,height:900});
 await expect(page.locator('.leader-draft-phase .drafted-leaders')).toHaveCount(1);
});

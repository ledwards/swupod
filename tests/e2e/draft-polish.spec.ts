import {test, expect, type Page} from '@playwright/test'
import {readFileSync} from 'node:fs'
import {signInAs} from './helpers'
const cardData = JSON.parse(readFileSync(new URL('../../src/data/cards.json', import.meta.url), 'utf8')) as {
  cards: Array<{id: string; set: string; type: string; variantType: string; [key: string]: unknown}>
}

// Exercise the actual draft page and controls; network doubles isolate the
// presentation contract from the engine, database and multiplayer sockets.
async function draftFixture(page: Page, {beta = true, admin = false, enabled = true, phase = 'pack_draft', theme = 'purrgil', leaderCount = 3, longLabels = false} = {}) {
  if (theme) await page.addInitScript(value => {
    if (!localStorage.getItem('purrgil-table-v1')) localStorage.setItem('purrgil-table-v1', JSON.stringify({theme: value}))
  }, theme)
  const cards = cardData.cards.filter(card => card.set === 'SOR' && card.type === 'Unit' && card.variantType === 'Normal').slice(0, 14)
  const leaders = cardData.cards.filter(card => card.set === 'SOR' && card.type === 'Leader' && card.variantType === 'Normal').slice(0, leaderCount).map(card => ({...card}))
  if (longLabels) Object.assign(leaders[0], {name:'Poggle the Lesser', subtitle:'Let the Executions Begin'})
  const me = {id: 'draft-player', userId: 'table-user', username: 'You', seatNumber: 1, pickStatus: phase === 'leader_preview' ? 'waiting' : 'picking', selectionConfirmed: false, currentPack: cards, draftedCards: phase.startsWith('leader_') ? [] : cards.slice(0, 4), draftedLeaders: phase === 'leader_draft' || phase === 'leader_preview' ? [] : leaders, leaderPack: phase === 'leader_preview' ? leaders : [], leaders}
  const players = [me, ...Array.from({length: 7}, (_, i) => ({id: `bot-${i}`, username: `Drafter ${i + 2}`, seatNumber: i + 2, isBot: true, pickStatus: phase === 'leader_preview' ? 'waiting' : 'picking', draftedLeaders: phase === 'leader_preview' ? [] : leaders, leaderPack: phase === 'leader_preview' ? leaders : []}))]
  const draft = {id: 'draft-fixture', shareId: 'table-fixture', name: 'Spark of Rebellion Draft', setCode: 'SOR', setName: 'Spark of Rebellion', status: 'active', isHost: true, isPlayer: true, maxPlayers: 8, packSize: 14, players, myPlayer: me, draftState: {phase, packNumber: 1, pickInPack: 1, round: 1}, settings: {isSolo: true}, stateVersion: 1}
  let selected = 0
  let confirmed = 0
  let rollout = enabled
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    let data: unknown = {}
    if (path === '/api/auth/session') data = {user: {id: 'table-user', username: 'You', email: 'table@example.invalid', is_admin: admin, is_beta_tester: beta, is_alpha_tester: beta}}
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
  // The alpha draft room is chosen server-side from the session cookie (lib/viewerAccess), so a mocked session alone
  // would pair the legacy page with alpha-scoped styles; sign a real alpha tester in for the cookie.
  if (beta && enabled) await signInAs(page, {alpha: true})
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
  await page.goto('/pools/polish-fixture/deck', {waitUntil:'domcontentloaded'})
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
  // Themes stays reachable once the review closes; in the alpha draft room it opens the site's shared Themes
  // dialog (site-theme.spec covers the catalog itself).
  await page.getByRole('button',{name:'Themes',exact:true}).click()
  const dialog=page.getByRole('dialog',{name:'Themes',exact:true})
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
})

test('compact leader tray stays upper left at desktop and narrow widths',async({page})=>{
 await draftFixture(page,{theme:'kashyyyk',phase:'pack_draft'});
 const tray=page.locator('#draft-header-leaders .draft-leader-summary');
 for(const width of [1280,800,390,800]) {
  await page.setViewportSize({width,height:900});
  await expect(tray).toBeVisible();
  await expect(page.locator('.draft-pick-table .draft-leader-summary')).toHaveCount(0);
  const bounds=await tray.boundingBox();
  const table=await page.locator('.draft-pick-table').boundingBox();
  expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(table!.y);
  expect(bounds!.x).toBeLessThan(width/4);
  expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(width);
  for(const thumbnail of await tray.locator('.leader-thumbnail').all()) {
   const box=await thumbnail.boundingBox();
   expect(box!.width).toBeLessThanOrEqual(56);
   expect(box!.height).toBeLessThanOrEqual(40);
  }
 }
 await page.screenshot({path:'/tmp/alpha-compact-leaders.png'});
});

test('draft preview waits a full second and Ctrl bypasses the delay', async ({page}) => {
  await page.setViewportSize({width:1440,height:1000})
  await draftFixture(page, {phase:'leader_draft'})
  await page.clock.install()
  await page.clock.pauseAt(new Date())
  const card=page.locator('.leaders-grid .draftable-card').first()
  const preview=page.locator('.card-preview-enlarged')
  await card.hover()
  await page.clock.runFor(999)
  await expect(preview).toHaveCount(0)
  await page.clock.runFor(1)
  await expect(preview).toBeVisible()
  await page.mouse.move(5,5)
  await expect(preview).toHaveCount(0)
  await card.hover()
  await page.keyboard.down('Control')
  await expect(preview).toBeVisible()
  await page.keyboard.up('Control')
  await expect(preview).toHaveCount(0)
  await page.mouse.move(5,5)
  await page.clock.runFor(1000)
  await expect(preview).toHaveCount(0)
})


test('alpha pick tray fits full leader text and hides empty counters',async({page})=>{
 await page.setViewportSize({width:1512,height:980});
 await draftFixture(page,{phase:'leader_draft',theme:'kashyyyk',longLabels:true});
 await expect(page.getByText('Your Leaders',{exact:true})).toHaveCount(0);
 await expect(page.getByText('Cards: 0/42',{exact:true})).toHaveCount(0);
 const card=page.getByRole('button',{name:'Poggle the Lesser',exact:true});
 await card.click();
 await expect(card).toHaveCSS('cursor','pointer');
 await expect(card.locator('img').first()).toHaveCSS('cursor','pointer');
 const content=page.locator('.pick-confirmation-content');
 await expect(content).toBeVisible();
 for(const cls of ['selection-card-name','selection-card-subtitle']){
  const text=content.locator('.'+cls);
  await expect(text).toHaveCSS('white-space','nowrap');
  expect(await text.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
 }
 const outer=(await page.getByRole('region',{name:'Pick confirmation',exact:true}).boundingBox())!;
 const inner=(await content.boundingBox())!;
 expect(outer.width-inner.width).toBeLessThan(30);
 await page.screenshot({path:'/tmp/alpha-leader-confirmation.png'});
});


test('alpha pack tray keeps its leader label clear and suppresses Companion overlays',async({page})=>{
 await page.setViewportSize({width:1512,height:980});
 await draftFixture(page,{theme:'kashyyyk'});
 const label=page.getByText('Your Leaders',{exact:true});
 await expect(label).toBeVisible();
 const labelBox=(await label.boundingBox())!;
 const thumb=(await page.locator('.leader-thumbnail').first().boundingBox())!;
 expect(labelBox.y+labelBox.height).toBeLessThanOrEqual(thumb.y);
 const review=(await page.getByRole('button',{name:/Cards: 4/}).boundingBox())!;
 expect(labelBox.x+labelBox.width<=review.x || labelBox.y+labelBox.height<=review.y).toBe(true);
 await page.locator('.current-pack .draftable-card').first().click();
 const panel=(await page.getByRole('region',{name:'Pick confirmation',exact:true}).boundingBox())!;
 const content=(await page.locator('.pick-confirmation-content').boundingBox())!;
 expect(panel.width-content.width).toBeLessThan(30);
 await page.evaluate(()=>{for(const cls of ['wf-ptp-card-stat-badge','wf-ptp-card-stats-overlay']){const e=document.createElement('div');e.className=cls;e.textContent='Injected Companion overlay';document.body.append(e);}});
 await expect(page.locator('.wf-ptp-card-stat-badge')).toBeHidden();
 await expect(page.locator('.wf-ptp-card-stats-overlay')).toBeHidden();
 await page.screenshot({path:'/tmp/alpha-pack-confirmation.png'});
});

test('draft cancellation recovers from a stalled request and retries without sockets', async ({page}) => {
 await draftFixture(page);
 await page.clock.install();
 let attempts=0;
 await page.route('**/api/draft/table-fixture', async route => {
  if(route.request().method() !== 'DELETE') return route.fallback();
  attempts++;
  if(attempts === 1) return;
  await route.fulfill({json:{success:true}});
 });
 await page.getByRole('button',{name:'Cancel Draft',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await dialog.getByRole('button',{name:'Cancel Draft',exact:true}).click();
 await page.clock.runFor(16000);
 await expect(dialog.getByRole('alert')).toContainText('Couldn’t confirm');
 await expect(dialog.getByRole('button',{name:'Go Back'})).toBeEnabled();
 await dialog.getByRole('button',{name:'Cancel Draft',exact:true}).click();
 await expect(page).toHaveURL(/\/draft$/);
 expect(attempts).toBe(2);
});

for (const status of [403, 500, 404]) {
 test(`draft cancellation handles HTTP ${status}`, async ({page}) => {
  await draftFixture(page);
  await page.route('**/api/draft/table-fixture', route => route.request().method() === 'DELETE'
   ? route.fulfill({status,json:{error:'Cancellation failed'}}) : route.fallback());
  await page.getByRole('button',{name:'Cancel Draft',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByRole('button',{name:'Cancel Draft',exact:true}).click();
  if(status === 404) {
   await expect(page).toHaveURL(/\/draft$/);
  } else {
   await expect(dialog.getByRole('alert')).toContainText('Couldn’t cancel');
   await dialog.getByRole('button',{name:'Go Back'}).click();
   await expect(dialog).toHaveCount(0);
  }
 });
}

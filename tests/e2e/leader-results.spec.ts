import {test, expect, type Page} from '@playwright/test'
import {readFileSync, mkdirSync} from 'node:fs'
const cards=JSON.parse(readFileSync('src/data/cards.json','utf8')).cards
const leaders=cards.filter((c:any)=>c.set==='SOR'&&c.type==='Leader'&&c.variantType==='Normal').slice(0,3)
async function fixture(page: Page) {
  const players=Array.from({length:8},(_,i)=>({seatNumber:i+1,username:`Drafter ${i+1}`,userId:`player-${i+1}`,isBot:i>0,isLogPublic:false}))
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname
    let data:any={}
    if(path==='/api/play/native/presentation')return route.fulfill({json:{enabled:true}})
    if(path==='/api/play/native/decks')return route.fulfill({json:{decks:[{poolShareId:'pool-fixture',name:'Draft deck',setCode:'SOR',poolType:'draft',packCount:3,mainDeckCount:30,ready:true,leaderName:leaders[0].name,leaderImageUrl:leaders[0].imageUrl}]}})
    if(path==='/api/play/native/solo')return route.fulfill({json:{run:null,unavailableReason:null}})
    if(path==='/api/pools/pool-fixture')data={shareId:'pool-fixture',setCode:'SOR',name:'Draft deck',poolType:'draft',owner:{id:'player-1'},cards:[],deckBuilderState:{activeLeader:'leader',cardPositions:{leader:{card:leaders[0]}}}}
    if(path==='/api/pools/pool-fixture/deck.json')return route.fulfill({json:{deck:[{id:'card',count:30}]}})
    if(path==='/api/auth/session')data={user:{id:'player-1',username:'Drafter 1',is_alpha_tester:true}}
    if(path==='/api/draft/leader-results')data={shareId:'results-fixture',players:players.map((p,i)=>({...p,leaders:i===3?null:leaders}))}
    if(path==='/api/draft/results-fixture/log')data={
      picks:[{type:'leader',packNumber:1,pickInPack:1,visibleCards:leaders.map((c:any)=>({...c,instanceId:c.id})),pickedInstanceId:leaders[0].id}],
      meta:{targetSeat:1,playerName:'Drafter 1',setCode:'SOR',setName:'Spark of Rebellion',players,viewableSeats:[1,2,3,5,6,7,8],myPlayerId:'player-1',isHost:false,isDraftPublic:false},
    }
    if(path==='/api/draft/results-fixture/pod')data={draft:{shareId:'results-fixture',setCode:'SOR',setName:'Spark of Rebellion',settings:{isSolo:false}},players:players.map(p=>({...p,id:p.userId,isReady:true})),pairings:{matches:[],byePlayer:null},myBye:true,isHost:false,myPoolShareId:null}
    if(path.endsWith('/chat/history'))data={messages:[]}
    await route.fulfill({json:{success:true,data}})
  })
  await page.routeWebSocket('**/socket.io/**',()=>{})
}
for(const width of [390,1280])test(`leader results retain seats and inspect both faces at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:844})
  await fixture(page)
  await page.goto('/draft/results-fixture/log')
  const summary=page.getByRole('region',{name:'Leader draft results'})
  await expect(summary.getByText('Private log')).toBeVisible()
  await expect(summary.locator('.leader-results-player')).toHaveCount(8)
  await expect(summary.locator('.leader-results-player').nth(3)).toContainText('Seat 4')
  await expect(summary.locator('.leader-results-player').nth(3).locator('img')).toHaveCount(0)
  await expect(summary.locator('.leader-results-player').first()).toHaveClass(/is-active/)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await summary.locator('.canvas-card').first().click()
  await expect(page.locator('.card-zoom-face')).toHaveCount(2)
  await expect(page.getByAltText(`${leaders[0].name} — unit side`)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.card-zoom')).toHaveCount(0)
  mkdirSync('tmp/leader-results',{recursive:true})
  await page.locator('.leader-results img').evaluateAll(images => Promise.all(images.map(image => (image as HTMLImageElement).decode())))
  await page.screenshot({path:`tmp/leader-results/log-${width}.png`,fullPage:true})
  await summary.getByRole('button',{name:'Seat 2 · Drafter 2',exact:true}).click()
  await expect(page).toHaveURL(/seat=2/)
})
test('mobile shared card preview shows the leader unit side after long press',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true})
  const page=await context.newPage()
  await fixture(page)
  await page.goto('/draft/results-fixture/log')
  const card=page.locator('.draft-log-pack-cards .canvas-card').first()
  await card.dispatchEvent('touchstart',{touches:[{identifier:0,clientX:100,clientY:200}]})
  await expect(page.locator('.card-zoom-face')).toHaveCount(2)
  await card.dispatchEvent('touchend',{touches:[]})
  await expect(page.getByAltText(`${leaders[0].name} — unit side`)).toBeVisible()
  for(const size of [{width:390,height:844},{width:844,height:390}]){
    await page.setViewportSize(size)
    const bounds=await page.locator('.card-zoom').boundingBox()
    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.y).toBeGreaterThanOrEqual(0)
    expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(size.width)
    expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(size.height)
  }
  await page.screenshot({path:'tmp/leader-results/mobile-preview.png'})
  await page.getByRole('button',{name:'Close modal',exact:true}).click()
  await expect(page.locator('.card-zoom')).toHaveCount(0)
  await context.close()
})
test('post-draft pod keeps leader results collapsed until requested',async({page})=>{
  await fixture(page)
  await page.goto('/draft/results-fixture/pod')
  const summary=page.getByRole('region',{name:'Leader draft results'})
  await expect(summary.getByRole('button',{name:'Show',exact:true})).toBeVisible()
  await expect(summary.locator('.leader-results-grid')).toBeHidden()
  await summary.getByRole('button',{name:'Show',exact:true}).click()
  await expect(summary.locator('.leader-results-player')).toHaveCount(8)
})

for (const path of ['/play?pool=pool-fixture', '/play/solo?pool=pool-fixture', '/pools/pool-fixture/play/swiss', '/pools/pool-fixture/play/bracket']) test(`leader results stay available after deck building on ${path}`, async ({page}) => {
  await fixture(page)
  await page.goto(path)
  const summary=page.getByRole('region',{name:'Leader draft results'})
  await expect(summary.getByRole('button',{name:'Show',exact:true})).toBeVisible()
  await summary.getByRole('button',{name:'Show',exact:true}).click()
  await expect(summary.locator('.leader-results-player')).toHaveCount(8)
})

import {test,expect,type Page,type Route} from '@playwright/test'
import {join} from 'node:path'

// The Sealed tile's pack fan and the Draft tile's cards must show however the page arrives:
// prerendered shell only, lobby state failing or slow, a pack image 404ing, a throttled cold load.
const shots=(name:string)=>process.env.HOME_SHOTS_DIR?join(process.env.HOME_SHOTS_DIR,`${name}-${test.info().project.name}.png`):test.info().outputPath(`${name}.png`)
const sealed=(page:Page)=>page.locator('.ph-tiles>.ph-tile').nth(1)
const draft=(page:Page)=>page.locator('.ph-tiles>.ph-tile').nth(0)
/** Every image in the tile art has loaded with real pixels and is rendered at a visible size. */
async function expectLoaded(page:Page,tile:ReturnType<typeof sealed>,count:number,timeout=20_000){
 const images=tile.locator('.ph-tile-art img')
 await expect(images).toHaveCount(count)
 await expect.poll(()=>images.evaluateAll(list=>list.filter(img=>{const i=img as HTMLImageElement,r=i.getBoundingClientRect(),s=getComputedStyle(i);return i.complete&&i.naturalWidth>0&&r.width>10&&r.height>10&&s.visibility!=='hidden'&&s.display!=='none'&&Number(s.opacity)>0}).length),{timeout}).toBe(count)
}
const quiet={signedIn:false,enabled:true,ptpOrigin:'',playOrigin:'',sets:[{code:'HMW',name:'Homeworlds'}],pools:[],queues:[],pods:[],active:null,queue:null}
const lobbyState=(page:Page,handler:(route:Route)=>Promise<void>|void)=>page.route('**/api/lobby/shared',route=>route.request().method()==='GET'?handler(route):route.fulfill({json:{}}))

test('prerendered shell has the pack fan before the bundle arrives',async({page})=>{
 let release:()=>void=()=>{}
 const held=new Promise<void>(resolve=>{release=resolve})
 await page.route('**/play-home/homepage.js?*',async route=>{await held;await route.continue()})
 try{
  await page.goto('/',{waitUntil:'domcontentloaded'})
  await expect(page.locator('[aria-label="Protect the Pod"]')).toHaveAttribute('data-ready','false')
  await expectLoaded(page,sealed(page),6)
  await expectLoaded(page,draft(page),3)
  await sealed(page).screenshot({path:shots('sealed-shell')})
 }finally{release()}
})

test('server HTML alone, no JavaScript, still has the packs',async({browser,baseURL})=>{
 const context=await browser.newContext({javaScriptEnabled:false})
 const page=await context.newPage()
 try{
  await page.goto(`${baseURL}/`)
  await expectLoaded(page,sealed(page),6)
  await expectLoaded(page,draft(page),3)
  await sealed(page).screenshot({path:shots('sealed-no-js')})
 }finally{await context.close()}
})

for(const [name,handler] of [
 ['lobby-401',(r:Route)=>r.fulfill({status:401,json:{error:'Sign in to play.'}})],
 ['lobby-500',(r:Route)=>r.fulfill({status:500,json:{error:'Play is unavailable.'}})],
 ['lobby-aborted',(r:Route)=>r.abort('failed')],
 ['lobby-empty-sets',(r:Route)=>r.fulfill({json:{...quiet,sets:[]}})],
 ['lobby-unknown-set',(r:Route)=>r.fulfill({json:{...quiet,sets:[{code:'ZZZ',name:'Not yet printed'}]}})],
 ['lobby-slow',async(r:Route)=>{await new Promise(resolve=>setTimeout(resolve,6000));await r.fulfill({json:quiet})}],
] as const){
 test(`Sealed packs show when the lobby state is ${name.slice(6)}`,async({page})=>{
  await lobbyState(page,handler)
  await page.goto('/')
  await expect(page.locator('[aria-label="Protect the Pod"]')).toHaveAttribute('data-ready','true')
  await expectLoaded(page,sealed(page),6)
  await expectLoaded(page,draft(page),3)
  await sealed(page).screenshot({path:shots(`sealed-${name}`)})
 })
}

test('a pack image that 404s falls back to another pack, never a gap',async({page})=>{
 const failed:string[]=[]
 await page.route(/\/pack-images\/(home\/)?(hmw-pack-[12]|zzz-pack-\d)\.(png|webp)/,route=>{failed.push(route.request().url());return route.fulfill({status:404,body:''})})
 await lobbyState(page,r=>r.fulfill({json:{...quiet,sets:[{code:'ZZZ',name:'Not yet printed'}]}}))
 await page.goto('/')
 await expect(page.locator('[aria-label="Protect the Pod"]')).toHaveAttribute('data-ready','true')
 await expectLoaded(page,sealed(page),6)
 expect(failed.length).toBeGreaterThan(0)
 const sources=await sealed(page).locator('img').evaluateAll(list=>list.map(i=>(i as HTMLImageElement).currentSrc))
 expect(sources.every(src=>/\/home\/hmw-pack-3\.webp$/.test(src))).toBe(true)
 await sealed(page).screenshot({path:shots('sealed-image-404')})
})

test('the Draft cards show when the card CDN fails',async({page})=>{
 await page.route(/cdn\.starwarsunlimited\.com\/.*card_0901/,route=>route.abort('failed'))
 await page.goto('/')
 await expect(page.locator('[aria-label="Protect the Pod"]')).toHaveAttribute('data-ready','true')
 await expectLoaded(page,draft(page),3)
 await draft(page).screenshot({path:shots('draft-cdn-failed')})
})

test('with no small copies at all, the full pack art still shows',async({page})=>{
 await page.route(/\/pack-images\/home\//,route=>route.fulfill({status:404,body:''}))
 await page.goto('/')
 await expect(page.locator('[aria-label="Protect the Pod"]')).toHaveAttribute('data-ready','true')
 await expectLoaded(page,sealed(page),6)
 const sources=await sealed(page).locator('img').evaluateAll(list=>list.map(i=>(i as HTMLImageElement).currentSrc))
 expect(sources.every(src=>/\/pack-images\/hmw-pack-[123]\.png$/.test(src))).toBe(true)
})

test('throttled, cold-cache load keeps both fans',async({page,browserName})=>{
 test.skip(browserName!=='chromium','Network throttling needs CDP')
 test.setTimeout(150_000)
 const cdp=await page.context().newCDPSession(page)
 await cdp.send('Network.enable')
 await cdp.send('Network.setCacheDisabled',{cacheDisabled:true})
 await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:400,downloadThroughput:50*1024,uploadThroughput:100*1024})
 await lobbyState(page,r=>r.fulfill({status:500,json:{error:'down'}}))
 await page.goto('/',{waitUntil:'domcontentloaded',timeout:90_000})
 await expectLoaded(page,sealed(page),6,90_000)
 await expectLoaded(page,draft(page),3,90_000)
 await sealed(page).screenshot({path:shots('sealed-throttled')})
})

test('Now Playing always shows the five primary queues, at 0 when nothing is happening',async({page})=>{
 await lobbyState(page,r=>r.fulfill({json:quiet}))
 await page.goto('/')
 await expect(page.locator('[aria-label="Protect the Pod"]')).toHaveAttribute('data-ready','true')
 const board=page.locator('.ph-activity-board')
 await expect(board).toBeVisible()
 const queues=board.getByRole('group',{name:'Queues'}).getByRole('button')
 await expect(queues).toHaveCount(5)
 for(const [i,name] of ['HMW Draft','HMW Sealed 6-pack','HMW Sealed 8-pack','Premier','Eternal'].entries())await expect(queues.nth(i)).toHaveAttribute('aria-label',`Join ${name} queue, 0 waiting`)
 // Three to a row: Draft, Sealed 6-pack, Sealed 8-pack on the first; Premier and Eternal on the second.
 const [draft,eight,premierTile]=await Promise.all([queues.nth(0).boundingBox(),queues.nth(2).boundingBox(),queues.nth(3).boundingBox()])
 expect(Math.abs((draft?.y??0)-(eight?.y??-99))).toBeLessThan(2)
 expect((premierTile?.y??0)-(draft?.y??0)).toBeGreaterThan(20)
 await page.screenshot({path:shots('home-quiet'),fullPage:true})
 await page.unroute('**/api/lobby/shared')
 const premier={format:'premier',limited:'six',pool:'current',set:''}
 await lobbyState(page,r=>r.fulfill({json:{...quiet,queues:[{key:'premier',contract:premier,label:'Premier',waiting:2}],pods:[{id:'pod-1',name:'Friday draft',set:'HMW',players:3,capacity:8}]}}))
 await page.reload()
 await expect(board.getByRole('button',{name:'Join Premier queue, 2 waiting'})).toBeVisible()
 await expect(board).toContainText('Friday draft')
 await page.screenshot({path:shots('home-busy'),fullPage:true})
})

test('the resume box takes 40% of the row beside the lobbies, one item at a time, a sibling at the same height, quiet or busy',async({page})=>{
 await page.setViewportSize({width:1440,height:900})
 const item=(i:number,label:string,action:string)=>({id:`pool-${i}`,label,action,href:`/pool/pool-${i}`,imageUrl:null,artKind:'set',setImageUrl:'/expansion-art/hmw.png',removeUrl:`/api/pools/pool-${i}`,removeLabel:'Delete'})
 await page.route('**/api/home/resumes',r=>r.fulfill({json:{resumes:[item(1,'Friday sealed · Deck not built','Build deck'),item(2,'HMW draft pod · Pick 9 of 42','Resume draft'),item(3,'Ashes sealed · Deck built','Edit deck')]}}))
 await lobbyState(page,r=>r.fulfill({json:{...quiet,signedIn:true}}))
 await page.goto('/')
 const status=page.locator('.ph-home-status'),resume=status.locator('.ph-resume-wrap'),card=resume.locator('.ph-resume-game'),board=page.locator('.ph-activity-board')
 await expect(resume.getByRole('link',{name:'Build deck'})).toBeVisible()
 await expect(board).toBeVisible()
 // Only the most recent item shows; the other two wait behind More.
 await expect(status.getByRole('link',{name:'Resume draft'})).toHaveCount(0)
 await expect(status.locator('.ph-resume-rows.is-inline')).toHaveCount(0)
 await page.waitForTimeout(500)
 const [row,box,lobbies]=await Promise.all([status.boundingBox(),card.boundingBox(),board.boundingBox()])
 expect(Math.abs((box?.width??0)/(row?.width??1)-.4)).toBeLessThan(.02)
 expect((lobbies?.width??0)/(row?.width??1)).toBeGreaterThan(.55)
 expect(Math.abs((box?.height??0)-(lobbies?.height??0))).toBeLessThan(1)
 expect(Math.abs((box?.y??0)-(lobbies?.y??0))).toBeLessThan(1)
 // One heading style for both boxes, and the same box: radius, border, padding.
 const look=(l:typeof board)=>l.evaluate(e=>{const c=getComputedStyle(e),h=getComputedStyle(e.querySelector('.ph-box-head h2')!);return [c.borderTopLeftRadius,c.borderTopWidth,c.paddingTop,c.paddingLeft,h.fontSize,h.fontWeight,h.color].join(' ')})
 expect(await look(card)).toBe(await look(board))
 await expect(board.locator('.ph-activity-art')).toHaveCSS('background-image',/Mos_Eisley/)
 await page.screenshot({path:shots('home-quiet-resume'),fullPage:true})
 await resume.getByRole('button',{name:'Show 2 more'}).click()
 const more=page.getByRole('region',{name:'Other unfinished items'})
 await expect(more.getByRole('link',{name:'Resume draft'})).toBeVisible();await expect(more.getByRole('link',{name:'Edit deck'})).toBeVisible()
 await page.keyboard.press('Escape')
 await page.unroute('**/api/lobby/shared')
 const premier={format:'premier',limited:'six',pool:'current',set:''}
 await lobbyState(page,r=>r.fulfill({json:{...quiet,signedIn:true,queues:[{key:'premier',contract:premier,label:'Premier',waiting:2}]}}))
 await page.reload()
 await expect(board.getByRole('button',{name:'Join Premier queue, 2 waiting'})).toBeVisible()
 await expect(resume).toBeVisible()
 await page.screenshot({path:shots('home-busy-resume'),fullPage:true})
})

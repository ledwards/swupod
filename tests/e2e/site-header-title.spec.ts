import {test,expect,type Page} from '@playwright/test'
async function session(page:Page){
 await page.route('**/api/auth/session',route=>route.fulfill({json:{success:true,data:{user:{id:'00000000-0000-4000-8000-000000000001',username:'Theme tester',is_admin:true,is_alpha_tester:true,is_beta_tester:true}}}}))
 await page.route('**/api/**/patron-status',route=>route.fulfill({json:{success:true,data:{isPatron:true}}}))
 await page.route('**/api/entitlements',route=>route.fulfill({json:{beta:true,canCustomize:true}}))
}
const cases:[string,string,string|null][]=[
 ['/draft/new?competitive=0','Select a Set','Draft'],
 ['/formats/pack-wars','Pack Wars','Formats'],
 ['/draft','Draft Pod',null],
 ['/history','History',null],
 ['/me','My Stats',null],
]
for(const width of [1440,390])test(`site header carries the page title at ${width}`,async({page,context,baseURL})=>{
 await page.setViewportSize({width,height:width===390?844:1000})
 await session(page)
 await context.addCookies([{name:'purrgil-table-v1',value:encodeURIComponent(JSON.stringify({theme:'hoth',animations:false})),url:baseURL!}])
 for(const [path,title,section] of cases){
  await page.goto(path,{waitUntil:'domcontentloaded'})
  const header=page.locator('.site-header')
  await expect(header.locator('.site-title-text')).toHaveText(title,{timeout:15000})
  if(section){
   const back=header.getByRole('link',{name:section,exact:true})
   await expect(back).toHaveAttribute('href',`/${section.toLowerCase()}`)
   // Back link sits at the upper left, after the logo and before the title.
   const b=(await back.boundingBox())!,logo=(await header.locator('.site-brand').boundingBox())!,t=(await header.locator('.site-title').boundingBox())!
   expect(b.x).toBeGreaterThan(logo.x+logo.width-1)
   if(width>720)expect(b.x+b.width).toBeLessThan(t.x)
   else expect(b.y+b.height).toBeLessThanOrEqual(t.y+1) // phone: title drops to its own row under the logo and controls
  }
  else await expect(header.locator('.site-back')).toHaveCount(0)
  // The page's own heading stays for assistive tech and sits once in the document.
  await expect(page.locator('main h1, .site-content h1').filter({hasText:path==='/me'?/./:title})).toHaveCount(1)
  const titleBox=(await header.locator('.site-title').boundingBox())!,headerBox=(await header.boundingBox())!
  expect(Math.abs((titleBox.x+titleBox.width/2)-(headerBox.x+headerBox.width/2))).toBeLessThan(4)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow on ${path}`).toBe(true)
 }
 await page.goto('/me')
 await expect(page.locator('.me-hero-titles h1')).toBeVisible()
 await page.goto('/')
 await expect(page.locator('.site-title')).toBeHidden()
 // FIXED: with no title the control cluster still sits at the right edge, not in the empty middle column.
 const home=(await page.locator('.site-header').boundingBox())!,homeNav=(await page.locator('.site-header nav').boundingBox())!
 expect(home.x+home.width-(homeNav.x+homeNav.width)).toBeLessThan(40)
})
test('tool icons sit as one cluster beside the avatar',async({page})=>{
 await session(page)
 await page.goto('/draft')
 const nav=page.locator('.site-header nav')
 const boxes=await Promise.all([nav.locator('.site-release-notes button').first(),nav.getByRole('button',{name:'Themes',exact:true}),nav.getByRole('button',{name:'Settings',exact:true}),nav.getByRole('button',{name:'User menu',exact:true})].map(l=>l.boundingBox()))
 for(let i=1;i<3;i++)expect(boxes[i]!.x-(boxes[i-1]!.x+boxes[i-1]!.width)).toBeLessThanOrEqual(6)
})

// The sealed pool route checks pool existence server-side, so only the deck builder can run on a mocked pool.
for(const [path,name] of [['/pool/header-fixture/deck','deck builder']])test(`the editable ${name} title renders inside the site header`,async({page},testInfo)=>{
 const {readFileSync}=await import('node:fs')
 const cards=JSON.parse(readFileSync(new URL('../../src/data/cards.json',import.meta.url),'utf8')).cards.filter((card:any)=>card.set==='SOR'&&card.variantType==='Normal').slice(0,40)
 await page.route('**/api/**',route=>{
  const p=new URL(route.request().url()).pathname
  const data=p==='/api/auth/session'?{user:null}:p==='/api/pools/header-fixture'?{shareId:'header-fixture',setCode:'SOR',cards,poolType:'sealed',name:'Header layout check'}:p.endsWith('/builds')?{builds:[]}:{}
  return route.fulfill({json:{success:true,data}})
 })
 await page.routeWebSocket('**/socket.io/**',()=>{})
 await page.goto(path)
 const header=page.locator('.site-header')
 await expect(header.locator('h1 .editable-title')).toContainText('Header layout check',{timeout:30000})
 await expect(page.locator('.site-content h1')).toHaveCount(0)
 const t=(await header.locator('.site-title').boundingBox())!,h=(await header.boundingBox())!
 expect(Math.abs((t.x+t.width/2)-(h.x+h.width/2))).toBeLessThan(4)
 expect(t.y+t.height).toBeLessThanOrEqual(h.y+h.height+1)
 await page.screenshot({path:testInfo.outputPath(`editable-${name.split(' ').join('-')}.png`),clip:{x:0,y:0,width:1280,height:420}})
})

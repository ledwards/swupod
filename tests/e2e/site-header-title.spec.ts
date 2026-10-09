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
  if(section)await expect(header.getByRole('link',{name:section,exact:true})).toHaveAttribute('href',`/${section.toLowerCase()}`)
  else await expect(header.locator('.site-title-section')).toHaveCount(0)
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
})
test('tool icons sit as one cluster beside the avatar',async({page})=>{
 await session(page)
 await page.goto('/draft')
 const nav=page.locator('.site-header nav')
 const boxes=await Promise.all([nav.locator('.site-release-notes button').first(),nav.getByRole('button',{name:'Themes',exact:true}),nav.getByRole('button',{name:'Settings',exact:true}),nav.getByRole('button',{name:'User menu',exact:true})].map(l=>l.boundingBox()))
 for(let i=1;i<3;i++)expect(boxes[i]!.x-(boxes[i-1]!.x+boxes[i-1]!.width)).toBeLessThanOrEqual(6)
})

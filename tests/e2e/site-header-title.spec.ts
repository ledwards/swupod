import {test,expect,type Page} from '@playwright/test'
import {signInAs} from './helpers'
// Alpha surfaces are decided on the server from the session cookie: sign a real alpha tester in, then mock the client's reads.
async function session(page:Page){
 await signInAs(page,{alpha:true})
 await page.route('**/api/auth/session',route=>route.fulfill({json:{success:true,data:{user:{id:'00000000-0000-4000-8000-000000000001',username:'Theme tester',is_admin:true,is_alpha_tester:true,is_beta_tester:true}}}}))
 await page.route('**/api/**/patron-status',route=>route.fulfill({json:{success:true,data:{isPatron:true}}}))
 await page.route('**/api/entitlements',route=>route.fulfill({json:{beta:true,canCustomize:true}}))
}
// No back links in the header (a632c124): the section column stays null; the browser and the logo go back.
const cases:[string,string,string|null,string|null][]=[
 ['/draft/new?competitive=0','Select a Set',null,null],
 ['/formats/pack-wars','Pack Wars',null,'Open 2 packs, choose your leader, and battle!'],
 ['/draft','Draft',null,null], // its description is a full sentence and stays in the page
 ['/history','History',null,null],
 ['/me','Stats',null,null], // the homepage bundle's Stats view
]
for(const width of [1440,390])test(`site header carries the page title at ${width}`,async({page,context,baseURL})=>{
 await page.setViewportSize({width,height:width===390?844:1000})
 await session(page)
 await context.addCookies([{name:'purrgil-table-v1',value:encodeURIComponent(JSON.stringify({theme:'hoth',animations:false})),url:baseURL!}])
 for(const [path,title,section,subtitle] of cases){
  await page.goto(path,{waitUntil:'domcontentloaded'})
  const header=page.locator('.site-header')
  await expect(header.locator('.site-title-text')).toHaveText(title,{timeout:15000})
  if(subtitle){
   await expect(header.locator('.site-subtitle')).toHaveText(subtitle)
   const tt=(await header.locator('.site-title-text').boundingBox())!,st=(await header.locator('.site-subtitle').boundingBox())!
   expect(st.y).toBeGreaterThanOrEqual(tt.y+tt.height-1) // directly beneath the title
   await expect(page.locator('.site-content p').filter({hasText:subtitle})).toHaveAttribute('data-site-subtitle-source','hidden') // hidden in place, kept for assistive tech
  } else await expect(header.locator('.site-subtitle')).toHaveCount(0)
  // Overlays size themselves from this variable, so it must match the header's real height.
  expect(Math.round(parseFloat(await page.evaluate(()=>getComputedStyle(document.body).getPropertyValue('--site-header-height'))))).toBe(Math.round((await header.boundingBox())!.height))
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
 // Alpha /me is the homepage bundle's Stats view: its own h1 is mirrored into the site header.
 await expect(page.locator('.site-header .site-title-text')).toHaveText('Stats',{timeout:15000})
 await expect(page.locator('main h1, .site-content h1').filter({hasText:'Stats'})).toHaveCount(1)
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
 for(let i=1;i<3;i++)expect(boxes[i]!.x-(boxes[i-1]!.x+boxes[i-1]!.width)).toBeLessThanOrEqual(1)
 // Icon glyphs (22px) in 36px buttons sit no more than 14px apart edge to edge (one tight group).
 const glyphs=await Promise.all([nav.locator('.site-release-notes button svg').first(),nav.getByRole('button',{name:'Themes',exact:true}).locator('svg'),nav.getByRole('button',{name:'Settings',exact:true}).locator('svg')].map(l=>l.boundingBox()))
 for(let i=1;i<3;i++)expect(glyphs[i]!.x-(glyphs[i-1]!.x+glyphs[i-1]!.width)).toBeLessThanOrEqual(14)
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
 await signInAs(page,{alpha:true})
 await page.goto(path)
 const header=page.locator('.site-header')
 await expect(header.locator('h1 .editable-title')).toContainText('Header layout check',{timeout:30000})
 await expect(header.locator('.site-title-slot p')).toHaveText(/SOR Sealed|Sealed Pool/)
 expect(Math.round(parseFloat(await page.evaluate(()=>getComputedStyle(document.body).getPropertyValue('--site-header-height'))))).toBe(Math.round((await header.boundingBox())!.height))
 await expect(page.locator('.site-content h1')).toHaveCount(0)
 const t=(await header.locator('.site-title').boundingBox())!,h=(await header.boundingBox())!
 expect(Math.abs((t.x+t.width/2)-(h.x+h.width/2))).toBeLessThan(4)
 expect(t.y+t.height).toBeLessThanOrEqual(h.y+h.height+1)
 await page.screenshot({path:testInfo.outputPath(`editable-${name.split(' ').join('-')}.png`),clip:{x:0,y:0,width:1280,height:420}})
})

/** WCAG contrast of an element's text against its own computed background (rgb/rgba strings). */
const contrastOf=(el:Element)=>{
 const luminance=(css:string)=>{
  const [r,g,b]=(css.match(/\d+(\.\d+)?/g)??['0','0','0']).slice(0,3).map(Number)
  const lin=(v:number)=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4}
  return 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b)
 }
 // A translucent background (hover tints are rgba) reads as the colour it composites to over its ancestors.
 const parse=(css:string)=>{const n=(css.match(/\d+(\.\d+)?/g)??[]).map(Number);return {r:n[0]??0,g:n[1]??0,b:n[2]??0,a:css.startsWith('rgba')?(n[3]??1):1}}
 const effective=(node:Element|null):{r:number;g:number;b:number}=>{
  if(!node)return {r:0,g:0,b:0}
  const c=parse(getComputedStyle(node).backgroundColor)
  if(c.a>=1)return c
  const under=effective(node.parentElement)
  return {r:c.r*c.a+under.r*(1-c.a),g:c.g*c.a+under.g*(1-c.a),b:c.b*c.a+under.b*(1-c.a)}
 }
 const bg=effective(el),a=luminance(getComputedStyle(el).color),b=luminance(`rgb(${bg.r}, ${bg.g}, ${bg.b})`)
 return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)
}
for(const theme of ['purrgil','hoth','imperial'])test(`buttons stay legible at rest and on hover (${theme})`,async({page,context,baseURL})=>{
 await session(page)
 await context.addCookies([{name:'purrgil-table-v1',value:encodeURIComponent(JSON.stringify({theme,animations:false})),url:baseURL!}])
 await page.goto('/draft')
 // Create Pod is the primary; an unpressed after-draft choice (Swiss/Bracket) is a secondary button at rest.
 const primary=page.locator('.sp-create .sp-primary').first(),secondary=page.locator('.sp-after-draft button[aria-pressed="false"]').first()
 await expect(primary).toBeVisible({timeout:15000})
 for(const [label,el] of [['primary',primary],['secondary',secondary]] as const){
  // Poll: the page re-renders these buttons once patron status resolves, so a single read can land on a detached node.
  await expect.poll(()=>el.evaluate(contrastOf),{message:`${label} at rest on ${theme}`,timeout:10000}).toBeGreaterThanOrEqual(4.5)
  await el.hover({force:true}); await page.waitForTimeout(350)
  await expect.poll(()=>el.evaluate(contrastOf),{message:`${label} hovered on ${theme}`,timeout:10000}).toBeGreaterThanOrEqual(4.5)
 }
})

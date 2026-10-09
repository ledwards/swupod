import {test,expect} from '@playwright/test'

test('homepage content is visible before the interactive bundle arrives',async({page})=>{
 const hydrationErrors:string[]=[]
 page.on('console',message=>{if(/hydrat/i.test(message.text()))hydrationErrors.push(message.text())})
 let release:()=>void=()=>{}
 const held=new Promise<void>(resolve=>{release=resolve})
 await page.route('**/play-home/homepage.js?*',async route=>{await held;await route.continue()})
 try{
  await page.goto('/',{waitUntil:'domcontentloaded'})
  await expect(page.locator('.ph-tile-title')).toHaveText(['Draft','Sealed','Constructed'])
  await expect(page.getByText('Loading Protect the Pod…',{exact:true})).toHaveCount(0)
  await expect(page.getByRole('link',{name:'Protect the Pod home',exact:true})).toBeVisible()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.screenshot({path:test.info().outputPath('home-shell.png'),fullPage:true})
 }finally{release()}
 await expect(page.locator('[aria-label="Protect the Pod"]')).toHaveAttribute('data-ready','true')
 await page.getByRole('button',{name:'Settings',exact:true}).click()
 await expect(page.getByRole('dialog')).toBeVisible()
 expect(hydrationErrors).toEqual([])
})

test('server HTML contains the correct route before any JavaScript runs',async({browser,baseURL})=>{
 const context=await browser.newContext({javaScriptEnabled:false})
 const page=await context.newPage()
 try{
  await page.goto(`${baseURL}/`)
  await expect(page.locator('.ph-tile-title')).toHaveText(['Draft','Sealed','Constructed'])
  await page.goto(`${baseURL}/lobby/constructed?format=eternal`)
  await expect(page.getByRole('heading',{name:'Constructed',exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:'Eternal',exact:true})).toHaveAttribute('aria-pressed','true')
  await expect(page.getByText('Loading Protect the Pod…',{exact:true})).toHaveCount(0)
 }finally{await context.close()}
})

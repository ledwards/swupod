import {test,expect} from '@playwright/test'
import {signInAs} from './helpers'
// The play homepage is for alpha testers (everyone else keeps the current front page), so each test signs one in.

test('homepage content is visible before the interactive bundle arrives',async({page})=>{
 const hydrationErrors:string[]=[]
 page.on('console',message=>{if(/hydrat/i.test(message.text()))hydrationErrors.push(message.text())})
 let release:()=>void=()=>{}
 const held=new Promise<void>(resolve=>{release=resolve})
 await page.route('**/play-home/homepage.js?*',async route=>{await held;await route.continue()})
 await signInAs(page,{alpha:true})
 try{
  await page.goto('/',{waitUntil:'domcontentloaded'})
  await expect(page.locator('.ph-tile-title')).toHaveText(['Draft','Sealed','Play'])
  await expect(page.getByText('Loading Protect the Pod…',{exact:true})).toHaveCount(0)
  // The homepage carries the logo as a large centred masthead; interior pages keep the corner link.
  await expect(page.locator('.site-masthead img')).toBeVisible()
  await expect(page.locator('.site-brand')).toHaveCount(0)
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
 await signInAs(page,{alpha:true})
 try{
  await page.goto(`${baseURL}/`)
  await expect(page.locator('.ph-tile-title')).toHaveText(['Draft','Sealed','Play'])
  // The old /lobby/constructed address lands on /play with its query; the prerendered shell is the Play landmark,
  // busy until the bundle mounts the format drawer (the chosen format lives in the address, not the shell).
  await page.goto(`${baseURL}/lobby/constructed?format=eternal`)
  await expect(page).toHaveURL(/\/play\?format=eternal$/)
  // The page's own h1 is mirrored into the site header by script; without script it is in the HTML but hidden.
  await expect(page.locator('h1.lobby-header-title')).toHaveText('Play')
  await expect(page.locator('section.ph-play[aria-label="Play"]')).toHaveAttribute('aria-busy','true')
  await expect(page.getByText('Loading Protect the Pod…',{exact:true})).toHaveCount(0)
 }finally{await context.close()}
})

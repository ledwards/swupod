import {test,expect} from '@playwright/test'
const box=async(l:import('@playwright/test').Locator)=>(await l.boundingBox())!
const apart=(a:{x:number;y:number;width:number;height:number},b:{x:number;y:number;width:number;height:number})=>a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y
for(const [w,h] of [[1440,900],[1280,720],[768,1024],[390,844],[375,667]])test(`pack opening controls share one bottom row under the site header at ${w}x${h}`,async({page})=>{
 await page.setViewportSize({width:w,height:h})
 // Anonymous pools are generated in the browser, so nothing is written on the server.
 await page.route('**/api/auth/session',r=>r.fulfill({json:{success:true,data:{user:null}}}))
 await page.goto('/pools/new?set=HMW&packs=6')
 const overlay=page.locator('.pack-opening-container'),skip=overlay.locator('.skip-button'),actions=overlay.locator('.open-all-container'),counter=overlay.locator('.pack-counter'),header=page.locator('.site-header')
 await expect(skip).toBeVisible({timeout:60000})
 await expect(skip).toHaveText(/^Skip$/)
 // Let the packs finish sliding into their row before measuring against them.
 await expect(overlay.locator('.pack-item, .pack-item-mobile')).toHaveCount(6)
 await page.waitForTimeout(1800)
 const [o,s,a,c,hd]=await Promise.all([box(overlay),box(skip),box(actions),box(counter),box(header)])
 // The overlay starts where the header ends; nothing in the header is covered.
 expect(o.y).toBeGreaterThanOrEqual(hd.y+hd.height-1)
 // Skip hugs the right edge of the overlay's bottom; the counter hugs the left; the actions are centered between them.
 expect(o.x+o.width-(s.x+s.width)).toBeLessThan(40)
 expect(c.x-o.x).toBeLessThan(40)
 expect(Math.abs((a.x+a.width/2)-(o.x+o.width/2))).toBeLessThan(4)
 for(const el of [s,a,c])expect(o.y+o.height-(el.y+el.height),'sits in the bottom band').toBeLessThan(96)
 // None of the three touch each other or the packs.
 expect(apart(s,a)).toBe(true);expect(apart(c,a)).toBe(true);expect(apart(s,c)).toBe(true)
 const pack=await box(overlay.locator('.pack-item, .pack-item-mobile').first())
 for(const el of [s,a,c])expect(apart(el,pack),'clear of the packs').toBe(true)
})

test("the release-notes toast stays hidden while packs are opening",async({page})=>{
 await page.route("**/api/auth/session",r=>r.fulfill({json:{success:true,data:{user:null}}}))
 await page.goto("/pools/new?set=HMW&packs=6")
 await expect(page.locator(".pack-opening-container .skip-button")).toBeVisible({timeout:60000})
 await expect(page.locator(".lobby-toast")).toBeHidden()
})

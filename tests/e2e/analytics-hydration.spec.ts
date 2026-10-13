import {test,expect} from '@playwright/test'

// localhost normally disables analytics and would miss script injection before hydration.
test('production analytics starts after hydration without replacing the page',async({page,baseURL})=>{
 const errors:string[]=[]
 let analyticsRequests=0
 page.on('pageerror',error=>errors.push(error.message))
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url())
  if(url.hostname==='www.protectthepod.com'){
   const response=await route.fetch({url:new URL(url.pathname+url.search,baseURL).href})
   return route.fulfill({response})
  }
  if(url.hostname.endsWith('.posthog.com'))analyticsRequests++
  // Never send test events, keys or traffic to production services.
  return route.abort()
 })
 await page.goto('http://www.protectthepod.com/')
 await expect(page.locator('.landing-page')).toBeVisible()
 await expect.poll(()=>analyticsRequests).toBeGreaterThan(0)
 await page.evaluate(()=>new Promise<void>(resolve=>requestIdleCallback(()=>resolve())))
 await page.unrouteAll({behavior:'ignoreErrors'})
 expect(errors).toEqual([])
})

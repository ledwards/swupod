import {test,expect} from '@playwright/test'
test('connects through public Bio proof and exposes disconnect with an explicit consequence',async({page},info)=>{
 let linked=false
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname
  if(path==='/api/auth/session')return route.fulfill({json:{success:true,data:{user:{id:'melee-test',username:'example',is_beta_tester:true}}}})
  if(path==='/api/connections/melee'){
   const input=route.request().method()==='POST'?route.request().postDataJSON():{action:'status'}
   if(input.action==='begin')return route.fulfill({json:{challengeId:'00000000-0000-0000-0000-000000000001',marker:'PTP-'+'a'.repeat(48),expiresAt:new Date(Date.now()+900000).toISOString(),handle:'example_melee'}})
   if(input.action==='verify')linked=true
   if(input.action==='disconnect')linked=false
   return route.fulfill({json:{link:linked?{handle:'example_melee',verified_at:'2026-10-08T00:00:00Z',version:1}:null}})
  }
  return route.fulfill({json:{success:true,data:{isPatron:false},isPatron:false}})
 })
 await page.goto('/connections/melee')
 await expect(page.locator('main')).toHaveCSS('background-image',/bg-texture-crop/);
 await expect(page.locator('main')).not.toContainText('↗');
 await page.screenshot({path:`test-results/melee-connect-${info.project.name}.png`,fullPage:true});
 await page.getByLabel('Melee username',{exact:true}).fill('example_melee')
 await page.getByRole('button',{name:'Continue to verification'}).click()
 await expect(page.getByRole('link',{name:'Melee Profile Settings'})).toHaveAttribute('href','https://melee.gg/Profile/Settings')
 await expect(page.getByText('Bio',{exact:true})).toBeVisible()
 await page.screenshot({path:`test-results/melee-proof-${info.project.name}.png`,fullPage:true})
 await page.getByRole('button',{name:'Verify my Melee profile'}).click()
 await expect(page.getByRole('heading',{name:'Connected to example_melee'})).toBeVisible()
 await page.getByRole('button',{name:'Disconnect…',exact:true}).click()
 await expect(page.getByText('Disconnecting removes attendance-based unlocks. Friend of the Pod access stays available.')).toBeVisible()
 await page.getByRole('button',{name:'Disconnect Melee',exact:true}).click()
 await expect(page.getByLabel('Melee username',{exact:true})).toBeVisible()
 expect(linked).toBe(false)
})

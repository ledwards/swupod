import {test,expect} from '@playwright/test';
test('Melee steps explain trophies, recover verification errors, persist connection and disconnect immediately',async({page},info)=>{
 test.setTimeout(60000);
 await page.route('**/api/session',r=>r.fulfill({status:401,json:{}}));
 await page.route('**/api/entitlements',r=>r.fulfill({json:{beta:true,canCustomize:true}}));
 await page.route('**/api/lobby',r=>r.fulfill({json:{activity:{activeGames:0,queuedPlayers:0},user:{name:'example',lifetimeElo:1500,seasonElo:1500,season:'Launch'},loginUrl:'/login',capabilities:{queue:true,private:true,ai:true},games:[],queue:null,active:null,history:[]}}));
 await page.route('**/api/lobby/shared',r=>r.fulfill({json:{signedIn:true,enabled:true,sets:[],pools:[],queues:[],pods:[],active:null,queue:null}}));
 let linked=false,failCheck=true,verifyAttempts=0;
 await page.route('**/api/lobby/melee',r=>{
  const b=r.request().postDataJSON();
  if(!b){if(failCheck){return r.fulfill({status:503,json:{error:{message:'Connection unavailable. Try again.'}}});}return r.fulfill({json:{link:linked?{handle:'example',verified_at:new Date().toISOString()}:null}});}
  if(b.action==='begin')return r.fulfill({json:{handle:'example',marker:'example',challengeId:'test',expiresAt:new Date(Date.now()+900000).toISOString()}});
  if(b.action==='verify'&&verifyAttempts++===0)return r.fulfill({status:409,json:{error:{message:'The code is not in your public Melee Bio yet. Save it on Melee, then try again.'}}});
  linked=b.action==='verify';if(linked)return r.fulfill({status:503,json:{error:{message:'Verification response interrupted.'}}});return r.fulfill({json:{link:linked?{handle:'example',verified_at:new Date().toISOString()}:null}});
 });
 await page.goto('/?settings=account');await expect(page.getByRole('button',{name:'Retry connection check'})).toBeVisible();failCheck=false;await page.getByRole('button',{name:'Retry connection check'}).click();
 await expect(page.getByText('Trophy Mats unlock when',{exact:false})).toHaveCount(0);
 await page.getByRole('button',{name:'Connect Melee',exact:true}).click();await expect(page.getByText('we never ask for your Melee password.',{exact:false})).toBeVisible();await page.getByLabel('Melee username').fill('example');await page.getByRole('button',{name:'Continue',exact:true}).click();
 await expect(page.getByText('Keep your existing Bio text',{exact:false})).toBeVisible();
 await expect(page.getByRole('button',{name:'Copy username'})).toBeVisible();
 await expect(page.getByRole('link',{name:'Open Melee settings'})).toHaveAttribute('href','https://melee.gg/Profile/Settings');
 await expect(page.getByRole('status')).toContainText('Waiting for your Discord username');
 await expect(page.getByText('Connected as',{exact:false})).toBeVisible({timeout:35000});
 expect(verifyAttempts).toBe(2);
 await expect(page.getByRole('link',{name:'Trophy Mats',exact:true})).toHaveAttribute('href','/themes?section=playmats&collection=trophy');await page.reload();await expect(page.getByText('Connected as',{exact:false})).toBeVisible();
 await page.context().route('https://melee.gg/Profile/Index/example',r=>r.fulfill({contentType:'text/html',body:'<h1>Melee profile</h1>'}));
 const profileOpened=page.waitForEvent('popup');
 await page.getByRole('link',{name:'example',exact:true}).click();
 const profile=await profileOpened;await expect(profile).toHaveURL('https://melee.gg/Profile/Index/example');
 await expect(page).toHaveURL(/\/\?settings=account$/);await profile.close();
 await page.screenshot({path:`artifacts/melee-connected-${info.project.name}.png`,fullPage:true});
 await expect(page.getByRole('button',{name:'Erase connection data'})).toHaveCount(0);
 await page.getByRole('button',{name:'Disconnect',exact:true}).click();await expect(page.getByRole('button',{name:'Connect Melee',exact:true})).toBeVisible();expect(linked).toBe(false);
 let logoutAttempts=0;
 await page.route('**/api/lobby/logout',r=>{
  expect(r.request().method()).toBe('POST');
  return ++logoutAttempts===1?r.fulfill({status:503,json:{error:{message:'Unable to log out. Try again.'}}}):r.fulfill({json:{ok:true}});
 });
 const logout=page.locator('.settings-discord').getByRole('button',{name:'Log out',exact:true});
 await logout.click();await expect(page.getByRole('alert')).toContainText('Unable to log out. Try again.');await expect(logout).toBeEnabled();
 await logout.click();await expect(page).toHaveURL(/\/$/);expect(logoutAttempts).toBe(2);
});

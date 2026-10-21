import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
// The split leader/base banner on Play's "Your deck" panel: the art must show whenever the browser has it,
// whatever order the image finished loading and React attached its listeners in, and a failed load must
// recover through the backup copy rather than leaving a blank panel with only the seam.
const now=Date.now();
const premier={format:'premier',limited:'six',set:'',pool:'current',policy:'p1'};
const hmwSealed={format:'limited',limited:'six',set:'HMW',pool:'current',policy:'p1'};
const shared={currentPolicy:'p1',signedIn:true,enabled:true,ptpOrigin:'https://www.protectthepod.com',playOrigin:'https://play.protectthepod.com',sets:[{code:'HMW',name:'Homeworlds'}],pools:[{id:'current',name:'Current'}],
 queues:[{key:'premier',contract:premier,label:'Premier',waiting:3},{key:'hmw',contract:hmwSealed,label:'HMW Sealed',waiting:2}],pods:[],active:null,queue:null};
// Lee's HMW Sealed deck: a leader name and a base name, no ids, as PTP's library sends them.
const warrior={poolShareId:'pool-warrior',poolRootShareId:'pool-warrior',name:'Warrior Tusken 30',leaderName:'The Warrior',baseName:'Tusken Camp',setCode:'HMW',poolType:'sealed',packCount:6,ready:true,mainDeckCount:30,updatedAt:new Date(now-3600000).toISOString()};
const tarkin={...warrior,poolShareId:'pool-tarkin',poolRootShareId:'pool-tarkin',name:'Tarkin Blue 30',leaderName:'Grand Moff Tarkin',baseName:'Dune Sea Outpost',updatedAt:new Date(now-7200000).toISOString()};
const lobby={activity:{activeGames:0,queuedPlayers:5},user:{name:'terronk',lifetimeElo:1532,seasonElo:1510,season:'Launch'},loginUrl:'/login',capabilities:{queue:true,private:true,ai:true},games:[],queue:null,active:null,history:[]};
const fixtures=resolve(import.meta.dirname,'fixtures/deck-art');
const warriorLeader='card_09020290_EN_The_Warrior_Leader_b1d62fe09f.png',tuskenBase='card_09020298_EN_Tusken_Camp_Base_b10c8084c9.png';
/** Serve the two official card scans and their Karabast copies from disk, so the tests never depend on the CDNs. */
async function serveArt(page:Page,{official=true,backup=true}:{official?:boolean;backup?:boolean}={}){
 await page.route('**/cdn.starwarsunlimited.com/**',r=>{const file=r.request().url().split('/').pop()!;return official&&[warriorLeader,tuskenBase].includes(file)?r.fulfill({contentType:'image/png',body:readFileSync(resolve(fixtures,file))}):r.abort();});
 await page.route('**/karabast-data.s3.amazonaws.com/**',r=>{const m=/HMW\/en\/standard\/large\/(018|026)\.webp$/.exec(r.request().url());return backup&&m?r.fulfill({contentType:'image/webp',body:readFileSync(resolve(fixtures,`${m[1]}.webp`))}):r.abort();});
}
async function mock(page:Page){
 await page.route('**/api/session',r=>r.fulfill({status:401,json:{error:{code:'session_required'}}}));
 await page.route('**/api/lobby',r=>r.fulfill({json:lobby}));
 await page.route('**/api/lobby/decks/played',r=>r.fulfill({json:{decks:[]}}));
 await page.route('**/api/lobby/shared',async r=>{
  if(r.request().method()==='GET')return r.fulfill({json:shared});
  const body=r.request().postDataJSON();
  if(body.action==='decks'||body.action==='library')return r.fulfill({json:{decks:[warrior,tarkin]}});
  if(body.action==='validate')return r.fulfill({json:{valid:true,deck:body.deck,names:{}}});
  return r.fulfill({json:{queued:true}});
 });
}
const openSealed=async(page:Page)=>{await page.goto('/');await page.getByRole('region',{name:'Lobbies'}).getByRole('button',{name:'Join HMW Sealed 6-pack queue, 2 waiting'}).click();const modal=page.getByRole('region',{name:'Play',exact:true});await expect(modal.locator('.ph-deck-main')).toContainText('The Warrior');return modal;};
/** Both halves painted: decoded pixels, a visible box, and the leader on the left of the base. */
async function expectPainted(page:Page,art:ReturnType<Page['locator']>){
 const images=art.locator('img');await expect(images).toHaveCount(2);
 for(const img of [images.first(),images.last()]){
  await expect.poll(()=>img.evaluate(e=>(e as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(img).toHaveCSS('visibility','visible');
  await img.evaluate(e=>(e as HTMLImageElement).decode());
  const box=(await img.boundingBox())!;expect(box.width).toBeGreaterThan(0);expect(box.height).toBeGreaterThan(0);
 }
 const [leader,base]=await Promise.all([art.locator('.ph-deck-art-leader').boundingBox(),art.locator('.ph-deck-art-base').boundingBox()]);expect(leader!.x).toBeLessThan(base!.x);
}

test('the Warrior / Tusken Camp Sealed deck paints both halves of the banner, and the panel loads eagerly',async({page},info)=>{
 await mock(page);await serveArt(page);
 const modal=await openSealed(page);
 const art=modal.locator('.ph-deck-main>.ph-deck-art');
 await expectPainted(page,art);
 // The panel sits above the fold: its scans are requested at once, not deferred until the browser scrolls near them.
 for(const img of await art.locator('img').all())expect(await img.getAttribute('loading')).not.toBe('lazy');
 await page.screenshot({path:`artifacts/play-home-tests/deck-art-after-${info.project.name}.png`});
});

test('art that finished loading before React listened is still shown',async({page},info)=>{
 await mock(page);await serveArt(page);
 // The browser already holds the scans (a warm cache, or a prerendered shell that fetched them) and reports them
 // complete before any load listener is attached: hold every load listener back until well after the image settles.
 await page.addInitScript(()=>{
  const add=HTMLImageElement.prototype.addEventListener;
  HTMLImageElement.prototype.addEventListener=function(this:HTMLImageElement,type:string,...rest:unknown[]){if(type==='load'||type==='error')setTimeout(()=>add.call(this,type,...rest),400);else add.call(this,type,...rest);} as typeof add;
 });
 const modal=await openSealed(page);
 await page.waitForTimeout(600);
 await expectPainted(page,modal.locator('.ph-deck-main>.ph-deck-art'));
 await page.screenshot({path:`artifacts/play-home-tests/deck-art-preloaded-${info.project.name}.png`});
});

test('a scan that fails once shows from its backup copy, and the deck tile below matches',async({page},info)=>{
 await mock(page);await serveArt(page,{official:false});
 const modal=await openSealed(page);
 const art=modal.locator('.ph-deck-main>.ph-deck-art');
 await expectPainted(page,art);
 for(const img of await art.locator('img').all())expect(await img.getAttribute('src')).toMatch(/karabast-data/);
 await expectPainted(page,modal.locator('.ph-deck-tiles .ph-deck-row').first().locator('.ph-deck-art'));
 await page.screenshot({path:`artifacts/play-home-tests/deck-art-backup-${info.project.name}.png`});
});

test('with both copies unreachable the banner shows no broken image, and comes back once the network does',async({page},info)=>{
 await mock(page);
 // A stalled network while the page is still loading: every image request dies, official and backup alike.
 let network=false;
 await page.route('**/cdn.starwarsunlimited.com/**',r=>{const file=r.request().url().split('/').pop()!;return network&&[warriorLeader,tuskenBase].includes(file)?r.fulfill({contentType:'image/png',body:readFileSync(resolve(fixtures,file))}):r.abort('failed');});
 await page.route('**/karabast-data.s3.amazonaws.com/**',r=>r.abort('failed'));
 const modal=await openSealed(page);
 const art=modal.locator('.ph-deck-main>.ph-deck-art');
 const images=art.locator('img');await expect(images).toHaveCount(2);
 await expect(images.first()).toHaveCSS('visibility','hidden');await expect(images.last()).toHaveCSS('visibility','hidden');
 await page.screenshot({path:`artifacts/play-home-tests/deck-art-offline-${info.project.name}.png`});
 // The network returns: the banner fetches its art afresh instead of keeping the stale failure until the next reload.
 network=true;await page.evaluate(()=>dispatchEvent(new Event('online')));
 await expectPainted(page,art);
});

test('a banner whose load failed comes back by itself once the scans load again, with no online or tab event',async({page})=>{
 await mock(page);
 // Both copies fail during page load, then the network quietly recovers: the browser never goes offline and the
 // player never leaves the tab, so neither 'online' nor 'visibilitychange' fires. The tiles beside it show the art.
 let network=false;
 await page.route('**/cdn.starwarsunlimited.com/**',r=>{const file=r.request().url().split('/').pop()!;return network&&[warriorLeader,tuskenBase].includes(file)?r.fulfill({contentType:'image/png',body:readFileSync(resolve(fixtures,file))}):r.abort('failed');});
 await page.route('**/karabast-data.s3.amazonaws.com/**',r=>r.abort('failed'));
 const modal=await openSealed(page);
 const art=modal.locator('.ph-deck-main>.ph-deck-art');
 await expect(art.locator('img').first()).toHaveCSS('visibility','hidden');
 network=true;
 await expectPainted(page,art);
});

test('the Wayfinder extension leaves the banner art alone, so both halves stay painted',async({page},info)=>{
 await mock(page);await serveArt(page);
 const modal=await openSealed(page);
 const art=modal.locator('.ph-deck-main>.ph-deck-art');
 await expect(art.locator('img')).toHaveCount(2);
 // What the extension's card-stats overlay does to a card image it badges: its parent becomes the badge host and is
 // forced to position:relative. Hosts inside [data-wf-no-card-stats] are skipped. A forced host collapses a half to 0x0.
 await page.evaluate(()=>{
  const style=document.createElement('style');style.textContent='.wf-ptp-card-stat-host{position:relative !important}';document.head.append(style);
  for(const img of document.querySelectorAll('.ph-deck-main>.ph-deck-art img')){if(img.closest('[data-wf-no-card-stats]'))continue;img.parentElement!.classList.add('wf-ptp-card-stat-host');}
 });
 await expectPainted(page,art);
 for(const half of await art.locator('span').all()){const box=(await half.boundingBox())!;expect(box.width).toBeGreaterThan(100);expect(box.height).toBeGreaterThan(100);}
 await page.screenshot({path:`artifacts/play-home-tests/deck-art-wayfinder-${info.project.name}.png`});
});

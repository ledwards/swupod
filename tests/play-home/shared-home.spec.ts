import {test,expect,type Page} from '@playwright/test';
import {resolve} from 'node:path';
// The play homepage, Play setup, My Decks and History, driven only through the UI.
const now=Date.now(),day=86400000;
const premier={format:'premier',limited:'six',set:'',pool:'current',policy:'p1'};
const hmwSealed={format:'limited',limited:'six',set:'HMW',pool:'current',policy:'p1'};
const shared={currentPolicy:'p1',signedIn:true,enabled:true,ptpOrigin:'https://www.protectthepod.com',playOrigin:'https://play.protectthepod.com',sets:[{code:'HMW',name:'Homeworlds'},{code:'ASH',name:'Ashes of the Empire'}],pools:[{id:'current',name:'Current'}],
 queues:[{key:'premier',contract:premier,label:'Premier',waiting:3},{key:'hmw',contract:hmwSealed,label:'HMW Sealed',waiting:2}],pods:[{id:'pod-1',name:'Friday draft',set:'HMW',players:5,capacity:8}],active:null,queue:null};
const limitedDecks=[{poolShareId:'pool-hmw',poolRootShareId:'pool-hmw',name:'Tarkin Blue 30',leaderName:'Grand Moff Tarkin',setCode:'HMW',poolType:'sealed',packCount:6,ready:true,mainDeckCount:30,updatedAt:new Date(now-3600000).toISOString()},{poolShareId:'pool-hmw-b2',poolRootShareId:'pool-hmw',name:'Chewie Green 30',setCode:'HMW',poolType:'sealed',packCount:6,ready:true,mainDeckCount:30,updatedAt:new Date(now-2*day).toISOString()},{poolShareId:'pool-law',poolRootShareId:'pool-law',name:'Luke Red',setCode:'LAW',poolType:'sealed',packCount:8,ready:false,blocker:'Add 3 more cards.',mainDeckCount:27,updatedAt:new Date(now-9*day).toISOString()}];
const limitedPools=[{poolShareId:'pool-hmw',name:'Friday sealed',setCode:'HMW',setName:'Homeworlds',poolType:'sealed',packCount:6,createdAt:new Date(now-2*day).toISOString(),decks:limitedDecks.slice(0,2)},{poolShareId:'pool-law',name:null,setCode:'LAW',setName:'A Lawless Time',poolType:'sealed',packCount:8,createdAt:new Date(now-9*day).toISOString(),decks:[limitedDecks[2]]}];
const exp=(leader:string,base:string)=>({leader:{id:leader,count:1},base:{id:base,count:1},deck:[{id:'SOR_040',count:3}],sideboard:[]});
const played=[
 {key:'k-tarkin',format:'premier',leader:'HMW_004',base:'HMW_019',mainCount:50,sideboardCount:6,lastPlayedAt:now-3600000,games:5,wins:4,losses:1,draws:0,source:'swuforge',sourceUrl:'https://swuforge.com/decks/tarkin',name:'Tarkin Blue',export:exp('HMW_004','HMW_019')},
 {key:'k-vader',format:'premier',leader:'LAW_010',base:'LAW_020',mainCount:50,sideboardCount:4,lastPlayedAt:now-3*day,games:3,wins:1,losses:2,draws:0,source:'json',sourceUrl:null,name:null,export:exp('LAW_010','LAW_020')},
 {key:'k-tarkin-old',format:'premier',leader:'HMW_004',base:'HMW_019',mainCount:50,sideboardCount:8,lastPlayedAt:now-6*day,games:3,wins:2,losses:1,draws:0,source:'swuforge',sourceUrl:'https://swuforge.com/decks/tarkin-v1',name:null,export:exp('HMW_004','HMW_019')},
];
const history=[
 {id:'g1',players:['terronk','bigbantha'],seat:0,leaders:['HMW_004','LAW_018'],bases:['HMW_019','HMW_020'],createdAt:now-2*3600000,completedAt:now-2*3600000+34*60000,format:'Limited',status:'complete',result:'Win',globalMatchup:{key:'hmw-six-tarkin-lando',wins:58,losses:42,draws:2},mode:'queue',poolShareId:'pool-hmw',contract:{format:'limited',limited:'six',set:'HMW',pool:'current'},replayUrl:'/api/lobby/matches/g1/replay',recordingUrl:'/api/lobby/matches/g1/recording'},
 {id:'g2',players:['terronk','moonmoon'],seat:0,leaders:['HMW_004','SOR_014'],bases:['HMW_019','SOR_029'],createdAt:now-3600000,completedAt:now-3600000+22*60000,format:'Premier',status:'complete',result:'Loss',globalMatchup:{key:'premier-tarkin-sabine',wins:52,losses:48,draws:0},mode:'queue',contract:premier,replayUrl:'/api/lobby/matches/g2/replay'},
 {id:'g3',players:['terronk','porgfan'],seat:1,leaders:['SOR_016','LAW_010'],bases:['SOR_029','LAW_020'],createdAt:now-8*day,completedAt:now-8*day+40*60000,format:'Limited',status:'complete',result:'Win',mode:'private',poolShareId:'pool-ash',contract:{format:'limited',limited:'draft',set:'ASH',pool:'next'},replayUrl:'/api/lobby/matches/g3/replay'},
];
// A fuller run makes the matchup table reviewable in tests and the local preview.
const extraMatchups=[
 ['HMW_005','HMW_022','Win',45],['HMW_005','HMW_022','Win',45],['HMW_005','HMW_022','Loss',45],
 ['HMW_010','HMW_025','Loss',54],['HMW_010','HMW_025','Loss',54],
 ['HMW_014','HMW_029','Win',50],['HMW_014','HMW_029','Loss',50],
].map(([leader,base,result,rate],i)=>({...history[0],id:`sample-${i}`,players:['terronk',`Opponent ${i+1}`],leaders:['HMW_004',String(leader)],bases:['HMW_019',String(base)],result:String(result),createdAt:now-(i+3)*3600000,completedAt:now-(i+3)*3600000+25*60000,globalMatchup:{key:`${leader}-${base}`,wins:Number(rate)*10,losses:(100-Number(rate))*10,draws:0},recordingUrl:undefined}));
const lobby={activity:{activeGames:2,queuedPlayers:5},user:{name:'terronk',lifetimeElo:1532,seasonElo:1510,season:'Launch'},loginUrl:'/login',capabilities:{queue:true,private:true,ai:true},games:[{id:'live1',players:['kesselrun','mandoz'],createdAt:now,format:'Premier',status:'in_progress',url:'/spectate/live1/'}],queue:null,active:null,history};

for(const [i,game] of [...history,...extraMatchups].entries())Object.assign(game,{turns:6+i%4});
const personalCardFixture={games:8,decided:8,draws:0,replays:8,handGames:8,scope:'exact-main-deck',cards:[40,41,42,44,50,55,60,65,70,75].map((n,i)=>({id:'HMW_'+String(n).padStart(3,'0'),main:3,gp:{wins:12,count:24},oh:{wins:2,count:4+i%2},gd:{wins:2,count:3+i%3},gih:{wins:4,count:7+i%2+i%3},gns:{wins:8,count:17-i%2-i%3},pr:{wins:3,count:7+i%2+i%3},rws:{wins:2,count:7+i%2+i%3},played:{wins:3,count:4},unplayed:{wins:1,count:4},playedCopies:{wins:5,count:8},resourcedCopies:{wins:2,count:5},activations:{total:3,games:8},discards:{total:1,games:8}})),gameMetrics:{winTurns:{total:28,games:4},lossTurns:{total:32,games:4},winResources:{total:32,games:4},winHealth:{total:44,games:4},first:{wins:3,count:4},second:{wins:1,count:4},rounds:[1,2,3,4,5,6].map(turn=>({turn,played:{total:12,games:8},spent:{total:0,games:0},left:{total:4,games:8},hand:{total:24,games:8},damageDealt:{total:16,games:8},damageTaken:{total:20,games:8}}))}};
async function mock(page:Page,posts:Record<string,unknown>[]=[],state:Record<string,unknown>={}){
 await page.route('**/api/session',r=>r.fulfill({status:401,json:{error:{code:'session_required'}}}));
 await page.route('**/api/lobby',r=>r.fulfill({json:lobby}));
 await page.route('**/api/lobby/decks/played',r=>r.fulfill({json:{decks:played}}));
 await page.route('**/api/lobby/import-url',r=>r.fulfill({json:{deck:{...exp('HMW_004','HMW_019'),metadata:{name:'From SWUForge'}},source:'swuforge',url:'https://swuforge.com/decks/x'}}));
 await page.route('**/api.swuapi.com/**',r=>{const u=new URL(r.request().url());r.fulfill({json:{nickname:u.searchParams.get('leader_card_uuid')?.startsWith('01a0ad23')?'Tarkin (HMW) Blue 30 (Premier)':'Vader Red 30 (Premier)'}});});
 await page.route('**/api/lobby/shared',async r=>{
  if(r.request().method()==='GET')return r.fulfill({json:{...shared,...state}});
  const body=r.request().postDataJSON();posts.push(body);
  if(body.action==='decks')return r.fulfill({json:{decks:limitedDecks,...(body.byPool?{pools:limitedPools}:{})}});
  // Vader's list uses rotated cards: fine in Eternal, not in Premier.
  if(body.action==='validate'){const vader=body.deck?.leader?.id==='LAW_010';return vader&&body.contract.format==='premier'?r.fulfill({status:409,json:{error:'3 cards are not legal in Premier: Overwhelming Barrage, Vanquish, Force Choke.'}}):r.fulfill({json:{valid:true,deck:{...body.deck,deck:[{id:'SOR_040',count:50}],sideboard:[{id:'SOR_041',count:vader?4:6}]},names:{}}});}
  return r.fulfill({json:{queued:true}});
 });
}
const noSideScroll=(page:Page)=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);

test('homepage: Draft, Sealed and a Play tile; Now Playing filters; utilities',async({page},info)=>{
 await mock(page);await page.goto('/');
 await expect(page.getByRole('link',{name:/^Draft/})).toHaveAttribute('href',/\/draft$/);await expect(page.getByRole('link',{name:/^Sealed/})).toHaveAttribute('href',/\/sealed$/);
 await expect(page.getByRole('button',{name:'Play',exact:true}).last()).toBeVisible();
 await expect(page.locator('.ph-tile').nth(2)).toContainText('Play Limited or Constructed against bots or humans');
 await page.getByRole('button',{name:'Play',exact:true}).last().click();const play=page.getByRole('region',{name:'Play',exact:true});await expect(play).toBeVisible();
 await play.locator('.ph-format-drawer .ph-drawer-handle').click();await play.getByRole('group',{name:'Format'}).getByRole('button',{name:'Eternal',exact:true}).click();await expect(play.locator('.ph-format-drawer .ph-drawer-handle')).toHaveAccessibleName('Eternal, change format');await page.getByRole('link',{name:'Protect the Pod home',exact:true}).click();
 // Now Playing always shows: the pod and live game above the five primary queues, newest set first.
 const now=page.getByRole('region',{name:'Now Playing'});await expect(now).toBeVisible();
 await expect(page.locator('.ph-home-status')).toHaveClass(/\bis-none\b/);await expect(page.locator('.ph-home-status')).toHaveClass(/\bis-busy\b/);
 const rowWidth=async()=>page.locator('.ph-home-status').evaluate(e=>e.getBoundingClientRect().width);
 expect(Math.abs(await now.evaluate(e=>e.getBoundingClientRect().width)-await rowWidth())).toBeLessThan(2);// no resume: the lobbies take the whole row
 const pod=now.locator('.ph-activity-row',{hasText:'Friday draft'});await expect(pod).toContainText('5/8 seats');await expect(pod.getByRole('link',{name:'Join pod'})).toHaveAttribute('href','https://www.protectthepod.com/draft/pod-1');
 const game=now.locator('.ph-activity-row',{hasText:'kesselrun vs mandoz'});await expect(game.getByRole('link',{name:'Watch'})).toHaveAttribute('href','/spectate/live1/');
 const tiles=now.getByRole('group',{name:'Queues'}).getByRole('button');
 await expect(tiles).toHaveCount(5);
 await expect(tiles.locator('.ph-queue-name')).toHaveText(['Draft','Sealed 6-pack','Sealed 8-pack','Premier','Eternal']);
 const labels=['Join HMW Draft queue, 0 waiting','Join HMW Sealed 6-pack queue, 2 waiting','Join HMW Sealed 8-pack queue, 0 waiting','Join Premier queue, 3 waiting','Join Eternal queue, 0 waiting'];
 // Now Playing sits over faint card art, its heading the same small eyebrow as the resume box.
 await expect(now.locator('.ph-activity-art')).toHaveCSS('background-image',/expansion-art\/hmw/);
 await expect(now.locator('.ph-box-head h2')).toHaveCSS('font-size','11px');
 for(const [i,name] of labels.entries()){const tile=tiles.nth(i);await expect(tile).toHaveAccessibleName(name);await expect(tile.locator('.ph-queue-count')).toHaveText(name.match(/(\d+) waiting/)![1]);await expect(tile.locator('.ph-queue-join')).toBeVisible();await expect(tile.locator('.ph-queue-join')).toHaveText('Join');}
 await expect(tiles.nth(1)).toHaveClass(/is-waiting/);await expect(tiles.nth(0)).not.toHaveClass(/is-waiting/);
 // Phones drop the set label so the count and Join chip fit; desktop names the set.
 await expect(tiles.nth(0).locator('.ph-queue-set')).toHaveText('HMW');
 // Expanded, the same lobbies open in a dialog; Join on a tile closes it and opens Play on that queue.
 await now.getByRole('button',{name:'Expand Now Playing'}).click();const full=page.getByRole('dialog',{name:'Now Playing'});await expect(full).toBeVisible();
 await expect(full.getByRole('group',{name:'Queues'}).getByRole('button')).toHaveCount(5);await expect(full).toContainText('Friday draft');await expect(full).toContainText('kesselrun vs mandoz');
 await full.getByRole('button',{name:'Collapse Now Playing'}).click();await expect(full).toBeHidden();
 await tiles.nth(4).click();const eternal=page.getByRole('region',{name:'Play',exact:true});await expect(eternal.locator('.ph-format-drawer .ph-drawer-handle')).toHaveAccessibleName('Eternal, change format');
 await page.getByRole('link',{name:'Protect the Pod home',exact:true}).click();await expect(now).toBeVisible();
 for(const name of ['Meta','My Stats','History','More Formats'])await expect(page.locator('.ph-utils').getByRole('link',{name:new RegExp(name)})).toBeVisible();
 expect(await noSideScroll(page)).toBe(true);
 await page.waitForLoadState('networkidle',{timeout:5000}).catch(()=>{});await page.screenshot({path:`/tmp/ph-home-${info.project.name}.png`,fullPage:true});
});

test('Play setup: last 5 decks with quiet validation, format switch re-checks, opponent sets the button',async({page},info)=>{
 const posts:Record<string,unknown>[]=[];await mock(page,posts);
 // The same Vader list was also played in Eternal; each format tab keeps its own recent decks.
 await page.route('**/api/lobby/decks/played',r=>r.fulfill({json:{decks:[...played,{...played[1],key:'k-vader-eternal',format:'eternal',lastPlayedAt:now-4*day},{...played[0],key:'k-tarkin-eternal',format:'eternal',lastPlayedAt:now-5*day}]}}));
 await page.goto('/');
 await page.getByRole('button',{name:'Play',exact:true}).last().click();
 const modal=page.getByRole('region',{name:'Play',exact:true});await expect(modal).toBeVisible();
 await expect(modal.locator('.ph-deck-tiles .ph-deck-row')).toHaveCount(3);
 await expect(modal.locator('.ph-deck-main')).toContainText(/Tarkin.*Blue 30/);
 await expect(modal.locator('.ph-deck-main').getByRole('img',{name:'Valid',exact:true})).toBeVisible();
 await expect(modal.locator('.ph-deck-main')).toContainText('50 cards + 6 sideboard');
 await modal.locator('.ph-deck-row',{hasText:'Vader'}).click();
 await expect(modal.locator('.ph-deck-main')).toContainText('Not valid');
 await expect(modal.getByRole('alert').first()).toContainText('Overwhelming Barrage');
 await expect(modal.getByRole('button',{name:'Fix your deck to play'})).toBeDisabled();
 await modal.locator('.ph-format-drawer .ph-drawer-handle').click();await modal.getByRole('group',{name:'Format'}).getByRole('button',{name:'Eternal'}).click();
 // Eternal offers only its own decks: Vader's Eternal list, re-checked against Eternal and now valid.
 await expect(modal.locator('.ph-deck-main')).toContainText('Vader');
 await expect(modal.locator('.ph-deck-tiles .ph-deck-row')).toHaveCount(2);await expect(modal.locator('.ph-deck-tiles .ph-deck-row',{hasText:'Vader'})).toHaveCount(1);
 await expect(modal.locator('.ph-deck-main').getByRole('img',{name:'Valid',exact:true})).toBeVisible();
 expect(posts.some(p=>p.action==='validate'&&(p.contract as {format:string}).format==='eternal'&&(p.deck as {leader:{id:string}}).leader.id==='LAW_010')).toBe(true);
 await expect(modal.getByRole('button',{name:'Join matchmaking'})).toBeEnabled();
 await modal.getByRole('radio',{name:/vs AI/}).click();
 await expect(modal.getByRole('button',{name:'Play vs AI'})).toBeDisabled();await modal.getByRole('group',{name:'AI deck'}).getByRole('button',{name:/Tarkin/}).first().click();await expect(modal.getByRole('button',{name:'Play vs AI'})).toBeEnabled();
 await page.waitForLoadState('networkidle',{timeout:5000}).catch(()=>{});await page.screenshot({path:`/tmp/ph-modal-${info.project.name}.png`});
 await modal.getByRole('button',{name:'Play vs AI'}).click();await expect(modal).toBeHidden();
 await expect(page.getByRole('status')).toHaveText('Loading game…');
 await expect(page.locator('.ph-tiles')).toHaveCount(0);
 await page.waitForTimeout(1200);
 await expect(page.getByRole('status')).toHaveText('Loading game…');
 await expect(page).toHaveURL(/waiting=ai/);
 await page.route('**/ready-table',r=>r.fulfill({contentType:'text/html',body:'<main>Game table</main>'}));
 await page.route('**/api/lobby',r=>r.fulfill({json:{...lobby,active:{id:'ai-ready',status:'in_progress',mode:'ai',url:'/ready-table'}}}));
 await expect(page).toHaveURL(/ready-table/,{timeout:15000});
 await expect(page.getByText('Game table',{exact:true})).toBeVisible();
 const play=posts.find(p=>p.action==='play') as {mode:string;contract:{format:string};deckSource:{source:string};opponentDeck:{leader:{id:string}}};
 expect(play.mode).toBe('ai');expect(play.opponentDeck.leader.id).toBe('HMW_004');expect(play.contract.format).toBe('eternal');expect(play.deckSource.source).toBe('json');
});

// A real HMW draft deck (30 cards) and the rest of its pool (13), as the gateway exports them.
const draftList={"deck":[{"id":"HMW_089","count":1},{"id":"HMW_091","count":1},{"id":"HMW_143","count":1},{"id":"HMW_118","count":1},{"id":"HMW_102","count":1},{"id":"HMW_150","count":1},{"id":"HMW_136","count":2},{"id":"HMW_270","count":1},{"id":"HMW_117","count":1},{"id":"HMW_115","count":1},{"id":"HMW_272","count":1},{"id":"HMW_094","count":1},{"id":"HMW_093","count":1},{"id":"HMW_080","count":1},{"id":"HMW_099","count":1},{"id":"HMW_072","count":1},{"id":"HMW_084","count":1},{"id":"HMW_146","count":2},{"id":"HMW_081","count":1},{"id":"HMW_133","count":1},{"id":"HMW_132","count":1},{"id":"HMW_101","count":1},{"id":"HMW_100","count":1},{"id":"HMW_085","count":2},{"id":"HMW_097","count":1},{"id":"HMW_096","count":2}],"sideboard":[{"id":"HMW_083","count":1},{"id":"HMW_167","count":1},{"id":"HMW_220","count":1},{"id":"HMW_258","count":1},{"id":"HMW_172","count":1},{"id":"HMW_249","count":1},{"id":"HMW_110","count":1},{"id":"HMW_245","count":1},{"id":"HMW_207","count":1},{"id":"HMW_200","count":1},{"id":"HMW_251","count":1},{"id":"HMW_059","count":1},{"id":"HMW_253","count":1}]};
test('the deck eye opens the decklist: Deck / Entire Pool, Grid by default with counts, a two-column List, the full card on hover or tap',async({page},info)=>{
 await mock(page);
 await page.route('**/api/lobby/shared',r=>{const body=r.request().method()==='POST'?r.request().postDataJSON():null;return body?.action==='export'?r.fulfill({json:{deck:{leader:{id:'HMW_005',count:1},base:{id:'HMW_023',count:1},...draftList}}}):r.fallback();});
 await page.goto('/?pool=pool-hmw');
 const modal=page.getByRole('region',{name:'Play',exact:true});await expect(modal.locator('.ph-deck-main')).toContainText('Tarkin Blue 30');
 await modal.getByRole('button',{name:'View decklist'}).click();
 const list=page.getByRole('dialog',{name:'Decklist'});await expect(list).toBeVisible();
 await expect(list.getByRole('tab',{name:'Deck 30'})).toHaveAttribute('aria-selected','true');await expect(list.getByRole('tab',{name:'Entire Pool 43'})).toBeVisible();
 const views=list.getByRole('group',{name:'View'});
 await expect(views.getByRole('button',{name:'Grid'})).toHaveAttribute('aria-pressed','true');await expect(views.getByRole('button',{name:'List'})).toHaveAttribute('aria-pressed','false');
 // Grid: the leader and base first, then Units, Events, Upgrades, each counted; the type summary and curve agree.
 await expect(list.locator('.ph-dv-head > span:first-child')).toHaveText(['Leader & Base','Units','Events','Upgrades']);
 await expect(list.locator('.ph-dv-head > span:last-child')).toHaveText(['2','20','6','4']);
 await expect(list.locator('.ph-dv-types dd')).toHaveText(['20','6','4']);await expect(list.locator('.ph-dv-types dt')).toHaveText(['Units','Events','Upgrades']);
 await expect(list.getByRole('list',{name:/^Cost curve: 0 at 0, 1 at 1, 13 at 2, 5 at 3, 3 at 4, 2 at 5, 1 at 6, 5 at 7\+$/})).toBeVisible();
 const scout=list.getByRole('button',{name:/^2 × Remote Scout/});await expect(scout.locator('.ph-dv-badge')).toHaveText('×2');
 const badges=await list.locator('.ph-dv-badge').allTextContents();expect(badges.reduce((n,c)=>n+Number(c.slice(1)),0)).toBe(32);
 // Five cards to a row in the modal, three on a phone.
 const perRow=await list.locator('.ph-dv-group').nth(1).evaluate(g=>{const tops=[...g.querySelectorAll('.ph-dv-card')].map(c=>Math.round(c.getBoundingClientRect().top));return tops.filter(t=>t===tops[0]).length;});
 expect(perRow).toBe(info.project.name==='phone'?3:5);
 // A centred dialog with its own scroll, nothing clipped sideways.
 const box=await list.evaluate(e=>{const r=e.getBoundingClientRect(),b=e.querySelector('.ph-dv-body')!;return {w:r.width,h:r.height,left:r.left,right:innerWidth-r.right,vh:innerHeight,vw:innerWidth,side:b.scrollWidth>b.clientWidth};});
 expect(box.w).toBeLessThanOrEqual(760);expect(Math.abs(box.left-box.right)).toBeLessThan(2);expect(box.h).toBeLessThanOrEqual(box.vh*.9+1);expect(box.side).toBe(false);
 if(info.project.name==='phone')expect(box.w).toBeGreaterThan(box.vw-20);
 const previewOf=(name:string)=>page.getByRole('img',{name,exact:true});
 if(info.project.name==='phone'){await scout.tap();await expect(previewOf('Remote Scout')).toBeVisible();const top=(await list.boundingBox())!.y;await page.touchscreen.tap(195,top/2);await expect(previewOf('Remote Scout')).toHaveCount(0);await expect(list).toBeVisible();/* dismissing the card, even outside the dialog, leaves the list open */}
 else{await scout.hover();const card=previewOf('Remote Scout');await expect(card).toBeVisible();const r=await card.boundingBox();expect(r!.x).toBeGreaterThan(box.vw-box.right);await page.mouse.move(2,2);await expect(card).toHaveCount(0);}
 await page.screenshot({path:`/tmp/ph-deck-grid-${info.project.name}.png`});
 // List: Melee.gg's text decklist in two columns; the whole deck reads without scrolling on desktop.
 await views.getByRole('button',{name:'List'}).click();await expect(views.getByRole('button',{name:'List'})).toHaveAttribute('aria-pressed','true');
 await expect(list.locator('.ph-dv-list-head')).toHaveText(['Leader','Base','Units (20)','Events (6)','Upgrades (4)']);
 const line=list.locator('.ph-dv-list li',{hasText:'Remote Scout'});await expect(line.locator('.ph-dv-list-n')).toHaveText('2');
 const lines=await list.locator('.ph-dv-list-n').allTextContents();expect(lines.reduce((n,c)=>n+Number(c),0)).toBe(32);
 if(info.project.name!=='phone'){
  const fit=await list.evaluate(e=>{const b=e.querySelector('.ph-dv-body')!;const xs=new Set([...e.querySelectorAll('.ph-dv-list-group')].map(g=>Math.round(g.getBoundingClientRect().left)));return {scroll:b.scrollHeight>b.clientHeight+1,columns:xs.size};});
  expect(fit).toEqual({scroll:false,columns:2});
  await line.getByRole('button').hover();await expect(previewOf('Remote Scout')).toBeVisible();await page.mouse.move(2,2);await expect(previewOf('Remote Scout')).toHaveCount(0);
 }
 await page.screenshot({path:`/tmp/ph-deck-list-${info.project.name}.png`});
 // Entire Pool: the deck and the sideboard together, with the leader and base.
 await list.getByRole('tab',{name:'Entire Pool 43'}).click();await expect(list.getByRole('tab',{name:'Entire Pool 43'})).toHaveAttribute('aria-selected','true');
 await expect(list.locator('.ph-dv-list li',{hasText:'Emperor Palpatine'})).toBeVisible();await expect(list.locator('.ph-dv-list li',{hasText:'Leia Organa'})).toBeVisible();
 const pool=await list.locator('.ph-dv-list-n').allTextContents();expect(pool.reduce((n,c)=>n+Number(c),0)).toBe(45);
 await page.screenshot({path:`/tmp/ph-deck-pool-list-${info.project.name}.png`});
 await views.getByRole('button',{name:'Grid'}).click();await expect(list.locator('.ph-dv-card',{has:page.locator('img')}).first()).toBeVisible();
 await page.screenshot({path:`/tmp/ph-deck-pool-grid-${info.project.name}.png`});
 // The chosen view is remembered.
 await views.getByRole('button',{name:'List'}).click();
 expect(await page.evaluate(()=>localStorage.getItem('decklist-view'))).toBe('list');
 await list.getByRole('button',{name:'Close'}).click();await expect(list).toBeHidden();
 await modal.getByRole('button',{name:'View decklist'}).click();await expect(list.getByRole('group',{name:'View'}).getByRole('button',{name:'List'})).toHaveAttribute('aria-pressed','true');
 await list.getByRole('button',{name:'Close'}).click();await expect(list).toBeHidden();
});
const aiDecks=[{id:'baize-premier-luke',name:'Luke (JTL) DV',leader:'JTL_012',base:'JTL_024',formats:['premier','eternal']},{id:'baize-premier-cad',name:'Cad (ASH) Blue 30',leader:'ASH_011',base:'JTL_020',formats:['eternal']},{id:'baize-hmw-chewbacca',name:'Chewie (HMW) Red 30',leader:'HMW_009',base:'HMW_029',formats:['premier','eternal']},{id:'baize-hmw-tarkin',name:'Tarkin (HMW) Green 30',leader:'HMW_004',base:'SEC_022',formats:['premier','eternal']},{id:'baize-ash-luke',name:'Luke (ASH) Red 30',leader:'ASH_005',base:'ASH_024',formats:['premier','eternal']},{id:'baize-law-jabba',name:'Jabba (LAW) Great Pit of Carkoon',leader:'LAW_015',base:'LAW_023',formats:['premier','eternal']}];
test('vs AI: Leebo’s own decks lead, default to his strongest, and Sealed opens his own pool',async({page},info)=>{
 const posts:Record<string,unknown>[]=[];await mock(page,posts,{aiDecks});await page.goto('/');
 await page.getByRole('button',{name:'Play',exact:true}).last().click();
 const modal=page.getByRole('region',{name:'Play',exact:true});await expect(modal.locator('.ph-deck-main').getByRole('img',{name:'Valid',exact:true})).toBeVisible();
 await modal.getByRole('radio',{name:/vs AI/}).click();
 const leebo=modal.getByRole('group',{name:'AI deck'});
 await expect(leebo.getByRole('button',{name:'Luke (JTL) DV'})).toHaveAttribute('aria-pressed','true');
 await expect(leebo.getByRole('button',{name:'Cad (ASH) Blue 30'})).toHaveCount(0);
 await expect(leebo.getByRole('button',{name:'Mirror'})).toBeVisible();
 await expect(leebo.locator('.ph-deck-art').first()).toBeVisible();
 await leebo.getByRole('button',{name:'More'}).click();await expect(leebo.getByRole('button',{name:'Jabba (LAW) Great Pit of Carkoon'})).toBeVisible();
 await leebo.getByRole('button',{name:'Chewie (HMW) Red 30'}).click();
 await expect(modal.getByRole('button',{name:'Play vs AI'})).toBeEnabled();
 expect(await noSideScroll(page)).toBe(true);
 await page.waitForLoadState('networkidle',{timeout:5000}).catch(()=>{});await page.screenshot({path:`/tmp/ai-decks-shots/premier-${info.project.name}.png`,fullPage:true});
 await modal.getByRole('button',{name:'Play vs AI'}).click();await expect(modal).toBeHidden();
 await expect(page.getByRole('status')).toHaveText('Loading game…');
 await expect(page.locator('.ph-tiles')).toHaveCount(0);
 await page.waitForTimeout(1200);
 await expect(page.getByRole('status')).toHaveText('Loading game…');
 await expect(page).toHaveURL(/waiting=ai/);
 await page.route('**/ready-table',r=>r.fulfill({contentType:'text/html',body:'<main>Game table</main>'}));
 await page.route('**/api/lobby',r=>r.fulfill({json:{...lobby,active:{id:'ai-ready',status:'in_progress',mode:'ai',url:'/ready-table'}}}));
 await expect(page).toHaveURL(/ready-table/,{timeout:15000});
 await expect(page.getByText('Game table',{exact:true})).toBeVisible();
 const play=posts.find(p=>p.action==='play') as Record<string,unknown>;
 expect(play.opponentPreset).toBe('baize-hmw-chewbacca');expect(play.opponentDeck).toBeUndefined();expect(play.mode).toBe('ai');
 // Back to the lobby with no game in progress. Eternal adds the Eternal-only lists; Sealed offers Leebo's own pool.
 await page.route('**/api/lobby',r=>r.fulfill({json:lobby}));await page.goto('/');
 await page.getByRole('button',{name:'Play',exact:true}).last().click();
 await modal.locator('.ph-format-drawer .ph-drawer-handle').click();await modal.getByRole('group',{name:'Format'}).getByRole('button',{name:'Eternal'}).click();await modal.getByRole('radio',{name:/vs AI/}).click();
 await leebo.getByRole('button',{name:'More'}).click();await expect(leebo.getByRole('button',{name:'Cad (ASH) Blue 30'})).toBeVisible();
 await modal.locator('.ph-format-drawer .ph-drawer-handle').click();await modal.getByRole('group',{name:'Format'}).getByRole('button',{name:'Sealed 6'}).click();
 await expect(leebo.getByRole('button',{name:"Leebo's pool"})).toHaveAttribute('aria-pressed','true');
 await expect(modal.getByRole('button',{name:'Play vs AI'})).toBeEnabled();
 await page.waitForLoadState('networkidle',{timeout:5000}).catch(()=>{});await page.screenshot({path:`/tmp/ai-decks-shots/sealed-${info.project.name}.png`,fullPage:true});
 await modal.getByRole('button',{name:'Play vs AI'}).click();await expect(modal).toBeHidden();
 await expect(page.getByRole('status')).toHaveText('Loading game…');
 await expect(page.locator('.ph-tiles')).toHaveCount(0);
 await page.waitForTimeout(1200);
 await expect(page.getByRole('status')).toHaveText('Loading game…');
 await expect(page).toHaveURL(/waiting=ai/);
 await page.route('**/ready-table',r=>r.fulfill({contentType:'text/html',body:'<main>Game table</main>'}));
 await page.route('**/api/lobby',r=>r.fulfill({json:{...lobby,active:{id:'ai-ready',status:'in_progress',mode:'ai',url:'/ready-table'}}}));
 await expect(page).toHaveURL(/ready-table/,{timeout:15000});
 await expect(page.getByText('Game table',{exact:true})).toBeVisible();
 const sealed=posts.filter(p=>p.action==='play')[1] as Record<string,unknown>;
 expect(sealed.opponentPool).toBe('leebo');expect(sealed.poolShareId).toBe('pool-hmw');expect(sealed.opponentPreset).toBeUndefined();
});

test('Play setup: paste a SWUForge URL or JSON just under the deck; a successful import folds the form away',async({page})=>{
 await mock(page);await page.goto('/');await page.getByRole('button',{name:'Play',exact:true}).last().click();
 const modal=page.getByRole('region',{name:'Play',exact:true});
 const toggle=modal.getByRole('button',{name:'Import Deck'}),form=modal.locator('#ph-deck-imports');
 await toggle.click();await expect(toggle).toHaveAttribute('aria-expanded','true');await expect(form).toHaveAttribute('aria-hidden','false');
 await modal.getByLabel('SWUForge URL').fill('https://swuforge.com/decks/x');await modal.getByRole('button',{name:'Import',exact:true}).click();
 await expect(modal.locator('.ph-deck-main').getByRole('img',{name:'Valid',exact:true})).toBeVisible();
 await expect(modal.locator('.ph-deck-main')).toContainText('From SWUForge');
 // Imported: the form collapses; the same Import control opens it again.
 await expect(toggle).toHaveAttribute('aria-expanded','false');await expect(form).toHaveAttribute('aria-hidden','true');
 await toggle.click();await expect(form).toHaveAttribute('aria-hidden','false');
 // A failure keeps the form open with the error.
 await modal.getByLabel('Deck JSON').fill('{oops');await modal.getByRole('button',{name:'Use JSON',exact:true}).click();
 await expect(modal.getByRole('alert')).toContainText('not valid JSON');await expect(form).toHaveAttribute('aria-hidden','false');await expect(modal.getByLabel('Deck JSON')).toHaveValue('{oops');
 // Pasted JSON that reads collapses it too.
 await modal.getByLabel('Deck JSON').fill(JSON.stringify({...exp('HMW_004','HMW_019'),metadata:{name:'Pasted Tarkin'}}));await modal.getByRole('button',{name:'Use JSON',exact:true}).click();
 await expect(modal.locator('.ph-deck-main')).toContainText('Pasted Tarkin');await expect(form).toHaveAttribute('aria-hidden','true');await expect(modal.getByRole('alert')).toHaveCount(0);
});

const obiWan={leader:{id:'LOF_272',count:1},base:{id:'LOF_293',count:1},deck:[{id:'LOF_040',count:3}],sideboard:[],metadata:{name:'Obi-Wan Yellow - Copy'}};
test('an imported deck stays after a reload; an invalid one lists its problems and links to its SWUForge page',async({page})=>{
 await mock(page);
 await page.route('**/api/lobby/import-url',r=>r.fulfill({json:{deck:obiWan,source:'swuforge',url:'https://swuforge.com/decks/obi-copy'}}));
 await page.route('**/api/lobby/shared',r=>{const body=r.request().method()==='POST'?r.request().postDataJSON():null;
  return body?.action==='validate'&&body.deck?.leader?.id==='LOF_272'?r.fulfill({status:409,json:{error:'4 copies of Yoda (max 3 across the main deck and sideboard, including reprints).\nLuke Skywalker is not legal in Premier · Current.'}}):r.fallback();});
 await page.goto('/');await page.getByRole('button',{name:'Play',exact:true}).last().click();
 const modal=page.getByRole('region',{name:'Play',exact:true});
 await modal.getByRole('button',{name:'Import Deck'}).click();await modal.getByLabel('SWUForge URL').fill('https://swuforge.com/decks/obi-copy');await modal.getByRole('button',{name:'Import',exact:true}).click();
 await expect(modal.locator('.ph-deck-main')).toContainText('Obi-Wan Yellow - Copy');
 // Hyperspace printings read as their cards, never as raw IDs.
 await expect(modal.locator('.ph-deck-meta')).toHaveText('Obi-Wan Kenobi · Crystal Caves');await expect(modal.locator('.ph-deck-main')).not.toContainText('LOF_');
 // Every problem, one line each, and the CTA opens the deck on SWUForge in a new tab.
 const problems=modal.getByRole('alert',{name:'Deck problems'});
 await expect(problems.locator('li')).toHaveText(['4 copies of Yoda (max 3 across the main deck and sideboard, including reprints).','Luke Skywalker is not legal in Premier · Current.']);
 await expect(problems).toContainText('Not valid for Premier');
 const fix=modal.getByRole('link',{name:'Fix your deck on SWUForge'});
 await expect(fix).toHaveAttribute('href','https://swuforge.com/decks/obi-copy');await expect(fix).toHaveAttribute('target','_blank');await expect(fix).toHaveAttribute('rel',/noopener/);
 // Kept in this browser: after a reload it is still in the list, newest first, so it is the pick.
 await page.reload();
 await expect(modal.locator('.ph-deck-main')).toContainText('Obi-Wan Yellow - Copy');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('ph-imported-decks')??'[]').map((d:{name:string;url?:string})=>`${d.name} ${d.url}`))).toEqual(['Obi-Wan Yellow - Copy https://swuforge.com/decks/obi-copy']);
 // A valid deck keeps the usual CTA.
 const tarkin=modal.locator('.ph-deck-tiles').getByRole('button',{name:/Tarkin/}).first();if(!await tarkin.isVisible())await modal.locator('.ph-deck-tiles').getByRole('button',{name:'More'}).click();await tarkin.click();
 await expect(modal.getByRole('alert',{name:'Deck problems'})).toHaveCount(0);await expect(modal.getByRole('link',{name:/Fix your deck/})).toHaveCount(0);
});
test('Join queue on a Sealed queue opens Play setup with that pool’s decks',async({page},info)=>{
 await mock(page);await page.goto('/');
 await page.getByRole('region',{name:'Now Playing'}).getByRole('button',{name:'Join HMW Sealed 6-pack queue, 2 waiting'}).click();
 const modal=page.getByRole('region',{name:'Play',exact:true});
 await expect(modal.locator('.ph-format-drawer .ph-art-tile')).toHaveCount(1);await expect(modal.getByRole('group',{name:'Set'})).toHaveCount(0);
 await expect(modal.locator('.ph-deck-main').getByRole('img',{name:'Valid',exact:true})).toBeVisible();
 await expect(modal.getByRole('button',{name:'Join matchmaking'})).toBeEnabled();
 await page.waitForLoadState('networkidle',{timeout:5000}).catch(()=>{});await page.screenshot({path:`/tmp/ph-modal-sealed-${info.project.name}.png`});
});

test('My Decks: Premier and Eternal grouped by archetype with dates and source; Limited by set',async({page},info)=>{
 await mock(page);await page.goto('/decks');
 await expect(page.getByRole('heading',{name:'Decks and Pools'})).toBeVisible();
 const tarkin=page.locator('.ph-group',{hasText:/Tarkin.*Blue 30/});
 await expect(tarkin).toContainText('2 versions');await expect(tarkin).toContainText('6–2');
 await expect(tarkin.getByRole('link',{name:'View in SWUForge'}).first()).toHaveAttribute('href','https://swuforge.com/decks/tarkin');
 await page.locator('.ph-group',{hasText:'Vader'}).getByRole('button',{name:'View JSON'}).click();
 await expect(page.getByRole('dialog',{name:'Deck JSON'})).toContainText('LAW_010');
 await page.getByRole('button',{name:'Close'}).click();
 await page.waitForLoadState('networkidle',{timeout:5000}).catch(()=>{});await page.screenshot({path:`/tmp/ph-decks-${info.project.name}.png`,fullPage:true});
 await page.getByRole('tab',{name:'Limited'}).click();
 const pool=page.locator('.ph-group',{hasText:'Friday sealed'});
 await expect(pool.locator('.ph-version')).toHaveCount(2);await expect(pool).toContainText('Tarkin Blue 30');await expect(pool).toContainText('Chewie Green 30');await expect(pool).toContainText('6 packs');
 await page.waitForLoadState('networkidle',{timeout:5000}).catch(()=>{});await page.screenshot({path:`/tmp/ph-decks-limited-${info.project.name}.png`,fullPage:true});
 await expect(page.locator('.ph-version',{hasText:'Luke Red'}).getByRole('button',{name:'Join queue'})).toBeDisabled();
 await page.locator('.ph-version',{hasText:/Tarkin.*Blue 30/}).getByRole('button',{name:'Join queue'}).click();
 const sealedPlay=page.getByRole('region',{name:'Play',exact:true});await expect(sealedPlay.locator('.ph-format-drawer .ph-art-tile')).toHaveCount(1);await expect(sealedPlay.getByRole('group',{name:'Set'})).toHaveCount(0);
});

test('History: limited runs group their games; tags show format, and pool only when not current',async({page},info)=>{
 await mock(page);await page.goto('/history');
 await expect(page.getByRole('heading',{name:'History'})).toBeVisible();
 const run=page.locator('.ph-run').first();await expect(run).toContainText('Sealed');await expect(run).toContainText('HMW');await expect(run).toContainText('6 packs');
 await expect(page.locator('.ph-tag-pool')).toHaveCount(1);await expect(page.locator('.ph-tag-pool')).toHaveText('Pool: Next set');
 await run.locator(':scope > summary').getByRole('button',{name:'Details',exact:true}).click();
 await expect(run.getByRole('region',{name:'Matchup matrix'})).toBeHidden();
 await expect(run.locator('.ph-history-overview')).toContainText('6.0 turns (34 min)');
 const game=run.locator('.ph-history-item').first(),header=game.locator(':scope > summary');
 await expect(header.getByRole('link',{name:'▶ Play'})).toBeVisible();
 await expect(header.getByRole('button',{name:'⤓ Download'})).toBeVisible();
 await page.route('**/api/lobby/matches/*/recording',r=>r.fulfill({status:409}));
 await header.getByRole('button',{name:'⤓ Download'}).click();
 await expect(header.getByRole('status')).toHaveText('Building game log…');
 await expect(header.getByRole('button',{name:'⤓ Download'})).toBeDisabled();
 await expect(game).not.toHaveAttribute('open','');
 await header.getByRole('button',{name:'Details',exact:true}).click();
 await expect(header.getByRole('button',{name:'Hide details'})).toHaveAttribute('aria-expanded','true');
 await header.getByRole('button',{name:'Hide details'}).click();
 await expect(header.getByRole('button',{name:'Details',exact:true})).toHaveAttribute('aria-expanded','false');
 await expect(page.getByRole('link',{name:'▶ Play'}).first()).toHaveAttribute('href',/replay/);
 await expect(page.getByRole('button',{name:'⤓ Download'})).toHaveCount(1);
 await page.getByRole('group',{name:'Format'}).getByRole('button',{name:'Premier'}).click();await expect(page.locator('.ph-run')).toHaveCount(0);
 expect(await noSideScroll(page)).toBe(true);
 await page.getByRole('group',{name:'Format'}).getByRole('button',{name:'All'}).click();
 await page.waitForLoadState('networkidle',{timeout:3000}).catch(()=>{});await page.screenshot({path:`/tmp/ph-history-${info.project.name}.png`,fullPage:true});
});

test('PTP Ready to Play lands on Play setup with that deck chosen',async({page})=>{
 await mock(page);await page.goto('/?pool=pool-hmw-b2');
 const modal=page.getByRole('region',{name:'Play',exact:true});
 await expect(modal.locator('.ph-format-drawer .ph-art-tile')).toHaveCount(1);await expect(modal.getByRole('group',{name:'Set'})).toHaveCount(0);
 await expect(modal.locator('.ph-deck-main')).toContainText('Chewie Green 30');
 // Play keeps its own address, with the chosen pool, so a reload or share lands on the same deck.
 await expect(page).toHaveURL(/\/play\?format=sealed&set=HMW&pool=pool-hmw-b2$/);
});

// Carried over from codex/shared-ptp-session: account, rejoin, stats and themes still behave the same in the new shell.
test.describe('account, rejoin, stats and themes',()=>{
const accountContract={format:'limited',limited:'six',set:'ASH',pool:'current'};
const accountShared={signedIn:true,enabled:true,ptpOrigin:'https://www.protectthepod.com',playOrigin:'https://play.protectthepod.com',sets:[{code:'ASH',name:'Ashes'},{code:'SOR',name:'Spark'}],pools:[{id:'current',name:'Current'}],queues:[],pods:[{id:'pod',name:'Friday draft',set:'ASH',players:5,capacity:8}],active:null,queue:null};
const accountDecks=[{poolShareId:'six',name:'Six-pack deck',setCode:'ASH',poolType:'sealed',packCount:6,ready:true},{poolShareId:'eight',name:'Eight-pack deck',setCode:'ASH',poolType:'sealed',packCount:8,ready:true}];
test.beforeEach(async({page})=>{
 await page.route('**/api/session',r=>r.fulfill({status:401,json:{error:{code:'session_required'}}}));
 await page.route('**/api/entitlements',r=>r.fulfill({json:{beta:true,canCustomize:true}}));
 await page.route('**/api/lobby',r=>r.fulfill({json:{activity:{activeGames:0,queuedPlayers:0},user:{name:'terronk',lifetimeElo:1500,seasonElo:1500,season:'Launch'},loginUrl:'/login',capabilities:{queue:true,private:true,ai:true},games:[],queue:null,active:null,history:[{id:'game',players:['terronk','Leebo'],leaders:['LAW_018','LAW_018'],bases:['HMW_020','HMW_020'],createdAt:Date.now(),format:'Premier',status:'complete',result:'Loss',replayUrl:'/replay/test'}]}}));
 await page.route('**/api/lobby/shared',r=>r.fulfill({json:r.request().method()==='POST'?{decks:accountDecks}:accountShared}));
});
test('Account contains Melee verification and gameplay uses compact selected controls',async({page},info)=>{
 await page.route('**/api/lobby/melee',r=>{const body=r.request().postDataJSON();if(body?.action==='verify')return r.fulfill({status:400,json:{error:{message:'The code is not in your public Melee Bio yet.'}}});return r.fulfill({json:body?.action==='begin'?{handle:'example',marker:'terronk',challengeId:'test',expiresAt:new Date(Date.now()+900000).toISOString()}:{link:null}})});
 await page.goto('/');await page.getByRole('button',{name:'Settings',exact:true}).click();
 await expect(page.getByRole('button',{name:'Connect Melee',exact:true})).toBeVisible();
 expect((await page.getByRole('dialog',{name:'Settings',exact:true}).boundingBox())!.height).toBeLessThan(700);
 await page.screenshot({path:`/tmp/polish-settings-${info.project.name}.png`});
 await page.getByRole('button',{name:'Connect Melee',exact:true}).click();await page.getByLabel('Melee username').fill('example');await page.getByRole('button',{name:'Continue',exact:true}).click();await expect(page.getByRole('button',{name:'Copy username',exact:true})).toBeVisible();
 await page.screenshot({path:`/tmp/polish-melee-${info.project.name}.png`});
 await page.getByRole('tab',{name:'Gameplay',exact:true}).click();
 const selected=page.getByRole('group',{name:'Animations',exact:true}).getByRole('button',{name:'On',exact:true});await expect(selected).toHaveAttribute('aria-pressed','true');expect((await selected.boundingBox())!.height).toBeLessThan(50);
 await page.screenshot({path:`/tmp/polish-gameplay-${info.project.name}.png`});
});
test('an existing game offers rejoin without automatically leaving the lobby',async({page},info)=>{
 let launchCalls=0;const active={id:'running',status:'in_progress',format:'Premier',contract:accountContract,mode:'queue',players:['terronk','Leebo'],seat:0,createdAt:Date.now(),url:'/api/lobby/matches/running/launch'};
 await page.route('**/api/lobby',r=>r.fulfill({json:{activity:{activeGames:1,queuedPlayers:0},user:{name:'terronk',season:'Launch'},loginUrl:'/login',games:[],history:[],queue:null,active}}));
 await page.route('**/api/lobby/matches/running/launch',r=>{launchCalls++;return r.fulfill({contentType:'text/html',body:'<h1>Game table</h1>'});});
 await page.route('**/api/lobby/shared',r=>{const body=r.request().postDataJSON();return r.fulfill({json:body?.action==='decks'?{decks:accountDecks}:{...accountShared,active}})});
 await page.goto('/');await expect(page.getByRole('link',{name:'Rejoin game'})).toHaveAttribute('href','/api/lobby/matches/running/launch');await expect(page.getByRole('button',{name:'Play',exact:true}).last()).toBeVisible();expect(launchCalls).toBe(0);await expect(page).toHaveURL(/\/$/);
 await page.screenshot({path:`/tmp/polish-rejoin-${info.project.name}.png`});
});
test('stats shows real breakdown data by deck and archetype for the current season',async({page},info)=>{
 const record={elo:1520,games:3,wins:2,losses:1,draws:0};const row={key:'deck1',leader:'LAW_018',base:'HMW_020',colors:['Aggression'],games:3,wins:2,losses:1,draws:0};const breakdowns={decks:[row],archetypes:[row],opponents:[row]};
 await page.route('**/api/lobby',r=>r.fulfill({json:{user:{name:'terronk',season:'Launch season',lifetimeElo:1520,seasonElo:1510,stats:{all:record,season:record,formats:{all:{Premier:record},season:{Premier:record}},breakdowns:{all:breakdowns,season:breakdowns}}},active:null,queue:null,games:[],history:[]}}));
 await page.goto('/me');await expect(page.getByRole('button',{name:'Season',exact:true})).toBeVisible();await expect(page.locator('.stats-tiles')).toContainText('67%');
 const results=page.locator('.stats-breakdowns');await expect(results.locator('.stats-archetype-row')).toHaveCount(1);
 await page.getByRole('button',{name:'Leader',exact:true}).click();await expect(results.locator('.stats-archetype-row')).toContainText(/Lando/);await page.screenshot({path:`/tmp/polish-stats-${info.project.name}.png`,fullPage:true});
});
test('lobby Themes opens the existing collection including Events without a route change',async({page})=>{
 await page.route('**/api/cosmetics',r=>r.fulfill({json:{catalog:{revision:'test',items:[]},access:{supporter:true,status:'supporter',allowedItemIds:[],expiresAt:0},loadout:{},version:0}}));
 await page.goto('/');await page.getByRole('button',{name:'Themes',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Themes',exact:true});await expect(dialog).toBeVisible();
 await expect(dialog.getByRole('navigation',{name:'Theme catalogs'}).getByRole('button')).toHaveText(['Themes','Token sets','Token cards','Card backs','Playmats','Events']);
 await dialog.getByRole('button',{name:'Events',exact:true}).click();await expect(page).toHaveURL(/\/$/);await page.getByRole('button',{name:'Close themes',exact:true}).click();await expect(dialog).not.toBeVisible();
});

});


test('History expansion shows hyperspace backgrounds without aspects and aggregates seat-aware matchup results',async({page},info)=>{
 await mock(page);
 const original={...history[0],turns:7};
 const second={...original,turns:8,id:'g4',seat:1,players:[...original.players].reverse(),leaders:[...original.leaders].reverse(),bases:[...original.bases].reverse(),result:'Loss',createdAt:now-1800000,completedAt:now-600000};
 await page.route('**/api/lobby',r=>r.fulfill({json:{...lobby,history:[...history,second,...extraMatchups]}}));
 await page.goto('/history');
 const run=page.locator('.ph-run').first(),summary=run.locator(':scope > summary');
 await expect(run.getByRole('region',{name:'Matchup matrix'})).toBeHidden();
 await expect(summary).toContainText('Limited');await expect(summary).toContainText('Sealed');await expect(summary).toContainText('6 packs');
 await expect(page.locator('.ph-history-aspects')).toHaveCount(0);
 await summary.focus();await page.keyboard.press('Enter');
 await expect(run.getByRole('tab',{name:'History',exact:true})).toHaveAttribute('aria-selected','true');
 await run.getByRole('tab',{name:'History',exact:true}).press('ArrowRight');
 await expect(run.getByRole('tab',{name:'Matchups',exact:true})).toBeFocused();
 const matrix=run.getByRole('region',{name:'Matchup matrix'});
 await expect(matrix).toBeVisible();await expect(matrix.locator('tbody tr')).toHaveCount(4);
 await expect(matrix.locator('.ph-history-leader-art img')).toHaveCount(8);
 await expect(matrix.locator('thead th')).toHaveText(['Opponent leader / base','Games','W–L–D','Your win rate','Global win rate','vs global']);
 const lando=matrix.locator('tbody tr').filter({hasText:'Lando Calrissian'});
 await expect(lando.locator('td').nth(0)).toHaveText('2');await expect(lando.locator('td').nth(1)).toHaveText('1–1–0');await expect(lando.locator('td').nth(2)).toHaveText('50%');
 await expect(lando.locator('.ph-global-delta')).toHaveAttribute('aria-label','8.0 percentage points below global Purrgil');
 await expect(lando.locator('.ph-global-comparison')).toContainText('58.0%100 results');
 await expect(matrix.locator('.ph-global-above')).toHaveCount(1);await expect(matrix.locator('.ph-global-below')).toHaveCount(2);await expect(matrix.locator('.ph-global-equal')).toHaveCount(1);
 await run.getByRole('tab',{name:'History',exact:true}).click();
 await expect(matrix).toBeHidden();await run.locator('.ph-game').first().click();await expect(run.getByRole('link',{name:'▶ Play'}).first()).toBeVisible();
 expect(await noSideScroll(page)).toBe(true);
 await run.getByRole('tab',{name:'Matchups',exact:true}).click();
 await expect.poll(()=>matrix.locator('.ph-history-leader-art img').evaluateAll(images=>images.every(image=>(image as HTMLImageElement).complete&&(image as HTMLImageElement).naturalWidth>0)),{timeout:20000}).toBe(true);
 await page.waitForLoadState('networkidle',{timeout:3000}).catch(()=>{});
 await page.screenshot({path:`/tmp/ph-history-expanded-${info.project.name}.png`,fullPage:true});
 await summary.click();await expect(matrix).toBeHidden();
 const single=page.locator('.ph-group:not(.ph-run) .ph-history-item').first();await single.locator(':scope > summary').click();await single.getByRole('tab',{name:'Matchups',exact:true}).click();
 await expect(single.getByRole('region',{name:'Matchup matrix'})).toBeVisible();await expect(single).toContainText('Premier');
});

test('History card analysis shows personal copy-weighted metrics in an artwork table with retry',async({page},info)=>{
 await mock(page);let unavailable=true;
 await page.route('**/api/lobby/matches/*/cards',r=>{return unavailable?r.fulfill({status:503,json:{error:{message:'Replay analysis is temporarily unavailable.'}}}):r.fulfill({json:personalCardFixture});});
 await page.goto('/history');const run=page.locator('.ph-run').first();await run.locator(':scope > summary').click();
 await expect(run.getByRole('link',{name:'View pool'})).toHaveClass(/ph-btn/);
 await run.getByRole('tab',{name:'Card Analysis',exact:true}).click();await expect(run.getByRole('alert')).toContainText('temporarily unavailable');unavailable=false;await run.getByRole('button',{name:'Retry'}).click();
 const table=run.getByRole('region',{name:'Personal card metrics'});await expect(table.locator('tbody tr')).toHaveCount(10);
 await expect(run.getByLabel('Deck version')).toBeVisible();await expect(run).not.toContainText('Your results with this exact leader');
 await page.evaluate(()=>document.fonts.ready);
 await table.locator('thead .ph-metric-hint').filter({hasText:'GP WR'}).scrollIntoViewIfNeeded();
 await table.locator('thead .ph-metric-hint').filter({hasText:'GP WR'}).hover();await expect(page.getByRole('tooltip')).toContainText('Games played win rate');
 await table.locator('thead .ph-metric-hint').filter({hasText:'GP WR'}).focus();await page.keyboard.press('Escape');await expect(page.getByRole('tooltip')).toHaveCount(0);
 const row=table.locator('tbody tr').filter({hasText:"Talzin's Shuttle"});await expect(row).toContainText('50.0%');await expect(row).toContainText('(12/24)');await expect(row).toContainText('↑ +50.0 pp');
 await expect(table.locator('thead th')).toHaveText(['Card','Copies','C','G','GP WR','OH WR','GD WR','GIH WR','GNS WR','IIH','PR','RWS%','PWAR','Played WR','Resourced WR','Activations','Discards']);
 await expect(run).not.toContainText('Metric definitions and sample notes');
 await expect(run.locator('.ph-analysis-samples')).toHaveText('8 decided games · 0 draws excluded · 8/8 games with validated hand data · 8/8 replays available');
 await expect(run.getByRole('region',{name:'Game outcome metrics'})).toContainText('75.0%');
 await expect(run.getByRole('region',{name:'Per-turn metrics'}).locator('tbody tr')).toHaveCount(6);
 await expect(row).toContainText('62.5%');
 await expect(table.locator('.ph-personal-card-art img')).toHaveCount(10);await expect(run).toContainText('8/8 games with validated hand data');
 await run.getByRole('searchbox',{name:'Find a card'}).fill('Talzin');await expect(table.locator('tbody tr')).toHaveCount(1);
 expect(await noSideScroll(page)).toBe(true);await run.getByRole('searchbox',{name:'Find a card'}).fill('');
 await expect(table.locator('.ph-card-subtitle').first()).toBeVisible();
 await run.getByRole('button',{name:'Edit columns',exact:true}).click();
 await table.getByRole('button',{name:'Hide GP WR column',exact:true}).click();
 await expect(table.locator('thead th')).toHaveCount(16);
 await run.getByText('Hidden columns (1)',{exact:true}).click();
 await run.getByRole('button',{name:'Show GP WR',exact:true}).click();
 await expect(table.locator('thead th')).toHaveCount(17);
 await table.getByRole('button',{name:'Hide Copies column',exact:true}).click();
 await run.getByRole('button',{name:'Done',exact:true}).click();
 await page.reload();await run.locator(':scope > summary').click();await run.getByRole('tab',{name:'Card Analysis',exact:true}).click();
 await expect(table.locator('thead th')).toHaveCount(16);
 await expect(table.getByRole('columnheader',{name:'Copies',exact:true})).toHaveCount(0);
 await run.getByRole('button',{name:'Edit columns',exact:true}).click();await run.getByText('Hidden columns (1)',{exact:true}).click();await run.getByRole('button',{name:'Show all',exact:true}).click();await run.getByRole('button',{name:'Done',exact:true}).click();
 await page.waitForLoadState('networkidle',{timeout:3000}).catch(()=>{});await page.screenshot({path:`/tmp/ph-card-analysis-${info.project.name}.png`,fullPage:true});
});

test('Events connection is centered inside the theme modal',async({page},info)=>{
 await page.route('**/api/cosmetics',r=>r.fulfill({status:503,json:{}}));
 await page.goto('/');await page.getByRole('button',{name:'Themes',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Themes',exact:true});
 await dialog.getByRole('button',{name:'Events',exact:true}).click();
 const cta=dialog.locator('.dlc-event-connect');await expect(cta).toBeVisible();
 const panel=(await dialog.locator('.events-catalog').boundingBox())!,box=(await cta.boundingBox())!;
 expect(Math.abs(box.x+box.width/2-panel.x-panel.width/2)).toBeLessThan(2);
 expect(Math.abs(box.y+box.height/2-panel.y-panel.height/2)).toBeLessThan(2);
 await page.evaluate(()=>document.fonts.ready);
 await page.screenshot({path:`artifacts/events-modal-centered-${info.project.name}.png`});
});

test('matched queue holds the interstitial while the launch URL catches up',async({page},info)=>{
 const reservation:{queue:any;active:any}={queue:{contract:premier,label:'Premier',joinedAt:Date.now()},active:null};
 await mock(page,[],reservation);
 await page.goto('/lobby/constructed?waiting=queue');
 await expect(page.getByRole('heading',{name:'Finding your opponent'})).toBeVisible();
 await page.evaluate(()=>{(window as any).homepageFlashed=false;new MutationObserver(()=>{if(document.querySelector('.ph-tiles'))(window as any).homepageFlashed=true;}).observe(document.body,{childList:true,subtree:true});});
 reservation.queue=null;reservation.active={id:'matched',status:'in_progress',mode:'queue',contract:premier};
 await expect(page.getByRole('status')).toHaveText('Match found');
 await page.screenshot({path:`/tmp/match-found-${info.project.name}.png`});
 await page.waitForTimeout(1500);
 await expect(page).toHaveURL(/waiting=queue/);
 await expect(page.locator('.ph-tiles')).toHaveCount(0);
 expect(await page.evaluate(()=>(window as any).homepageFlashed)).toBe(false);
 await page.route('**/ready-table',async r=>{await new Promise(resolve=>setTimeout(resolve,500));await r.fulfill({contentType:'text/html',body:'<main>Game table</main>'});});
 await page.route('**/api/lobby',r=>r.fulfill({json:{...lobby,active:{id:'matched',status:'in_progress',mode:'queue',url:'/ready-table'}}}));
 await expect(page).toHaveURL(/ready-table/,{timeout:15000});
 await expect(page.getByText('Game table',{exact:true})).toBeVisible();
});

test('resume action stays bottom right and delete confirmations leave room for focus',async({page},info)=>{
 await mock(page);
 await page.route('**/api/home/resumes',r=>r.fulfill({json:{resumes:[{id:'pool-layout',label:'ASH Draft 10/11/26 · Deck not built',action:'Build deck',href:'/pool/layout/deck',imageUrl:'/expansion-art/ash.png',artKind:'set',removeUrl:'/api/pools/layout',removeLabel:'Delete pool'}]}}));
 await page.goto('/');
 const card=page.getByRole('complementary',{name:'Pick up where you left off'});
 const action=card.getByRole('link',{name:'Build deck'});
 await expect(action).toBeVisible();
 const box=(await card.boundingBox())!,button=(await action.boundingBox())!;
 expect(box.x+box.width-button.x-button.width).toBeLessThan(16);
 expect(box.y+box.height-button.y-button.height).toBeLessThan(16);
 await page.screenshot({path:`/tmp/resume-layout-${info.project.name}.png`,fullPage:true});
 await card.getByRole('button',{name:'Delete pool',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Delete pool',exact:true});
 await expect(dialog).toBeVisible();
 const copy=(await dialog.getByText('This removes the item permanently.').boundingBox())!;
 const cancel=dialog.getByRole('button',{name:'Cancel'});
 await cancel.focus();
 const control=(await cancel.boundingBox())!;
 expect(control.y-copy.y-copy.height).toBeGreaterThanOrEqual(20);
 expect(await noSideScroll(page)).toBe(true);
 await page.screenshot({path:`/tmp/delete-layout-${info.project.name}.png`});
 await cancel.click();await expect(dialog).toBeHidden();
});

test('deck artwork recovers when switching decks after an image load failure',async({page},info)=>{
 await mock(page);
 await page.route('**/card_*',r=>/Grand_Moff_Tarkin|Dune_Sea/.test(r.request().url())?r.abort():r.continue());
 await page.goto('/play');
 const art=page.locator('.ph-deck-main>.ph-deck-art').first();
 const images=art.locator('img');
 await expect(images).toHaveCount(2);
 await expect(images.first()).toHaveCSS('visibility','hidden');
 await expect(images.last()).toHaveCSS('visibility','hidden');
 await page.locator('.ph-deck-tiles .ph-deck-row').nth(1).click();
 for(const img of [images.first(),images.last()]){
  await expect.poll(()=>img.evaluate(e=>(e as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(img).toHaveCSS('visibility','visible');
  await img.evaluate(e=>(e as HTMLImageElement).decode());
  const bounds=(await img.boundingBox())!;expect(bounds.width).toBeGreaterThan(0);expect(bounds.height).toBeGreaterThan(0);
 }
 await page.screenshot({path:`/tmp/deck-art-recovered-${info.project.name}.png`});
});


test('theme apply control stays centered on hover, including reduced motion',async({page},info)=>{
 await mock(page);
 await page.route('**/api/entitlements',r=>r.fulfill({json:{beta:true,canCustomize:true}}));
 await page.route('**/api/cosmetics',r=>r.fulfill({json:{catalog:{revision:'test',items:[]},access:{supporter:true,status:'supporter',allowedItemIds:[],expiresAt:0},loadout:{},version:0}}));
 await page.goto('/');await page.getByRole('button',{name:'Themes',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Themes',exact:true});
 await dialog.getByRole('button',{name:'Kashyyyk Treetop Table',exact:true}).click();
 const apply=dialog.getByRole('button',{name:'Use this Theme',exact:true});
 await apply.scrollIntoViewIfNeeded();
 for(const reducedMotion of ['no-preference','reduce'] as const){
  await page.emulateMedia({reducedMotion});await page.mouse.move(0,0);
  const position=()=>apply.evaluate(e=>{const b=e.getBoundingClientRect(),p=e.parentElement!.getBoundingClientRect();return {x:b.x-p.x,y:b.y-p.y,width:b.width,parentWidth:p.width};});
  const before=await position();
  await apply.hover();
  await page.waitForTimeout(350); // Let hover transitions finish before comparing positions.
  await expect.poll(async()=>{const after=await position();return Math.abs(after.x-before.x)+Math.abs(after.y-before.y);}).toBeLessThan(1);
  expect(Math.abs(before.x+before.width/2-before.parentWidth/2)).toBeLessThan(1);
 }
 await page.screenshot({path:`/tmp/theme-hover-${info.project.name}.png`});
});


test('homepage tiles keep their position and decorative artwork out of hover targets',async({page})=>{
 await mock(page);await page.goto('/');
 const tiles=page.locator('.ph-tiles>.ph-tile');
 for(const tile of await tiles.all()){
  await tile.scrollIntoViewIfNeeded();
  await tile.hover();
  await expect(tile).toHaveCSS('transform','none');
  await expect(tile).toHaveCSS('box-shadow','none');
  await expect(tile.locator('.ph-tile-art')).toHaveCSS('pointer-events','none');
 }
});

test('stats deck artwork falls back when official images fail',async({page})=>{
 await mock(page);
 const record={elo:1500,games:1,wins:1,losses:0,draws:0};
 const rows=['LAW_018','HMW_018','HMW_010','HMW_003'].map(leader=>({key:leader,leader,base:'HMW_020',colors:[],...record}));
 const groups={decks:rows,archetypes:rows,opponents:rows};
 await page.route('**/api/lobby',r=>r.fulfill({json:{...lobby,user:{...lobby.user,stats:{all:record,season:record,breakdowns:{all:groups,season:groups}}}}}));
 await page.route('https://cdn.starwarsunlimited.com/**',r=>r.abort());
 await page.goto('/me');
 const art=page.locator('.stats-archetype-art');
 await expect(art).toHaveCount(4);
 for(const row of await art.all()){
  await row.scrollIntoViewIfNeeded();
  await expect(row.locator('img')).toHaveCount(2);
  for(const img of await row.locator('img').all()){
   await expect(img).toHaveAttribute('src',/karabast-data/);
   await expect.poll(()=>img.evaluate(i=>(i as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
   await expect(img).toBeVisible();
  }
 }
});

test('History pairs players with archetypes and labels replay links',async({page},info)=>{
 await mock(page);
 await page.route('https://cdn.starwarsunlimited.com/**',r=>r.abort());
 await page.goto('/history');
 const row=page.locator('.ph-history-item>.ph-game').filter({has:page.getByRole('link',{name:'Replay'})}).first();
 await expect(row).toBeVisible();
 await expect(row.locator('.ph-history-contender')).toHaveCount(2);
 for(const player of await row.locator('.ph-history-contender').all()){
  const name=await player.locator(':scope>strong').boundingBox();
  const deck=await player.locator('.ph-history-archetype').boundingBox();
  expect(deck!.y).toBeGreaterThanOrEqual(name!.y+name!.height);
 }
 await expect(row.getByRole('link',{name:'Play',exact:true})).toHaveCount(0);
 for(const img of await row.locator('.ph-deck-art img').all()){
  await expect.poll(()=>img.evaluate(i=>(i as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(img).toBeVisible();
 }
 await page.screenshot({path:`/tmp/history-identities-${info.project.name}.png`,fullPage:true});
});

test('My Stats decks open exact-deck history, build stats and card analysis',async({page},info)=>{
 await mock(page);
 const record={elo:1500,games:1,wins:1,losses:0,draws:0};
 const row={key:'exact-list',leader:'HMW_004',base:'HMW_019',colors:[],...record,matchIds:['g1']};
 const breakdowns={decks:[row],archetypes:[row],opponents:[row]};
 await page.route('**/api/lobby',r=>r.fulfill({json:{...lobby,ptpUrl:locationOrigin(),user:{...lobby.user,stats:{all:record,season:record,breakdowns:{all:breakdowns,season:breakdowns}}}}}));
 await page.route('**/api/lobby/matches/g1/cards',r=>r.fulfill({json:{cards:[],games:1,decided:1,draws:0,replays:1,handGames:1}}));
 await page.goto('/me');
 const rowControl=page.locator('.stats-deck-details>summary');await rowControl.focus();await page.keyboard.press('Enter');
 const details=page.locator('.stats-deck-details');await expect(details.getByRole('link',{name:'Stats',exact:true})).toHaveAttribute('href','http://127.0.0.1:4437/pools/pool-hmw/deck/stats#build');
 await expect(details).toContainText('bigbantha');await expect(details).not.toContainText('moonmoon');
 await details.getByRole('tab',{name:'Card Analysis'}).click();await expect(details.getByText('1 decided games', {exact:false})).toBeVisible();
 await page.screenshot({path:`/tmp/my-stats-deck-${info.project.name}.png`,fullPage:true});
 expect(await noSideScroll(page)).toBe(true);
});
function locationOrigin(){return 'http://127.0.0.1:4437';}

test('draft entry fixes format while a direct deck entry fixes both deck and format',async({page},info)=>{
 const posts:Record<string,unknown>[]=[];await mock(page,posts);
 await page.goto('/play?format=draft&set=HMW');
 const play=page.getByRole('region',{name:'Play',exact:true});
 await expect(play.locator('.ph-format-drawer .ph-art-tile')).toHaveCount(1);
 await expect(play.getByRole('group',{name:'Set'})).toHaveCount(0);
 await expect(play.getByText('Saved decks and tournaments')).toHaveCount(0);
 await page.goto('/play?format=premier&deck=k-tarkin');
 await expect(play.locator('.ph-deck-main')).toContainText('Tarkin');
 await expect(play.locator('.ph-modal-deck .ph-deck-tiles')).toHaveCount(0);
 await expect(play.getByRole('button',{name:'Import Deck'})).toHaveCount(0);
 await expect(play.getByRole('group',{name:'Queues',exact:true})).toHaveCount(0);
 await page.reload();await expect(play.locator('.ph-deck-main')).toContainText('Tarkin');
 await play.getByRole('radio',{name:/vs AI/}).click();
 await play.getByRole('button',{name:'Mirror',exact:true}).click();
 await expect(play.getByRole('button',{name:'Play vs AI'})).toBeEnabled();
 await page.screenshot({path:`/tmp/context-play-${info.project.name}.png`,fullPage:true});
 const bounds=await play.boundingBox();expect(bounds!.width).toBeLessThanOrEqual(info.project.use.viewport!.width);
 await play.getByRole('button',{name:'Play vs AI'}).click();
 await expect.poll(()=>posts.find(p=>p.action==='play')).toMatchObject({contract:{format:'premier'},deck:{leader:{id:'HMW_004'}}});
});
test('unavailable locked deck never silently selects a different deck',async({page})=>{
 await mock(page);await page.goto('/play?format=premier&deck=deleted-deck');
 await expect(page.getByRole('alert')).toContainText('This deck is no longer available');
 await expect(page.getByRole('button',{name:'Choose a deck to play'})).toBeDisabled();
 await expect(page.locator('.ph-modal-deck .ph-deck-tiles')).toHaveCount(0);
});

test('general Play entry keeps format choices through browser Back',async({page})=>{
 await mock(page);await page.goto('/');await page.getByRole('button',{name:'Play',exact:true}).last().click();
 await expect(page.getByRole('group',{name:'Format',exact:true})).toBeVisible();
 await page.locator('.ph-format-drawer .ph-drawer-handle').click();await page.getByRole('group',{name:'Format',exact:true}).getByRole('button',{name:'Eternal'}).click();
 await page.getByRole('link',{name:'Protect the Pod home',exact:true}).click();
 await page.goBack();await expect(page.getByRole('group',{name:'Format',exact:true})).toBeVisible();
});


test('Play format and set drawers show the current pick and open on click',async({page},info)=>{
 await mock(page);
 await page.route('**/expansion-art/*',r=>r.fulfill({path:resolve('public/expansion-art',new URL(r.request().url()).pathname.split('/').pop()!)}));
 await page.goto('/play?format=sealed&set=HMW');
 const formats=page.locator('.ph-format-drawer'),formatHandle=formats.locator('.ph-drawer-handle'),setHandle=page.locator('.ph-set-drawer .ph-drawer-handle');
 await expect(formats.locator('.ph-art-tile')).toHaveCount(1);await expect(formatHandle).toHaveAccessibleName('Sealed 6-pack, change format');
 await expect(setHandle).toHaveAccessibleName('Homeworlds, change set');await expect(page.getByRole('group',{name:'Set',exact:true})).toHaveCount(0);
 await page.getByRole('radio',{name:/vs AI/}).click();
 await page.waitForTimeout(1500);
 await page.locator('.ph-update-toast button').first().click({timeout:500}).catch(()=>{});
 await page.screenshot({path:`/tmp/play-drawers-closed-${info.project.name}.png`,fullPage:true});
 // Formats slide out beside the current one; the current one stays at the end.
 await formatHandle.click();await expect(formats.locator('.ph-art-tile')).toHaveCount(5);await expect(formats.locator('.ph-art-tile').last()).toHaveClass(/ph-drawer-handle/);
 await page.waitForTimeout(600);await page.screenshot({path:`/tmp/play-drawers-formats-${info.project.name}.png`,fullPage:true});
 await formatHandle.click();await expect(formats.locator('.ph-art-tile')).toHaveCount(1);
 // Sets open a carousel below; picking one closes it.
 await setHandle.click();await expect(page.getByRole('group',{name:'Set',exact:true})).toBeVisible();
 await page.waitForTimeout(600);await page.screenshot({path:`/tmp/play-drawers-sets-${info.project.name}.png`,fullPage:true});
 await page.getByRole('group',{name:'Set',exact:true}).getByRole('button',{name:'ASH',exact:true}).click();
 await expect(page.getByRole('group',{name:'Set',exact:true})).toHaveCount(0);await expect(setHandle).toHaveAccessibleName('Ashes of the Empire, change set');
 // No ASH sealed deck: the deck panel offers saved sealed decks from other sets; loading one switches to its set.
 const load=page.getByRole('button',{name:'Load a saved deck'});await expect(load).toBeVisible();
 await page.screenshot({path:`/tmp/play-saved-closed-${info.project.name}.png`,fullPage:true});
 await load.click();await expect(page.locator('.ph-modal-deck .ph-deck-row')).toHaveCount(2);
 await page.waitForTimeout(600);await page.screenshot({path:`/tmp/play-saved-open-${info.project.name}.png`,fullPage:true});
 await page.locator('.ph-modal-deck .ph-deck-row',{hasText:'Chewie Green 30'}).click();
 await expect(setHandle).toHaveAccessibleName('Homeworlds, change set');await expect(page.locator('.ph-deck-main .ph-deck-title')).toContainText('Chewie Green 30');
 // A fixed deck pins both: the handles are labels, not controls.
 await page.goto('/play?format=premier&deck=k-tarkin');
 await expect(page.locator('.ph-format-drawer .ph-drawer-handle.is-static')).toHaveText('Premier');await expect(page.locator('.ph-format-drawer button')).toHaveCount(0);
 expect(await noSideScroll(page)).toBe(true);
});

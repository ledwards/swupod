import {test,expect,type Page} from '@playwright/test';
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
async function mock(page:Page,posts:Record<string,unknown>[]=[]){
 await page.route('**/api/session',r=>r.fulfill({status:401,json:{error:{code:'session_required'}}}));
 await page.route('**/api/lobby',r=>r.fulfill({json:lobby}));
 await page.route('**/api/lobby/decks/played',r=>r.fulfill({json:{decks:played}}));
 await page.route('**/api/lobby/import-url',r=>r.fulfill({json:{deck:{...exp('HMW_004','HMW_019'),metadata:{name:'From SWUForge'}},source:'swuforge',url:'https://swuforge.com/decks/x'}}));
 await page.route('**/api.swuapi.com/**',r=>{const u=new URL(r.request().url());r.fulfill({json:{nickname:u.searchParams.get('leader_card_uuid')?.startsWith('01a0ad23')?'Tarkin (HMW) Blue 30 (Premier)':'Vader Red 30 (Premier)'}});});
 await page.route('**/api/lobby/shared',async r=>{
  if(r.request().method()==='GET')return r.fulfill({json:shared});
  const body=r.request().postDataJSON();posts.push(body);
  if(body.action==='decks')return r.fulfill({json:{decks:limitedDecks,...(body.byPool?{pools:limitedPools}:{})}});
  // Vader's list uses rotated cards: fine in Eternal, not in Premier.
  if(body.action==='validate'){const vader=body.deck?.leader?.id==='LAW_010';return vader&&body.contract.format==='premier'?r.fulfill({status:409,json:{error:'3 cards are not legal in Premier: Overwhelming Barrage, Vanquish, Force Choke.'}}):r.fulfill({json:{valid:true,deck:{...body.deck,deck:[{id:'SOR_040',count:50}],sideboard:[{id:'SOR_041',count:vader?4:6}]},names:{}}});}
  return r.fulfill({json:{queued:true}});
 });
}
const noSideScroll=(page:Page)=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);

test('alpha combines the current import flow with Claude opponent artwork and mode requests',async({page})=>{
 const posts:Record<string,unknown>[]=[];await mock(page,posts);await page.goto('/play?format=premier');
 const setup=page.getByRole('region',{name:'Play',exact:true});await expect(setup).toBeVisible();
 await expect(page.getByRole('radio',{name:'Queue',exact:true})).toHaveAttribute('aria-checked','true');
 await page.getByRole('radio',{name:'Queue',exact:true}).press('ArrowRight');
 await expect(page.getByRole('radio',{name:'Private',exact:true})).toBeFocused();
 await page.getByRole('switch',{name:'Hide my name'}).click();
 await expect(page.getByRole('switch',{name:'Hide my name'})).toHaveAttribute('aria-checked','true');
 await setup.getByRole('button',{name:'Import Deck',exact:true}).click();
 await page.getByLabel('SWUForge URL',{exact:true}).fill('https://swuforge.com/decks/x');
 await setup.getByRole('button',{name:'Import',exact:true}).click();
 // The deck banner reports validity as an icon, not a Ready label.
 await expect(setup.locator('.ph-deck-main')).toContainText('Grand Moff Tarkin');await expect(setup.locator('.ph-deck-main').getByRole('img',{name:'Valid',exact:true})).toBeVisible();
 await setup.getByRole('button',{name:'Create invite',exact:true}).click();
 expect(posts.find(p=>p.action==='play')).toMatchObject({mode:'private',anonymous:true,contract:{format:'premier'}});
 expect(await noSideScroll(page)).toBe(true);
});
test('alpha release notes open without board controls and persist read state',async({page})=>{
 await mock(page);await page.route('**/release-notes.md*',r=>r.fulfill({contentType:'text/markdown',body:'# Protect the Pod release notes\n\n## 2026-10-12 · Website updates\n\n- Play and history live in PTP.\n'}));await page.goto('/');
 const notes=page.getByRole('button',{name:/^Release notes/});await expect(notes).toHaveAttribute('aria-label',/unread/);await notes.click();
 const dialog=page.getByRole('dialog',{name:'Release notes',exact:true});await expect(dialog).toContainText('Website updates');
 await expect(dialog.getByRole('button',{name:/move|resize|pin/i})).toHaveCount(0);
 await dialog.getByRole('button',{name:'Close release notes'}).click();await page.reload();
 await expect(page.getByRole('button',{name:'Release notes',exact:true})).toBeVisible();
});
for(const [action,label] of [['cancel','End existing game'],['forfeit','Forfeit existing game'],['leave','Leave existing queue']] as const){
 test(`reservation recovery: ${action} preserves the selected deck and permits retry`,async({page})=>{
  await mock(page);let cleared=false,attempts=0;const mutations:unknown[]=[];
  const reservation=action==='leave'?{kind:'queue',joinedAt:123,action}:{kind:'game',matchId:'existing-game',action};
  await page.route('**/api/lobby/reservation',r=>{if(r.request().method()==='POST'){mutations.push(r.request().postDataJSON());cleared=true;return r.fulfill({json:{ok:true}});}return r.fulfill({json:{reservation}});});
  await page.route('**/api/lobby/shared',r=>{if(r.request().method()==='POST'&&r.request().postDataJSON().action==='play'){attempts++;return cleared?r.fulfill({json:{queued:true}}):r.fulfill({status:409,json:{error:'You already have a game or queue reservation.'}});}return r.fallback();});
  await page.goto('/play?format=premier');
  const setup=page.getByRole('region',{name:'Play',exact:true});
  await setup.getByRole('button',{name:'Import Deck',exact:true}).click();
  await page.getByLabel('SWUForge URL',{exact:true}).fill('https://swuforge.com/decks/x');await setup.getByRole('button',{name:'Import',exact:true}).click();
  const play=setup.getByRole('button',{name:'Join queue',exact:true});await expect(play).toBeEnabled();await play.click();
  await expect(page.getByRole('alert')).toContainText('You already have a game or queue reservation.');
  expect(mutations).toEqual([]);await page.getByRole('alert').getByRole('button',{name:label,exact:true}).click();
  // One line, one link: confirm, clear the reservation, and the same play request goes again on its own.
  const confirm=page.getByRole('dialog',{name:label,exact:true});await expect(confirm).toBeVisible();await confirm.getByRole('button',{name:label,exact:true}).click();
  await expect(page.getByRole('alert')).toHaveCount(0);expect(mutations).toEqual([reservation]);await expect.poll(()=>attempts).toBe(2);
 });
}

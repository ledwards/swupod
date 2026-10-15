import {test,expect,type Page} from '@playwright/test';
// The website shell around the homepage: login, Play setup, queueing, resume, history, watch, stats, account and dialogs.
// Everything is driven through the UI against route-mocked gateway responses.
const premier={format:'premier',limited:'six',set:'',pool:'current',policy:'p1'};
const state={activity:{activeGames:12,queuedPlayers:3},user:null,capabilities:{queue:false,private:false,ai:false},loginUrl:'/login',ptpUrl:'https://www.protectthepod.com/play/native',legacyGame:false,active:null,queue:null,games:[],history:[]};
const pilot={name:'Pilot',lifetimeElo:1532,seasonElo:null,season:'Launch season'};
const signedIn={...state,user:pilot,capabilities:{queue:true,private:true,ai:true}};
const sharedBase={currentPolicy:'p1',signedIn:true,enabled:true,ptpOrigin:'https://www.protectthepod.com',playOrigin:'https://play.protectthepod.com',sets:[{code:'HMW',name:'Homeworlds'},{code:'ASH',name:'Ashes of the Empire'}],pools:[{id:'current',name:'Current'}],queues:[{key:'premier',contract:premier,label:'Premier',waiting:3}],pods:[],active:null,queue:null};
const exp=(leader:string,base:string)=>({leader:{id:leader,count:1},base:{id:base,count:1},deck:[{id:'SOR_040',count:50}],sideboard:[]});
const tarkin={key:'k-tarkin',format:'premier',leader:'HMW_004',base:'HMW_019',mainCount:50,sideboardCount:6,lastPlayedAt:Date.now()-3600000,games:5,wins:4,losses:1,draws:0,source:'json',sourceUrl:null,name:null,export:exp('HMW_004','HMW_019')};
const finished={id:'past',players:['Pilot','Two'],seat:0,leaders:['HMW_004','LAW_018'],bases:['HMW_019','HMW_020'],format:'Premier',status:'complete',createdAt:Date.now()-3600000,completedAt:Date.now()-3000000,result:'Win',mode:'queue',contract:premier,replayUrl:'/api/lobby/matches/past/replay'};
const activeGame={id:'live',players:['Pilot','Opponent'],seat:0,leaders:['HMW_004','LAW_018'],bases:['HMW_019','HMW_020'],format:'Premier',status:'in_progress',createdAt:Date.now(),url:'/api/lobby/matches/live/launch',mode:'queue',contract:premier};

type Mocks={invite?:(token:string)=>unknown;lobby?:()=>unknown;shared?:()=>unknown;decks?:unknown[];played?:unknown[];onPlay?:(body:Record<string,unknown>)=>Promise<{status?:number;json:unknown}>|{status?:number;json:unknown};onCancel?:()=>void};
async function mock(page:Page,m:Mocks={}){
 await page.route('**/api/session',r=>r.fulfill({status:401,json:{error:{code:'session_required'}}}));
 await page.route('**/api/entitlements',r=>r.fulfill({json:{beta:true,canCustomize:true}}));
 await page.route('**/api/lobby',r=>r.fulfill({json:m.lobby?m.lobby():state}));
 await page.route('**/api/lobby/decks/played',r=>r.fulfill({json:{decks:m.played??[]}}));
 await page.route('**/api/lobby/shared',async r=>{
  if(r.request().method()==='GET')return r.fulfill({json:m.shared?m.shared():{...sharedBase,signedIn:false}});
  const body=r.request().postDataJSON() as Record<string,unknown>;
  if(body.action==='decks')return r.fulfill({json:{decks:m.decks??[]}});
  if(body.action==='invite')return r.fulfill({json:m.invite?m.invite(String(body.invite)):{status:'waiting',contract:premier,format:'Premier',host:{name:'Hostess',leader:'LOF_008',base:'LOF_029',deckName:null},expiresAt:Date.now()+3600000}});
  if(body.action==='validate')return r.fulfill({json:{valid:true,deck:{...(body.deck as object),deck:[{id:'SOR_040',count:50}],sideboard:[]},names:{}}});
  if(body.action==='play'){const out=m.onPlay?await m.onPlay(body):{json:{queued:true}};return r.fulfill({status:out.status??200,json:out.json});}
  if(body.action==='cancel'){m.onCancel?.();return r.fulfill({json:{ok:true}});}
  return r.fulfill({json:{}});
 });
}
const noSideScroll=(page:Page)=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
const openPlay=async(page:Page)=>{await page.getByRole('button',{name:'Play',exact:true}).last().click();await expect(page.getByRole('region',{name:'Play',exact:true})).toBeVisible();return page.getByRole('region',{name:'Play',exact:true});};

test('logged out: login in the header and on Play, settings and themes still preview and persist',async({page},info)=>{
 await mock(page);await page.goto('/');
 await expect(page.getByRole('navigation',{name:'Lobby',exact:true}).getByRole('link',{name:'Log in with Discord'})).toBeVisible();
 const play=await openPlay(page);
 await expect(play.getByRole('link',{name:'Log in to play',exact:true})).toHaveAttribute('href',/^\/api\/auth\/signin\/discord/);
 await expect(play.getByRole('switch',{name:'Hide my name'})).toBeDisabled();
 await page.getByRole('link',{name:'Protect the Pod home',exact:true}).click();
 await page.getByRole('button',{name:'Settings',exact:true}).click();
 const settings=page.getByRole('dialog',{name:'Settings',exact:true});
 await expect(settings.getByRole('tab',{name:'Account',exact:true})).toHaveAttribute('aria-selected','true');await expect(settings.getByRole('link',{name:'Log in with Discord'})).toBeVisible();
 await settings.getByRole('tab',{name:'Gameplay',exact:true}).click();await settings.getByRole('group',{name:'Card presentation'}).getByRole('button',{name:'Cinematic art'}).click();await settings.getByRole('button',{name:'Close',exact:true}).click();
 await expect(page.locator('.lobby-app')).toHaveAttribute('data-theme','purrgil');
 await page.getByRole('button',{name:'Themes',exact:true}).click();
 const themes=page.getByRole('dialog',{name:'Themes',exact:true});await themes.getByRole('button',{name:/^Hoth Ice Table/}).click();await themes.getByRole('button',{name:'Use this Theme',exact:true}).click();
 await expect(themes.getByRole('button',{name:/^Hoth Ice Table/})).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('.lobby-app')).toHaveAttribute('data-theme','hoth');
 await page.reload();await expect(page.locator('.lobby-app')).toHaveAttribute('data-theme','hoth');
 await page.getByRole('button',{name:'Themes',exact:true}).click();await themes.getByRole('button',{name:/^Purrgil Passage/}).click();await themes.getByRole('button',{name:'Use this Theme',exact:true}).click();await page.getByRole('button',{name:'Close themes',exact:true}).click();
 await expect(themes).toHaveCount(0);await expect(page.locator('.lobby-app')).toHaveAttribute('data-theme','purrgil');
 expect(await noSideScroll(page)).toBe(true);
 await page.screenshot({path:`artifacts/lobby-${info.project.name}.png`,fullPage:true});
});

test('Play setup: pasted JSON, a stable request id across a retry, anonymous play, then leaving the queue',async({page})=>{
 let queued=false;const submissions:Record<string,unknown>[]=[];
 await mock(page,{lobby:()=>signedIn,shared:()=>({...sharedBase,queue:queued?{contract:premier,label:'Premier',joinedAt:Date.now()-5000}:null}),
  onPlay:body=>{submissions.push(body);if(submissions.length===1)return {status:503,json:{error:{message:'Please retry.'}}};queued=true;return {json:{queued:true}};},onCancel:()=>{queued=false;}});
 await page.goto('/');const play=await openPlay(page);
 const opponent=play.getByRole('radiogroup',{name:'Opponent',exact:true});await expect(opponent.getByRole('radio')).toHaveCount(3);await expect(opponent.getByRole('radio',{name:/Queue/})).toHaveAttribute('aria-checked','true');
 await expect(play.getByRole('button',{name:'Choose a deck to play',exact:true})).toBeDisabled();
 await opponent.getByRole('radio',{name:/Private/}).click();await expect(play.getByRole('button',{name:'Choose a deck to play',exact:true})).toBeVisible();await opponent.getByRole('radio',{name:/Queue/}).click();
 const hide=play.getByRole('switch',{name:'Hide my name'});await hide.click();await expect(hide).toHaveAttribute('aria-checked','true');
 await play.getByRole('button',{name:'Import Deck',exact:true}).click();
 await play.getByLabel('Deck JSON').fill('{bad');await play.getByRole('button',{name:'Use JSON',exact:true}).click();await expect(play.getByRole('alert')).toContainText('not valid JSON');expect(submissions).toHaveLength(0);
 await play.getByLabel('Deck JSON').fill(JSON.stringify({...exp('HMW_004','HMW_019'),metadata:{name:'Pasted Tarkin'}}));await play.getByRole('button',{name:'Use JSON',exact:true}).click();
 await expect(play.locator('.ph-deck-main').getByRole('img',{name:'Valid',exact:true})).toBeVisible();
 const cta=play.getByRole('button',{name:'Join queue',exact:true});await cta.click();
 await expect(play.getByRole('alert')).toContainText('Please retry.');await cta.click();
 await expect(page.getByRole('heading',{name:'Finding your opponent'})).toBeVisible();
 expect(submissions).toHaveLength(2);expect(submissions[0].requestId).toBe(submissions[1].requestId);expect(submissions[1].anonymous).toBe(true);expect(submissions[1].mode).toBe('queue');
 await page.getByRole('button',{name:'Leave matchmaking',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Finding your opponent'})).toHaveCount(0);
 await expect(page.getByRole('heading',{name:'Now Playing'})).toBeVisible();
});

test('Limited plays a saved PTP deck by pool id; a deck that does not fit the queue cannot be sent',async({page})=>{
 const sent:Record<string,unknown>[]=[];
 const decks=[{poolShareId:'saved-sealed',name:'Tarkin Blue 30',leaderName:'Grand Moff Tarkin',setCode:'HMW',poolType:'sealed',packCount:6,ready:true,hasDeck:true,mainDeckCount:30},{poolShareId:'short',name:'Short deck',setCode:'HMW',poolType:'sealed',packCount:6,ready:false,hasDeck:true,blocker:'Add 3 more cards.',mainDeckCount:27}];
 await mock(page,{lobby:()=>signedIn,shared:()=>({...sharedBase,queues:[...sharedBase.queues,{key:'hmw-six',contract:{format:'limited',limited:'six',set:'HMW',pool:'current',policy:'p1'},label:'HMW Sealed',waiting:1}]}),decks,onPlay:body=>{sent.push(body);return {json:{queued:true}};}});
 await page.goto('/');const play=await openPlay(page);
 await play.getByRole('group',{name:'Format'}).getByRole('button',{name:'Sealed 6-pack',exact:true}).click();
 await expect(play.getByLabel('Deck JSON')).toHaveCount(0);
 await expect(play.locator('.ph-deck-main')).toContainText('Tarkin Blue 30');await expect(play.locator('.ph-deck-main').getByRole('img',{name:'Valid',exact:true})).toBeVisible();
 await play.getByRole('button',{name:/Short deck/}).click();await expect(play.getByRole('alert')).toContainText('Add 3 more cards.');await expect(play.getByRole('button',{name:'Fix your deck to play',exact:true})).toBeDisabled();
 await play.getByRole('button',{name:/Tarkin Blue 30/}).click();await play.getByRole('button',{name:'Join queue',exact:true}).click();
 await expect.poll(()=>sent.length).toBe(1);expect(sent[0].poolShareId).toBe('saved-sealed');expect(sent[0].deck).toBeUndefined();expect((sent[0].contract as {limited:string}).limited).toBe('six');
});

test('Play deep links pick set and pack count; the queues panel switches format and the button follows the opponent',async({page})=>{
 await mock(page,{lobby:()=>signedIn,shared:()=>sharedBase,played:[tarkin]});
 await page.goto('/play?format=sealed&set=ASH&limited=eight');const play=page.getByRole('region',{name:'Play',exact:true});
 await expect(play.getByRole('group',{name:'Set'}).getByRole('button',{name:'ASH',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(play.getByRole('group',{name:'Format'}).getByRole('button',{name:'Sealed 8-pack',exact:true})).toHaveAttribute('aria-pressed','true');
 const queues=play.getByRole('group',{name:'Queues',exact:true});await expect(queues.getByRole('button').first()).toContainText('Premier');
 await queues.getByRole('button',{name:/^Premier/}).click();await expect(play.getByRole('group',{name:'Format'}).getByRole('button',{name:'Premier',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(play.locator('.ph-deck-main').getByRole('img',{name:'Valid',exact:true})).toBeVisible();
 const opponent=play.getByRole('radiogroup',{name:'Opponent',exact:true});
 await opponent.getByRole('radio',{name:'Private',exact:true}).click();await expect(play.getByRole('button',{name:'Create invite',exact:true})).toBeEnabled();
 await opponent.getByRole('radio',{name:'vs AI',exact:true}).click();await expect(play.getByRole('button',{name:'Play vs AI',exact:true})).toBeDisabled();await play.getByRole('group',{name:"Leebo's deck"}).getByRole('button',{name:'Same deck'}).click();await expect(play.getByRole('button',{name:'Play vs AI',exact:true})).toBeEnabled();
 const box=await opponent.getByRole('radio',{name:'Queue',exact:true}).locator('.lobby-mode-name').evaluate(el=>el.scrollWidth<=el.clientWidth);expect(box).toBe(true);
 expect(await noSideScroll(page)).toBe(true);
});
test('an invitation link opens the private game lobby: the host ready on one seat, yours to fill',async({page},info)=>{
 await mock(page,{lobby:()=>signedIn,shared:()=>sharedBase,played:[tarkin]});
 await page.goto('/?invite=abc');const play=page.getByRole('region',{name:'Play',exact:true});await expect(play).toBeVisible();
 await expect(page.locator('.lobby-header-title')).toHaveText('Private game');
 await expect(play.locator('.ph-format-pill')).toHaveText('Premier');await expect(play.getByRole('group',{name:'Format'})).toHaveCount(0);
 const host=play.getByRole('region',{name:'Host'});await expect(host).toContainText('Hostess');await expect(host.getByRole('img',{name:'Ready'})).toBeVisible();
 await expect(play.getByRole('radiogroup',{name:'Opponent',exact:true})).toHaveCount(0);
 await expect(play.getByRole('status')).toContainText('Both ready');
 await expect(play.getByRole('button',{name:'Join private game',exact:true})).toBeEnabled();
 await page.screenshot({path:`artifacts/invite-signed-in-${info.project.name}.png`,fullPage:true});
});
test('signed out, an invitation shows nothing of the host: only Discord login, returning to the same invite',async({page})=>{
 let asked=false;
 await mock(page,{shared:()=>({...sharedBase,signedIn:false}),invite:()=>{asked=true;return {status:'invalid'};}});
 await page.goto('/?invite=abc');const invited=page.getByRole('region',{name:'Private game'});
 await expect(invited).toContainText("You're invited to a private game");
 const login=invited.getByRole('link',{name:/Login with Discord/});await expect(login).toHaveAttribute('href',/^\/api\/auth\/signin\/discord\?return_to=[^&]*invite%3Dabc/);
 await expect(page.getByText('Hostess')).toHaveCount(0);expect(asked).toBe(false);
});
for(const [status,head] of [['used','already used'],['expired','expired'],['invalid','not valid']] as const)test(`an invitation that is ${status} says so`,async({page})=>{
 await mock(page,{lobby:()=>signedIn,shared:()=>sharedBase,invite:()=>({status})});
 await page.goto('/?invite=gone');
 const gone=page.getByRole('alert');await expect(gone.getByRole('heading')).toContainText(head);await expect(gone.getByRole('link',{name:'Go to Play'})).toBeVisible();
});
test('the host watches the other seat fill in, at Play\'s address, with a PTP-style invite link',async({page},info)=>{
 const waitingGame={id:'m1',status:'waiting',format:'Premier',contract:premier,mode:'private',invite:'tok'};
 let current:Record<string,unknown>|null=null;
 await mock(page,{lobby:()=>signedIn,shared:()=>({...sharedBase,active:current}),played:[tarkin],onPlay:()=>{current=waitingGame;return {json:{matchId:'m1'}};}});
 await page.goto('/');const play=await openPlay(page);
 await play.getByRole('radio',{name:/Private/}).click();await play.getByRole('button',{name:'Create invite',exact:true}).click();
 await expect(page).toHaveURL(/waiting=private/);expect(new URL(page.url()).pathname).not.toBe('/');
 const room=page.getByRole('region',{name:'Private game'});await expect(room).toBeVisible();await expect(page.locator('.lobby-header-title')).toHaveText('Private game');
 await expect(room.getByRole('status')).toHaveText('Waiting for opponent');
 await expect(room.getByRole('region',{name:'You'}).getByRole('img',{name:'Ready'})).toBeVisible();
 await expect(room.getByRole('textbox',{name:'Private game link'})).toHaveValue(new URL('/play?invite=tok',page.url()).href);
 await page.screenshot({path:`artifacts/host-waiting-${info.project.name}.png`,fullPage:true});
 current={...waitingGame,status:'starting',invite:undefined,opponent:{name:'Guest',leader:'HMW_004',base:'HMW_019',deckName:'Tarkin Blue'}};
 await expect(room.getByRole('status')).toHaveText('Opponent joined · Starting…',{timeout:15000});
 const other=room.getByRole('region',{name:'Opponent'});await expect(other).toContainText('Guest');await expect(other).toContainText('Tarkin Blue');await expect(other.getByRole('img',{name:'Ready'})).toBeVisible();
 await page.screenshot({path:`artifacts/host-joined-${info.project.name}.png`,fullPage:true});
});

test('History plays saved replays and ignores games that never started; Stats shows the rating per period',async({page})=>{
 await mock(page,{lobby:()=>({...signedIn,history:[finished,{id:'failed',players:['Pilot','Second test pilot'],format:'Premier',createdAt:Date.now(),status:'failed',notice:'Internal service misconfiguration'}]})});
 await page.goto('/history');
 await expect(page.getByRole('link',{name:'▶ Play',exact:true})).toHaveAttribute('href','/api/lobby/matches/past/replay');
 await expect(page.getByText('Second test pilot')).toHaveCount(0);await expect(page.getByText('Internal service misconfiguration')).toHaveCount(0);
 await page.goto('/me');await expect(page.getByRole('heading',{name:'Stats',exact:true})).toBeVisible();await expect(page.locator('.stats-elo')).toHaveText('1532');
 await page.getByRole('button',{name:'Season',exact:true}).click();await expect(page.locator('.stats-elo')).toHaveText('1500');
});

test('a history with only failed setups shows the empty state',async({page})=>{
 await mock(page,{lobby:()=>({...signedIn,history:[{id:'failed',players:['Pilot','Second test pilot'],format:'Premier',createdAt:Date.now(),status:'failed'}]})});
 await page.goto('/history');await expect(page.getByText('Your games and replays start here.',{exact:true})).toBeVisible();
});

test('live games are watchable from Now Playing and the Watch page; footer links point at Protect the Pod',async({page},info)=>{
 const live={id:'live',players:['One','Two'],format:'Premier',status:'in_progress',createdAt:Date.now(),url:'/spectate/live/'};
 await mock(page,{lobby:()=>({...signedIn,games:[live],history:[finished]}),shared:()=>sharedBase});
 await page.goto('/');
 // Now Playing lists the live game above the queues, with a Watch link straight to the table.
 const now=page.getByRole('region',{name:'Now Playing'});const row=now.locator('.ph-activity-row',{hasText:'One vs Two'});
 await expect(row).toContainText('Live game');await expect(row.getByRole('link',{name:'Watch',exact:true})).toHaveAttribute('href','/spectate/live/');
 await expect(now.getByRole('group',{name:'Queues'}).getByRole('button')).toHaveCount(5);
 await page.goto('/watch');await expect(page.getByRole('heading',{name:'Watch',exact:true})).toBeVisible();await expect(page.getByRole('main').getByRole('link',{name:'Watch',exact:true})).toHaveAttribute('href','/spectate/live/');
 await expect(page.getByRole('link',{name:'Privacy Policy'})).toHaveAttribute('href','https://www.protectthepod.com/privacy-policy');
 await expect(page.getByRole('link',{name:'Terms of Service'})).toHaveAttribute('href','https://www.protectthepod.com/terms-of-service');
 await page.screenshot({path:`artifacts/watch-${info.project.name}.png`,fullPage:true});
});

test('a game in progress is offered as Rejoin without leaving the lobby, on every view',async({page},info)=>{
 let launches=0;
 await mock(page,{lobby:()=>({...signedIn,active:activeGame}),shared:()=>({...sharedBase,active:{id:'live',status:'in_progress',format:'Premier',contract:premier,mode:'queue'}})});
 await page.route('**/api/lobby/matches/live/launch',r=>{launches++;return r.fulfill({contentType:'text/html',body:'<h1>Game table</h1>'});});
 await page.goto('/');
 await expect(page.getByRole('link',{name:'Rejoin game'})).toHaveAttribute('href','/api/lobby/matches/live/launch');
 await expect(page.getByRole('button',{name:'Play',exact:true}).last()).toBeVisible();expect(launches).toBe(0);await expect(page).toHaveURL(/\/$/);
 // The resume box takes 40% of the row beside Now Playing (60%), a sibling at the same height; phones stack it first, full width.
 const status=page.locator('.ph-home-status');await expect(status).toHaveClass(/\bis-narrow\b/);
 const resume=page.locator('.ph-home-resume'),now=page.getByRole('region',{name:'Now Playing'});await expect(now).toBeVisible();
 const card=resume.locator('.ph-resume-game');
 for(const prop of ['border-top-left-radius','border-top-width','padding-top','padding-left'])await expect(card).toHaveCSS(prop,await now.evaluate((e,p)=>getComputedStyle(e).getPropertyValue(p),prop));
 // Both headings are the same small eyebrow.
 const eyebrow=(l:typeof now)=>l.locator('.ph-box-head h2').evaluate(e=>{const c=getComputedStyle(e);return `${c.fontSize} ${c.fontWeight} ${c.color}`;});
 expect(await eyebrow(card)).toBe(await eyebrow(now));
 await expect.poll(async()=>{const [r,n,s]=await Promise.all([card,now,status].map(l=>l.evaluate(e=>e.getBoundingClientRect())));
  return info.project.name==='phone'?Math.abs(r.width-s.width)<2&&Math.abs(n.width-s.width)<2&&r.bottom<=n.top:Math.abs(r.width/s.width-.4)<.02&&Math.abs((n.right-r.left)-s.width)<2&&n.width>r.width&&Math.abs(r.top-n.top)<2&&Math.abs(r.height-n.height)<1;
 }).toBe(true);
 await page.screenshot({path:`artifacts/rejoin-${info.project.name}.png`});
 for(const path of ['/history','/watch','/me']){
  await page.goto(path);await expect(page.getByRole('button',{name:'User menu',exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Rejoin game'})).toBeVisible();expect(new URL(page.url()).pathname).toBe(path);
 }
 expect(launches).toBe(0);
});

test('matchmaking opens the table the moment the game is ready',async({page})=>{
 let ready=false;
 await mock(page,{lobby:()=>({...signedIn,queue:ready?null:{joinedAt:Date.now()},active:ready?activeGame:null}),shared:()=>({...sharedBase,queue:ready?null:{contract:premier,label:'Premier',joinedAt:Date.now()-2000},active:ready?{id:'live',status:'in_progress',format:'Premier',contract:premier,mode:'queue'}:null})});
 await page.route('**/api/lobby/matches/live/launch',r=>r.fulfill({contentType:'text/html',body:'<h1>Game table</h1>'}));
 await page.goto('/');await expect(page.getByRole('heading',{name:'Finding your opponent'})).toBeVisible();
 ready=true;
 await expect(page).toHaveURL(/\/api\/lobby\/matches\/live\/launch$/,{timeout:15000});await expect(page.getByRole('heading',{name:'Game table'})).toBeVisible();
});

test('account menu shows the player and their online ELO and fits every phone width',async({page})=>{
 await mock(page,{lobby:()=>({...signedIn,user:{...pilot,lifetimeElo:1500}})});
 await page.goto('/history');
 const toggle=page.getByRole('button',{name:'User menu',exact:true});await expect(toggle).toHaveCSS('border-radius','50%');
 await toggle.click();const menu=page.locator('.lobby-account-popover');
 await expect(menu).toBeVisible();await expect(menu).toContainText('Pilot');await expect(menu).toContainText('Online ELO 1500');
 await expect(menu.getByRole('link',{name:'Home'})).toHaveAttribute('href','/');
 await menu.getByRole('link',{name:'History'}).click();await expect(page).toHaveURL(/\/history$/);
 await page.keyboard.press('Escape');await expect(menu).not.toBeVisible();
 for(const width of [320,390,768]){await page.setViewportSize({width,height:844});await page.goto('/');expect(await noSideScroll(page)).toBe(true);await toggle.click();const box=await menu.boundingBox();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(width);if(width===390)await page.screenshot({path:'artifacts/lobby-account-phone.png',fullPage:true});await page.keyboard.press('Escape');}
});

test('Stats shows private ratings and confirms a reset without deleting records',async({page},info)=>{
 const record={elo:1612,games:20,wins:12,losses:7,draws:1};
 let current={...signedIn,user:{...pilot,lifetimeElo:1612,seasonElo:1548,stats:{all:record,season:{...record,elo:1548},formats:{all:{Premier:record},season:{Premier:record}},breakdowns:{all:{decks:[],archetypes:[],opponents:[]},season:{decks:[],archetypes:[],opponents:[]}},lastResetAt:null}}};let resets=0;
 await mock(page,{lobby:()=>current});
 await page.route('**/api/lobby/ratings/reset',async r=>{expect(r.request().postDataJSON().confirm).toBe(true);resets++;current={...current,user:{...current.user,lifetimeElo:1500,seasonElo:1500}};await r.fulfill({json:{ok:true}});});
 await page.goto('/me');await expect(page.getByRole('heading',{name:'Stats',exact:true})).toBeVisible();await expect(page.locator('.stats-elo')).toHaveText('1612');await expect(page.locator('.stats-tiles')).toContainText('60%');
 expect(await noSideScroll(page)).toBe(true);
 await page.screenshot({path:`artifacts/stats-${info.project.name}.png`,fullPage:true});
 await page.getByRole('button',{name:'Reset ELO',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Reset ELO to 1500?'});await expect(dialog).toContainText('This cannot be undone.');expect(resets).toBe(0);await dialog.getByRole('button',{name:'Keep my ELO'}).click();expect(resets).toBe(0);
 await page.getByRole('button',{name:'Reset ELO',exact:true}).click();await page.getByRole('button',{name:'Reset to 1500',exact:true}).click();await expect(page.getByRole('status')).toContainText('now 1500');expect(resets).toBe(1);await expect(page.locator('.stats-elo')).toHaveText('1500');await expect(page.locator('.stats-tiles')).toContainText('60%');
});

test('homepage settings separates connected Discord from gameplay',async({page},info)=>{
 await mock(page,{lobby:()=>signedIn});await page.goto('/');await page.getByRole('button',{name:'Settings',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Settings',exact:true});await expect(dialog.getByRole('tabpanel')).toContainText('Pilot');await expect(dialog.getByRole('tabpanel')).toContainText('Discord');await expect(dialog.locator('.decision-tools')).toHaveCount(0);
 await page.screenshot({path:`artifacts/account-settings-${info.project.name}.png`,fullPage:true});
 await dialog.getByRole('tab',{name:'Account',exact:true}).press('ArrowRight');await expect(dialog.getByRole('tab',{name:'Gameplay',exact:true})).toBeFocused();await expect(dialog.locator('.preset-options[aria-label="Interaction style"]')).toBeVisible();await dialog.getByRole('group',{name:'Animations',exact:true}).getByRole('button',{name:'Off',exact:true}).click();
 await dialog.getByRole('tab',{name:'Account',exact:true}).click();await dialog.getByRole('tab',{name:'Gameplay',exact:true}).click();await expect(dialog.getByRole('group',{name:'Animations',exact:true}).getByRole('button',{name:'Off',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.screenshot({path:`artifacts/gameplay-settings-${info.project.name}.png`,fullPage:true});expect(await noSideScroll(page)).toBe(true);
});

test('webpage modals dismiss on outside click without activating the page',async({page})=>{
 await mock(page);await page.goto('/');await page.getByRole('button',{name:'Settings',exact:true}).click();const settings=page.getByRole('dialog',{name:'Settings',exact:true});await expect(settings).toBeVisible();await settings.getByRole('tab',{name:'Gameplay',exact:true}).click();await expect(settings).toBeVisible();
 await page.mouse.click(2,2);await expect(settings).toHaveCount(0);await expect(page).toHaveURL(/\/$/);
 await page.getByRole('button',{name:'Themes',exact:true}).click();const themes=page.getByRole('dialog',{name:'Themes',exact:true});await themes.getByRole('button',{name:/^Hoth Ice Table/}).click();await expect(themes).toBeVisible();await page.mouse.click(2,2);await expect(themes).toHaveCount(0);
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.keyboard.press('Escape');await expect(settings).toHaveCount(0);
});

test('settings Theme tab updates the page, stays open, and shares the saved picker selection',async({page},info)=>{
 await mock(page);await page.goto('/');await page.getByRole('button',{name:'Settings',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Settings',exact:true});await dialog.getByRole('tab',{name:'Theme',exact:true}).click();await dialog.getByRole('button',{name:'Hoth Ice Table',exact:true}).click();await expect(dialog).toBeVisible();await expect(dialog.getByRole('button',{name:'Hoth Ice Table',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.locator('.lobby-app')).toHaveAttribute('data-theme','hoth');await page.screenshot({path:`artifacts/settings-theme-${info.project.name}.png`,fullPage:true});await dialog.getByRole('button',{name:'Close',exact:true}).click();await page.reload();await expect(page.locator('.lobby-app')).toHaveAttribute('data-theme','hoth');await page.getByRole('button',{name:'Themes',exact:true}).click();await expect(page.getByRole('dialog',{name:'Themes',exact:true}).getByRole('button',{name:/^Hoth Ice Table/})).toHaveAttribute('aria-pressed','true');
});

test('release notes icon shows unread state, toasts once, and reads on open',async({page})=>{
 const notes='# Notes\n\n## 2026-10-08 · Opponent switch\n- One switch for queue, private and AI.\n\n## 2026-10-01 · Earlier\nOlder entry.\n';
 await mock(page);await page.route('**/release-notes.md**',route=>route.fulfill({contentType:'text/markdown',body:notes}));
 await page.goto('/');
 const button=page.getByRole('button',{name:'Release notes, 2 unread',exact:true});await expect(button).toBeVisible();
 await expect(page.locator('.lobby-toast')).toContainText('Opponent switch');
 await button.click();
 const dialog=page.getByRole('dialog',{name:'Release notes',exact:true});await expect(dialog).toBeVisible();await expect(dialog.getByRole('heading',{name:/Opponent switch/})).toBeVisible();await expect(dialog.getByText('New',{exact:true})).toHaveCount(2);
 await dialog.getByRole('button',{name:'Close release notes',exact:true}).click();
 await expect(page.getByRole('button',{name:'Release notes',exact:true})).toBeVisible();
 await page.reload();await expect(page.getByRole('button',{name:'Release notes',exact:true})).toBeVisible();await expect(page.locator('.lobby-toast')).toHaveCount(0);
});

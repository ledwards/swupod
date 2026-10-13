import {test,expect} from '@playwright/test';
const premier={format:'premier',limited:'six',set:'',pool:'current'};
const game=(over:Record<string,unknown>)=>({players:['Pilot','Purrgil AI'],seat:0,leaders:['SOR_005','SOR_010'],bases:['SOR_020','SOR_023'],format:'Premier',status:'complete',result:'Win',mode:'ai',contract:premier,createdAt:1791331200000,completedAt:1791331200000+1500000,...over});
test('history offers playback and a log download while pending replays stay visible',async({page},info)=>{
 await page.route('**/api/session',r=>r.fulfill({status:401,json:{}}));
 await page.route('**/api/lobby/shared',r=>r.fulfill({json:{signedIn:true,enabled:true,ptpOrigin:'https://www.protectthepod.com',playOrigin:'https://play.protectthepod.com',sets:[],pools:[],queues:[],pods:[],active:null,queue:null}}));
 await page.route('**/api/lobby/decks/played',r=>r.fulfill({json:{decks:[]}}));
 await page.route('**/api/lobby',r=>r.fulfill({json:{activity:{activeGames:0,queuedPlayers:0},user:{name:'Pilot'},capabilities:{queue:true,private:true,ai:true},loginUrl:'/login',active:null,queue:null,games:[],history:[game({id:'complete',replayUrl:'/api/lobby/matches/complete/replay',recordingUrl:'/api/lobby/matches/complete/recording'}),game({id:'pending',players:['Pilot','Second'],createdAt:1791334800000,completedAt:1791336000000})]}}));
 await page.route('**/api/lobby/matches/complete/recording',r=>r.fulfill({contentType:'application/vnd.swu-pgn',body:'[Game "SWU-PGN/1.0"]\n'}));
 await page.goto('/history');
 await expect(page.getByRole('link',{name:'▶ Play',exact:true})).toHaveAttribute('href','/api/lobby/matches/complete/replay');
 await expect(page.getByText('Saving replay…')).toBeVisible();
 const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'⤓ Download',exact:true}).click();expect((await downloaded).suggestedFilename()).toBe('game.swupgn');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`artifacts/recording-history-${info.project.name}.png`,fullPage:true});
});

test('history filters games by format and says when a format has none',async({page})=>{
 await page.route('**/api/session',r=>r.fulfill({status:401,json:{}}));
 await page.route('**/api/lobby/shared',r=>r.fulfill({json:{signedIn:true,enabled:true,ptpOrigin:'https://www.protectthepod.com',playOrigin:'https://play.protectthepod.com',sets:[],pools:[],queues:[],pods:[],active:null,queue:null}}));
 await page.route('**/api/lobby/decks/played',r=>r.fulfill({json:{decks:[]}}));
 const games=[game({id:'one',replayUrl:'/play/one'}),game({id:'two',players:['Pilot','Han fan'],format:'Limited',result:'Loss',contract:{format:'limited',limited:'six',set:'SOR',pool:'current'},createdAt:1791417600000,completedAt:1791419000000,replayUrl:'/play/two'})];
 await page.route('**/api/lobby',r=>r.fulfill({json:{activity:{activeGames:0,queuedPlayers:0},user:{name:'Pilot'},capabilities:{},loginUrl:'/login',active:null,queue:null,games:[],history:games}}));
 await page.goto('/history');
 const chips=page.getByRole('group',{name:'Format',exact:true});
 await expect(page.locator('.ph-history-item')).toHaveCount(2);
 await chips.getByRole('button',{name:'Limited',exact:true}).click();await expect(page.locator('.ph-history-item')).toHaveCount(1);await expect(page.getByRole('link',{name:'▶ Play',exact:true})).toHaveAttribute('href','/play/two');
 await chips.getByRole('button',{name:'Eternal',exact:true}).click();await expect(page.getByText('No games in this format yet.',{exact:true})).toBeVisible();
 await chips.getByRole('button',{name:'All',exact:true}).click();await expect(page.locator('.ph-history-item')).toHaveCount(2);
});

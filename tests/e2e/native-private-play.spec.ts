import { test, expect, type Page } from '@playwright/test'

// Browser contract tests with explicit API doubles. These do not claim real-engine integration.
const deck = { poolShareId: 'pool-fixture', setCode: 'SOR', setName: 'Spark of Rebellion', poolType: 'draft', name: 'Saved draft deck', leaderName: 'Luke Skywalker', baseName: 'Command Center', packCount: 3, mainDeckCount: 30, ready: true, blocker: null, createdAt: null, updatedAt: null }
async function signedIn(page: Page) {
  await page.route('**/api/auth/session', route => route.fulfill({ json: { success: true, data: { user: { id: 'test-user', username: 'Test player', email: 'test@example.invalid', is_admin: false, is_beta_tester: true } } } }))
  await page.route('**/api/auth/patron-status', route => route.fulfill({ json: { success: true, data: { isPatron: false } } }))
  await page.route('**/api/play/native/decks*', route => route.fulfill({ json: { decks: [deck] } }))
  await page.route('**/api/play/native/matches', route => route.fulfill({ json: { matches: [] } }))
}

test('native invite sign-in keeps invitation and selected deck', async ({ page }) => {
  await page.route('**/api/auth/session', route => route.fulfill({ json: { success: true, data: null } }))
  await page.goto('/play/native?invite=private-fixture&pool=pool-fixture')
  const href = await page.getByRole('link', { name: 'Sign in with Discord', exact: true }).getAttribute('href')
  expect(new URL(href!, 'https://example.invalid').searchParams.get('return_to')).toBe('/play/native?invite=private-fixture&pool=pool-fixture')
})

test('a lost create response retains request identity and selected deck on retry', async ({ page }) => {
  await signedIn(page)
  const ids: string[] = []
  await page.route('**/api/play/native/invitations', async route => {
    const body = route.request().postDataJSON() as { requestId: string; poolShareId: string }
    ids.push(body.requestId)
    expect(body.poolShareId).toBe(deck.poolShareId)
    if (ids.length === 1) await route.fulfill({ status: 503, json: { code: 'native_unavailable', error: 'Temporarily unavailable. Retry safely.' } })
    else await route.fulfill({ json: { matchId: 'match-fixture', token: 'private-fixture', status: 'waiting', allowMismatch: false } })
  })
  await page.route('**/api/play/native/invitations/private-fixture', route => route.fulfill({ json: { matchId: 'match-fixture', status: 'waiting', seat: 0, allowMismatch: false, setCode: 'SOR', poolType: 'draft', packCount: 3 } }))
  await page.goto('/play/native?pool=pool-fixture')
  await page.getByRole('button', { name: 'Invite a friend', exact: true }).click()
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Temporarily unavailable')
  await expect(page.getByRole('radio')).toBeChecked()
  await page.getByRole('button', { name: 'Invite a friend', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Waiting for your friend' })).toBeVisible()
  await expect(page.getByLabel('Invite link', { exact: true })).toHaveValue(/\/play\/native\?invite=private-fixture$/)
  expect(ids).toHaveLength(2)
  expect(ids[0]).toBe(ids[1])
})

test('join eligibility error remains visible after invitation polling', async ({ page }) => {
  await signedIn(page)
  let reads = 0
  await page.route('**/api/play/native/invitations/private-fixture', async route => {
    if (route.request().method() === 'POST') await route.fulfill({ status: 409, json: { code: 'unverified_source', error: 'A completed server draft is required.' } })
    else { reads++; await route.fulfill({ json: { matchId: 'match-fixture', status: 'waiting', seat: null, allowMismatch: true, setCode: 'SOR', poolType: 'draft', packCount: 3 } }) }
  })
  await page.goto('/play/native?invite=private-fixture&pool=pool-fixture')
  await page.getByRole('button', { name: 'Join and play', exact: true }).click()
  await expect(page.getByRole('main').getByRole('alert')).toContainText('A completed server draft is required.')
  const priorReads = reads
  await expect.poll(() => reads).toBeGreaterThan(priorReads)
  await expect(page.getByRole('main').getByRole('alert')).toContainText('A completed server draft is required.')
  await expect(page.getByRole('radio')).toBeChecked()
})

test('rematch waits for both people and opens without an extra confirmation', async ({ page }) => {
  await signedIn(page)
  let accepted = false
  let otherAccepted = false
  let launches = 0
  await page.route('**/api/play/native/matches/finished-fixture', route => route.fulfill({ json: { matchId: 'finished-fixture', status: 'complete', seat: 1, result: 'player2' } }))
  await page.route('**/api/play/native/matches/finished-fixture/rematch', async route => {
    if (route.request().method() === 'POST') { expect(route.request().postDataJSON()).toEqual({ accept: true }); accepted = true }
    await route.fulfill({ json: { status: accepted && otherAccepted ? 'ready' : 'waiting', accepted: [otherAccepted, accepted], matchId: accepted && otherAccepted ? 'rematch-fixture' : null } })
  })
  await page.route('**/api/play/native/matches/rematch-fixture/launch', async route => { launches++; await route.fulfill({ json: { launchUrl: `${new URL(page.url()).origin}/native-test-launched` } }) })
  await page.route('**/native-test-launched', route => route.fulfill({ contentType: 'text/html', body: '<h1>Test launch accepted</h1>' }))
  await page.goto('/play/native?match=finished-fixture')
  await expect(page.getByRole('heading', { name: 'You won', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Rematch', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Rematch requested' })).toBeDisabled()
  expect(launches).toBe(0)
  otherAccepted = true
  await expect(page.getByRole('heading', { name: 'Test launch accepted' })).toBeVisible()
  expect(launches).toBe(1)
})

test('a completed original invitation displays the authoritative result', async ({ page }) => {
  await signedIn(page)
  await page.route('**/api/play/native/invitations/completed-invite', route => route.fulfill({ json: { matchId:'completed-match',status:'complete',seat:0,allowMismatch:false } }))
  await page.route('**/api/play/native/matches/completed-match', route => route.fulfill({ json: { matchId:'completed-match',status:'complete',seat:0,result:'player1' } }))
  await page.route('**/api/play/native/matches/completed-match/rematch', route => route.fulfill({ json: { status:'waiting',accepted:[false,false],matchId:null } }))
  await page.goto('/play/native?invite=completed-invite')
  await expect(page.getByRole('heading',{name:'You won',exact:true})).toBeVisible()
  await expect(page.getByText('Result pending',{exact:true})).toHaveCount(0)
})

test('public Find game retries with the same identity and cancellation frees the deck', async ({page}) => {
 await signedIn(page);let availability:any=null;const requests:string[]=[];
 await page.route('**/api/play/native/public', async route=>{
  if(route.request().method()==='POST'){requests.push(route.request().postDataJSON().requestId);if(requests.length===1)return route.fulfill({status:503,json:{error:'Please retry safely.'}});availability={matchId:'public-match',status:'waiting',seat:0,setCode:'SOR',poolType:'draft',packCount:3,poolShareId:deck.poolShareId,visibility:'public'};return route.fulfill({json:availability});}
  return route.fulfill({json:{entries:[],availability}});
 });
 await page.route('**/api/play/native/public/public-match',route=>{expect(route.request().method()).toBe('DELETE');availability=null;return route.fulfill({json:{status:'cancelled'}})});
 await page.goto('/play?pool=pool-fixture');await page.getByRole('button',{name:'Find game',exact:true}).click();await expect(page.getByRole('main').getByRole('alert')).toContainText('Please retry safely.');await page.getByRole('button',{name:'Find game',exact:true}).click();await expect(page.getByRole('heading',{name:'Finding your opponent'})).toBeVisible();expect(requests[0]).toBe(requests[1]);await expect(page.getByRole('radio')).toBeDisabled();await page.getByRole('button',{name:'Cancel search'}).click();await expect(page.getByRole('button',{name:'Find game',exact:true})).toBeEnabled();await expect(page.getByText(/Karabast|Install.*Companion/)).toHaveCount(0);
});

test('public table joins the selected compatible deck and opens without confirmation', async ({page}) => {
 await signedIn(page);let launches=0;
 await page.route('**/api/play/native/public',route=>route.fulfill({json:{entries:[{matchId:'open-match',setCode:'SOR',poolType:'draft',packCount:3,createdAt:'2026-09-30'}],availability:null}}));
 await page.route('**/api/play/native/public/open-match/join',route=>{expect(route.request().postDataJSON().poolShareId).toBe(deck.poolShareId);return route.fulfill({json:{matchId:'open-match',status:'active',seat:1,setCode:'SOR',poolType:'draft',packCount:3,poolShareId:deck.poolShareId,visibility:'public'}})});
 await page.route('**/api/play/native/matches/open-match/launch',route=>{launches++;return route.fulfill({json:{launchUrl:`${new URL(page.url()).origin}/native-test-launched`}})});
 await page.route('**/native-test-launched',route=>route.fulfill({contentType:'text/html',body:'<h1>Test launch accepted</h1>'}));
 await page.goto('/play');await page.getByRole('button',{name:'Join table',exact:true}).click();await expect(page.getByRole('heading',{name:'Test launch accepted'})).toBeVisible();expect(launches).toBe(1);
});

test('native eligibility blockers and pack mismatch prevent public admission', async ({page}) => {
 await signedIn(page);await page.route('**/api/play/native/decks*',route=>route.fulfill({json:{decks:[{...deck,ready:false,blocker:'A completed server draft is required.',blockerCode:'unverified_source'}]}}));
 await page.route('**/api/play/native/public',route=>route.fulfill({json:{entries:[{matchId:'sealed',setCode:'SOR',poolType:'sealed',packCount:6}],availability:null}}));
 await page.goto('/play?pool=pool-fixture');await expect(page.locator('.native-selected-blocker')).toBeVisible();await expect(page.getByRole('button',{name:'Find game',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Join table',exact:true})).toBeDisabled();
});

test('replay reports archive pending and retries with a single launch action', async ({page}) => {
 await signedIn(page);await page.route('**/api/play/native/matches/finished-fixture',route=>route.fulfill({json:{matchId:'finished-fixture',status:'complete',seat:0,result:'player1'}}));await page.route('**/api/play/native/matches/finished-fixture/rematch',route=>route.fulfill({json:{status:'waiting',accepted:[false,false],matchId:null}}));let calls=0;
 await page.route('**/api/play/native/matches/finished-fixture/replay-launch',route=>{calls++;return calls===1?route.fulfill({status:503,json:{error:'The replay is still being saved. Please retry.'}}):route.fulfill({json:{launchUrl:`${new URL(page.url()).origin}/native-test-replay`}})});
 await page.route('**/native-test-replay',route=>route.fulfill({contentType:'text/html',body:'<h1>Test replay opened</h1>'}));await page.goto('/play/native?match=finished-fixture');await page.getByRole('button',{name:'Watch replay',exact:true}).click();await expect(page.getByRole('main').getByRole('alert')).toContainText('still being saved');await page.getByRole('button',{name:'Watch replay',exact:true}).click();await expect(page.getByRole('heading',{name:'Test replay opened'})).toBeVisible();expect(calls).toBe(2);
});


test('public lobby remains usable on desktop and phone', async ({page}) => {
 await signedIn(page);await page.route('**/api/play/native/public',route=>route.fulfill({json:{entries:[{matchId:'open-match',setCode:'SOR',poolType:'draft',packCount:3,createdAt:'2026-09-30'}],availability:null}}));await page.goto('/play?pool=pool-fixture');await expect(page.getByRole('button',{name:'Find game',exact:true})).toBeEnabled();await page.screenshot({path:'artifacts/native-public-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});await expect(page.locator('.native-public-tables')).not.toHaveAttribute('open','');await page.locator('.native-public-tables summary').click();await expect(page.getByRole('button',{name:'Join table',exact:true})).toBeEnabled();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'artifacts/native-public-phone.png',fullPage:true});
});

test('returning to a public waiting seat opens the matched game once', async ({page}) => {
 await signedIn(page);let matched=false;let launches=0;const own={matchId:'reserved',status:'waiting',seat:0,setCode:'SOR',poolType:'draft',packCount:3,poolShareId:deck.poolShareId,visibility:'public'};
 await page.route('**/api/play/native/matches',route=>route.fulfill({json:{matches:[own]}}));await page.route('**/api/play/native/public',route=>route.fulfill({json:{entries:[],availability:{...own,status:matched?'active':'waiting'}}}));
 await page.route('**/api/play/native/matches/reserved/launch',route=>{launches++;return route.fulfill({json:{launchUrl:`${new URL(page.url()).origin}/native-test-launched`}})});await page.route('**/native-test-launched',route=>route.fulfill({contentType:'text/html',body:'<h1>Test launch accepted</h1>'}));await page.goto('/play');await expect(page.getByRole('heading',{name:'Finding your opponent'})).toBeVisible();await expect(page.getByRole('heading',{name:'You already have a table'})).toHaveCount(0);matched=true;await expect(page.getByRole('heading',{name:'Test launch accepted'})).toBeVisible();expect(launches).toBe(1);
});

test('homepage routes saved decks to native Play without external lobby discovery', async ({page}) => {
 await signedIn(page);const externalLobbyRequests:string[]=[];page.on('request',request=>{if(/karabast|\/api\/open-games|\/api\/lobbies\/public/.test(request.url()))externalLobbyRequests.push(request.url())});await page.goto('/');await expect(page.getByRole('link',{name:'Play a deck',exact:true})).toHaveAttribute('href','/play');await expect(page.getByRole('region',{name:'Draft pods open',exact:true})).toBeVisible();expect(externalLobbyRequests).toEqual([]);await page.screenshot({path:'artifacts/native-home-entry.png',fullPage:true});
});

test('committed admission with lost response can cancel and find a fresh table in one click',async({page})=>{
 await signedIn(page);let availability:any=null;const ids:string[]=[];const own={matchId:'lost-match',status:'waiting',seat:0,setCode:'SOR',poolType:'draft',packCount:3,poolShareId:deck.poolShareId,visibility:'public'};
 await page.route('**/api/play/native/public',async route=>{if(route.request().method()==='POST'){ids.push(route.request().postDataJSON().requestId);availability={...own,matchId:ids.length===1?'lost-match':'fresh-match'};if(ids.length===1)return route.abort('failed');return route.fulfill({json:availability});}return route.fulfill({json:{entries:[],availability}})});
 await page.route('**/api/play/native/public/lost-match',route=>{availability=null;return route.fulfill({json:{status:'cancelled'}})});
 await page.goto('/play');await page.getByRole('button',{name:'Find game',exact:true}).click();await expect(page.getByRole('button',{name:'Cancel search'})).toBeVisible();expect(await page.evaluate(()=>Object.keys(sessionStorage).filter(key=>key.startsWith('native-public-request:')))).toEqual([]);await page.reload();await page.getByRole('button',{name:'Cancel search'}).click();await page.getByRole('button',{name:'Find game',exact:true}).click();await expect(page.getByRole('button',{name:'Cancel search'})).toBeVisible();expect(ids).toHaveLength(2);expect(ids[0]).not.toBe(ids[1]);
});

test('lost response after pairing still auto-launches without Resume click',async({page})=>{
 await signedIn(page);let availability:any=null;let launches=0;
 await page.route('**/api/play/native/public',route=>{if(route.request().method()==='POST'){availability={matchId:'paired-lost',status:'starting',seat:1,setCode:'SOR',poolType:'draft',packCount:3,poolShareId:deck.poolShareId,visibility:'public'};return route.abort('failed');}return route.fulfill({json:{entries:[],availability}})});
 await page.route('**/api/play/native/matches/paired-lost/launch',route=>{launches++;return route.fulfill({json:{launchUrl:`${new URL(page.url()).origin}/native-test-launched`}})});await page.route('**/native-test-launched',route=>route.fulfill({contentType:'text/html',body:'<h1>Test launch accepted</h1>'}));await page.goto('/play');await page.getByRole('button',{name:'Find game',exact:true}).click();await expect(page.getByRole('heading',{name:'Test launch accepted'})).toBeVisible();expect(launches).toBe(1);
});

test('public recovery displays the reserved deck rather than the first ready deck',async({page})=>{
 await signedIn(page);await page.route('**/api/play/native/decks*',route=>route.fulfill({json:{decks:[{...deck,poolShareId:'other-pool',name:'Newest deck'},deck]}}));await page.route('**/api/play/native/public',route=>route.fulfill({json:{entries:[],availability:{matchId:'reserved',status:'waiting',seat:0,setCode:'SOR',poolType:'draft',packCount:3,poolShareId:deck.poolShareId,visibility:'public'}}}));await page.goto('/play');await expect(page.getByRole('radio',{name:/Saved draft deck · Reserved/})).toBeChecked();await expect(page.getByRole('radio',{name:/Newest deck/})).not.toBeChecked();await expect(page.getByRole('radio',{name:/Saved draft deck · Reserved/})).toBeDisabled();
});

for (const viewport of [{width:1280,height:800}, {width:834,height:1112}, {width:390,height:844}]) {
 test(`large library keeps play actions in view at ${viewport.width}px`, async ({page}) => {
  await page.setViewportSize(viewport)
  await signedIn(page)
  const cards = (await import('../../src/data/cards.json', { with: { type: 'json' } })).default.cards
  const leaders = cards.filter(card => card.type === 'Leader' && card.set === 'SOR' && card.variantType === 'Normal')
  const decks = Array.from({length:80}, (_,index) => {
   const leader = leaders[index % leaders.length]!
   return {...deck, poolShareId:`deck-${index}`, name:`${leader.name} ${index % 2 ? 'Sealed' : 'Draft'} ${index + 1}`, leaderName:leader.name, leaderImageUrl:leader.imageUrl, poolType:index % 2 ? 'sealed' : 'draft',packCount:index % 2 ? 6 : 3}
  })
  await page.route('**/api/play/native/decks*',route=>route.fulfill({json:{decks}}))
  await page.route('**/api/play/native/public',route=>route.fulfill({json:{entries:Array.from({length:30},(_,i)=>({matchId:`open-${i}`,setCode:'SOR',poolType:'draft',packCount:3})),availability:null}}))
  await page.goto('/play')
  await expect(page.getByRole('button',{name:'Find game',exact:true})).toBeEnabled()
  for (const name of ['Find game','Invite a friend']) {
   const bounds = await page.getByRole('button',{name,exact:true}).boundingBox()
   expect(bounds).not.toBeNull()
   expect(bounds!.y).toBeGreaterThanOrEqual(0)
   expect(bounds!.y + bounds!.height).toBeLessThan(viewport.height)
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width)
  const library = page.locator('.native-play-decks')
  expect(await library.evaluate(el=>el.scrollHeight > el.clientHeight)).toBe(true)
  await page.locator('.native-selected-deck img').evaluate(async image => { await (image as HTMLImageElement).decode().catch(() => {}) })
  await page.locator('.native-deck-art').evaluateAll(async images => { await Promise.all(images.filter(image => { const rect = image.getBoundingClientRect(); return rect.top < innerHeight && rect.bottom > 0 }).map(image => (image as HTMLImageElement).decode().catch(() => {}))) })
  await page.screenshot({path:`artifacts/native-library-${viewport.width}.png`,fullPage:true})
  // Filtering never silently swaps the deck being sent to the queue.
  await page.getByRole('button',{name:'Sealed',exact:true}).click()
  await expect(page.getByRole('radio')).toHaveCount(40)
  await expect(page.getByLabel('Play with selected deck')).toContainText(decks[0]!.name)
  await page.getByRole('searchbox',{name:'Search decks'}).fill(decks[79]!.name)
  await expect(page.getByRole('radio')).toHaveCount(1)
  await page.getByRole('radio').check()
  await expect(page.getByLabel('Play with selected deck')).toContainText(decks[79]!.name)
  await page.getByRole('searchbox',{name:'Search decks'}).fill('no such deck')
  await expect(page.getByText('No decks match these filters.')).toBeVisible()
  await expect(page.getByLabel('Play with selected deck')).toContainText(decks[79]!.name)
 })
}

test('local self play opens two seats for an older build without enabling public admission',async({page})=>{
 await signedIn(page)
 await page.route('**/api/play/native/decks*',route=>route.fulfill({json:{localTesting:true,decks:[{...deck,ready:false,practiceReady:true,blocker:'This older pool has no immutable generation record.'}]}}))
 await page.route('**/api/play/native/public',route=>route.fulfill({json:{entries:[],availability:null}}))
 await page.goto('/play')
 await expect(page.getByRole('radio')).toBeChecked()
 await expect(page.getByRole('button',{name:'Find game',exact:true})).toBeDisabled()
 await expect(page.getByRole('button',{name:'Invite a friend',exact:true})).toBeDisabled()
 await page.getByRole('button',{name:'Test both sides',exact:true}).click()
 const one=page.getByRole('link',{name:'Open player 1',exact:true}),two=page.getByRole('link',{name:'Open player 2',exact:true})
 await expect(one).toHaveAttribute('target','_blank')
 await expect(two).toHaveAttribute('target','_blank')
 const first=new URL((await one.getAttribute('href'))!,'http://localhost:3000'),second=new URL((await two.getAttribute('href'))!,'http://localhost:3000')
 expect(first.searchParams.get('request')).toBe(second.searchParams.get('request'))
 expect(first.searchParams.get('seat')).toBe('0')
 expect(second.searchParams.get('seat')).toBe('1')
 expect(first.searchParams.get('pool')).toBe(deck.poolShareId)
})

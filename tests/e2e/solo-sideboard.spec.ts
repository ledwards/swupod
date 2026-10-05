import {test,expect} from '@playwright/test'
import {getAllCards} from '../../src/utils/cardData'
import type {SideboardData} from '../../src/services/play/solo/sideboard'
const catalog=getAllCards().filter(c=>c.set==='SOR'&&c.variantType==='Normal')
const leaders=catalog.filter(c=>c.type==='Leader').slice(0,2), bases=catalog.filter(c=>c.type==='Base'&&c.rarity==='Common').slice(0,2)
const units=catalog.filter(c=>['Unit','Event','Upgrade'].includes(c.type)).slice(0,22)
const cards=[...leaders,...bases,...units].map(c=>({id:c.id,engineId:`SOR_${String(c.number).padStart(3,'0')}`,name:c.name,type:c.type,count:c.type==='Leader'||c.type==='Base'?1:2,supported:true,imageUrl:c.imageUrl}))
const selection={leader:leaders[0]!.id,base:bases[0]!.id,deck:Object.fromEntries(units.slice(0,15).map(c=>[c.id,2]))}
const data:SideboardData={runId:'11111111-1111-4111-a111-111111111111',gameId:'22222222-2222-4222-a222-222222222222',gameNumber:2,poolShareId:'pool',returnUrl:'/limited/ai?pool=pool',cards,selection,
 builds:[{shareId:'alternate',name:'Alternate build',selection:{...selection,leader:leaders[1]!.id,base:bases[1]!.id}}]}
for(const width of [1280,390]) test(`sideboarding at ${width}px validates moves and submits the selected build`,async({page})=>{
 await page.setViewportSize({width,height:900})
 await page.route('**/api/auth/session',r=>r.fulfill({json:{success:true,data:{user:{id:'test',username:'Test',is_beta_tester:true}}}}))
 await page.route('**/api/play/native/presentation',r=>r.fulfill({json:{enabled:true}}))
 await page.route('**/api/auth/patron-status',r=>r.fulfill({json:{success:true,data:{isPatron:false}}}))
 await page.route('**/api/entry/ai/sideboard?*',r=>r.fulfill({json:data}))
 let submitted:Record<string,any>|undefined
 await page.route('**/api/entry/ai/sideboard',r=>{submitted=r.request().postDataJSON();return r.fulfill({json:{launchUrl:'/sideboard-test-complete'}})})
 await page.route('**/sideboard-test-complete',r=>r.fulfill({contentType:'text/html',body:'<h1>Game ready</h1>'}))
 await page.goto(`/limited/sideboard?run=${data.runId}`,{waitUntil:'domcontentloaded'})
 const next=page.getByRole('button',{name:'Continue to game'})
 await expect(next).toBeEnabled()
 await page.getByRole('button',{name:`Move ${units[0]!.name} to sideboard`,exact:true}).click()
 await expect(next).toBeDisabled()
 await expect(page.getByText('Your deck needs at least 30 cards (29 selected).')).toBeVisible()
 await page.getByRole('button',{name:`Add ${units[0]!.name} to deck`,exact:true}).click()
 await expect(next).toBeEnabled()
 await page.getByLabel('Saved build').selectOption('alternate')
 await expect(page.getByLabel('Choose leader')).toHaveValue(leaders[1]!.id)
 await expect(page.getByLabel('Choose base')).toHaveValue(bases[1]!.id)
 await page.locator('.sideboard-card img').evaluateAll(async images=>{await Promise.all(images.map(image=>(image as HTMLImageElement).decode().catch(()=>{})))})
 expect(await page.evaluate(()=>[...document.querySelectorAll('a,button,select,input')].every(e=>e.getBoundingClientRect().right<=innerWidth+1))).toBe(true)
 await page.screenshot({path:`artifacts/sideboard-${width}.png`,fullPage:true})
 await next.click()
 await expect(page.getByRole('heading',{name:'Game ready'})).toBeVisible()
 expect(submitted?.gameId).toBe(data.gameId)
 expect(submitted?.buildShareId).toBe('alternate')
 expect(submitted?.selection.leader).toBe(leaders[1]!.id)
})

test('Purrgil conversion intent opens host sideboarding once',async({page})=>{
 await page.route('**/api/auth/session',r=>r.fulfill({json:{success:true,data:{user:{id:'test',username:'Test',is_beta_tester:true}}}}))
 await page.route('**/api/play/native/presentation',r=>r.fulfill({json:{enabled:true}}))
 await page.route('**/api/auth/patron-status',r=>r.fulfill({json:{success:true,data:{isPatron:false}}}))
 await page.route('**/api/entry/runs/*',r=>r.fulfill({json:{pool:'pool',request:'existing',format:'ai'}}))
 let conversions=0
 await page.route('**/api/entry/ai**',r=>{
  if(r.request().method()==='POST'){
   expect(r.request().postDataJSON()).toEqual({action:'bo3',runId:data.runId});conversions++
   return r.fulfill({json:{launchUrl:`/runs/${data.runId}/sideboard`}})
  }
  return r.fulfill({json:{deck:{poolShareId:'pool',name:'My deck',poolType:'sealed',setCode:'SOR',mainDeckCount:30,ready:true},savedDecks:[],bots:[],choice:'default',opponent:null,status:{run:{id:data.runId,complete:true,singleGame:true,matches:[],standings:[],currentGame:null}}}})
 })
 await page.route(`**/runs/${data.runId}/sideboard`,r=>r.fulfill({contentType:'text/html',body:'<h1>Sideboard for game 2</h1>'}))
 await page.goto(`/runs/${data.runId}?convert=bo3`)
 await expect(page.getByRole('heading',{name:'Sideboard for game 2'})).toBeVisible();expect(conversions).toBe(1)
})

for(const complete of [false,true])test(`finished game 2 ${complete?'stays on completed match':'waits for recording and opens sideboard'}`,async({page})=>{
 await page.route('**/api/auth/session',r=>r.fulfill({json:{success:true,data:{user:{id:'test',username:'Test',is_beta_tester:true}}}}))
 await page.route('**/api/play/native/presentation',r=>r.fulfill({json:{enabled:true}}))
 await page.route('**/api/auth/patron-status',r=>r.fulfill({json:{success:true,data:{isPatron:false}}}))
 await page.route('**/api/entry/runs/*',r=>r.fulfill({json:{pool:'pool',request:'existing',format:'ai'}}))
 let polls=0,sideboards=0
 await page.route('**/api/entry/ai?*',r=>{
  polls++;const recorded=complete||polls>1
  return r.fulfill({json:{deck:{poolShareId:'pool',name:'My deck',poolType:'sealed',setCode:'SOR',mainDeckCount:30,ready:true},savedDecks:[],bots:[],choice:'default',opponent:null,status:{run:{id:data.runId,complete,singleGame:false,matches:[{id:'match',players:[],wins:[1,1],games:[{id:'game-two',number:2,result:recorded?'player2':null}]}],standings:[],currentGame:complete?null:recorded?{id:'game-three',number:3,started:false}:{id:'game-two',number:2,started:true}}}}})
 })
 await page.route(`**/runs/${data.runId}/sideboard`,r=>{sideboards++;return r.fulfill({contentType:'text/html',body:'<h1>Sideboard for game 3</h1>'})})
 await page.goto(`/runs/${data.runId}?finished=game-two`)
 if(complete){await expect(page.getByRole('heading',{name:'Match complete',exact:true})).toBeVisible();expect(sideboards).toBe(0)}
 else {await expect(page.getByRole('heading',{name:'Sideboard for game 3'})).toBeVisible({timeout:15000});expect(polls).toBeGreaterThan(1);expect(sideboards).toBe(1)}
})

for(const width of [1280,390])test(`opponent picker starts collapsed and whole cards select at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900})
 await page.route('**/api/auth/session',r=>r.fulfill({json:{success:true,data:{user:{id:'test',username:'Test',is_beta_tester:true}}}}))
 await page.route('**/api/play/native/presentation',r=>r.fulfill({json:{enabled:true}}))
 await page.route('**/api/auth/patron-status',r=>r.fulfill({json:{success:true,data:{isPatron:false}}}))
 await page.route('**/api/entry/runs/*',r=>r.fulfill({json:{pool:'pool',request:'existing',format:'ai'}}))
 let selected=''
 const deck={poolShareId:'pool',name:'My deck',poolType:'draft',setCode:'SOR',mainDeckCount:30,ready:true}
 await page.route('**/api/entry/ai**',r=>{
  if(r.request().method()==='POST'){selected=r.request().postDataJSON().opponentParticipantId;return r.fulfill({json:{runId:data.runId,name:'DraftBot Zeta',mainDeckCount:30}})}
  return r.fulfill({json:{deck,savedDecks:[],bots:[{id:'eta',name:'DraftBot Eta',isDefault:true},{id:'zeta',name:'DraftBot Zeta'}],choice:'draft:eta',opponent:{runId:data.runId,name:'DraftBot Eta',mainDeckCount:30},status:{run:null}}})
 })
 await page.goto(`/runs/${data.runId}?chooseOpponent=1`)
 await expect(page.getByRole('button',{name:'Change deck',exact:true})).toHaveAttribute('aria-expanded','false')
 await page.getByRole('button',{name:'Change deck',exact:true}).click()
 await expect(page.getByRole('heading',{name:'DraftBot Eta',exact:true})).toHaveCount(1)
 await expect(page.getByRole('button',{name:'Select DraftBot Zeta'})).toHaveText('')
 await page.getByRole('button',{name:'Select DraftBot Zeta'}).click({position:{x:15,y:15}})
 await expect(page.locator('#entry-opponent-picker')).toHaveCount(0)
 await expect(page.getByRole('heading',{name:'DraftBot Zeta',exact:true})).toBeVisible()
 expect(selected).toBe('zeta')
})

for(const failFirst of [false,true])test(`Play vs AI launches in one click${failFirst?' after a temporary handoff failure':''}`,async({page})=>{
 await page.route('**/api/auth/session',r=>r.fulfill({json:{success:true,data:{user:{id:'test',username:'Test',is_beta_tester:true}}}}))
 await page.route('**/api/play/native/presentation',r=>r.fulfill({json:{enabled:true}}))
 await page.route('**/api/auth/patron-status',r=>r.fulfill({json:{success:true,data:{isPatron:false}}}))
 await page.route('**/api/entry/runs/*',r=>r.fulfill({json:{pool:'pool',request:'existing',format:'ai'}}))
 let launches=0
 await page.route('**/api/entry/ai**',r=>{
  if(r.request().method()==='POST'){
   expect(r.request().postDataJSON()).toEqual({action:'resume',runId:data.runId});launches++
   if(failFirst&&launches===1)return r.fulfill({status:503,json:{code:'runtime_unavailable',error:'Launch not ready'}})
   return r.fulfill({json:{launchUrl:'/launch-test-success'}})
  }
  return r.fulfill({json:{deck:{poolShareId:'pool',name:'My deck',poolType:'draft',setCode:'SOR',mainDeckCount:30,ready:true},savedDecks:[],bots:[],choice:'default',opponent:{runId:data.runId,name:'Leebo',mainDeckCount:30},status:{run:{id:data.runId,complete:false,singleGame:true,matches:[],standings:[],currentGame:{id:data.runId,number:1,started:launches>0}}}}})
 })
 await page.route('**/launch-test-success',r=>r.fulfill({contentType:'text/html',body:'<h1>Game launched</h1>'}))
 await page.goto(`/runs/${data.runId}`)
 await page.getByRole('button',{name:'Play vs AI Beta',exact:true}).click()
 await expect(page.getByRole('heading',{name:'Game launched'})).toBeVisible()
 expect(launches).toBe(failFirst?2:1)
})

test('wide matchup puts the action between outward-aligned players',async({page})=>{
 await page.setViewportSize({width:1440,height:900})
 await page.route('**/api/auth/session',r=>r.fulfill({json:{success:true,data:{user:{id:'test',username:'Test',is_beta_tester:true}}}}))
 await page.route('**/api/play/native/presentation',r=>r.fulfill({json:{enabled:true}}))
 await page.route('**/api/auth/patron-status',r=>r.fulfill({json:{success:true,data:{isPatron:false}}}))
 await page.route('**/api/entry/runs/*',r=>r.fulfill({json:{pool:'pool',request:'existing',format:'elimination'}}))
 const warrior=getAllCards().find(c=>c.name==='The Warrior'&&c.variantType==='Normal')!,camp=getAllCards().find(c=>c.name==='Tusken Camp'&&c.variantType==='Normal')!
 const players=['human','bot'].map((id,i)=>{const leader=i?leaders[i]!:warrior,base=i?bases[i]!:camp;return {id,name:i?'DraftBot Delta':'terronk',archetype:i?'Tarfful Red 30':'Warrior Tatooine Green 30',wins:0,losses:0,leaderName:leader.name,leaderSubtitle:leader.subtitle,leaderImageUrl:leader.imageUrl,baseName:base.name,basePlanet:base.traits.join(' · ')||null,baseImageUrl:base.imageUrl}})
 await page.route('**/api/play/native/solo?*',r=>r.fulfill({json:{run:{id:data.runId,round:1,rounds:3,complete:false,singleGame:false,eventFormat:'elimination',currentGame:{id:'game',number:1,started:true},standings:[],matches:[{id:'match',round:1,players,wins:[0,0],winner:null,games:[{id:'replay-one',number:1,result:'player1',started:true}]}]}}}))
 await page.goto(`/runs/${data.runId}`)
 const hero=page.getByRole('region',{name:'Your matchup'}),action=hero.getByRole('button',{name:/Resume game/})
 await expect(action).toBeVisible()
 await expect(hero.locator('figcaption').filter({hasText:'The Warrior'})).toHaveText('The WarriorDeft Duelist')
 await expect(hero.locator('figcaption').filter({hasText:'Tusken Camp'})).toHaveText('Tusken CampTatooine')
 const own=(await hero.locator('.tournament-contender').first().locator('.tournament-cards').boundingBox())!,opp=(await hero.locator('.tournament-contender').last().locator('.tournament-cards').boundingBox())!,button=(await action.boundingBox())!
 expect(button.y).toBeLessThan(own.y+own.height)
 expect(button.x).toBeGreaterThanOrEqual(own.x+own.width)
 expect(button.x+button.width).toBeLessThanOrEqual(opp.x)
 await expect(hero.locator('.tournament-contender').last().locator('.tournament-identity')).toHaveCSS('text-align','right')
 const replay=page.getByRole('button',{name:'Watch game 1 replay',exact:true})
 await expect(replay).toBeVisible()
 const background=await replay.evaluate(el=>getComputedStyle(el).backgroundColor)
 await replay.hover()
 await expect(replay).not.toHaveCSS('background-color',background)
 await expect(replay).toHaveCSS('color','rgb(7, 16, 31)')
 await page.screenshot({path:'artifacts/compact-matchup.png',fullPage:true})
 await page.route('**/api/play/native/solo',r=>r.fulfill({json:{launchUrl:'/test-replay-window'}}))
 await page.context().route('**/test-replay-window',r=>r.fulfill({contentType:'text/html',body:'<h1>Replay window</h1>'}))
 const popupPromise=page.waitForEvent('popup')
 await replay.click()
 const popup=await popupPromise
 await expect(popup.getByRole('heading',{name:'Replay window'})).toBeVisible()
 await expect(page).toHaveURL(new RegExp(`/runs/${data.runId}$`))
 await popup.close()

})

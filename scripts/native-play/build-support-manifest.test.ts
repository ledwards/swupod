import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'

// Exercise the manifest generator, including normal-print and reprint resolution.
test('Homeworlds Devotion variants resolve to the original engine card without relaxing rules identity',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'native-reprints-'))
 const source=JSON.parse(await readFile('src/data/cards.json','utf8')).cards
 const devotion=source.filter((c:any)=>c.name==='Devotion'&&['SOR','HMW'].includes(c.set))
 assert.ok(devotion.some((c:any)=>c.id==='01a0ad27-dd32-7ece-ac1e-15d7afadc879'))
 const original=devotion.find((c:any)=>c.set==='SOR'&&c.variantType==='Normal')
 const changed={...original,id:'different-rules',set:'HMW',variantType:'Hyperspace',frontText:'Attached unit gains Restore 3.'}
 const server=createServer((_req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({protocolVersion:1,engineRevision:'test',cards:[{id:'SOR_070',type:'Upgrade',authoring:'Scripted'},{id:'HMW_001',type:'Leader',authoring:'Scripted'}]}))})
 try{
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
  const address=server.address() as {port:number}
  await writeFile(join(directory,'env'),'BAIZE_PVP_SERVICE_KEY=test')
  await writeFile(join(directory,'catalog.json'),JSON.stringify({cards:[...devotion,changed]}))
  await promisify(execFile)('node',['--import','tsx','scripts/native-play/build-support-manifest.ts','--env-file',join(directory,'env'),'--output',join(directory,'support.json'),'--catalog',join(directory,'catalog.json'),'--engine',`http://127.0.0.1:${address.port}`])
  const manifest=JSON.parse(await readFile(join(directory,'support.json'),'utf8'))
  for(const card of devotion)assert.equal(manifest.cards.find((entry:any)=>entry.ptpId===card.id)?.engineId,'SOR_070',`${card.set} ${card.variantType}`)
  assert.ok(!manifest.cards.some((entry:any)=>entry.ptpId==='different-rules'))
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(directory,{recursive:true,force:true})}
})

// The feed sometimes omits reminder text on a reprint's Hyperspace printings (LOF-428 Wampa reads "Overwhelm ").
// Reminder text is not rules: those printings are still the original engine card. Different rules still fail closed.
test('a reprint printing missing only reminder text resolves to the original engine card',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'native-reminder-'))
 const source=JSON.parse(await readFile('src/data/cards.json','utf8')).cards
 const wampa=source.filter((c:any)=>c.name==='Wampa'&&['SOR','LOF'].includes(c.set))
 const bare=wampa.filter((c:any)=>c.set==='LOF'&&c.variantType.startsWith('Hyperspace'))
 assert.ok(bare.length===2&&bare.every((c:any)=>!c.frontText.includes('(')),'fixture: LOF Hyperspace Wampa printings lack reminder text')
 const changed={...bare[0],id:'different-rules',frontText:'Overwhelm. When Played: Deal 1 damage to a unit.'}
 const server=createServer((_req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({protocolVersion:1,engineRevision:'test',cards:[{id:'SOR_164',type:'Unit',authoring:'Scripted'},{id:'LOF_001',type:'Leader',authoring:'Scripted'}]}))})
 try{
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
  const address=server.address() as {port:number}
  await writeFile(join(directory,'env'),'BAIZE_PVP_SERVICE_KEY=test')
  await writeFile(join(directory,'catalog.json'),JSON.stringify({cards:[...wampa,changed]}))
  await promisify(execFile)('node',['--import','tsx','scripts/native-play/build-support-manifest.ts','--env-file',join(directory,'env'),'--output',join(directory,'support.json'),'--catalog',join(directory,'catalog.json'),'--engine',`http://127.0.0.1:${address.port}`])
  const manifest=JSON.parse(await readFile(join(directory,'support.json'),'utf8'))
  for(const card of wampa)assert.equal(manifest.cards.find((entry:any)=>entry.ptpId===card.id)?.engineId,'SOR_164',`${card.cardId} ${card.variantType}`)
  assert.ok(!manifest.cards.some((entry:any)=>entry.ptpId==='different-rules'))
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(directory,{recursive:true,force:true})}
})

// Reprints whose text differs only in the feed's formatting (SHD-081 General Tagge: "TROOPER" vs "Trooper";
// SHD-066 Cargo Juggernaut: "[Vigilance]" vs "Vigilance") are the original card. LOF-060 Padawan Starfighter was
// reworded ("a Force unit or upgrade") with the same rules, so it maps by a reviewed entry; nothing else is relaxed.
test('reprints differing only in formatting, and reviewed rewordings, resolve to the original engine card',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'native-format-'))
 const source=JSON.parse(await readFile('src/data/cards.json','utf8')).cards
 const pick=(name:string,sets:string[])=>source.filter((c:any)=>c.name===name&&sets.includes(c.set))
 const tagge=pick('General Tagge',['SOR','SHD']),juggernaut=pick('Cargo Juggernaut',['SOR','SHD']),padawan=pick('Padawan Starfighter',['TWI','LOF'])
 const changed={...tagge.find((c:any)=>c.set==='SHD')!,id:'different-rules',frontText:'When Played: Give an Experience token to each of up to 2 Trooper units.'}
 const server=createServer((_req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({protocolVersion:1,engineRevision:'test',cards:[{id:'SOR_080',type:'Unit',authoring:'Scripted'},{id:'SOR_068',type:'Unit',authoring:'Scripted'},{id:'TWI_058',type:'Unit',authoring:'Scripted'},{id:'SHD_001',type:'Leader',authoring:'Scripted'},{id:'LOF_001',type:'Leader',authoring:'Scripted'}]}))})
 try{
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
  const address=server.address() as {port:number}
  await writeFile(join(directory,'env'),'BAIZE_PVP_SERVICE_KEY=test')
  await writeFile(join(directory,'catalog.json'),JSON.stringify({cards:[...tagge,...juggernaut,...padawan,changed]}))
  await promisify(execFile)('node',['--import','tsx','scripts/native-play/build-support-manifest.ts','--env-file',join(directory,'env'),'--output',join(directory,'support.json'),'--catalog',join(directory,'catalog.json'),'--engine',`http://127.0.0.1:${address.port}`])
  const manifest=JSON.parse(await readFile(join(directory,'support.json'),'utf8'))
  for(const [cards,engineId] of [[tagge,'SOR_080'],[juggernaut,'SOR_068'],[padawan,'TWI_058']] as const)
   for(const card of cards)assert.equal(manifest.cards.find((entry:any)=>entry.ptpId===card.id)?.engineId,engineId,`${card.cardId} ${card.variantType}`)
  assert.ok(!manifest.cards.some((entry:any)=>entry.ptpId==='different-rules'))
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(directory,{recursive:true,force:true})}
})

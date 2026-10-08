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

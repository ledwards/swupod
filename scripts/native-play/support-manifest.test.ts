import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=(path:string)=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'))
test('every constructed-only Hoth printing has an engine mapping, including typographic duplicates',()=>{
 const manifest=read('../../data/native-support/all.json')
 const supplemental=read('../../src/data/constructed-supplemental.json')
 const mappings=new Map(manifest.cards.map((card:any)=>[card.ptpId,card]))
 assert.ok(supplemental.length>0)
 for(const card of supplemental){const mapped:any=mappings.get(card.ptpId);assert.ok(mapped,`${card.id} (${card.name}) has no engine mapping`);assert.equal(mapped.type,card.type)}
 const hans=supplemental.filter((card:any)=>['IBH_010','IBH_042'].includes(card.id))
 assert.equal(hans.length,2)
 assert.equal((mappings.get(hans[0].ptpId) as any).engineId,(mappings.get(hans[1].ptpId) as any).engineId)
})

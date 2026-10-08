// ash-card-lookup.mjs — resolve an ASH card by collector NUMBER (authoritative) or name.
// Used by the carbonite transcription workflow: number decodes treatment + rarity and
// disambiguates duplicate names. Usage: node scripts/ash-card-lookup.mjs <number|name>
import fs from 'fs'
const raw=JSON.parse(fs.readFileSync('src/data/cards.json','utf8'))
const cards=Array.isArray(raw)?raw:(raw.cards||raw.data||Object.values(raw).find(v=>Array.isArray(v)))
const q=(process.argv[2]||'').trim()
const norm=s=>(s||'').replace(/[’‘]/g,"'").toLowerCase()
const isNum=/^\d+$/.test(q)
let hits
if(isNum){ hits=cards.filter(c=>c.set==='ASH'&&String(c.number)===q) }
else { hits=cards.filter(c=>c.set==='ASH'&&norm(c.name).includes(norm(q))) }
const byName={}
for(const c of hits){ (byName[c.name]=byName[c.name]||{rarity:c.rarity,type:c.type,subtitle:c.subtitle||'',variants:{}}).variants[c.variantType]=c.number }
for(const [name,info] of Object.entries(byName)){
  console.log(`${name} | ${info.subtitle} | rarity=${info.rarity} | type=${info.type}`)
  for(const [v,n] of Object.entries(info.variants)) console.log(`    ${v} = ${n}`)
}
if(!Object.keys(byName).length) console.log('NO MATCH for: '+q)

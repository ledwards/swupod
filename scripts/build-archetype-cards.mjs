// Builds play-home/data/archetype-cards.json from PTP's card data so the lobby can
// ask swuapi for archetype names (it resolves by card UUID, which the engine
// catalog does not carry). Leaders and bases only.
// Usage: node scripts/build-archetype-cards.mjs ../swupod/src/data/cards.json
import {readFileSync,writeFileSync} from 'node:fs';
const source=process.argv[2];
if(!source)throw Error('Pass the path to PTP src/data/cards.json');
const data=JSON.parse(readFileSync(source,'utf8')),cards=Array.isArray(data)?data:data.cards;
const out={};
for(const c of cards){
 if(!['Leader','Base'].includes(c.type)||c.variantType&&c.variantType!=='Normal')continue;
 const key=`${c.set}-${String(c.number).padStart(3,'0')}`;
 if(out[key])continue;
 out[key]={uuid:c.id,type:c.type,name:c.name,...(c.type==='Base'?{hp:c.hp,rarity:c.rarity,aspects:c.aspects??[]}:{})};
}
writeFileSync(new URL('../play-home/data/archetype-cards.json',import.meta.url),JSON.stringify(out)+'\n');
console.log(`Wrote ${Object.keys(out).length} leaders and bases.`);

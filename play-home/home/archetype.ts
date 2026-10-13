import cards from '../data/archetype-cards.json';
import details from '@purrgil/ui/engine/card-details.json';
import deckArt from './deck-art.json';

type Entry={uuid:string;type:'Leader'|'Base';name:string;hp?:number;rarity?:string;aspects?:string[]};
const table=cards as Record<string,Entry>;
const engine=details as unknown as Record<string,{name:string}>;
export type FormatKey='premier'|'eternal'|'limited';
/** Engine ids use SOR_005; card data uses SOR-005. */
export const cardKey=(id:string)=>id.replace('_','-').toUpperCase();
// Hyperspace and Showcase leaders and bases (LOF-272, LOF-1012) are the standard card (LOF-008) in another printing:
// deck-art.json lists every printing with the same art, so the lowest number sharing it is the standard one.
const printings=deckArt as unknown as Record<string,[string,string,0|1]>;
const standardByArt=new Map<string,string>();
for(const [id,[path]] of Object.entries(printings).sort(([a],[b])=>a.localeCompare(b,undefined,{numeric:true})))if(!standardByArt.has(`${id.split('-')[0]}|${path}`))standardByArt.set(`${id.split('-')[0]}|${path}`,id);
/** The standard printing's key for any leader or base printing; other cards are returned as they are. */
export const standardKey=(id:string)=>{const k=cardKey(id),e=printings[k];return e?standardByArt.get(`${k.split('-')[0]}|${e[0]}`)??k:k;};
export const cardName=(id:string)=>engine[cardKey(id)]?.name??table[cardKey(id)]?.name??engine[standardKey(id)]?.name??table[standardKey(id)]?.name??printings[cardKey(id)]?.[1]??id;

/** Use the canonical API nickname verbatim, including identity-disambiguating set tags. */
const cache=new Map<string,Promise<string|null>>();
export function archetypeName(leader:string,base:string,format:FormatKey):Promise<string|null>{
 const key=`${cardKey(leader)}:${cardKey(base)}:${format}`;
 let pending=cache.get(key);
 if(!pending){
  const l=table[cardKey(leader)]??table[standardKey(leader)],b=table[cardKey(base)]??table[standardKey(base)];
  if(!l||!b)return Promise.resolve(null);
  const api=format==='limited'?'Limited':format==='eternal'?'Eternal':'Premier';
  pending=fetch(`https://api.swuapi.com/archetypes/resolve?leader_card_uuid=${l.uuid}&base_card_uuid=${b.uuid}&format=${api}`,{signal:AbortSignal.timeout(8000)})
   .then(r=>r.ok?r.json():null).then(d=>typeof d?.nickname==='string'&&d.nickname.trim()?d.nickname:null)
   .catch(()=>null).then(name=>{if(!name)cache.delete(key);return name;});
  cache.set(key,pending);
 }
 return pending;
}
export const archetypeFormat=(format:string):FormatKey=>/limited|sealed|draft|chaos/i.test(format)?'limited':/eternal/i.test(format)?'eternal':'premier';

import {PtpPlayError} from './playState'
import {suspendedIds} from '../../utils/setConfigs/suspensions'
export interface LegalityCard {id:string;name:string;subtitle?:string|null;type:string;set:string;released:boolean;premier:boolean;placeholder?:boolean;ptpId?:string|undefined}
export interface ConstructedDeck {leader:string;base:string;cards:{id:string;count:number}[];sideboard:{id:string;count:number}[]}
const identity=(c:LegalityCard)=>JSON.stringify([c.name,c.subtitle??'',c.type])
// The suspension list itself lives with the set configs; this module only applies it.
export {suspendedIds}
/**
 * Every problem with the deck, not just the first: the message is one terse line per problem
 * ("4 copies of X (max 3 ...)", "Y is not legal in Premier · Current."), so the Play page can list them all.
 * A malformed export (not an object, no arrays, not SWUDB IDs) still fails at once.
 */
export function validateConstructed(input:unknown,format:'premier'|'eternal',catalog:LegalityCard[],options:{now?:Date;homeworldsReleased?:boolean}={}):ConstructedDeck {
 function fail(message:string):never {throw new PtpPlayError(409,'invalid_deck',message)}
 if(!input||typeof input!=='object'||Array.isArray(input))fail('Import a deck JSON object.')
 const errors:string[]=[],problem=(m:string)=>{if(!errors.includes(m))errors.push(m)}
 const formatName=format==='premier'?'Premier':'Eternal'
 const value=input as Record<string,any>,cards=new Map(catalog.map(c=>[c.id,c])),banned=new Set(suspendedIds(format,options.now,options.homeworldsReleased).map(id=>cards.get(id)).filter((c):c is LegalityCard=>!!c).map(identity))
 const legal=new Set(catalog.filter(c=>c.released&&!c.placeholder&&(format==='eternal'||c.premier)).map(identity))
 const lookup=(entry:any,types:string[]):LegalityCard|null=>{
  const id=typeof entry==='string'?entry:entry?.id
  if(typeof id!=='string'||!/^\w{3}[_-]\d{3,5}$/.test(id))fail('Use card IDs from a SWUDB JSON export.')
  if(typeof entry==='object'&&entry.count!==undefined&&entry.count!==1&&types.length===1)problem('Choose exactly one leader and one base.')
  const card=cards.get(id.toUpperCase().replace('-','_'))
  if(!card||!types.includes(card.type)||card.placeholder){problem(`${id} is not a known card in this slot.`);return null}
  if(!card.released||!legal.has(identity(card)))problem(`${card.name} is not legal in ${formatName} · Current.`)
  else if(banned.has(identity(card)))problem(`${card.name} is suspended in ${formatName}.`)
  return card
 }
 const leader=lookup(value.leader,['Leader']),base=lookup(value.base,['Base']),copies=new Map<string,{name:string;count:number}>()
 const section=(raw:unknown)=>{
  if(!Array.isArray(raw)||raw.length>110)fail('Use a deck or sideboard array of card IDs and counts.')
  const merged=new Map<string,number>()
  for(const entry of raw){
   const card=lookup(entry,['Unit','Event','Upgrade']);if(!card)continue
   if(!Number.isSafeInteger(entry.count)||entry.count<1||entry.count>3){problem(`${card.name}: use a count from 1 to 3.`);continue}
   const key=identity(card),seen=copies.get(key);copies.set(key,{name:card.name,count:(seen?.count??0)+entry.count})
   merged.set(card.id,(merged.get(card.id)??0)+entry.count)
  }
  return [...merged].sort(([a],[b])=>a.localeCompare(b)).map(([id,count])=>({id,count}))
 }
 const main=section(value.deck??value.cards),sideboard=section(value.sideboard??[])
 // Copies count across the main deck and sideboard, reprints included.
 for(const {name,count} of copies.values())if(count>3)problem(`${count} copies of ${name} (max 3 across the main deck and sideboard, including reprints).`)
 const total=main.reduce((n,c)=>n+c.count,0),minimum=base?.id==='JTL_024'?60:base?.id==='JTL_025'?45:50
 if(base&&total<minimum)problem(`This base requires at least ${minimum} main-deck cards; you have ${total}.`)
 if(total>100)problem('This game engine supports at most 100 main-deck cards.')
 if(sideboard.reduce((n,c)=>n+c.count,0)>10)problem('The sideboard may contain at most ten cards.')
 if(errors.length||!leader||!base)fail(errors.join('\n'))
 return {leader:leader.id,base:base.id,cards:main,sideboard}
}

/**
 * The engine plays each card by its standard printing: a Hyperspace, Showcase or foil printing
 * (LOF_272, LOF_1012) is the same card as LOF_008. Map every printing in a validated deck to the
 * engine ID its PTP card maps to, merging copies that land on the same ID.
 */
export function toEngineDeck(deck:ConstructedDeck,engineIdOf:(id:string)=>string|undefined):ConstructedDeck {
 const map=(id:string)=>engineIdOf(id)??id
 const merge=(list:{id:string;count:number}[])=>{const m=new Map<string,number>();for(const c of list){const id=map(c.id);m.set(id,(m.get(id)??0)+c.count)}return [...m].sort(([a],[b])=>a.localeCompare(b)).map(([id,count])=>({id,count}))}
 return {leader:map(deck.leader),base:map(deck.base),cards:merge(deck.cards),sideboard:merge(deck.sideboard)}
}
/** Collector ID (LOF_272) → the engine ID of the PTP card behind it, from the card catalog and the native support manifest. */
export function engineIdLookup(catalog:LegalityCard[],engineIdOfPtp:(ptpId:string)=>string|undefined):(id:string)=>string|undefined {
 const byCollector=new Map(catalog.filter(c=>c.ptpId).map(c=>[c.id,c.ptpId!]))
 return id=>{const ptp=byCollector.get(id);return ptp?engineIdOfPtp(ptp):undefined}
}

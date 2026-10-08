import {PtpPlayError} from './playState'
export interface LegalityCard {id:string;name:string;subtitle?:string|null;type:string;set:string;released:boolean;premier:boolean;placeholder?:boolean}
export interface ConstructedDeck {leader:string;base:string;cards:{id:string;count:number}[];sideboard:{id:string;count:number}[]}
const identity=(c:LegalityCard)=>JSON.stringify([c.name,c.subtitle??'',c.type])
// Sources/effective dates: official Cad Banned (2026-08-24), Meta Update from
// the Team (2025-11), and Eternal Format Update (2026-04-15). Limited is exempt.
export function suspendedIds(format:'premier'|'eternal',now=new Date(),homeworldsReleased=false) {
 if(format==='eternal')return now>=new Date('2026-04-24T00:00:00Z')&&!homeworldsReleased?['JTL_170','JTL_140']:[]
 return [...(now>=new Date('2024-11-08')?['SOR_015']:[]),...(now>=new Date('2025-04-11')?['TWI_016','SHD_194','SHD_213']:[]),...(now>=new Date('2025-09-22')?['SOR_167']:[]),...(now>=new Date('2026-08-31')?['ASH_011']:[])]
}
export function validateConstructed(input:unknown,format:'premier'|'eternal',catalog:LegalityCard[],options:{now?:Date;homeworldsReleased?:boolean}={}):ConstructedDeck {
 function fail(message:string):never {throw new PtpPlayError(409,'invalid_deck',message)}
 if(!input||typeof input!=='object'||Array.isArray(input))fail('Import a deck JSON object.')
 const value=input as Record<string,any>,cards=new Map(catalog.map(c=>[c.id,c])),banned=new Set(suspendedIds(format,options.now,options.homeworldsReleased).map(id=>cards.get(id)).filter((c):c is LegalityCard=>!!c).map(identity))
 const legal=new Set(catalog.filter(c=>c.released&&!c.placeholder&&(format==='eternal'||c.premier)).map(identity))
 const lookup=(entry:any,types:string[])=>{
  const id=typeof entry==='string'?entry:entry?.id
  if(typeof id!=='string'||!/^\w{3}[_-]\d{3,5}$/.test(id))fail('Use card IDs from a SWUDB JSON export.')
  if(typeof entry==='object'&&entry.count!==undefined&&entry.count!==1&&types.length===1)fail('Choose exactly one leader and one base.')
  const card=cards.get(id.toUpperCase().replace('-','_'))
  if(!card||!types.includes(card.type)||card.placeholder)fail(`${id} is not a known card in this slot.`)
  if(!card.released||!legal.has(identity(card)))fail(`${card.name} is not legal in ${format==='premier'?'Premier':'Eternal'} · Current.`)
  if(banned.has(identity(card)))fail(`${card.name} is suspended in ${format==='premier'?'Premier':'Eternal'}.`)
  return card
 }
 const leader=lookup(value.leader,['Leader']),base=lookup(value.base,['Base']),copies=new Map<string,number>()
 const section=(raw:unknown)=>{
  if(!Array.isArray(raw)||raw.length>110)fail('Use a deck or sideboard array of card IDs and counts.')
  const merged=new Map<string,number>()
  for(const entry of raw){const card=lookup(entry,['Unit','Event','Upgrade']);if(!Number.isSafeInteger(entry.count)||entry.count<1||entry.count>3)fail(`${card.name}: use a count from 1 to 3.`);const key=identity(card),count=(copies.get(key)??0)+entry.count;if(count>3)fail(`${card.name}: at most three copies across the main deck and sideboard, including reprints.`);copies.set(key,count);merged.set(card.id,(merged.get(card.id)??0)+entry.count)}
  return [...merged].sort(([a],[b])=>a.localeCompare(b)).map(([id,count])=>({id,count}))
 }
 const main=section(value.deck??value.cards),sideboard=section(value.sideboard??[]),total=main.reduce((n,c)=>n+c.count,0),minimum=base.id==='JTL_024'?60:base.id==='JTL_025'?45:50
 if(total<minimum)fail(`This base requires at least ${minimum} main-deck cards; you have ${total}.`)
 if(total>100)fail('This game engine supports at most 100 main-deck cards.')
 if(sideboard.reduce((n,c)=>n+c.count,0)>10)fail('The sideboard may contain at most ten cards.')
 return {leader:leader.id,base:base.id,cards:main,sideboard}
}

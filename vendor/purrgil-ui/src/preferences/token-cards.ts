import catalog from '../data/token-cards.json' with {type:'json'};
import {canCustomize} from './access';
import {readPreferenceCookie,writePreferenceCookie} from './cookies';
const premiumOrder=['Standard','Standard Foil','Hyperspace','Hyperspace Foil','GC Participation','GC VIP Promo'];
export const tokenCardPrintings=[...catalog.printings].sort((a,b)=>(premiumOrder.indexOf(a.variant)<0?premiumOrder.length:premiumOrder.indexOf(a.variant))-(premiumOrder.indexOf(b.variant)<0?premiumOrder.length:premiumOrder.indexOf(b.variant)));
export type TokenCardPrinting=typeof tokenCardPrintings[number];
export const tokenCardNames=[...new Set(tokenCardPrintings.map(card=>card.name))];
const key='purrgil-token-cards-v1';
let memory='{}';
const defaults:Record<string,string>={Shield:'ASH_T003',Experience:'TS26_T003',Advantage:'ASH_T002',Weakness:'HMW_T002'};
const localArt:Record<string,string>={ASH_T003:'/assets/tokens/shield-ash.png',TS26_T003:'/assets/tokens/experience-ts26.png',ASH_T002:'/assets/tokens/advantage-ash.png',HMW_T002:'/assets/tokens/weakness-hmw.png'};
export function tokenCardImage(card:TokenCardPrinting){return card.variant==='Standard'&&localArt[card.number]||card.image;}
export function readTokenCards(){
 if(!canCustomize())return '{}';
 try{return readPreferenceCookie(key)??localStorage.getItem(key)??memory;}catch{return memory;}
}
export function tokenName(code:string){const normalized=code.replace(/^TOKEN-/i,'').replace(/[^a-z0-9]/gi,'').toLowerCase();return tokenCardNames.find(name=>name.replace(/[^a-z0-9]/gi,'').toLowerCase()===normalized);}
export function selectedTokenCard(nameOrCode:string,snapshot=readTokenCards()):TokenCardPrinting|undefined{
 const name=tokenName(nameOrCode);if(!name)return;
 let id:unknown;try{id=JSON.parse(snapshot)[name];}catch{/* Ignore malformed preferences. */}
 const cards=tokenCardPrintings.filter(card=>card.name===name);
 return cards.find(card=>card.id===id)??cards.find(card=>card.number===defaults[name]&&card.variant==='Standard')??cards.find(card=>card.variant==='Standard')??cards[0];
}
export function writeTokenCard(name:string,id:string){
 if(!canCustomize()||!tokenCardPrintings.some(card=>card.name===name&&card.id===id))return;
 const next:Record<string,string>={};
 try{const saved=JSON.parse(readTokenCards());for(const card of tokenCardPrintings)if(saved[card.name]===card.id)next[card.name]=card.id;}catch{/* Replace invalid storage. */}
 memory=JSON.stringify({...next,[name]:id});writePreferenceCookie(key,memory);
 try{localStorage.setItem(key,memory);}catch{/* Retain session preference when storage is blocked. */}
 window.dispatchEvent(new Event(key));
}
export function subscribeTokenCards(notify:()=>void){window.addEventListener('storage',notify);window.addEventListener(key,notify);return()=>{window.removeEventListener('storage',notify);window.removeEventListener(key,notify);};}

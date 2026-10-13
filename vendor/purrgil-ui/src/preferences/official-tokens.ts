import art from '../data/official-token-art.json';
import {canCustomize} from './access';
import {readPreferenceCookie,writePreferenceCookie} from './cookies';
import {selectedTokenCard,tokenCardImage} from './token-cards';
import {resolveTokenPiece,type TokenPiece,type TokenSet} from './token-sets';
export type OfficialTokenRole='force'|'credit';
export const officialTokens:{id:string;name:string;role:OfficialTokenRole;release:string;source:string;faces:TokenPiece[]}[]=[
 {id:'force-lof',name:'Legends of the Force',role:'force',release:'2025 · HobbyNext store promo',source:'https://www.hobbynext.com/offer/star-wars-unlimited-force-token-and-mini-box/',faces:art['force-lof'].map((face,index)=>({...face,role:'force',name:'Legends of the Force',face:index?'Back':'Front',presentation:'on-card',aspectRatio:1}))},
 ...['Imperial','Galactic'].map((name,index)=>({id:`credit-${name.toLowerCase()}`,name:`${name} Credit`,role:'credit' as const,release:'2026 · A Lawless Time store promo',source:'https://www.hobbynext.com/offer/star-wars-unlimited-binder-and-credit-tokens/',faces:[{...art['credit-law'][index],role:'credit' as const,name:`${name} Credit`,presentation:'on-card' as const}]})),
];
const key='purrgil-official-tokens-v1';
let memory='{}';
export function readOfficialTokens(){if(!canCustomize())return '{}';try{return readPreferenceCookie(key)??localStorage.getItem(key)??memory;}catch{return memory;}}
export function officialChoice(role:OfficialTokenRole,snapshot=readOfficialTokens()):string{
 try{const value=JSON.parse(snapshot)[role];return officialTokens.some(design=>design.role===role&&design.faces.some((_,i)=>`${design.id}:${i}`===value))?value:'default';}catch{return 'default';}
}
export function writeOfficialToken(role:OfficialTokenRole,value:string){
 if(!canCustomize())return;
 memory=JSON.stringify({...Object.fromEntries((['force','credit'] as const).map(role=>[role,officialChoice(role)])),[role]:officialChoice(role,JSON.stringify({[role]:value}))});
 writePreferenceCookie(key,memory);try{localStorage.setItem(key,memory);}catch{/* Keep this session's choice. */}window.dispatchEvent(new Event(key));
}
export function subscribeOfficialTokens(notify:()=>void){window.addEventListener(key,notify);window.addEventListener('storage',notify);return()=>{window.removeEventListener(key,notify);window.removeEventListener('storage',notify);};}
export function officialTokenPiece(role:OfficialTokenRole,set:TokenSet,choice='default'):TokenPiece{
 for(const design of officialTokens.filter(design=>design.role===role)){const index=design.faces.findIndex((_,i)=>`${design.id}:${i}`===choice);if(index>=0)return design.faces[index];}
 const own=resolveTokenPiece(set,role);if(own&&!own.text)return own;
 const card=role==='credit'?selectedTokenCard('Credit'):undefined;
 return {role,name:role==='force'?'The Force':'Credit',src:card?tokenCardImage(card):'/assets/tokens/official/force-card.png',presentation:'attachment'};
}

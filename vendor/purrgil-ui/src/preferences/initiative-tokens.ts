import catalog from '../data/initiative-tokens.json';
import {canCustomize} from './access';
import {readPreferenceCookie,writePreferenceCookie} from './cookies';
import {resolveTokenPiece,tokenSets,type TokenPiece,type TokenSet} from './token-sets';

export type InitiativeDesign={id:string;name:string;group:string;seasons:number[];releases:string;source:string;faces:{name:string;src:string;crop?:{width:number;height:number;box:number[]}}[]};
export const initiativeDesigns:InitiativeDesign[]=catalog.designs;
export const setInitiatives:InitiativeDesign[]=tokenSets.map(set=>({id:`set-${set.id}`,name:set.name,group:'Token sets',seasons:[],releases:'',source:'',faces:set.pieces.filter(piece=>piece.role==='initiative').map(piece=>({name:piece.face??'Front',src:piece.src}))}));
export const allInitiatives=[...initiativeDesigns,...setInitiatives];
const key='purrgil-initiative-token-v1';
// Until a local choice is saved, honor existing server event loadouts.
let memory='event';
export function initiativeChoice(id:string,face=0){return `${id}:${face}`;}
const choices=new Map(allInitiatives.flatMap(design=>design.faces.map((face,index)=>[initiativeChoice(design.id,index),{design,face}] as const)));
function findChoice(choice:string){return choices.get(choice);}
export function normalizeInitiativeChoice(choice:string|null){return choice==='event'||choice&&findChoice(choice)?choice:'default';}
export function readInitiativeToken(){
 if(!canCustomize())return 'event';
 try{return normalizeInitiativeChoice(readPreferenceCookie(key)??localStorage.getItem(key)??memory);}catch{return memory;}
}
export function writeInitiativeToken(choice:string){
 if(!canCustomize())return;
 memory=normalizeInitiativeChoice(choice);writePreferenceCookie(key,memory);
 try{localStorage.setItem(key,memory);}catch{/* Keep the preference for this session. */}
 window.dispatchEvent(new Event(key));
}
export function subscribeInitiativeToken(notify:()=>void){window.addEventListener(key,notify);window.addEventListener('storage',notify);return()=>{window.removeEventListener(key,notify);window.removeEventListener('storage',notify);};}
export function initiativePiece(set:TokenSet,choice='default'):TokenPiece{
 const selected=findChoice(choice);
 return selected?{role:'initiative',name:selected.design.name,src:selected.face.src,crop:selected.face.crop,aspectRatio:selected.design.id.startsWith('promo-')?1:undefined,shape:'initiative',presentation:'on-card'}:resolveTokenPiece(set,'initiative')!;
}

export function initiativeFaces(set:TokenSet,choice='default'):TokenPiece[]{
 const selected=findChoice(choice);
 if(selected){const index=selected.design.faces.indexOf(selected.face);return selected.design.faces.map((_,offset)=>initiativePiece(set,initiativeChoice(selected.design.id,(index+offset)%selected.design.faces.length)));}
 const faces=set.pieces.filter(piece=>piece.role==='initiative');
 return faces.length?faces:[initiativePiece(set)];
}

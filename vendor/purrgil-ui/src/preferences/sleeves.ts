import catalog from '../data/sleeves.json' with {type:'json'};
import {canCustomize} from './access';
import {readPreferenceCookie,writePreferenceCookie} from './cookies';
export const sleeves=catalog.sleeves;
export type Sleeve=typeof sleeves[number];
export const sleeveCategories=[['retail','Gamegenic'],['prize-wall','Prize wall'],['participation','Participation'],['champion','Champion']] as const;
const key='purrgil-sleeve-v1';
let memory='default';
export function readSleeve(){
 if(!canCustomize())return 'default';
 try{const value=readPreferenceCookie(key)??localStorage.getItem(key)??memory;return sleeves.some(s=>s.id===value)?value:'default';}catch{return memory;}
}
export function writeSleeve(id:string){
 if(!canCustomize()||(id!=='default'&&!sleeves.some(s=>s.id===id)))return;
 memory=id;writePreferenceCookie(key,id);
 try{localStorage.setItem(key,id);}catch{/* Keep the choice for this session. */}
 window.dispatchEvent(new Event(key));
}
export function subscribeSleeve(notify:()=>void){window.addEventListener(key,notify);window.addEventListener('storage',notify);return()=>{window.removeEventListener(key,notify);window.removeEventListener('storage',notify);};}

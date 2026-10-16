import {useEffect,useState} from 'react';
/** The engine's card table (every printed card: name, subtitle, type, cost, aspects, text). It is 750 KB, and only the
 * decklist and the card analysis read it, so it stays out of the homepage bundle: the build copies it beside the bundle
 * and it is fetched the first time something needs it. The object below is filled in place, so code that reads it at
 * call time (card names, Purrgil's card labels) sees the cards as soon as they arrive. */
export type CardDetail={name:string;subtitle?:string;type?:string;cost?:number|null;power?:number;hp?:number;aspects?:string[];traits?:string[];text?:string};
export const cardDetails:Record<string,CardDetail>={};
export default cardDetails;
let pending:Promise<Record<string,CardDetail>>|undefined;
let loaded=false;
const listeners=new Set<()=>void>();
export const cardDetailsLoaded=()=>loaded;
/** Fetches the table once; later calls share the same promise. A failed fetch is retried on the next call. */
export function loadCardDetails():Promise<Record<string,CardDetail>>{
 if(typeof fetch==='undefined')return Promise.resolve(cardDetails);
 pending??=fetch('/play-home/card-details.json',{credentials:'omit'}).then(r=>{if(!r.ok)throw Error(`Card table ${r.status}`);return r.json() as Promise<Record<string,CardDetail>>;})
  .then(table=>{Object.assign(cardDetails,table);loaded=true;for(const l of listeners)l();return cardDetails;})
  .catch(e=>{pending=undefined;throw e;});
 return pending;
}
/** True once the table is in; starts the fetch and re-renders when it lands. */
export function useCardDetails():boolean{
 const [ready,setReady]=useState(loaded);
 useEffect(()=>{if(loaded){setReady(true);return;}const l=()=>setReady(true);listeners.add(l);void loadCardDetails().catch(()=>{});return()=>{listeners.delete(l);};},[]);
 return ready;
}

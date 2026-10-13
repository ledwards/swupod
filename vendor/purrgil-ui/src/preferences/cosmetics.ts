import {createContext,useContext,useEffect,useState} from 'react';
import {gameApiPath} from '../transport/client';
export type CosmeticAppearance={id:string;image:string;backImage?:string;cardCode?:string};
export type Appearance=Partial<Record<'mat'|'sleeve'|'promo'|'initiative',CosmeticAppearance>>;
export const AppearanceContext=createContext<Record<string,Appearance>>({});
export function useOwnerAppearance(ownerId?:string){return useContext(AppearanceContext)[ownerId??'']??{};}
export function useMatchAppearances(){
 const [value,setValue]=useState<Record<number,Appearance>>({});
 useEffect(()=>{let active=true;let pending=false;const refresh=async()=>{if(pending)return;pending=true;try{const response=await fetch(gameApiPath('/api/appearances'));if(response.ok){const data=await response.json();if(active)setValue(data);}}catch{/* Optional artwork never interrupts a game. */}finally{pending=false;}};void refresh();const timer=setInterval(()=>void refresh(),5000);return()=>{active=false;clearInterval(timer);};},[]);
 return value;
}
export function promoImage(appearance:Appearance,code:string|undefined,deployedLeader:boolean):string|undefined {
 const promo=appearance.promo;
 if(!promo||promo.cardCode!==code)return undefined;
 return deployedLeader?promo.backImage:promo.image;
}

export function useSharePlaymat(playmat:string,enabled:boolean){
 useEffect(()=>{if(!enabled)return;void fetch(gameApiPath('/api/playmat'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({playmat})}).catch(()=>{/* Optional artwork never interrupts a game. */});},[playmat,enabled]);
}

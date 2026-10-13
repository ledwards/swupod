import {useEffect,useSyncExternalStore} from 'react';
import {gameApiPath} from '../transport/client';
let allowed=false;
let notes=false;
let betaStatus:'loading'|'allowed'|'denied'='loading';
let signedIn:boolean|null=null;
export const canCustomize=()=>allowed;
/** Only hosts that ship the notes backend report this; everywhere else notes stay hidden. */
export const canAddNotes=()=>notes;
export const sessionPresence=()=>signedIn;
const subscribe=(callback:()=>void)=>{window.addEventListener('purrgil-access',callback);return()=>window.removeEventListener('purrgil-access',callback);};
let pending:Promise<void>|undefined;
export function refreshAccess(){
 if(!pending)pending=fetch(gameApiPath('/api/entitlements'),{credentials:'same-origin'}).then(async response=>{
  if(response.status===401){signedIn=false;allowed=false;notes=false;betaStatus='denied';return;}
  if(response.ok){const value=await response.json();signedIn=true;betaStatus=value.beta===true?'allowed':'denied';allowed=value.beta===true&&value.canCustomize===true;notes=value.beta===true&&value.canAddNotes===true;return;}
  signedIn=response.status===403?true:null;allowed=false;notes=false;betaStatus='denied';
 }).catch(()=>{signedIn=null;allowed=false;notes=false;betaStatus='denied';}).finally(()=>{pending=undefined;window.dispatchEvent(new Event('purrgil-access'));window.dispatchEvent(new Event('storage'));});
 return pending;
}
function useAccess(read:()=>boolean){
 const value=useSyncExternalStore(subscribe,read,()=>false);
 useEffect(()=>{void refreshAccess();const refresh=()=>{void refreshAccess();};window.addEventListener('focus',refresh);const timer=setInterval(refresh,30000);return()=>{window.removeEventListener('focus',refresh);clearInterval(timer);};},[]);
 return value;
}
export function useCustomizationAccess(){return useAccess(canCustomize);}
export function useNotesAccess(){return useAccess(canAddNotes);}
export function useSignedIn(){return useSyncExternalStore(subscribe,sessionPresence,()=>null);}
export const membershipUrl='https://patreon.com/ProtectthePod';
export const loginUrl='https://www.protectthepod.com/api/auth/signin/discord?return_to=%2F';
/** Discord sign-in does not return a session on this port. The catalog stays open to browse. */
export const catalogExploreOpen=true;

export function useBetaStatus(){return useSyncExternalStore(subscribe,()=>betaStatus,()=>'loading');}

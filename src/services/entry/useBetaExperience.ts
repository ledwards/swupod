'use client'
import {useEffect,useState} from 'react'
import {useAuth} from '../../contexts/AuthContext'
import {hasEntryAccess} from './access'
/** Use the same fresh, server-checked gate as the draft presentation. */
export function useBetaExperience(){
 const {user,loading:authLoading}=useAuth() as {user:{id:string;is_admin?:boolean;is_beta_tester?:boolean}|null;loading:boolean}
 const [checked,setChecked]=useState<{id:string;enabled:boolean}|null>(null)
 const id=user?.id,eligible=hasEntryAccess(user)
 useEffect(()=>{
  setChecked(null)
  if(!id||!eligible)return
  const abort=new AbortController()
  const check=async()=>{try{const response=await fetch('/api/play/native/presentation',{cache:'no-store',signal:abort.signal});const data=response.ok?await response.json():null;if(!abort.signal.aborted)setChecked({id,enabled:data?.enabled===true})}catch{if(!abort.signal.aborted)setChecked({id,enabled:false})}}
  void check()
  const visible=()=>{if(document.visibilityState==='visible')void check()}
  document.addEventListener('visibilitychange',visible)
  return()=>{abort.abort();document.removeEventListener('visibilitychange',visible)}
 },[id,eligible])
 return {enabled:eligible&&checked?.id===id&&checked?.enabled===true,loading:authLoading||(eligible&&!!id&&checked?.id!==id)}
}

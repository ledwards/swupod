'use client'

import { useEffect, useRef, useState } from 'react'
import Button from '@/src/components/Button'
import type { PlayDeckSummary } from '@/src/services/play/playState'

export interface PublicSeat { visibility:'public'|'private'; matchId:string; status:string; seat:number; setCode:string; poolType:string; packCount:number; poolShareId:string }
interface PublicEntry { matchId:string; setCode:string; poolType:string; packCount:number; createdAt:string }
type NativeDeck = PlayDeckSummary & { packCount?:number|null }
async function request<T>(path:string, init?:RequestInit):Promise<T>{
 const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...init});const value=await response.json();
 if(!response.ok)throw new Error(value.error??value.message??'Unable to update the lobby. Please retry.');return value as T;
}
export default function NativePublicLobby({deck,userId,blocked,onReservation,onBusy,launch}:{deck:NativeDeck|undefined;userId:string;blocked:boolean;onReservation:(seat:PublicSeat|null)=>void;onBusy:(busy:boolean)=>void;launch:(matchId:string)=>Promise<void>}){
 const [entries,setEntries]=useState<PublicEntry[]>([]);const [seat,setSeat]=useState<PublicSeat|null>(null);const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const [error,setError]=useState<string|null>(null);const [refresh,setRefresh]=useState(0);
 const version=useRef(0);const intent=useRef(false);const launched=useRef<string|null>(null);const retry=useRef<{key:string;id:string}|null>(null);
 const clearRetry=(poolShareId?:string)=>{try{if(retry.current)sessionStorage.removeItem(retry.current.key);if(poolShareId){const prefix=`native-public-request:${userId}:${poolShareId}:`;for(const key of Object.keys(sessionStorage))if(key.startsWith(prefix))sessionStorage.removeItem(key);}}catch{}retry.current=null;};
 const apply=(next:PublicSeat|null)=>{setSeat(next);onReservation(next);};
 useEffect(()=>{
  let stopped=false;let timer:ReturnType<typeof setTimeout>;const abort=new AbortController();
  const load=async()=>{const observed=version.current;try{const result=await request<{entries:PublicEntry[];availability:PublicSeat|null}>('/api/play/native/public',{signal:abort.signal});if(stopped||observed!==version.current)return;setEntries(result.entries??[]);const available=result.availability?.visibility==='public'?result.availability:null;apply(available);if(available){
    if(!retry.current){const prefix=`native-public-request:${userId}:${available.poolShareId}:`;try{for(let index=0;index<sessionStorage.length;index++){const key=sessionStorage.key(index);if(key?.startsWith(prefix)){const id=sessionStorage.getItem(key);if(id){retry.current={key,id};break;}}}}catch{}}
    if(available.status==='waiting'||retry.current)intent.current=true;
    // Authoritative recovery acknowledges the admission even when its POST response was lost.
    clearRetry(available.poolShareId);
   }
   if(available&&['starting','active'].includes(available.status)&&intent.current&&launched.current!==available.matchId){launched.current=available.matchId;void launch(available.matchId);}
  }catch(failure){if(!stopped)setError(failure instanceof Error?failure.message:'The lobby is unavailable.');}finally{if(!stopped){setLoading(false);timer=setTimeout(()=>void load(),2500);}}};void load();return()=>{stopped=true;abort.abort();clearTimeout(timer);};
 // The parent passes stable state setters and launch callback.
 },[userId,refresh,launch,onReservation]);
 async function find(entry?:PublicEntry){
  if(!deck?.ready||busy||blocked||seat)return;setBusy(true);onBusy(true);setError(null);intent.current=true;version.current++;
  const key=`native-public-request:${userId}:${deck.poolShareId}:${entry?.matchId??'find'}`;
  if(retry.current?.key!==key){let id:string|null=null;try{id=sessionStorage.getItem(key);}catch{}retry.current={key,id:id??crypto.randomUUID()};try{sessionStorage.setItem(key,retry.current.id);}catch{}}
  try{const next=await request<PublicSeat>(entry?`/api/play/native/public/${encodeURIComponent(entry.matchId)}/join`:'/api/play/native/public',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({poolShareId:deck.poolShareId,requestId:retry.current.id})});apply(next);intent.current=true;try{sessionStorage.removeItem(key);}catch{}retry.current=null;
   if(['starting','active'].includes(next.status)){launched.current=next.matchId;await launch(next.matchId);}
  }catch(failure){setError(failure instanceof Error?failure.message:'Unable to reserve your seat.');}finally{setBusy(false);onBusy(false);setRefresh(value=>value+1);}
 }
 async function cancel(){if(!seat||busy)return;setBusy(true);onBusy(true);version.current++;try{await request(`/api/play/native/public/${encodeURIComponent(seat.matchId)}`,{method:'DELETE'});apply(null);clearRetry();intent.current=false;setError(null);}catch(failure){setError(failure instanceof Error?failure.message:'Unable to leave the lobby.');}finally{setBusy(false);onBusy(false);setRefresh(value=>value+1);}}
 const compatible=(entry:PublicEntry)=>Boolean(deck?.ready&&deck.setCode===entry.setCode&&deck.poolType===entry.poolType&&deck.packCount===entry.packCount);
 return <section className="native-play-panel native-public-lobby" aria-label="Public lobby"><h2>Find a Game</h2><p>Play someone with the same set, format, and pack count. Your game opens when both players are ready.</p>
 {error&&<div className="native-play-error" role="alert"><p>{error}</p><Button size="sm" onClick={()=>{setError(null);setRefresh(value=>value+1);}}>Refresh lobby</Button></div>}
 {loading?<p role="status">Loading the lobby…</p>:seat?<div className="native-public-waiting"><h3>{seat.status==='waiting'?'Finding your opponent':'Your game is ready'}</h3><p>{seat.setCode} · {seat.poolType} · {seat.packCount} packs</p>{seat.status==='waiting'?<><p>Your table is listed below. You can leave this page and return to the same seat.</p><Button disabled={busy} onClick={()=>void cancel()}>Cancel search</Button></>:<Button variant="primary" disabled={busy} onClick={()=>void launch(seat.matchId)}>Resume game</Button>}</div>:<Button variant="primary" size="lg" disabled={!deck?.ready||busy||blocked} onClick={()=>void find()}>{busy?'Finding a game…':'Find game'}</Button>}
 <h3 className="native-public-heading">Open Tables</h3>{!loading&&!entries.length&&<p>No open tables yet. Find game to offer the first seat.</p>}
 <div className="native-public-entries">{entries.map(entry=><div className="native-public-entry" key={entry.matchId}><div><strong>{entry.setCode} · {entry.poolType}</strong><span>{entry.packCount} packs</span>{deck&&!compatible(entry)&&<small>Choose a matching {entry.setCode} {entry.poolType} deck with {entry.packCount} packs.</small>}</div>{seat?.matchId===entry.matchId?<span>Your table</span>:<Button disabled={!compatible(entry)||busy||blocked||Boolean(seat)} onClick={()=>void find(entry)}>Join table</Button>}</div>)}</div>
 </section>;
}

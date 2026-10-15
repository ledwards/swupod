import {sessionKnown} from './shared';
import {ContentSkeleton} from '@purrgil/ui/components/ContentSkeleton';
import {useEffect,useMemo,useRef,useState} from 'react';
import type {LobbyGame} from '@purrgil/ui/transport/lobby';
import {setArt} from './art';
import {Archetype,DeckArt} from './bits';
import {ptpOriginOf,limitedContract,lobbyJson,sharedCall,type Contract,type DeckExport,type DeckListStats,type LimitedPool,type PlayedDeck,type SharedState,type LimitedDeck} from './shared';

type Tab='limited'|'premier'|'eternal';
const day=(t:number)=>new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',year:new Date(t).getFullYear()===new Date().getFullYear()?undefined:'numeric'}).format(t);
const record=(d:{wins:number;losses:number;draws:number})=>`${d.wins}–${d.losses}${d.draws?`–${d.draws}`:''}`;
const iso=(v?:string|null)=>v?Date.parse(v):0;
/** A PTP that predates byPool still returns every deck; group them here so rollout order does not matter. */
const groupByPool=(decks:LimitedDeck[]):LimitedPool[]=>{const m=new Map<string,LimitedPool>();for(const d of decks){const k=d.poolRootShareId??d.poolShareId;const p=m.get(k)??{poolShareId:k,name:null,setCode:d.setCode,setName:null,poolType:d.poolType,packCount:d.packCount,createdAt:d.createdAt??null,decks:[]};p.decks.push(d);m.set(k,p);}return [...m.values()];};

/** A deck row's mini curve and aspect counts. Aspect art comes from PTP, which serves this page. */
function DeckMiniStats({stats,ptp}:{stats:DeckListStats;ptp:string}){
 const top=Math.max(1,...stats.curve);
 return <span className="ph-mini-stats">
  <span className="ph-mini-curve" role="img" aria-label={`Cost curve: ${stats.curve.map((n,i)=>`${n} at ${i===stats.curve.length-1?`${i}+`:i}`).join(', ')}`}>{stats.curve.map((n,i)=><i key={i} style={{height:`${2+n/top*16}px`}}/>)}</span>
  <span className="ph-mini-aspects">{stats.aspects.map(a=><span key={a.aspect}><img src={`${ptp}/icons/${a.aspect.toLowerCase()}.png`} alt={a.aspect}/>{a.count}</span>)}</span>
  <span className="ph-mini-avg">avg {stats.avgCost.toFixed(2)}</span>
 </span>;
}

/** Every deck you can play, wherever it came from. A history, not a builder. */
export function MyDecks({shared,history,signedIn,loginUrl,onPlay,embedded=false}:{shared?:SharedState;history:LobbyGame[];signedIn:boolean;loginUrl:string;onPlay:(c:Contract,deckKey?:string)=>void;embedded?:boolean}){
 const Root=embedded?'div':'section';
 const [tab,setTab]=useState<Tab>(()=>(['limited','premier','eternal'] as Tab[]).find(t=>(typeof location==='undefined'?'':location.hash)===`#${t}`)??'premier');
 const [played,setPlayed]=useState<PlayedDeck[]>(),[pools,setPools]=useState<LimitedPool[]>(),[error,setError]=useState('');
 const [json,setJson]=useState<DeckExport>();
 useEffect(()=>{window.history.replaceState({...window.history.state},'',`#${tab}`);},[tab]);
 useEffect(()=>{if(!signedIn)return;
  lobbyJson<{decks:PlayedDeck[]}>('/api/lobby/decks/played').then(r=>setPlayed(r.decks)).catch(e=>setError(e.message));
  sharedCall<{decks:LimitedDeck[];pools?:LimitedPool[]}>({action:'decks',byPool:true}).then(r=>setPools(r.pools??groupByPool(r.decks))).catch(e=>setError(e.message));
 },[signedIn]);
 const ptp=ptpOriginOf(shared);
 // Archetype groups: same leader and base, newest version first.
 const groups=useMemo(()=>{const map=new Map<string,PlayedDeck[]>();for(const d of played??[]){if(d.format!==tab)continue;const k=`${d.leader}:${d.base}`;map.set(k,[...(map.get(k)??[]),d]);}return [...map.values()].sort((a,b)=>b[0].lastPlayedAt-a[0].lastPlayedAt);},[played,tab]);
 const lastPlayed=useMemo(()=>{const m=new Map<string,number>();for(const g of history)if(g.poolShareId)m.set(g.poolShareId,Math.max(m.get(g.poolShareId)??0,g.createdAt));return m;},[history]);
 // Pools with their builds, most recently touched first; builds newest first within a pool.
 const sortedPools=useMemo(()=>(pools??[]).map(p=>({...p,decks:[...p.decks].sort((a,b)=>iso(b.updatedAt)-iso(a.updatedAt))})).sort((a,b)=>iso(b.decks[0]?.updatedAt)-iso(a.decks[0]?.updatedAt)),[pools]);
 return <Root className={embedded?"ph-page-tab":"ph-page"} aria-label={embedded?undefined:"Decks and Pools"}>
  <div className="ph-page-head">
   <div className="ph-seg" role="tablist" aria-label="Format">{([['limited','Limited'],['premier','Premier'],['eternal','Eternal']] as const).map(([t,l])=><button key={t} role="tab" aria-selected={tab===t} aria-pressed={tab===t} onClick={()=>setTab(t)}>{l}</button>)}</div></div>
  {!sessionKnown(shared)?<ContentSkeleton/>:!signedIn?<div className="ph-panel ph-empty"><p>Log in to see the decks you've played.</p><a className="ph-btn ph-go" href={loginUrl}>Log in</a></div>
  :error?<p className="ph-problem" role="alert">{error}</p>
  :tab==='limited'?<>
   <div className="ph-row-between"><span className="ph-sub">Your Draft and Sealed pools from Protect the Pod, with every deck you built from each.</span><span className="ph-row-actions"><a className="ph-btn ph-sm" href={`${ptp}/deckbuilder`}>Deck builder</a><a className="ph-btn ph-sm" href={`${ptp}/sealed`}>+ New sealed pool</a></span></div>
   {pools===undefined?<ContentSkeleton/>:!sortedPools.length?<div className="ph-panel ph-empty"><p>No limited decks yet. Draft or open packs to build one.</p></div>
   :sortedPools.map(p=><div key={p.poolShareId} className="ph-group">
     <div className="ph-group-head"><span className="ph-group-art" style={{backgroundImage:`url(${setArt(ptp,p.setCode)})`}}/>
      <div><b>{p.name??`${p.setName??p.setCode} ${p.poolType==='draft'?'Draft':'Sealed'}`}</b><span className="ph-tags"><span className="ph-tag ph-tag-strong">{p.poolType==='draft'?'Draft':'Sealed'}</span><span className="ph-tag">{p.setCode}</span>{p.poolType!=='draft'&&p.packCount?<span className="ph-tag">{p.packCount} packs</span>:null}{p.createdAt?<span className="ph-tag">Opened {day(iso(p.createdAt))}</span>:null}</span></div>
      <a className="ph-btn ph-sm" href={`${ptp}/pools/${encodeURIComponent(p.poolShareId)}`}>Open pool</a></div>
     {p.decks.map(d=><div key={d.poolShareId} className="ph-version">
      <DeckArt className="ph-ldr ph-ldr-sm" leaderName={d.leaderName} baseName={d.baseName} set={d.setCode}/>
      <span className="ph-version-main"><b>{d.name}</b><span className="ph-tags">{d.mainDeckCount?<span className="ph-tag">{d.mainDeckCount} cards</span>:null}{d.updatedAt?<span className="ph-tag">Edited {day(iso(d.updatedAt))}</span>:null}{lastPlayed.get(d.poolShareId)?<span className="ph-tag">Played {day(lastPlayed.get(d.poolShareId)!)}</span>:null}</span>{d.listStats&&<DeckMiniStats stats={d.listStats} ptp={ptp}/>}{d.hasDeck===false?<span className="ph-sub">Not built yet</span>:!d.ready&&<span className="ph-problem">{d.blocker||'Finish building this deck on PTP.'}</span>}</span>
      <a className="ph-btn ph-sm" href={`${ptp}/pools/${encodeURIComponent(d.poolShareId)}`}>Edit</a>
      {d.listStats?<a className="ph-btn ph-sm" href={`${ptp}/pools/${encodeURIComponent(d.poolShareId)}/deck/stats#build`}>Stats</a>:<span/>}
      <button className="ph-btn ph-sm ph-go" disabled={!d.ready} onClick={()=>onPlay(limitedContract(d),d.poolShareId)}>Join queue</button>
     </div>)}
    </div>)}
  </>:<>
   <div className="ph-row-between"><span className="ph-sub">Every deck you've played in {tab==='premier'?'Premier':'Eternal'}, grouped by archetype.</span><span className="ph-source">Decks from <b>SWUForge</b> · or pasted JSON</span></div>
   {played===undefined?<ContentSkeleton/>:!groups.length?<div className="ph-panel ph-empty"><p>No {tab==='premier'?'Premier':'Eternal'} games yet. Play one with a SWUForge deck or pasted JSON and it shows up here.</p><button className="ph-btn ph-go" onClick={()=>onPlay({format:tab,limited:'six',set:'',pool:'current'})}>Play {tab==='premier'?'Premier':'Eternal'}</button></div>
   :groups.map(versions=>{const head=versions[0],totals=versions.reduce((t,v)=>({wins:t.wins+v.wins,losses:t.losses+v.losses,draws:t.draws+v.draws}),{wins:0,losses:0,draws:0});
    return <div key={`${head.leader}:${head.base}`} className="ph-group">
     <div className="ph-group-head"><DeckArt className="ph-ldr" leader={head.leader} base={head.base}/><div><Archetype leader={head.leader} base={head.base} format={tab}/><span className="ph-sub">{versions.length} {versions.length===1?'version':'versions'} · last played {day(head.lastPlayedAt)}</span></div><span className="ph-record">{record(totals)}<small>record</small></span></div>
     {versions.map(v=><div key={v.key} className="ph-version">
      <span className="ph-when">{day(v.lastPlayedAt)}</span>
      <span className="ph-version-main"><span className="ph-tags"><span className={`ph-tag${v.source==='swuforge'?' ph-tag-sf':''}`}>{v.source==='swuforge'?'SWUForge':'JSON'}</span><span className="ph-tag">{v.mainCount} + {v.sideboardCount}</span></span></span>
      <span className="ph-record-sm">{v.games?record(v):'—'}</span>
      {v.source==='swuforge'&&v.sourceUrl?<a className="ph-btn ph-sm" href={v.sourceUrl} target="_blank" rel="noreferrer">View in SWUForge</a>:<button className="ph-btn ph-sm" onClick={()=>setJson({...v.export,metadata:{name:v.name??undefined}})}>View JSON</button>}
      <button className="ph-btn ph-sm ph-go" onClick={()=>onPlay({format:tab,limited:'six',set:'',pool:'current'},v.key)}>Join queue</button>
     </div>)}
    </div>;})}
  </>}
  {json&&<JsonDialog deck={json} onClose={()=>setJson(undefined)}/>}
 </Root>;
}
function JsonDialog({deck,onClose}:{deck:DeckExport;onClose:()=>void}){
 const ref=useRef<HTMLDialogElement>(null),[note,setNote]=useState('');const text=JSON.stringify(deck,null,2);
 useEffect(()=>{ref.current?.showModal();},[]);
 const save=()=>{const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='deck.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 return <dialog ref={ref} className="ph-modal" aria-label="Deck JSON" onCancel={onClose}><div className="ph-modal-card ph-json">
  <header className="ph-modal-head"><h2>Deck JSON</h2><button className="ph-x" aria-label="Close" onClick={onClose}>✕</button></header>
  <textarea readOnly rows={16} value={text} aria-label="Deck JSON"/>
  <div className="ph-paste"><button className="ph-btn ph-sm" onClick={()=>void navigator.clipboard.writeText(text).then(()=>setNote('Copied.')).catch(()=>setNote('Select the text and copy it.'))}>Copy</button><button className="ph-btn ph-sm" onClick={save}>Download .json</button>{note&&<span className="ph-sub" role="status">{note}</span>}</div>
 </div></dialog>;
}

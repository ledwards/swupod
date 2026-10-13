import {useEffect,useRef,useState} from 'react';
import type {LobbyState} from '@purrgil/ui/transport/lobby';
import {newestPackSet,setArt} from './art';
import {FormatArt,type FormatKey} from './FormatArt';
import {formatLabel,premier,sameQueue,setsOf,waitingFor,type Contract,type SharedState} from './shared';

/** Whether anything is happening: a live game, a forming pod or an occupied queue. */
export const activityBusy=(shared?:SharedState,lobby?:LobbyState)=>(lobby?.games?.length??0)>0||(shared?.pods?.length??0)>0||(shared?.queues??[]).some(q=>waitingFor(shared,q.contract)>0);
/** The queues the panel always offers, empty or not: the newest set's Draft, Sealed 6-pack and Sealed 8-pack, then Premier and Eternal. */
export const primaryQueues=(set:string):Contract[]=>[...(['draft','six','eight'] as const).map(limited=>({...premier,format:'limited',limited,set} as Contract)),premier,{...premier,format:'eternal'}];
const queueName=(c:Contract)=>c.format==='limited'?(c.limited==='draft'?'Draft':c.limited==='chaos'?'Chaos':`Sealed ${c.limited==='eight'?8:6}-pack`):c.format==='eternal'?'Eternal':'Premier';
const queueMeta=(c:Contract)=>c.format==='limited'?(c.limited==='chaos'?'Any set':c.set):c.format==='eternal'?'All sets':'Current';
/** A queue's art is its Play tab's: packs over the format's table, Premier's meta art, Eternal's leader. */
const formatOf=(c:Contract):FormatKey=>c.format==='limited'?c.limited:c.format;
const fullLabel=(c:Contract)=>`${formatLabel(c)}${c.format==='limited'&&c.limited!=='draft'&&c.limited!=='chaos'?` ${c.limited==='eight'?8:6}-pack`:''}`;
const PersonGlyph=()=><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="5" r="3"/><path d="M2.5 14.5c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6z"/></svg>;

type Props={shared?:SharedState;lobby?:LobbyState;ptp:string;onPlay:(c:Contract)=>void};
export function ActivityBoard({shared,lobby,ptp,onPlay}:Props){
 const source=useRef<HTMLElement>(null),dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null);
 const [expanded,setExpanded]=useState(false),[closing,setClosing]=useState(false);
 const primary=primaryQueues(setsOf(shared)[0]?.code??newestPackSet);
 // Any other occupied queue (an older set, Chaos) joins the grid after the primary five.
 const extra=(shared?.queues??[]).map(q=>q.contract).filter(c=>waitingFor(shared,c)>0&&!primary.some(p=>sameQueue(p,c)))
  .filter((c,i,all)=>all.findIndex(o=>sameQueue(o,c))===i);
 const queues=[...primary,...extra];
 const pods=shared?.pods??[],games=lobby?.games??[];
 const animate=(reverse=false)=>{const a=source.current?.getBoundingClientRect(),b=dialog.current?.getBoundingClientRect();if(!a||!b||!dialog.current)return;
 const small={transform:`translate(${a.left-b.left}px,${a.top-b.top}px) scale(${a.width/b.width},${a.height/b.height})`,opacity:.65,borderRadius:'12px'};
 return dialog.current.animate(reverse?[{transform:'none',opacity:1},small]:[small,{transform:'none',opacity:1}],{duration:matchMedia('(prefers-reduced-motion: reduce)').matches?0:240,easing:'cubic-bezier(.2,.8,.2,1)',fill:'none'});
 };
 useEffect(()=>{if(!expanded)return;const d=dialog.current;if(!d)return;const overflow=document.body.style.overflow;d.showModal();document.body.style.overflow='hidden';animate();return()=>{document.body.style.overflow=overflow;};},[expanded]);
 const close=async()=>{if(closing)return;setClosing(true);await animate(true)?.finished.catch(()=>{});dialog.current?.close();setExpanded(false);setClosing(false);requestAnimationFrame(()=>trigger.current?.focus());};
 const choose=(c:Contract)=>{if(expanded){dialog.current?.close();setExpanded(false);}onPlay(c);};
 const keyArt=<span className="ph-activity-art" aria-hidden="true" style={{backgroundImage:`url("${setArt(ptp,newestPackSet)}")`,backgroundPosition:'50% 40%',backgroundSize:'cover'}}/>;
 const waiting=queues.reduce((n,c)=>n+waitingFor(shared,c),0);
 const summary=[games.length&&`${games.length} live ${games.length===1?'game':'games'}`,pods.length&&`${pods.length} ${pods.length===1?'pod':'pods'} forming`,waiting&&`${waiting} in queues`].filter(Boolean).join(' · ')||'No live games';
 // The panel keeps a fixed shape: at most two pod or game rows above the queues; the expanded view has them all.
 const content=(full:boolean)=>{const live=[...pods.map(p=>({kind:'pod' as const,p})),...games.map(g=>({kind:'game' as const,g}))];const shown=full?live:live.slice(0,2);return <>
  {full
   // Expanded, the board opens like the deck view: a key-art banner with the title, what's happening, and the same close button.
   ?<header className="ph-dv-hero ph-activity-hero">{keyArt}<span className="ph-dv-shade"/><span className="ph-dv-title"><b>Now Playing</b><span>{summary}</span></span>
    <button type="button" className="ph-dv-close" aria-label="Collapse Now Playing" onClick={()=>void close()}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg></button></header>
   :<header className="ph-box-head ph-activity-head"><h2>Now Playing</h2><button ref={trigger} className="ph-activity-expand" aria-label="Expand Now Playing" onClick={()=>setExpanded(true)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg></button></header>}
  <div className={full?'ph-activity-body':'ph-activity-content'}>
  {shown.length?<div className="ph-activity-list">
   {shown.map(item=>item.kind==='pod'
    ?<div className="ph-activity-row" key={`p-${item.p.id}`}><span><strong>{item.p.name}</strong><small>{item.p.players}/{item.p.capacity} seats · Forming pod</small></span><a className="ph-btn ph-sm" href={`${ptp}/draft/${encodeURIComponent(item.p.id)}`}>Join pod</a></div>
    :<div className="ph-activity-row" key={`g-${item.g.id}`}><span><strong>{item.g.players.join(' vs ')}</strong><small>Live game</small></span><a className="ph-btn ph-sm" href={item.g.url}>Watch</a></div>)}
  </div>:null}
  <div className="ph-queue-grid" role="group" aria-label="Queues">
   {queues.map(c=>{const n=waitingFor(shared,c);return <button type="button" key={`${c.format}-${c.limited}-${c.set}-${c.pool}`} className={`ph-queue-tile is-${formatOf(c)}${n>0?' is-waiting':''}`} aria-label={`Join ${fullLabel(c)} queue, ${n} waiting`} title={`Join ${fullLabel(c)} queue · ${n} waiting`} onClick={()=>choose(c)}>
    <span className="ph-queue-art" aria-hidden="true"><FormatArt format={formatOf(c)} ptp={ptp} set={c.set||newestPackSet}/></span>
    <span className="ph-queue-name">{queueName(c)}</span>
    <span className="ph-queue-meta"><span className="ph-queue-set">{queueMeta(c)}</span><span className="ph-queue-count"><PersonGlyph/>{n}</span></span><span className="ph-queue-join" aria-hidden="true">Join</span>
   </button>;})}
  </div>
  </div>
 </>};
 return <><section ref={source} className="ph-activity-board" aria-label="Now Playing" style={expanded?{visibility:'hidden'}:undefined}>{keyArt}{content(false)}</section>{expanded&&<dialog ref={dialog} className="ph-activity-modal" aria-label="Now Playing" onCancel={e=>{e.preventDefault();void close();}} onClick={e=>{if(e.target===dialog.current){const r=dialog.current.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)void close();}}}>{content(true)}</dialog>}</>;
}

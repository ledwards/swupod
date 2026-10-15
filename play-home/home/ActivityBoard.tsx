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

type Props={shared?:SharedState;ptp:string;onPlay:(c:Contract)=>void};
/** The lobbies: forming pods, then the queues with their counts and a Join. Live games are on the Live strip at the foot of every page. */
export function ActivityBoard({shared,ptp,onPlay}:Props){
 const primary=primaryQueues(setsOf(shared)[0]?.code??newestPackSet);
 // Any other occupied queue (an older set, Chaos) joins the grid after the primary five.
 const extra=(shared?.queues??[]).map(q=>q.contract).filter(c=>waitingFor(shared,c)>0&&!primary.some(p=>sameQueue(p,c)))
  .filter((c,i,all)=>all.findIndex(o=>sameQueue(o,c))===i);
 const queues=[...primary,...extra];
 const pods=shared?.pods??[];
 const keyArt=<span className="ph-activity-art" aria-hidden="true" style={{backgroundImage:`url("${setArt(ptp,newestPackSet)}")`,backgroundPosition:'50% 40%',backgroundSize:'cover'}}/>;
 return <section className="ph-activity-board" aria-label="Lobbies">{keyArt}
  {pods.length?<div className="ph-activity-list">
   {pods.map(p=><div className="ph-activity-row" key={p.id}><span><strong>{p.name}</strong><small>{p.players}/{p.capacity} seats · Forming pod</small></span><a className="ph-btn ph-sm" href={`${ptp}/draft/${encodeURIComponent(p.id)}`}>Join pod</a></div>)}
  </div>:null}
  <div className="ph-queue-grid" role="group" aria-label="Queues">
   {queues.map(c=>{const n=waitingFor(shared,c);return <button type="button" key={`${c.format}-${c.limited}-${c.set}-${c.pool}`} className={`ph-queue-tile is-${formatOf(c)}${n>0?' is-waiting':''}`} aria-label={`Join ${fullLabel(c)} queue, ${n} waiting`} title={`Join ${fullLabel(c)} queue · ${n} waiting`} onClick={()=>onPlay(c)}>
    <span className="ph-queue-art" aria-hidden="true"><FormatArt format={formatOf(c)} ptp={ptp} set={c.set||newestPackSet}/></span>
    <span className="ph-queue-name">{queueName(c)}</span>
    <span className="ph-queue-meta"><span className="ph-queue-set">{queueMeta(c)}</span><span className="ph-queue-count"><PersonGlyph/>{n}</span></span><span className="ph-queue-join" aria-hidden="true">Join</span>
   </button>;})}
  </div>
 </section>;
}

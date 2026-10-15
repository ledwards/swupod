import {ModeIcon} from '@purrgil/ui/components/ModeIcon';
import {ActivityBoard,activityBusy} from './ActivityBoard';
import {artworkThumbnailUrl} from '@purrgil/ui/artwork';
import {useEffect,useRef,useState,type CSSProperties} from 'react';
import type {LobbyGame,LobbyState} from '@purrgil/ui/transport/lobby';
import {CloseGlyph,ResumeCard,ResumeGame} from './ResumeGame';
import {art,draftFan,eternalLeaders,newestPackSet,packCandidates,premierLeaders,sealedTableBySet,setArt,type Art} from './art';
import {Archetype,Crop,DeckArt,SeatBanner} from './bits';
import {readSeat} from './seat';
import {clock,maintenanceOf,onPtpSite,ptpOriginOf,queueStages,returnLabel,sitePath,formatLabel,premier,setsOf,sharedCall,signedInOf,stageLabel,waitingFor,type Contract,type PlayMaintenance,type QueueSearch,type SharedState} from './shared';

/** The single front door: Draft, Sealed, Premier/Eternal, then what's happening now. */
export function HomePage({ptpHome=false,launching=false,resumeGame,lobby,shared,sharedError,onPlay,onLimited,refreshShared}:{ptpHome?:boolean;launching?:boolean;resumeGame?:LobbyGame;lobby?:LobbyState;shared?:SharedState;sharedError:string;onPlay:(c:Contract)=>void;onLimited:(flow:'sealed'|'draft')=>void;refreshShared:()=>Promise<void>}){
 // The Sealed fan never waits on a set list: the lobby state, then the host page's data-play-sets, then the newest set
 // with pack art (the prerendered shell has neither). Each pack falls back through other art if its image fails.
 const ptp=ptpOriginOf(shared),set=setsOf(shared)[0]?.code??newestPackSet;
 const tableImage=(id:string)=>artworkThumbnailUrl(`/table-environments/table-${id}-overhead.webp`);
 // A set with no curated table uses its expansion art, layered over the newest set's table in case that art is missing too.
 const sealedTable=sealedTableBySet[set]?`url("${tableImage(sealedTableBySet[set])}")`:`url("${setArt(ptp,set)}") center/cover,url("${tableImage(sealedTableBySet[newestPackSet])}")`;
 const contract:Contract=premier;
 const signedIn=signedInOf(shared),[resumes,setResumes]=useResumes(ptpHome,signedIn);
 // While Play is down, its card is the maintenance panel. Only a real server answer (page load or status poll) shows it.
 const maintenance=maintenanceOf(shared);
 // No resume, the lobbies take the whole row; otherwise the one resume box sits beside them at the same height.
 // While a signed-in player's resumes load, their column is already reserved, so nothing jumps when they arrive.
 const share=resumeGame||!resumes.loaded||resumes.items.length?'narrow':'none';
 // While queued or hosting, the page is just the two seats; the strip and footer stay below.
 // A private game that just started holds its room a moment, so the host sees the other seat filled before the table opens.
 if(shared?.queue||shared?.active&&(shared.active.status!=='in_progress'||launching))return <div className="ph-home"><Reservation shared={shared} refresh={refreshShared} user={lobby?.user} launching={launching}/></div>;
 return <div className="ph-home" style={{'--choice-draft':`url("${tableImage('canto-bight')}")`,'--choice-sealed':sealedTable,'--choice-constructed':`url("${tableImage('isb')}")`} as CSSProperties}>
  <Reservation shared={shared} refresh={refreshShared} user={lobby?.user}/>
  {/* Draft and Sealed are plain links: they work before the bundle hydrates, and open in a new tab like any link. */}
  <div className="ph-tiles">
   <a className="ph-tile" href={`${ptpHome?'':ptp}/draft`}>
    <span className="ph-tile-art ph-fan" aria-hidden="true">{draftFan.map(candidates=><FallbackImage key={candidates[0]} candidates={candidates}/>)}</span>
    <span className="ph-tile-copy"><span className="ph-tile-title">Draft</span><span className="ph-sub">Practice, create, or join a pod</span></span>
   </a>
   <a className="ph-tile" href={`${ptpHome?'':ptp}/sealed`}>
    <span className="ph-tile-art ph-packs" aria-hidden="true">{[1,2,3,1,2,3].map((n,i)=><FallbackImage key={`${set}-${i}`} candidates={packCandidates(ptp,set,n)} style={{'--i':i-2.5} as CSSProperties}/>)}</span>
    <span className="ph-tile-copy"><span className="ph-tile-title">Sealed</span><span className="ph-sub">Practice, create, or join a pod</span></span>
   </a>
   {maintenance?<MaintenancePanel maintenance={maintenance}/>:<div className="ph-tile" role="group" aria-label="Play">
    <button className="ph-tile-hit" aria-label="Play" onClick={()=>onPlay(contract)}/>
    <span className="ph-tile-art ph-leaders" aria-hidden="true">{premierLeaders.map(src=><img key={src} src={src} alt=""/>)}</span>
    <span className="ph-tile-copy">
     <span className="ph-tile-title">Play</span><span className="ph-sub">Play Limited or Constructed against bots or humans</span>
    </span>
   </div>}
  </div>
  {/* Below the three doors: where you left off, and the lobbies, which always show. */}
  <div className={`ph-home-status is-${share}${activityBusy(shared,lobby)?' is-busy':' is-quiet'}`}><div className="ph-home-resume">{resumeGame?<ResumeGame game={resumeGame}/>:!resumes.loaded?<ResumePending/>:<Resume items={resumes.items} setItems={setResumes}/>}</div><ActivityBoard shared={shared} ptp={ptp} onPlay={onPlay}/></div>

  <nav className="ph-utils" aria-label="Your stuff">
   <Util href={`${ptp}/meta`} title="Meta" sub="Card and leader stats" a={art.meta}/>
   <Util href={sitePath('stats')} title="My Stats" sub={lobby?.user?`Online ELO ${lobby.user.lifetimeElo??1500}`:'Your online record'} a={art.stats}/>
   <Util href={sitePath('history')} title="History" sub="Decks, pools, games, replays" a={art.myDecks}/>
   <Util href={`${ptp}/formats`} title="More Formats" sub="Chaos, Pack Wars, Rotisserie" a={art.moreFormats}/>
  </nav>
 </div>;
}
/** One card or pack in a tile's fan: on a failed load it moves to the next candidate image rather than leaving a gap. */
function FallbackImage({candidates,style}:{candidates:readonly string[];style?:CSSProperties}){
 const [at,setAt]=useState(0);
 return <img src={candidates[Math.min(at,candidates.length-1)]} alt="" style={style} decoding="async" onError={()=>setAt(a=>a<candidates.length-1?a+1:a)}/>;
}
function Util({href,title,sub,a}:{href:string;title:string;sub:string;a:Art}){return <a className="ph-util" href={href}><Crop className="ph-util-art" src={a.src} position={a.position} scale={a.scale}/><span><b>{title}</b><span className="ph-sub">{sub}</span></span></a>;}

/** While you're queued or hosting a private game, that leads the page: your seat, and the open one. */
function Reservation({shared,refresh,user,launching=false}:{shared?:SharedState;refresh:()=>Promise<void>;user?:{name:string;lifetimeElo:number|null}|null;launching?:boolean}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[note,setNote]=useState(''),[now,setNow]=useState(Date.now());
 const [seat]=useState(readSeat);
 useEffect(()=>{if(!shared?.queue)return;const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t);},[shared?.queue]);
 // A game already at the table is offered as Rejoin by the lobby, not here.
 if(!shared?.queue&&(!shared?.active||shared.active.status==='in_progress'&&!launching))return null;
 const cancel=async()=>{setBusy(true);setError('');try{await sharedCall({action:'cancel'});await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 // Invitations always open on Protect the Pod (/play?invite=…), never on Purrgil's gateway: this page's own origin on PTP, PTP's otherwise.
 const link=shared.active?.invite?`${onPtpSite()?location.origin:shared.ptpOrigin}/play?${new URLSearchParams({invite:shared.active.invite})}`:'';
 const elapsed=shared.queue?now-shared.queue.joinedAt:0;
 const contract=shared.queue?.contract??shared.active?.contract;
 const problem=error||shared.active?.error,opponent=shared.active?.opponent;
 const deckName=seat?.name?<b>{seat.name}</b>:seat?.leader&&seat.base?<Archetype leader={seat.leader} base={seat.base} format={seat.format??'premier'}/>:null;
 const you=<div className="ph-seat is-you">
  {seat?<DeckArt portrait leader={seat.leader} base={seat.base} leaderName={seat.leaderName} baseName={seat.baseName} set={seat.set}/>:<Crop src={art.queue.src} position={art.queue.position} scale={art.queue.scale}/>}
  <div className="ph-seat-copy"><span className="ph-seat-name">{user?.name??'You'}</span><span className="ph-sub">{deckName}{shared.queue&&user?.lifetimeElo?<> · {user.lifetimeElo}</>:null}</span></div>
 </div>;
 const leave=shared.active?.status!=='starting'&&shared.active?.status!=='in_progress';
 if(shared.queue)return <section className="ph-match" aria-live="polite" aria-label="Matchmaking">
  {you}
  <div className="ph-vs"><span>vs</span><span className="ph-timer" role="timer">{clock(elapsed)}</span></div>
  <div className="ph-seat is-open">
   <span className="ph-dots" aria-hidden="true"><i/><i/><i/></span>
   <h2>Finding your opponent</h2>
   <span className="ph-sub">{waitingFor(shared,shared.queue.contract)?`${waitingFor(shared,shared.queue.contract)} waiting in `:''}{formatLabel(shared.queue.contract)}</span>
   {shared.queue.search&&<SearchStages search={shared.queue.search} now={now}/>}
   {shared.queue.notice&&<span className="ph-sub" role="status">{shared.queue.notice}</span>}
   {shared.currentPolicy&&shared.queue.contract.policy&&shared.queue.contract.policy!==shared.currentPolicy&&<span className="ph-problem" role="status">Card pool changed. Leave and rejoin.</span>}
   {problem&&<span className="ph-problem" role="alert">{problem}</span>}
   {leave&&<button className="ph-btn ph-danger" disabled={busy} onClick={()=>void cancel()}>Leave matchmaking</button>}
  </div>
 </section>;
 return <section className="ph-private" aria-live="polite" aria-label="Private game">
  <div className="ph-private-head">{contract&&<span className="ph-format-pill">{formatLabel(contract)}</span>}<span className="ph-private-status" role="status">{opponent?'Opponent joined · Starting…':shared.active?.status==='waiting'?'Waiting for opponent':'Starting…'}</span></div>
  <div className="ph-private-grid">
   <SeatBanner label="You" name={user?.name??'You'} sub={deckName} leader={seat?.leader} base={seat?.base} leaderName={seat?.leaderName} baseName={seat?.baseName} set={seat?.set} ready/>
   {opponent?<SeatBanner label="Opponent" name={opponent.name} sub={opponent.deckName??(opponent.leader&&opponent.base?<Archetype leader={opponent.leader} base={opponent.base} format={contract?.format==='eternal'?'eternal':contract?.format==='limited'?'limited':'premier'}/>:undefined)} leader={opponent.leader} base={opponent.base} ready/>
   :<SeatBanner label="Opponent" name="Waiting for your friend" sub="Send them the link. The game starts when they join." status={<span className="ph-dots" aria-hidden="true"><i/><i/><i/></span>}>
    {link&&<span className="ph-invite"><input readOnly value={link} aria-label="Private game link" onFocus={e=>e.target.select()}/><button className="ph-btn ph-go" onClick={()=>void navigator.clipboard.writeText(link).then(()=>setNote('Link copied.')).catch(()=>setNote('Select the link and copy it.'))}>Copy link</button></span>}
    {(problem||note)&&<span className={problem?'ph-problem':'ph-sub'} role={problem?'alert':'status'}>{problem||note}</span>}
    {leave&&<button className="ph-link" disabled={busy} onClick={()=>void cancel()}>Cancel</button>}
   </SeatBanner>}
  </div>
 </section>;
}

/** Play's card while the matcher is down: the operator's message and the return time, in the card's place. */
function MaintenancePanel({maintenance}:{maintenance:PlayMaintenance}){
 const back=maintenance.returnAt?returnLabel(maintenance.returnAt):'';
 return <section className="ph-tile ph-maintenance" aria-label="Maintenance" role="status">
  <span className="ph-tile-title">Maintenance</span>
  <span className="ph-sub">{maintenance.message}</span>
  {back&&<span className="ph-maintenance-back">Back <time dateTime={maintenance.returnAt!}>{back}</time></span>}
 </section>;
}
/** The server's three search steps. The current one is lit and, until the last, shows the time to the next; the client never advances a step on its own. */
function SearchStages({search,now}:{search:QueueSearch;now:number}){
 const at=queueStages.indexOf(search.stage);
 return <ol className="ph-stages" aria-label="Search">{queueStages.map((stage,i)=><li key={stage} className={i===at?'is-current':i<at?'is-past':undefined} aria-current={i===at?'step':undefined}><i aria-hidden="true"/><span>{stageLabel[stage]}</span>{i===at&&search.widenAt!==null&&<span className="ph-stage-next" role="timer">{clock(search.widenAt-now)}</span>}</li>)}</ol>;
}
type UnfinishedItem={id:string;label:string;action:string;href:string;imageUrl:string|null;artKind:'leader'|'set';setImageUrl?:string|null;removeUrl?:string;removeMethod?:'DELETE'|'POST';removeLabel?:string};
const split=(label:string)=>{const at=label.lastIndexOf(' · ');return at<0?[label,'']:[label.slice(0,at),label.slice(at+3)];};
/** The player's unfinished pods and decks (PTP only, signed in). `loaded` is false until the first answer, so the row can hold their place. */
function useResumes(ptpHome:boolean,signedIn:boolean){
 const wanted=ptpHome&&signedIn;
 const [state,setState]=useState<{items:UnfinishedItem[];loaded:boolean}>(()=>({items:[],loaded:!wanted}));
 useEffect(()=>{
  if(!wanted){setState({items:[],loaded:true});return;}
  const controller=new AbortController();
  fetch('/api/home/resumes',{credentials:'same-origin',cache:'no-store',signal:controller.signal}).then(async r=>{const j=await r.json();setState({items:r.ok?(j.data??j).resumes??[]:[],loaded:true});}).catch(()=>{if(!controller.signal.aborted)setState(s=>({...s,loaded:true}));});
  return()=>controller.abort();
 },[wanted]);
 const setItems=(update:(items:UnfinishedItem[])=>UnfinishedItem[])=>setState(s=>({...s,items:update(s.items)}));
 return [state,setItems] as const;
}
/** The resume card's place while it loads: the same compact box, empty. */
const ResumePending=()=><div className="ph-resume-wrap is-pending" aria-hidden="true"><div className="ph-resume-game"/></div>;
/** The most recent unfinished pod or deck is the card; every other one is behind More. */
function Resume({items,setItems}:{items:UnfinishedItem[];setItems:(update:(items:UnfinishedItem[])=>UnfinishedItem[])=>void}){
 const [open,setOpen]=useState(false);
 const [removing,setRemoving]=useState<UnfinishedItem|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const confirm=useRef<HTMLDialogElement>(null);
 useEffect(()=>{if(removing)confirm.current?.showModal();},[removing]);
 const remove=async()=>{if(!removing?.removeUrl||busy)return;setBusy(true);setError('');try{const r=await fetch(removing.removeUrl,{method:removing.removeMethod??'DELETE',credentials:'same-origin'});if(!r.ok){const body=await r.json().catch(()=>null);throw Error(typeof body?.error==='string'?body.error:'Could not remove this item. Please try again.');}setItems(old=>old.filter(i=>i.id!==removing.id));setRemoving(null);}catch(e){setError(e instanceof Error?e.message:'Could not remove this item.');}finally{setBusy(false);}};
 const ask=(item:UnfinishedItem)=>{setError('');setRemoving(item);};
 const first=items[0];if(!first)return null;
 const rest=items.slice(1);
 const [title,status]=split(first.label);
 const row=(item:UnfinishedItem)=>{const [t,st]=split(item.label);return <div className="ph-resume-row" key={item.id} style={{backgroundImage:`linear-gradient(90deg,#000a,#000d 55%),url("${item.setImageUrl??item.imageUrl??''}")`}}><div><strong>{t}</strong><span>{st}</span></div><a className="ph-btn ph-sm" href={item.href}>{item.action}</a>{item.removeUrl&&<button className="ph-resume-delete" aria-label={`${item.removeLabel??'Delete'} ${t}`} title={item.removeLabel??'Delete'} onClick={()=>ask(item)}><CloseGlyph/></button>}</div>;};
 return <><ResumeCard image={first.setImageUrl??first.imageUrl} title={title} status={status} action={first.action} href={first.href} more={rest.length} open={open} onToggle={()=>setOpen(o=>!o)} onDelete={first.removeUrl?()=>ask(first):undefined} deleteLabel={first.removeLabel}>
  <div className="ph-resume-rows">{rest.map(row)}</div>
 </ResumeCard>{removing&&<dialog ref={confirm} className="ph-delete-confirm" aria-label={removing.removeLabel??'Delete item'} onCancel={e=>{e.preventDefault();if(!busy)setRemoving(null);}}><h2>{removing.removeLabel??'Delete item'}?</h2><p>{split(removing.label)[0]}</p><p>{removing.removeMethod==='POST'?'Leave this pod?':'This removes the item permanently.'}</p>{error&&<p role="alert">{error}</p>}<div><button className="ph-btn" disabled={busy} onClick={()=>setRemoving(null)}>Cancel</button><button className="ph-btn ph-danger" disabled={busy} onClick={()=>void remove()}>{busy?'Removing…':removing.removeLabel??'Delete'}</button></div></dialog>}</>;
}

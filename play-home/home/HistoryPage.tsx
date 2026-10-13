import {ModeIcon} from '@purrgil/ui/components/ModeIcon';
import {useId,useMemo,useState} from 'react';
import type {LobbyGame} from '@purrgil/ui/transport/lobby';
import {DownloadRecording} from '@purrgil/ui/components/DownloadRecording';
import {setArt} from './art';
import {cardName,cardKey} from './archetype';
import {GlobalComparison} from './GlobalComparison';
import {DeckArt} from './bits';
import {DeckCardAnalysis} from './DeckCardAnalysis';
import {playBase} from './shared';

type Filter='all'|'limited'|'premier'|'eternal';
type Run={key:string;games:LobbyGame[];latest:number};
const kind=(g:LobbyGame)=>g.contract?.format??(g.format==='Limited'?'limited':g.format==='Eternal'?'eternal':'premier');
const dayKey=(t:number)=>new Date(t).toDateString();
const dayLabel=(t:number)=>{const d=Math.floor((new Date().setHours(0,0,0,0)-new Date(t).setHours(0,0,0,0))/86400000);return d===0?'Today':d===1?'Yesterday':new Intl.DateTimeFormat(undefined,{month:'long',day:'numeric',year:new Date(t).getFullYear()===new Date().getFullYear()?undefined:'numeric'}).format(t);};
const minutes=(g:LobbyGame)=>g.completedAt?Math.max(1,Math.round((g.completedAt-g.createdAt)/60000)):null;
const record=(games:LobbyGame[])=>{const w=games.filter(g=>g.result==='Win').length,l=games.filter(g=>g.result==='Loss').length,d=games.filter(g=>g.result==='Draw').length;return `${w}–${l}${d?`–${d}`:''}`;};

/** Limited runs and constructed games in one timeline, every game replayable. */
export function HistoryPage({games,signedIn,loginUrl,ptp,embedded=false}:{games:LobbyGame[];signedIn:boolean;loginUrl:string;ptp:string;embedded?:boolean}){
 const Root=embedded?'div':'section';
 const [filter,setFilter]=useState<Filter>('all');
 const shown=useMemo(()=>games.filter(g=>filter==='all'||kind(g)===filter),[games,filter]);
 // A limited run is every game played with one pool's deck.
 const days=useMemo(()=>{
  const runs=new Map<string,Run>();
  for(const g of shown){const key=kind(g)==='limited'&&g.poolShareId?`run:${g.poolShareId}`:`game:${g.id}`;const r=runs.get(key)??{key,games:[],latest:0};r.games.push(g);r.latest=Math.max(r.latest,g.createdAt);runs.set(key,r);}
  const grouped=new Map<string,Run[]>();for(const r of [...runs.values()].sort((a,b)=>b.latest-a.latest)){const k=dayKey(r.latest);grouped.set(k,[...(grouped.get(k)??[]),r]);}
  return [...grouped.entries()];
 },[shown]);
 const week=games.filter(g=>Date.now()-g.createdAt<7*86400000);
 const wins=week.filter(g=>g.result==='Win').length,decided=week.filter(g=>g.result==='Win'||g.result==='Loss').length;
 return <Root className={embedded?"ph-page-tab":"ph-page"} aria-label={embedded?undefined:"History"}>
  <div className="ph-page-head">
   <div className="ph-chips" role="group" aria-label="Format">{([['all','All'],['limited','Limited'],['premier','Premier'],['eternal','Eternal']] as const).map(([f,l])=><button key={f} aria-pressed={filter===f} onClick={()=>setFilter(f)}>{l}</button>)}</div></div>
  {!signedIn?<div className="ph-panel ph-empty"><p>Log in to see your games and replays.</p><a className="ph-btn ph-go" href={loginUrl}>Log in</a></div>:<>
   <dl className="ph-stats">
    <div><dd>{record(week)}</dd><dt>games this week</dt></div>
    <div><dd>{decided?`${Math.round(wins/decided*100)}%`:'—'}</dd><dt>win rate this week</dt></div>
    <div><dd>{games.length}</dd><dt>games played</dt></div>
    <div><dd>{games.filter(g=>g.replayUrl).length}</dd><dt>replays saved</dt></div>
   </dl>
   {!shown.length?<div className="ph-panel ph-empty"><p>{games.length?'No games in this format yet.':'Your games and replays start here.'}</p><a className="ph-btn ph-go" href={playBase()}>Play a game</a></div>
   :days.map(([key,runs])=><div key={key} className="ph-day"><span className="ph-kicker">{dayLabel(runs[0].latest)}</span>
     {runs.map(r=>r.key.startsWith('run:')?<RunCard key={r.key} run={r} ptp={ptp}/>:<div key={r.key} className="ph-group"><GameRow game={r.games[0]} standalone history={games}/></div>)}
   </div>)}
  </>}
 </Root>;
}
function Tags({game,run=false,nested=false}:{game:LobbyGame;run?:boolean;nested?:boolean}){
 const c=game.contract,k=kind(game),m=minutes(game);
 return <span className="ph-tags">
  {!nested&&<><span className="ph-tag ph-tag-strong">{k==='limited'?'Limited':k==='eternal'?'Eternal':'Premier'}</span>
  {k==='limited'&&c?.limited&&<span className="ph-tag">{c.limited==='draft'?'Draft':c.limited==='chaos'?'Chaos sealed':'Sealed'}</span>}
  {k==='limited'&&(c?.limited==='six'||c?.limited==='eight')&&<span className="ph-tag">{c.limited==='eight'?8:6} packs</span>}
  {k==='limited'&&c?.set&&<span className="ph-tag">{c.set}</span>}</>}
  {!run&&game.mode&&<span className="ph-tag"><ModeIcon mode={game.mode}/>{game.mode==='queue'?'Matchmaking':game.mode==='private'?'Private':'vs AI'}</span>}
  {!run&&m&&<span className="ph-tag">{m} min</span>}
  {!nested&&c?.pool&&c.pool!=='current'&&<span className="ph-tag ph-tag-pool">Pool: {c.pool==='next'?'Next set':c.pool}</span>}
 </span>;
}
function DeckIdentity({game,seat,full=false}:{game:LobbyGame;seat:number;full?:boolean}){
 const leader=game.leaders?.[seat],base=game.bases?.[seat];
 return <span className="ph-history-deck"><span>{leader?cardName(leader):'Unknown leader'}{full&&base&&<small>{cardName(base)}</small>}</span></span>;
}
const deckKey=(g:LobbyGame,seat:number)=>[g.leaders?.[seat],g.bases?.[seat]].map(id=>id?cardKey(id):'?').join(':');
function HistoryStats({games}:{games:LobbyGame[]}){
 const wins=games.filter(g=>g.result==='Win').length,decided=games.filter(g=>g.result==='Win'||g.result==='Loss').length;
 const turns=games.map(g=>g.turns).filter((n):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>0);
 const durations=games.map(minutes).filter((m):m is number=>m!==null);
 return <div className="ph-history-overview">
  <dl className="ph-history-stats"><div><dt>Record (W–L–D)</dt><dd>{wins}–{games.filter(g=>g.result==='Loss').length}–{games.filter(g=>g.result==='Draw').length}</dd></div><div><dt>Win rate (excluding draws)</dt><dd>{decided?`${Math.round(wins/decided*100)}%`:'—'}</dd></div><div><dt>Games</dt><dd>{games.length}</dd></div>{durations.length>0&&<div><dt>Average game</dt><dd>{turns.length?`${(turns.reduce((a,b)=>a+b,0)/turns.length).toFixed(1)} turns`:'— turns'} <small>({Math.round(durations.reduce((a,b)=>a+b,0)/durations.length)} min)</small></dd></div>}</dl>
 </div>;
}
function MatchupDetails({games}:{games:LobbyGame[]}){
 const rows=new Map<string,LobbyGame>();
 for(const g of games){rows.set(deckKey(g,g.seat??0),g);}
 return <div className="ph-history-details">
  {[...rows].map(([key,g])=>{
   const played=games.filter(m=>deckKey(m,m.seat??0)===key);
   const opponents=[...new Set(played.map(m=>deckKey(m,1-(m.seat??0))))];
   return <div className="ph-history-matrix ph-matchup-table" role="region" aria-label="Matchup matrix" tabIndex={0} key={key}><table>
    <caption>Matchups <span className="ph-matchup-deck-label"><DeckIdentity game={g} seat={g.seat??0} full/></span><small>Every opponent matchup in this deck’s available history. Win rates exclude draws; differences are percentage points.</small></caption>
    <thead><tr><th scope="col">Opponent leader / base</th><th scope="col">Games</th><th scope="col">W–L–D</th><th scope="col">Your win rate</th><th scope="col">Global win rate</th><th scope="col">vs global</th></tr></thead>
    <tbody>{opponents.map(opponent=>{
     const matches=played.filter(m=>deckKey(m,1-(m.seat??0))===opponent),sample=matches[0];
     const w=matches.filter(m=>m.result==='Win').length,l=matches.filter(m=>m.result==='Loss').length,d=matches.filter(m=>m.result==='Draw').length;
     return <tr key={opponent}><th scope="row" className="ph-history-art-cell"><DeckArt className="ph-history-leader-art" leader={sample.leaders?.[1-(sample.seat??0)]} base={sample.bases?.[1-(sample.seat??0)]}/><DeckIdentity game={sample} seat={1-(sample.seat??0)} full/></th><td>{matches.length}</td><td>{w}–{l}–{d}</td><td><strong>{w+l?`${Math.round(w/(w+l)*100)}%`:'—'}</strong></td><GlobalComparison games={matches} tableCells/></tr>;
    })}</tbody>
   </table></div>;
  })}
 </div>;
}
function DetailsButton({open}:{open:boolean}){
 return <button type="button" className="ph-btn ph-sm" aria-expanded={open} onClick={e=>{e.preventDefault();e.stopPropagation();const details=e.currentTarget.closest('details');if(details)details.open=!details.open;}}>{open?'Hide details':'Details'}</button>;
}
function GameRow({game,standalone=false,history=[]}:{game:LobbyGame;standalone?:boolean;history?:LobbyGame[]}){
 const [open,setOpen]=useState(false);
 const seat=game.seat??0,other=1-seat;
 const related=history.filter(g=>kind(g)===kind(game)&&deckKey(g,g.seat??0)===deckKey(game,seat));
 return <details className="ph-history-item" onToggle={e=>{if(e.target===e.currentTarget)setOpen(e.currentTarget.open);}}>
 <summary className="ph-game">
  <span className={`ph-result ph-result-${game.result?.toLowerCase()??'none'}`}>{game.result??'Done'}</span>
  <DeckArt className="ph-history-leader-art" leader={game.leaders?.[other]} base={game.bases?.[other]}/>
  <span className="ph-game-main"><span className="ph-matchup">{standalone&&<><DeckIdentity game={game} seat={seat}/> vs </>}{game.players[other]??'Opponent'} · <DeckIdentity game={game} seat={other}/></span><Tags game={game} nested={!standalone}/></span>
 <span className="ph-game-actions ph-history-header-actions" onClick={e=>e.stopPropagation()}>{game.replayUrl?<a className="ph-btn ph-sm" href={game.replayUrl}>▶ Play</a>:<span className="ph-sub" role="status">Saving replay…</span>}{game.recordingUrl&&<DownloadRecording path={game.recordingUrl} label="⤓ Download" className="ph-btn ph-sm"/>}<DetailsButton open={open}/></span>
 </summary>
 {standalone?<DeckTabs games={related.length?related:[game]} history={<GameDetail game={game}/>}/>:<GameDetail game={game}/>}

 </details>;
}
function GameDetail({game}:{game:LobbyGame}){
 const seat=game.seat??0;
 return ( <div className="ph-history-game-detail"><div className="ph-history-players">{game.players.map((player,i)=><div key={i}><strong>{i===seat?'You':player}</strong><DeckIdentity game={game} seat={i} full/></div>)}</div>
 <p className="ph-sub"><time dateTime={new Date(game.createdAt).toISOString()}>{new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(game.createdAt)}</time>{minutes(game)?` · ${minutes(game)} min`:''}</p>

 </div>);
}
type HistoryTab='History'|'Matchups'|'Card Analysis';
function DeckTabs({games,history,poolUrl,statsUrl}:{games:LobbyGame[];history:React.ReactNode;poolUrl?:string;statsUrl?:string}){
 const [tab,setTab]=useState<HistoryTab>('History'),id=useId();
 const tabs:HistoryTab[]=['History','Matchups','Card Analysis'];
 return <div className="ph-deck-tabs"><HistoryStats games={games}/>
 <div className="ph-history-toolbar"><div role="tablist" aria-label="Deck details">{tabs.map((name,i)=><button key={name} role="tab" id={`${id}-tab-${i}`} aria-selected={tab===name} aria-controls={`${id}-panel-${i}`} tabIndex={tab===name?0:-1} onClick={()=>setTab(name)} onKeyDown={e=>{let next=i;if(e.key==='ArrowRight')next=(i+1)%3;else if(e.key==='ArrowLeft')next=(i+2)%3;else if(e.key==='Home')next=0;else if(e.key==='End')next=2;else return;e.preventDefault();setTab(tabs[next]);document.getElementById(`${id}-tab-${next}`)?.focus();}}>{name}</button>)}</div>{(poolUrl||statsUrl)&&<span className="ph-view-pool">{statsUrl&&<a className="ph-btn ph-sm" href={statsUrl}>Stats</a>}{poolUrl&&<a className="ph-btn ph-sm" href={poolUrl}>View pool</a>}</span>}</div>
 {tabs.map((name,i)=><div key={name} role="tabpanel" id={`${id}-panel-${i}`} aria-labelledby={`${id}-tab-${i}`} hidden={tab!==name} tabIndex={0}>{name==='History'?history:name==='Matchups'?<MatchupDetails games={games}/>:tab===name?<DeckCardAnalysis games={games}/>:null}</div>)}
 </div>;
}
function RunCard({run,ptp}:{run:Run;ptp:string}){
 const [open,setOpen]=useState(false);
 const first=[...run.games].sort((a,b)=>a.createdAt-b.createdAt)[0],seat=first.seat??0,c=first.contract;
 return <details className="ph-group ph-run ph-history-item" onToggle={e=>{if(e.target===e.currentTarget)setOpen(e.currentTarget.open);}}>
  <summary className="ph-group-head">
   <span className="ph-group-art" style={{backgroundImage:`url(${setArt(ptp,c?.set||'HMW')})`}}/>
   <div><DeckIdentity game={first} seat={seat}/><Tags game={first} run/></div>
   <span className="ph-record">{record(run.games)}<small>{run.games.length} {run.games.length===1?'game':'games'}</small></span>
   <DetailsButton open={open}/>
  </summary>
  <DeckTabs games={run.games} poolUrl={first.poolShareId?`${ptp}/pools/${encodeURIComponent(first.poolShareId)}`:undefined} statsUrl={first.poolShareId?`${ptp}/pools/${encodeURIComponent(first.poolShareId)}/deck/stats#build`:undefined} history={<>{[...run.games].sort((a,b)=>b.createdAt-a.createdAt).map(g=><GameRow key={g.id} game={g}/>)}</>}/>
 </details>;
}

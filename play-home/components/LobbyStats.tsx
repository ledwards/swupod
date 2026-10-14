import {ContentSkeleton} from '@purrgil/ui/components/ContentSkeleton';
import {sitePath} from '../home/shared';
import {StatsArchetypeList} from './StatsArchetypeList';
import {useRef,useState} from 'react';
import {lobbyRequest,type LobbyState} from '@purrgil/ui/transport/lobby';
import {DecisionDialog} from '@purrgil/ui/components/DecisionDialog';

const groups=[['decks','Deck','By deck'],['archetypes','Leader','By leader'],['opponents','Against','Against']] as const;

export function LobbyStats({state,refresh}:{state:LobbyState|null|undefined;refresh:()=>Promise<void>}){
 const [group,setGroup]=useState<'decks'|'archetypes'|'opponents'>('decks');
 const [scope,setScope]=useState<'all'|'season'>('all');
 const [confirm,setConfirm]=useState(false),[pending,setPending]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const requestId=useRef('');const user=state?.user;
 const rating=user?.stats?.[scope];const elo=(scope==='all'?user?.lifetimeElo:user?.seasonElo)??1500;
 const blocked=Boolean(state?.queue||state?.active);
 const rows=user?.stats?.breakdowns?.[scope][group]??[];
 const logout=async()=>{setPending(true);try{await lobbyRequest('/logout',{});location.assign(sitePath('home'));}catch(e){setError(e instanceof Error?e.message:'Unable to log out.');setPending(false);}};
 const reset=async()=>{setPending(true);setError('');try{await lobbyRequest('/ratings/reset',{confirm:true,requestId:requestId.current});await refresh();setConfirm(false);setNotice('ELO is now 1500.');}catch(e){setError(e instanceof Error?e.message:'Unable to reset ELO. Try again.');}finally{setPending(false);}};
 return <section className="ph-page lobby-stats" aria-label="Stats">
  <div className="ph-page-head">{user&&<div className="ph-seg" role="group" aria-label="Stats period"><button aria-pressed={scope==='all'} onClick={()=>setScope('all')}>All time</button><button aria-pressed={scope==='season'} onClick={()=>setScope('season')}>Season</button></div>}</div>
  {!state?<ContentSkeleton/>:!user?<div className="ph-panel ph-empty"><p>Log in to see your stats.</p><a className="ph-btn ph-go" href="/api/auth/signin/discord?return_to=%2Fme">Log in</a></div>:<>
   <dl className="stats-tiles">
    <div className="stats-tile is-elo"><dt>ELO</dt><dd className="stats-elo">{elo}</dd></div>
    <div className="stats-tile"><dt>Rated games</dt><dd>{rating?.games??0}</dd></div>
    <div className="stats-tile"><dt>Record</dt><dd>{rating?.games?`${rating.wins}–${rating.losses}${rating.draws?`–${rating.draws}`:''}`:'—'}</dd></div>
    <div className="stats-tile"><dt>Win rate</dt><dd>{rating?.games?`${Math.round(rating.wins/rating.games*100)}%`:'—'}</dd></div>
   </dl>
   <section className="stats-breakdowns" aria-labelledby="stats-group-title">
    <div className="ph-row-between"><h2 id="stats-group-title">{groups.find(g=>g[0]===group)![2]}</h2><div className="ph-chips" role="group" aria-label="Group by">{groups.map(([key,label])=><button key={key} aria-pressed={group===key} onClick={()=>setGroup(key)}>{label}</button>)}</div></div>
    {rows.length?<StatsArchetypeList rows={rows} group={group} history={state.history} ptp={state.ptpUrl?new URL(state.ptpUrl,location.origin).origin:location.origin}/>:<p className="ph-sub">No games yet.</p>}
   </section>
   <div className="stats-account">
    {notice&&<p className="ph-sub" role="status">{notice}</p>}{!confirm&&error&&<p className="ph-problem" role="alert">{error}</p>}
    <button className="ph-btn ph-sm" disabled={blocked||pending} title={blocked?'Leave your game or queue first':undefined} onClick={()=>{requestId.current=crypto.randomUUID();setError('');setConfirm(true);}}>Reset ELO</button>
    <button className="ph-btn ph-sm stats-logout" disabled={pending} onClick={()=>void logout()}>Log out</button>
   </div>
  </>}
  {confirm&&<DecisionDialog controls={false} label="Reset ELO to 1500?" className="lobby-dialog stats-reset-dialog" onClose={()=>{if(!pending)setConfirm(false);}}><h2>Reset ELO to 1500?</h2><p>All-time {user?.lifetimeElo??1500} and season {user?.seasonElo??1500} both go to <strong>1500</strong>. Games, replays and records stay. This cannot be undone.</p>{error&&<p role="alert">{error}</p>}<div className="stats-reset-actions"><button disabled={pending} onClick={()=>setConfirm(false)}>Keep my ELO</button><button disabled={pending} onClick={()=>void reset()}>{pending?'Resetting…':'Reset to 1500'}</button></div></DecisionDialog>}
 </section>;
}

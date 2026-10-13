import {useEffect,useState} from 'react';
import {sitePath} from './shared';
import {lobbyRequest,type LobbyGame,type LobbyState} from '@purrgil/ui/transport/lobby';
import {LeaderArt} from './bits';

/** In-progress games along the bottom of every page: both leaders, who's playing, and a way in. */
export function LiveStrip({games}:{games:LobbyGame[]}){
 if(!games.length)return null;
 return <section className="ph-live" aria-label="Live">
  <span className="ph-kicker">Live</span>
  <div className="ph-live-games">{games.slice(0,4).map(g=><a key={g.id} className="ph-live-game" href={g.url}><span className="ph-live-avatars">{[0,1].map(i=><LeaderArt key={i} className="ph-live-avatar" id={g.leaders?.[i]} zoom={1.6}/>)}</span><b>{g.players.join(' vs ')}</b>{g.turns?<span className="ph-sub">Round {g.turns}</span>:null}</a>)}</div>
  <a className="ph-link" href={sitePath('spectate')}>Watch all</a>
 </section>;
}

/** The strip on its own, for host pages outside the shell (PTP's /draft and /sealed). */
export function LiveStripHost(){
 const [games,setGames]=useState<LobbyGame[]>([]);
 useEffect(()=>{const c=new AbortController();const load=()=>lobbyRequest<LobbyState>('',undefined,c.signal).then(s=>setGames(s.games??[])).catch(()=>{});void load();const t=setInterval(load,15000);return()=>{c.abort();clearInterval(t);};},[]);
 return <div className="app table-themed lobby-app ph-shell ph-live-host"><LiveStrip games={games}/></div>;
}

import {useEffect,useState} from 'react';
import {sitePath} from './shared';
import {lobbyRequest,type LobbyGame,type LobbyState} from '@purrgil/ui/transport/lobby';
import {archetypeFormat,archetypeName,cardName} from './archetype';
import {LeaderArt} from './bits';

/** In-progress games along the bottom of every page: both leaders, what's being played, and a way in. A finished game
 * leaves within a few seconds: the lobby completes it on its next pass and the strip re-reads every 5s. */
export function LiveStrip({games}:{games:LobbyGame[]}){
 if(!games.length)return null;
 return <section className="ph-live" aria-label="Live">
  <span className="ph-kicker">Live</span>
  <div className="ph-live-games">{games.slice(0,4).map(g=><a key={g.id} className="ph-live-game" href={g.url}><span className="ph-live-avatars">{[0,1].map(i=><LeaderArt key={i} className="ph-live-avatar" id={g.leaders?.[i]} zoom={1.6}/>)}</span><b>{[0,1].map(i=><Seat key={i} game={g} seat={i}/>).reduce((a,b)=><>{a} vs {b}</>)}</b>{g.turns?<span className="ph-sub">Round {g.turns}</span>:null}</a>)}</div>
  <a className="ph-link" href={sitePath('spectate')}>Watch all</a>
 </section>;
}
/** One seat's deck: its archetype (the API nickname) once resolved, the leader's name meanwhile or when none resolves, and the
 * player's name only for a game the server lists without leaders. */
function Seat({game,seat}:{game:LobbyGame;seat:number}){
 const leader=game.leaders?.[seat],base=game.bases?.[seat],format=archetypeFormat(game.contract?.format??game.format);
 const [archetype,setArchetype]=useState<{key:string;name:string}>();
 const key=leader&&base?`${leader}:${base}:${format}`:'';
 useEffect(()=>{if(!key||!leader||!base)return;let live=true;void archetypeName(leader,base,format).then(name=>{if(live&&name)setArchetype({key,name});});return()=>{live=false;};},[key,leader,base,format]);
 return <>{archetype?.key===key&&key?archetype.name:leader?cardName(leader):game.players[seat]??'Player'}</>;
}

/** The strip on its own, for host pages outside the shell (PTP's /draft and /sealed). */
export function LiveStripHost(){
 const [games,setGames]=useState<LobbyGame[]>([]);
 useEffect(()=>{const c=new AbortController();const load=()=>lobbyRequest<LobbyState>('',undefined,c.signal).then(s=>setGames(s.games??[])).catch(()=>{});void load();const t=setInterval(load,5000);return()=>{c.abort();clearInterval(t);};},[]);
 return <div className="app table-themed lobby-app ph-shell ph-live-host"><LiveStrip games={games}/></div>;
}

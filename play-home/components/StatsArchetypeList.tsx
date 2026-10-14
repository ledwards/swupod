import {Archetype,DeckArt} from '../home/bits';
import {archetypeFormat} from '../home/archetype';
import {DeckTabs,GameRow} from '../home/HistoryPage';
import type {LobbyGame,Breakdown} from '@purrgil/ui/transport/lobby';

/** One row per deck, leader or opposing leader: art, name, record and a win bar. */
export function StatsArchetypeList({rows,group,history=[],ptp=''}:{rows:Breakdown[];group:'decks'|'archetypes'|'opponents';history?:LobbyGame[];ptp?:string}){
 return <ul className="stats-archetype-list" aria-label={group==='decks'?'Deck results':group==='archetypes'?'Leader results':'Opponent results'}>{rows.map(row=>{
  const rate=row.games?Math.round(row.wins/row.games*100):0;
  const games=history.filter(game=>row.matchIds?.includes(game.id));
  const contents=<>
   <DeckArt className="stats-archetype-art" leader={row.leader} base={row.base}/>
   <span className="stats-archetype-identity"><Archetype leader={row.leader} base={row.base} format={archetypeFormat(row.format??'Premier')}/><small>{row.format??'Premier'}</small></span>
   <span className="stats-archetype-record" aria-label={`${row.wins} wins, ${row.losses} losses${row.draws?`, ${row.draws} draws`:''}`}>{row.wins}–{row.losses}{row.draws?`–${row.draws}`:''}</span>
   <span className="stats-bar" role="img" aria-label={`${rate}% wins`}><i style={{width:`${rate}%`}}/></span>
  </>;
  if(group!=='decks')return <li className="stats-archetype-row" key={row.key}>{contents}</li>;
  const pool=games.find(game=>game.poolShareId)?.poolShareId;
  return <li key={row.key}><details className="stats-deck-details"><summary className="stats-archetype-row">{contents}<span className="stats-deck-open">Details</span></summary>{games.length?<DeckTabs games={games} statsUrl={pool?`${ptp}/pools/${encodeURIComponent(pool)}/deck/stats#build`:undefined} poolUrl={pool?`${ptp}/pools/${encodeURIComponent(pool)}`:undefined} history={<>{games.map(game=><GameRow key={game.id} game={game}/>)}</>}/>:<p className="ph-sub">Game details are not available for this deck yet.</p>}</details></li>;
 })}</ul>;
}

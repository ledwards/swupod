import {Archetype,DeckArt} from '../home/bits';
import {archetypeFormat} from '../home/archetype';
import type {Breakdown} from '@purrgil/ui/transport/lobby';

/** One row per deck, leader or opposing leader: art, name, record and a win bar. */
export function StatsArchetypeList({rows,group}:{rows:Breakdown[];group:'decks'|'archetypes'|'opponents'}){
 return <ul className="stats-archetype-list" aria-label={group==='decks'?'Deck results':group==='archetypes'?'Leader results':'Opponent results'}>{rows.map(row=>{
  const rate=row.games?Math.round(row.wins/row.games*100):0;
  return <li className="stats-archetype-row" key={row.key}>
   <DeckArt className="stats-archetype-art" leader={row.leader} base={row.base}/>
   <span className="stats-archetype-identity"><Archetype leader={row.leader} base={row.base} format={archetypeFormat(row.format??'Premier')}/><small>{row.format??'Premier'}</small></span>
   <span className="stats-archetype-record" aria-label={`${row.wins} wins, ${row.losses} losses${row.draws?`, ${row.draws} draws`:''}`}>{row.wins}–{row.losses}{row.draws?`–${row.draws}`:''}</span>
   <span className="stats-bar" role="img" aria-label={`${rate}% wins`}><i style={{width:`${rate}%`}}/></span>
  </li>;
 })}</ul>;
}

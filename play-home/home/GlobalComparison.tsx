import React from 'react';
import type {LobbyGame} from '@purrgil/ui/transport/lobby';

export function GlobalComparison({games,tableCells=false}:{games:LobbyGame[];tableCells?:boolean}){
 const unavailable=(message:string)=>tableCells?<><td><small className="ph-global-unavailable">{message}</small></td><td>—</td></>:<small className="ph-global-unavailable">{message}</small>;
 const decided=games.filter(g=>g.result==='Win'||g.result==='Loss');
 const cohorts=new Map<string,NonNullable<LobbyGame['globalMatchup']>>();
 let expectedWins=0;
 for(const game of decided){
  const global=game.globalMatchup;
  if(!global||global.wins+global.losses===0)return unavailable('Global comparison unavailable');
  expectedWins+=global.wins/(global.wins+global.losses);
  cohorts.set(global.key,global);
 }
 if(!decided.length)return unavailable('No decided games to compare');
 const baseline=100*expectedWins/decided.length;
 const personal=100*decided.filter(g=>g.result==='Win').length/decided.length;
 const delta=Math.round((personal-baseline)*10)/10;
 const samples=[...cohorts.values()].reduce((n,c)=>n+c.wins+c.losses,0);
 const direction=delta>0?'above':delta<0?'below':'equal';
 const explanation='Other human players on Purrgil, all recorded results, excluding your games and draws. Same leader/base matchup, format, card pool, and play mode; Limited also matches set and pack count. Multiple cohorts are weighted by your number of decided games.';
 const deltaLabel=<span className={`ph-global-delta ph-global-${direction}`} aria-label={`${Math.abs(delta).toFixed(1)} percentage points ${direction==='equal'?'difference from':direction} global Purrgil`}><span aria-hidden="true">{delta>0?'↑':delta<0?'↓':'='}</span> {Math.abs(delta).toFixed(1)} pp</span>;
 if(tableCells)return <><td className="ph-global-comparison" title={explanation}><strong>{baseline.toFixed(1)}%</strong><small>{samples.toLocaleString()} results</small></td><td>{deltaLabel}</td></>;
 return <span className="ph-global-comparison" title={explanation}><small>Global {baseline.toFixed(1)}% · {samples.toLocaleString()} results</small>{deltaLabel}</span>;
}

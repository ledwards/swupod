import {useEffect,useState} from 'react';
import type {LobbyGame} from '@purrgil/ui/transport/lobby';
import {MyDecks} from './MyDecks';
import {HistoryPage} from './HistoryPage';
import {sitePath,type Contract,type SharedState} from './shared';

export type LibraryTab='decks'|'history';
/** One page for everything a player owns and has played: Decks and Pools, and History, as tabs. Both old URLs still open their tab. */
export function DecksAndHistory({tab:initial,shared,history,signedIn,loginUrl,ptp,onPlay,onTab}:{tab:LibraryTab;onTab?:(tab:LibraryTab)=>void;shared?:SharedState;history?:LobbyGame[];signedIn:boolean;loginUrl:string;ptp:string;onPlay:(c:Contract,deckKey?:string)=>void}){
 const [tab,setTab]=useState<LibraryTab>(initial);
 useEffect(()=>{setTab(initial);onTab?.(initial);},[initial]);
 const select=(next:LibraryTab)=>{if(next===tab)return;setTab(next);onTab?.(next);window.history.replaceState({...window.history.state},'',sitePath(next));};
 return <section className="ph-page" aria-label={tab==='decks'?'Decks and Pools':'History'}>
  <div className="ph-page-head">
   <div className="ph-seg ph-seg-page" role="tablist" aria-label="Decks or History">{([['decks','Decks'],['history','History']] as const).map(([t,l])=><button key={t} role="tab" aria-selected={tab===t} aria-pressed={tab===t} onClick={()=>select(t)}>{l}</button>)}</div></div>
  {tab==='decks'?<MyDecks embedded shared={shared} history={history??[]} signedIn={signedIn} loginUrl={loginUrl} onPlay={onPlay}/>
  :history?<HistoryPage embedded games={history} signedIn={signedIn} loginUrl={loginUrl} ptp={ptp}/>:<div className="ph-page-tab" aria-busy="true"/>}
 </section>;
}

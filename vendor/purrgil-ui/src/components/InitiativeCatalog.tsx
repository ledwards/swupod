import {useState,useSyncExternalStore} from 'react';
import {initiativeDesigns,initiativeFaces,initiativeChoice,initiativePiece,readInitiativeToken,subscribeInitiativeToken,writeInitiativeToken} from '../preferences/initiative-tokens';
import {readTokenSet,subscribeTokenSet,tokenSetById} from '../preferences/token-sets';
import {TokenArt} from './TokenArt';
import {InUseCheck} from './InUseCheck';
import {EventCosmeticTile,EventCosmeticDetail,type EventCollection} from './EventCosmetics';

export function InitiativeCatalog({disabled,collection}:{disabled:boolean;collection:EventCollection}){
 const set=tokenSetById(useSyncExternalStore(subscribeTokenSet,readTokenSet));
 const choice=useSyncExternalStore(subscribeInitiativeToken,readInitiativeToken);
 const [query,setQuery]=useState(''),[season,setSeason]=useState('all'),[eventFocus,setEventFocus]=useState<string>();
 const [saving,setSaving]=useState(false);
 const equippedEvent=choice==='event'&&collection.state?.loadout.initiative;
 const defaultSelected=choice==='default'||choice==='event'&&!equippedEvent;
 const selectedEvent=collection.state?.catalog.items.find(item=>item.id===eventFocus);
 const designs=initiativeDesigns.filter(design=>(season==='all'||design.seasons.includes(Number(season)))&&`${design.name} ${design.group} ${design.releases}`.toLowerCase().includes(query.toLowerCase().trim()));
 const groups=[...new Set(designs.map(design=>design.group))];
 async function choose(value:string){
  if(disabled||saving||collection.busy)return;
  setSaving(true);
  try{
   if(collection.state?.loadout.initiative&&!await collection.clear('initiative'))return;
   writeInitiativeToken(value);
  }finally{setSaving(false);}
 }
 const defaultFaces=initiativeFaces(set);
 const defaultTile=<article className="initiative-design initiative-default-tile">
  <div className="initiative-faces"><button type="button" className="initiative-default" aria-label={`Default · ${set.name}`} aria-pressed={defaultSelected} disabled={disabled||saving||collection.busy} onClick={()=>void choose('default')}>
   <span className="initiative-default-preview">{defaultFaces.map((piece,index)=><span key={piece.src}><span className="initiative-face"><TokenArt piece={piece}/></span><small>{defaultFaces.length>1?index===0?'Front':'Back':set.name}</small></span>)}</span>{defaultSelected&&<InUseCheck/>}
  </button></div><h4>Default</h4><p>{set.name} · Follows your token set</p>
 </article>;
 return <section className="initiative-catalog" aria-labelledby="initiative-heading">
  <header className="initiative-catalog-head"><div><h2 id="initiative-heading">Initiative tokens</h2><p>Keep the token from your set, or choose a different one.</p></div></header>
  <div className="initiative-filters">
   <label><input aria-label="Search initiative tokens" type="search" placeholder="Search tokens, sets, or events" value={query} onChange={event=>setQuery(event.target.value)}/></label>
   <label><select aria-label="Initiative season" value={season} onChange={event=>setSeason(event.target.value)}><option value="all">All seasons</option>{[0,1,2].map(value=><option value={value} key={value}>Season {value}</option>)}</select></label>
  </div>
  {!designs.length&&<><div className="initiative-grid">{defaultTile}</div><p className="initiative-empty">No initiative tokens match these filters.</p></>}
  {groups.map((group,index)=><section className="initiative-group" aria-label={group} key={group}>
   <h3>{group}</h3>
   <div className="initiative-grid">{index===0&&defaultTile}{designs.filter(design=>design.group===group).map(design=><article className="initiative-design" key={design.id}>
    <div className="initiative-faces">{design.faces.map((face,index)=>{const value=initiativeChoice(design.id,index),selected=choice===value&&!equippedEvent;return <button type="button" key={value} aria-label={`${design.name} · ${face.name}`} aria-pressed={selected} disabled={disabled||saving||collection.busy} onClick={()=>void choose(value)}>
     <span className="initiative-face"><TokenArt piece={initiativePiece(set,value)}/></span><small>{face.name}</small>{selected&&<InUseCheck/>}
    </button>;})}</div>
    <h4>{design.name}</h4>{design.releases&&<p>{design.releases}</p>}
   </article>)}</div>
  </section>)}
  {!!collection.state?.catalog.items.some(item=>item.kind==='initiative')&&<section className="initiative-group" aria-label="Event collection"><h3>Event collection</h3><div className="dlc-list initiative-event-list">{collection.state.catalog.items.filter(item=>item.kind==='initiative').map(item=><EventCosmeticTile key={item.id} item={item} collection={collection} selected={eventFocus===item.id} onSelect={()=>setEventFocus(item.id)}/>)}</div>{selectedEvent&&<EventCosmeticDetail item={selectedEvent} collection={collection}/>}</section>}
 </section>;
}

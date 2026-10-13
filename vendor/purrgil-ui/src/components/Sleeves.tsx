import {CosmeticLock} from './CosmeticLock';
import {InUseCheck} from './InUseCheck';
import {eventSleeveId,type EventCollection} from './EventCosmetics';
import {useId,useState,useSyncExternalStore} from 'react';
import {readSleeve,subscribeSleeve,writeSleeve,sleeves,sleeveCategories} from '../preferences/sleeves';
import {SleeveArt} from './SleeveBack';
export function Sleeves({disabled,collection}:{disabled:boolean;collection:EventCollection}){
 const selected=useSyncExternalStore(subscribeSleeve,readSleeve);
 const [focusId,setFocusId]=useState(()=>sleeves.find(s=>eventSleeveId(s.id)===collection.state?.loadout.sleeve&&eventSleeveId(s.id))?.id??selected);
 const [query,setQuery]=useState(''),[category,setCategory]=useState('all');
 const fieldId=useId();
 const focus=sleeves.find(s=>s.id===focusId);
 const eventItem=collection.state?.catalog.items.find(item=>item.id===eventSleeveId(focusId));
 const inUse=(id:string)=>{const eventId=eventSleeveId(id);return eventId&&collection.state?.loadout.sleeve===eventId||!collection.state?.loadout.sleeve&&selected===id;};
 const visible=sleeves.filter(s=>(category==='all'||s.category===category)&&`${s.name} ${s.collection}`.toLowerCase().includes(query.toLowerCase().trim()));
 const apply=async()=>{if(eventItem){if(!inUse(focusId))await collection.equip(eventItem);}else{await collection.clear('sleeve');writeSleeve(focusId);}};
 return <main className="dlc-catalog playmat-catalog sleeve-catalog">
  <section className="playmat-browser" aria-label="Card back collection">
   <div className="playmat-filters">
    <label>Search card backs<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Character, event, or set"/></label>
    <div className="playmat-filter-field"><label htmlFor={`${fieldId}-collection`}>Collection</label><select id={`${fieldId}-collection`} value={category} onChange={e=>setCategory(e.target.value)}><option value="all">All card backs</option>{sleeveCategories.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></div>
   </div>
   <p className="playmat-count" role="status">{visible.length} {visible.length===1?'card back':'card backs'}</p>
   <div className="dlc-list playmat-list sleeve-list">    <button type="button" aria-pressed={focusId==='default'} onClick={()=>setFocusId('default')}><SleeveArt/><strong>Original card back</strong>{inUse('default')&&<InUseCheck/>}</button>
    {visible.map(s=>{const item=collection.state?.catalog.items.find(item=>item.id===eventSleeveId(s.id));const locked=item?!collection.allowed(item):disabled;return <button type="button" key={s.id} className={locked?'cosmetic-locked':undefined} aria-describedby={locked?`${fieldId}-${s.id}-lock`:undefined} aria-label={`${s.name} · ${s.collection}`} aria-pressed={focusId===s.id} onClick={()=>setFocusId(s.id)}><SleeveArt sleeve={s}/>{locked&&<CosmeticLock id={`${fieldId}-${s.id}-lock`} reason={item?"Requires event participation or Friend of the Pod. Select for details.":"Requires Friend of the Pod customization access."}/>}<strong>{s.name}</strong><span>{s.collection}</span>{inUse(s.id)&&<InUseCheck/>}</button>;})}
   </div>
   {!visible.length&&<p className="playmat-empty">No matching card backs.</p>}
  </section>
  <article className="dlc-detail playmat-detail sleeve-detail">
   <div className={`sleeve-stage ${(eventItem?!collection.allowed(eventItem):disabled)&&focus?'cosmetic-locked':''}`}><SleeveArt sleeve={focus}/>{focus&&(eventItem?!collection.allowed(eventItem):disabled)&&<CosmeticLock id={`${fieldId}-preview-lock`} reason={eventItem?"Requires event participation or Friend of the Pod.":"Become a Friend of the Pod to use this card back."}/>}</div>
   <div className="dlc-sample"><h1>{focus?.name??'Original card back'}</h1>{focus&&<p>{focus.collection}</p>}
    {(!focus||(eventItem?collection.allowed(eventItem):!disabled))&&<button type="button" className="btn btn--primary" disabled={collection.busy||!!inUse(focusId)||(disabled&&!eventItem)} onClick={()=>void apply()}>{inUse(focusId)?<InUseCheck/>:eventItem&&!collection.allowed(eventItem)?'Unlock':'Apply'}</button>}
   </div>
  </article>
 </main>;
}

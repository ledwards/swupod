import {CosmeticLock} from './CosmeticLock';
import {InUseCheck} from './InUseCheck';
import {eventRequirement,type EventCollection} from './EventCosmetics';
import {useId, useState} from 'react';
import {playmats, playmatById, playmatCategories,requiresEventAccess,type Playmat} from '../preferences/playmats';
import {useTablePreferences, writePreferences} from '../preferences/table';
import {PlaymatArt} from './PlaymatArt';

export function PlaymatCatalog({allowed,collection}: {allowed: boolean;collection:EventCollection}) {
  const [preferences, setPreferences] = useTablePreferences();
  const fieldId = useId();
  const [focusId, setFocusId] = useState(preferences.playmat);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(()=>new URLSearchParams(location.search).get('collection')==='trophy'?'trophy':'all');
  const eventItems=collection.state?.catalog.items.filter(item=>item.kind==='mat'&&item.available)??[];
  const eventMats:Playmat[]=eventItems.filter(item=>!playmatById(item.id)).map(item=>({id:item.id,name:item.name,image:item.image!,category:'event',collection:'Events',source:item.events[0]?.url??'',original:item.image!,trophy:item.access==='trophy'}));
  const focus=playmatById(focusId)??eventMats.find(mat=>mat.id===focusId);
  const eventItem=eventItems.find(item=>item.id===focusId);
  const visible = [...eventMats,...playmats].filter(mat => (category === 'all' || category==='trophy'&&mat.trophy || mat.category === category || category === 'prize-wall' && /prize.?wall|side.event/i.test(mat.name) || category === 'participation' && /participation|participant|day.?1/i.test(mat.name)) && `${mat.name} ${mat.collection} ${playmatCategories[mat.category]}`.toLowerCase().includes(query.toLowerCase().trim()));
  const inUse=eventItem?collection.state?.loadout.mat===eventItem.id:(!focus||!requiresEventAccess(focus))&&!collection.state?.loadout.mat&&preferences.playmat===focusId;
  const trophy=focus?.trophy===true||eventItem?.access==='trophy';
  const canUse=eventItem?(!trophy||eventItem.access==='trophy')&&collection.allowed(eventItem):!!focus&&!requiresEventAccess(focus)&&allowed;
  const apply=async()=>{if(focus&&!canUse)return;if(eventItem){await collection.equip(eventItem);return;}await collection.clear('mat');setPreferences(writePreferences({...preferences,playmat:focusId}));};
  const lockReason=(mat:Playmat)=>{
    const item=eventItems.find(item=>item.id===mat.id);
    if(requiresEventAccess(mat)&&!item?.events.length)return 'Event verification is not available for this mat yet.';
    if(mat.trophy)return `Requires a verified Melee result: ${item?.events.map(event=>`${event.name} (${eventRequirement(event)})`).join(' or ')}. Select for details.`;
    if(item)return `Requires verified Melee participation. ${item.events.map(event=>event.name).join(' or ')}. Select for details.`;
    return 'Requires Friend of the Pod customization access.';
  };
  const tile=(mat:Playmat)=>{
    const item=eventItems.find(item=>item.id===mat.id);
    const unlocked=item?(!mat.trophy||item.access==='trophy')&&collection.allowed(item):!requiresEventAccess(mat)&&allowed;
    return <button key={mat.id} type="button" className={!unlocked?'cosmetic-locked':undefined} aria-label={`${mat.name} · ${unlocked?'Unlocked':'Locked'}`} aria-describedby={!unlocked?`${fieldId}-${mat.id}-lock`:undefined} aria-pressed={focusId===mat.id} onClick={()=>setFocusId(mat.id)}>
      <span className="cosmetic-art-lock"><span className="playmat-thumbnail"><PlaymatArt mat={mat}/></span>
      {!unlocked&&<CosmeticLock id={`${fieldId}-${mat.id}-lock`} reason={lockReason(mat)}/>}</span>
      <strong>{mat.name}</strong><small>{playmatCategories[mat.category]}{mat.announced?' · Announced':''}{requiresEventAccess(mat)?' · '+(unlocked?'Unlocked':'Locked'):''}</small>
      {unlocked&&(collection.state?.loadout.mat===mat.id||!requiresEventAccess(mat)&&!collection.state?.loadout.mat&&preferences.playmat===mat.id)&&<InUseCheck/>}
    </button>;
  };
  return <main className="dlc-catalog playmat-catalog">
    <section className="playmat-browser" aria-label="Playmat collection">
      <div className="playmat-filters">
        <label>Search playmats<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Character, event, or set"/></label>
        <div className="playmat-filter-field"><label htmlFor={`${fieldId}-collection`}>Collection</label><select id={`${fieldId}-collection`} value={category} onChange={e => setCategory(e.target.value)}><option value="all">All playmats</option><option value="trophy">Trophy Mats</option><option value="prize-wall">Prize wall</option><option value="participation">Participation</option>{Object.entries(playmatCategories).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></div>
      </div>
      <p className="playmat-count" role="status">{visible.length} playmats</p>
      <div className="dlc-list playmat-list">        <button type="button" aria-pressed={focusId === 'none'} onClick={() => setFocusId('none')}><span className="playmat-none">No playmat</span><strong>None</strong>{preferences.playmat === 'none' && <InUseCheck/>}</button>
        {visible.filter(mat=>!mat.trophy).map(tile)}
        {visible.some(mat=>mat.trophy)&&<h2 className="playmat-trophy-heading">Trophy Mats</h2>}
        {visible.filter(mat=>mat.trophy).map(tile)}
      </div>
      {!visible.length && <p className="playmat-empty">No matching playmats. Try another search or collection.</p>}
    </section>
    <article className="dlc-detail playmat-detail">
      <div className={`playmat-stage ${focus&&!canUse?'cosmetic-locked':''}`} tabIndex={focus&&!canUse?0:undefined} aria-describedby={focus&&!canUse?`${fieldId}-preview-lock`:undefined}>{focus ? <PlaymatArt key={focus.id} mat={focus} eager/> : <span className="playmat-none">No playmat</span>}{focus&&!canUse&&<CosmeticLock id={`${fieldId}-preview-lock`} reason={lockReason(focus)}/>}</div>
      <div className="dlc-sample">
        <h1>{focus?.name ?? 'None'}</h1>
        {focus && <p>{playmatCategories[focus.category]} · {focus.collection}{focus.announced ? ' · Announced' : ''}</p>}
        <p>{focus ? 'Covers your side of the table. Your opponent’s side keeps its table theme.' : 'Show the table theme on both sides.'}</p>
        {focus&&requiresEventAccess(focus)&&<><p>{trophy?(canUse?'Unlocked through your verified Melee result.':'Earn this mat with the qualifying result at an eligible event. Friend of the Pod membership does not unlock Trophy Mats.'):canUse?'Unlocked through verified event participation.':'Connect Melee to check participation at an eligible event. Participation rewards need no placement result. Event mats require attendance, including for Friends of the Pod.'}</p>{!eventItem?.events.length&&<p>Event verification is not available for this mat yet.</p>}{eventItem?.events.map(event=><p key={event.url}><a href={event.url} target="_blank" rel="noreferrer">{event.name}</a>{eventRequirement(event)&&<> · {eventRequirement(event)}</>}{event.qualification==='placement'&&event.resultsReviewed===false&&<small> · Results awaiting review</small>}</p>)}{!canUse&&<><p>Add your Discord username to your Melee Bio. We’ll verify it automatically.</p><a className="btn melee-connect" href="/lobby?settings=account" target="_blank" rel="noopener noreferrer">Connect or manage Melee</a></>}</>}
        {(!focus||canUse)&&<button type="button" className="btn btn--primary" disabled={collection.busy||inUse || (!!focus && !canUse)} onClick={apply}>{focus&&!canUse?(trophy?'Locked · Verified result required':requiresEventAccess(focus)?'Locked · Event participation required':'Locked · Membership required'):inUse ? <InUseCheck/> : !focus ? 'Remove playmat' : !canUse ? 'Unlock this playmat' : 'Use this playmat'}</button>}
        {focus && <a href={focus.source} target="_blank" rel="noopener noreferrer">Playmat source</a>}
      </div>
    </article>
  </main>;
}

import {CosmeticLock} from './CosmeticLock';
import {writeInitiativeToken} from '../preferences/initiative-tokens';
import {SleeveArt} from './SleeveBack';
import {sleeves} from '../preferences/sleeves';
import {useEffect,useId,useRef,useState} from 'react';
import {gameApiPath} from '../transport/client';
import {membershipUrl} from '../preferences/access';
export type EventItem={id:string;kind:'mat'|'sleeve'|'promo'|'initiative';name:string;image:string|null;available:boolean;access?:'event'|'trophy';events:{name:string;url:string;qualification?:'attendance'|'placement'|'day_two';placementMin?:number;placementMax?:number;resultsReviewed?:boolean}[]};
type State={catalog:{revision:string;items:EventItem[]};access:{supporter:boolean;status:string;allowedItemIds:string[];catalogRevision?:string;expiresAt:number};loadout:Record<string,string>;version:number};
const linkUrl='/lobby?settings=account';
export const eventSleeveId=(id:string)=>({'gc2026-chimaera':'gc2026-sleeve-chimaera','gc2026-bo-katan':'gc2026-sleeve-bokatan'}[id]);
export function eventRequirement(event:EventItem['events'][number]){return event.qualification==='day_two'?'Day 2 participation':event.qualification==='placement'?(event.placementMax===1?'Champion':event.placementMin===1?`Top ${event.placementMax}`:`Places ${event.placementMin}–${event.placementMax}`):'Event participation';}
const names={mat:'Playmat',sleeve:'Sleeves',promo:'Promo art',initiative:'Initiative'};
export function useEventCosmetics(){
 const [state,setState]=useState<State|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loadFailed,setLoadFailed]=useState(false),[locked,setLocked]=useState<EventItem|null>(null);
 async function refresh(){try{const response=await fetch(gameApiPath('/api/cosmetics'),{credentials:'same-origin'});if(!response.ok)throw Error();setState(await response.json());setLoadFailed(false);}catch{setLoadFailed(true);}}
 useEffect(()=>{void refresh();const returned=()=>void refresh();window.addEventListener('focus',returned);window.addEventListener('melee-connection-changed',returned);return()=>{window.removeEventListener('focus',returned);window.removeEventListener('melee-connection-changed',returned);};},[]);
 const allowed=(item:EventItem)=>item.available&&((state?.access.supporter===true&&item.access!=='trophy'&&item.kind!=='mat')||(Number(state?.access.expiresAt)>Date.now()&&state?.access.catalogRevision===state?.catalog.revision&&state?.access.allowedItemIds.includes(item.id)));
 async function clear(kind:EventItem['kind']){const item=state?.catalog.items.find(item=>item.id===state.loadout[kind]);if(item)return await equip(item);return !state?.loadout[kind];}
 async function equip(item:EventItem){
  if(!state||busy)return;
  const remove=state.loadout[item.kind]===item.id;
  if(!remove&&!allowed(item)){setLocked(item);return;}
  setBusy(true);setError('');const loadout={...state.loadout};if(remove)delete loadout[item.kind];else loadout[item.kind]=item.id;
  try{const response=await fetch(gameApiPath('/api/cosmetics'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({loadout,version:state.version})});if(!response.ok)throw Error('This selection changed or is no longer unlocked. Refresh and try again.');const saved=await response.json();setState({...state,...saved});if(item.kind==='initiative')writeInitiativeToken(remove?'default':'event');return true;}catch(e){setError((e as Error).message);return false;}finally{setBusy(false);}
 }
 return {state,error,loadFailed,busy,locked,setLocked,allowed,equip,clear,refresh};
}
export type EventCollection=ReturnType<typeof useEventCosmetics>;
export function EventCosmeticTile({item,collection,selected,onSelect}:{item:EventItem;collection:EventCollection;selected:boolean;onSelect:()=>void}){
 const lockId=useId();
 const locked=!collection.allowed(item);
 return <button type="button" className={locked?'cosmetic-locked':undefined} aria-describedby={locked?lockId:undefined} data-event-id={item.id} aria-pressed={selected} onClick={()=>{onSelect();if(item.available&&!collection.allowed(item))collection.setLocked(item);}}>
  <span className="cosmetic-art-lock"><span className="dlc-event-art"><EventArt item={item}/></span>
  {locked&&<CosmeticLock id={lockId} reason={!item.available?'This reward is not currently available.':item.access==='trophy'?'Requires a verified Melee result at an eligible event. Select for details.':item.kind==='mat'?'Requires verified Melee participation at an eligible event. Select for details.':'Requires event participation or Friend of the Pod. Select for details.'}/>}</span>
  {item.name}<small>{names[item.kind]} · {collection.allowed(item)?collection.state?.loadout[item.kind]===item.id?'In use':'Unlocked':'Locked'}</small>
 </button>;
}
export function EventCosmeticDetail({item,collection}:{item:EventItem;collection:EventCollection}){
 const selected=collection.state?.loadout[item.kind]===item.id;
 return <article className="dlc-detail" aria-label={`${item.name} preview`}>
  <div className={`dlc-stage dlc-event-art ${!collection.allowed(item)?'cosmetic-locked':''}`} tabIndex={!collection.allowed(item)?0:undefined}><EventArt item={item}/>{!collection.allowed(item)&&<CosmeticLock id={`preview-lock-${item.id}`} reason={item.access==='trophy'?'Requires a verified Melee result at an eligible event.':item.kind==='mat'?'Requires verified event participation.':'Requires event participation or Friend of the Pod.'}/>}</div>
  <div className="dlc-sample"><h1>{item.name}</h1><p className="dlc-highlight">{names[item.kind]}</p>
   {item.events.map(event=><p key={event.url}><a href={event.url} target="_blank" rel="noreferrer">{event.name}</a></p>)}
   <p>{item.access==='trophy'?(collection.allowed(item)?'Unlocked through your verified Melee result.':'Requires the qualifying result at one of the listed events.'):collection.allowed(item)?collection.state?.access.supporter&&item.kind!=='mat'?'Included with Friend of the Pod.':'Unlocked through your event history.':item.kind==='mat'?'Unlock through verified Melee participation at an eligible event.':'Unlock through event attendance or Friend of the Pod.'} Selections apply to your next game.</p>
   <button type="button" className="btn btn--primary" disabled={collection.busy||!item.available} onClick={()=>void collection.equip(item)}>{selected?'Use default':collection.allowed(item)?'Use this item':'Unlock this item'}</button>
   {selected&&<p>Selected for your next game</p>}
  </div>
 </article>;
}
export function EventCosmetics({collection}:{collection:EventCollection}){
 const [selected,setSelected]=useState<string>();
 const items=(collection.state?.catalog.items??[]).filter(item=>!collection.state?.access.supporter||item.available);
 const supporter=collection.state?.access.supporter===true;
 const focus=items.find(item=>item.id===selected)??items.find(collection.allowed)??items[0];
 return <main className={`dlc-catalog events-catalog ${!focus?'events-empty':''}`} aria-label="Event cosmetics">
  <div className="dlc-list dlc-events-list">
   {(!supporter||items.some(item=>!collection.allowed(item)))&&<section className="dlc-event-connect"><h1>Connect Melee</h1><p>Unlock playmats and sleeves for attending and winning events.</p><p>Add your Discord username to your Melee Bio. We’ll verify it automatically.</p><a className="btn btn--primary" href={linkUrl} target="_blank" rel="noreferrer">Connect Melee</a></section>}
   {!collection.state&&!collection.loadFailed&&<div className="dlc-event-skeleton" aria-busy="true" aria-label="Retrieving event items"/>}
   {(collection.state?(supporter&&!items.some(item=>!collection.allowed(item))?['Unlocked']:['Unlocked','Locked']):[]).map(name=>{const group=items.filter(item=>collection.allowed(item)===(name==='Unlocked'));return <section className="dlc-event-group" aria-label={name} key={name}>
    <h2>{name} ({group.length})</h2>
    {!group.length&&collection.state&&<p>No {name.toLowerCase()} event items.</p>}
    {group.map(item=><EventCosmeticTile key={item.id} item={item} collection={collection} selected={focus?.id===item.id} onSelect={()=>setSelected(item.id)}/>)}
   </section>})}
  </div>
  {focus&&<EventCosmeticDetail item={focus} collection={collection}/>}
 </main>;
}
export function EventCosmeticFeedback({collection}:{collection:EventCollection}){
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{if(collection.locked)dialog.current?.showModal();else dialog.current?.close();},[collection.locked]);
 return <>
  {collection.error&&<p className="dlc-event-feedback" role="alert">{collection.error}</p>}
  <dialog ref={dialog} className="decision-dialog" aria-labelledby="event-unlock-title" onClose={()=>collection.setLocked(null)} onClick={e=>{if(e.target===dialog.current)collection.setLocked(null);}}><h2 id="event-unlock-title">Unlock {collection.locked?.name}</h2><p>{collection.locked?.access==='trophy'?'Connect Melee to verify the qualifying result at an eligible event. Trophy Mats are earned through results, including for Friends of the Pod.':collection.locked?.kind==='mat'?'Connect Melee to verify participation at an eligible event. Event mats require attendance, including for Friends of the Pod.':'Connect Melee to check your event attendance, or become a Friend of the Pod for attendance cosmetics.'}</p><p>Add your Discord username to your Melee Bio. We’ll verify it automatically.</p><div className="prompt-buttons"><a className="btn" href={linkUrl} target="_blank" rel="noreferrer">Connect Melee</a>{collection.locked?.access!=='trophy'&&collection.locked?.kind!=='mat'&&<a className="btn btn--primary" href={membershipUrl} target="_blank" rel="noreferrer">Become a Friend of the Pod</a>}<button type="button" className="btn" onClick={()=>collection.setLocked(null)}>Close</button></div></dialog>
 </>;
}

export function EventArt({item}:{item:EventItem}){const sleeve=sleeves.find(s=>eventSleeveId(s.id)===item.id);return sleeve?<SleeveArt sleeve={sleeve} alt={item.name}/>:<img src={item.image??'/assets/card-back.png'} alt={item.name}/>;}

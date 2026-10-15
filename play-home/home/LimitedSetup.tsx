import {ContentSkeleton} from '@purrgil/ui/components/ContentSkeleton';
import {useEffect,useRef,useState} from 'react';
import {packArt,setArt,packThumb,setThumb} from './art';
import {ArtImage} from './bits';
import {ptpOriginOf,setsOf,type SharedState} from './shared';


/** Sealed and Draft start here and continue on Protect the Pod for packs and building. */
export function LimitedSetup({flow,shared,onBack}:{flow:'sealed'|'draft';shared?:SharedState;onBack:()=>void}){
 const ptp=ptpOriginOf(shared),sets=setsOf(shared);
 const [code,setCode]=useState(''),[packs,setPacks]=useState(6),[group,setGroup]=useState<'solo'|'friends'>('solo');
 const set=sets.find(s=>s.code===code)??sets[0];
 const heading=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{heading.current?.focus();},[]);
 const go=flow==='sealed'?(set?`${ptp}/pools/new?set=${encodeURIComponent(set.code)}&packs=${packs}`:undefined):`${ptp}/draft/setup?group=${group}`;
 return <section className="ph-setup" aria-labelledby="ph-setup-title">
  <h1 id="ph-setup-title" data-site-title="shell" ref={heading} tabIndex={-1}>{flow==='sealed'?'Sealed':'Draft'}</h1>
  <div className="ph-setup-grid">
   <div className="ph-panel ph-setup-main">
    {flow==='sealed'?<>
     <h2>Choose a set</h2>
     {!sets.length?<ContentSkeleton/>:<div className="ph-sets">{sets.map(s=><button key={s.code} aria-pressed={set?.code===s.code} onClick={()=>setCode(s.code)} style={{backgroundImage:`url(${setArt(ptp,s.code)})`}}><b>{s.code}</b><span>{s.name}</span></button>)}</div>}
     <h2>Packs per player</h2>
     <div className="ph-options">{[6,8].map(n=><button key={n} aria-pressed={packs===n} onClick={()=>setPacks(n)}><b>{n} packs</b><span>{n===6?'The standard pool':'A deeper pool, easier to build'}</span></button>)}</div>
    </>:<>
     <h2>Who’s drafting?</h2>
     <div className="ph-options">
      <button aria-pressed={group==='solo'} onClick={()=>setGroup('solo')}><b>Just me</b><span>Draft against seven bots, at your own pace</span></button>
      <button aria-pressed={group==='friends'} onClick={()=>setGroup('friends')}><b>With a pod</b><span>Start a pod of up to 8 and share the invite</span></button>
     </div>
     <h2>Pods forming</h2>
     {shared?.pods.length?<ul className="ph-now-list">{shared.pods.map(p=><li key={p.id}><span className="ph-ico"><ArtImage src={setThumb(ptp,p.set)} backup={setArt(ptp,p.set)}/></span><span><b>{p.name}</b><span className="ph-sub">{p.set} · {p.players} / {p.capacity} seats</span></span><a className="ph-btn ph-sm ph-go" href={`${ptp}/draft/${encodeURIComponent(p.id)}`}>Take a seat</a></li>)}</ul>:<p className="ph-sub">No pods forming right now. Start one and bots fill any empty seats.</p>}
    </>}
   </div>
   <aside className="ph-panel ph-summary">
    {flow==='sealed'&&set&&<div className="ph-summary-packs" aria-hidden="true">{[2,1,3].map(n=><ArtImage key={n} src={packThumb(ptp,set.code,n)} backup={packArt(ptp,set.code,n)}/>)}</div>}
    <h2>{flow==='sealed'?set?.name??'Sealed':'Draft'}</h2>
    <dl>
     {flow==='sealed'?<><div><dt>Format</dt><dd>Sealed</dd></div><div><dt>Packs</dt><dd>{packs}</dd></div></>:<><div><dt>Format</dt><dd>Draft · 3 packs</dd></div><div><dt>Table</dt><dd>{group==='solo'?'You and seven bots':'Your pod'}</dd></div></>}
     <div><dt>Next up</dt><dd>{flow==='sealed'?'Open your packs':'Choose your set'}</dd></div>
    </dl>
    {go?<a className="ph-btn ph-go ph-lg ph-block" href={go}>{flow==='sealed'?`Open ${packs} packs`:group==='solo'?'Set up solo draft':'Set up a pod'}</a>:<button className="ph-btn ph-lg ph-block" disabled aria-busy="true">Continue</button>}
    <p className="ph-sub">Packs, drafting and deckbuilding happen on Protect the Pod. Your finished deck shows up here under My Decks, ready to queue.</p>
   </aside>
  </div>
 </section>;
}

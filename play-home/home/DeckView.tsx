import {useEffect,useMemo,useRef,useState,type CSSProperties,type MouseEvent,type PointerEvent,type ReactNode} from 'react';
import details from '@purrgil/ui/engine/card-details.json';
import {CardPreviewLayer} from '@purrgil/ui/components/CardPreviewLayer';
import {cardKey} from './archetype';
import {leaderArt} from './art';

type Entry={id:string;count:number};
/** The deck and its sideboard; the chosen leader and base when the source has them. */
type Cards={deck:Entry[];sideboard:Entry[];leader?:Entry|null;base?:Entry|null};
type Detail={name:string;cost?:number|null;aspects?:string[];type?:string;subtitle?:string};
const table=details as unknown as Record<string,Detail>;
type Row={id:string;card:Detail;count:number};
/** Melee.gg's decklist order: Leader, Base, then Units, Events, Upgrades; each by cost, then name. */
const TYPES=['Leader','Base','Units','Events','Upgrades','Other'] as const;
type Kind=(typeof TYPES)[number];
type Group={type:Kind;rows:Row[];total:number};

// One load per deck, shared by the prefetch on selection and the modal, so the eye opens on a list already in hand.
const loads=new Map<string,Promise<Cards>>();
export function deckCards(key:string,load:()=>Promise<Cards>):Promise<Cards>{
 let hit=loads.get(key);
 if(!hit){hit=load();loads.set(key,hit);hit.catch(()=>loads.delete(key));}
 return hit;
}

const typeOf=(t?:string):Kind=>/leader/i.test(t??'')?'Leader':/base/i.test(t??'')?'Base':/unit/i.test(t??'')?'Units':/upgrade/i.test(t??'')?'Upgrades':/event/i.test(t??'')?'Events':'Other';
const rowOf=(id:string,count:number):Row=>({id,card:table[cardKey(id)]??{name:id},count});
/** The chosen leader and base lead (typed as such even when the card table lacks them), then the cards by type. */
function grouped(cards:Cards,list:Entry[]):Group[]{
 const rows=new Map<string,Row>();
 for(const {id,count} of list){const key=cardKey(id),row=rows.get(key);if(row)row.count+=count;else rows.set(key,rowOf(id,count));}
 const sorted=[...rows.values()].sort((a,b)=>(a.card.cost??99)-(b.card.cost??99)||a.card.name.localeCompare(b.card.name));
 const head:Group[]=([['Leader',cards.leader],['Base',cards.base]] as const).flatMap(([type,e])=>e?[{type,rows:[rowOf(e.id,1)],total:1}]:[]);
 const body=TYPES.filter(t=>!head.some(h=>h.type===t)).map(type=>{const list=sorted.filter(r=>typeOf(r.card.type)===type);return {type,rows:list,total:list.reduce((n,r)=>n+r.count,0)};}).filter(g=>g.rows.length);
 return [...head,...body].sort((a,b)=>TYPES.indexOf(a.type)-TYPES.indexOf(b.type));
}
const CURVE=['0','1','2','3','4','5','6','7+'];
const totalOf=(groups:Group[],t:Kind)=>groups.find(g=>g.type===t)?.total??0;

function Summary({groups}:{groups:Group[]}){
 const bins=CURVE.map(()=>0);
 for(const g of groups)if(g.type!=='Leader'&&g.type!=='Base')for(const r of g.rows)if(r.card.cost!=null)bins[Math.min(7,Math.max(0,r.card.cost))]+=r.count;
 const top=Math.max(1,...bins);
 return <div className="ph-dv-summary">
  <ol className="ph-dv-curve" aria-label={`Cost curve: ${CURVE.map((c,i)=>`${bins[i]} at ${c}`).join(', ')}`}>{CURVE.map((c,i)=><li key={c} aria-hidden="true"><span className="ph-dv-curve-n">{bins[i]||''}</span><span className="ph-dv-curve-bar" style={{'--h':bins[i]/top} as CSSProperties}/><span className="ph-dv-curve-c">{c}</span></li>)}</ol>
  <dl className="ph-dv-types">{(['Units','Events','Upgrades'] as const).map(t=><div key={t}><dd>{totalOf(groups,t)}</dd><dt>{t}</dt></div>)}</dl>
 </div>;
}

/** Closing a tapped card must not also land that tap on what is underneath (outside the dialog it would close it). */
const swallowNextClick=()=>{const swallow=(e:Event)=>{e.stopPropagation();e.preventDefault();};document.addEventListener('click',swallow,{capture:true,once:true});setTimeout(()=>document.removeEventListener('click',swallow,true),400);};
type Preview={id:string;name:string;style:CSSProperties;centered:boolean};
type Show=(row:Row,el:HTMLElement|null,how:'hover'|'side'|'center'|'leave')=>void;
/** Mouse hover previews beside the dialog; a tap (touch, pen) centres it; a keyboard press toggles it beside. */
function usePreviewHandlers(onPreview:Show){
 const pointer=useRef('');
 return (row:Row)=>({
  onPointerDown:(e:PointerEvent)=>{pointer.current=e.pointerType;},
  onPointerEnter:(e:PointerEvent<HTMLElement>)=>{if(e.pointerType==='mouse')onPreview(row,e.currentTarget,'hover');},
  onPointerLeave:(e:PointerEvent)=>{if(e.pointerType==='mouse')onPreview(row,null,'leave');},
  onClick:(e:MouseEvent<HTMLElement>)=>{const how=pointer.current;pointer.current='';if(how==='touch'||how==='pen')onPreview(row,e.currentTarget,'center');else if(e.detail===0)onPreview(row,e.currentTarget,'side');},
 });
}
const labelOf=(row:Row)=>row.card.subtitle?`${row.card.name}, ${row.card.subtitle}`:row.card.name;

/** Grid: small card images in rows by type, a count badge on each. The leader and base share the first row. */
function Grid({groups,onPreview}:{groups:Group[];onPreview:Show}){
 const handlers=usePreviewHandlers(onPreview);
 const head=groups.filter(g=>g.type==='Leader'||g.type==='Base'),rest=groups.filter(g=>g.type!=='Leader'&&g.type!=='Base');
 const card=(row:Row)=><li key={row.id}><button type="button" className="ph-dv-card" aria-label={`${row.count} × ${labelOf(row)}`} title={labelOf(row)} {...handlers(row)}>
  <img src={leaderArt(cardKey(row.id))} alt="" loading="lazy" decoding="async" onError={e=>{e.currentTarget.style.visibility='hidden';}}/>
  <span className="ph-dv-badge" aria-hidden="true">×{row.count}</span>
 </button></li>;
 const section=(title:string,n:number,rows:Row[],lead=false)=><section key={title} className="ph-dv-group" aria-label={`${title}, ${n} ${n===1?'card':'cards'}`}>
  <h3 className="ph-dv-head"><span>{title}</span><span>{n}</span></h3>
  <ul className={`ph-dv-cards${lead?' is-lead':''}`}>{rows.map(card)}</ul>
 </section>;
 return <div className="ph-dv-grid">
  {head.length?section(head.map(g=>g.type).join(' & '),head.reduce((n,g)=>n+g.total,0),head.flatMap(g=>g.rows),true):null}
  {rest.map(g=>section(g.type,g.total,g.rows))}
 </div>;
}
/** List: a Melee.gg style text decklist in two columns, "count  Card Name"; hovering a name shows the card. */
function List({groups,onPreview}:{groups:Group[];onPreview:Show}){
 const handlers=usePreviewHandlers(onPreview);
 return <div className="ph-dv-list">{groups.map(g=><section key={g.type} className="ph-dv-list-group" aria-label={`${g.type}, ${g.total} ${g.total===1?'card':'cards'}`}>
  <h3 className="ph-dv-list-head">{g.type==='Leader'||g.type==='Base'?g.type:`${g.type} (${g.total})`}</h3>
  <ul>{g.rows.map(row=><li key={row.id}><span className="ph-dv-list-n">{row.count}</span><button type="button" className="ph-dv-list-name" title={labelOf(row)} {...handlers(row)}>{row.card.name}</button></li>)}</ul>
 </section>)}</div>;
}
type View='grid'|'list';
const Skeleton=({view}:{view:View})=>view==='grid'
 ?<div className="ph-dv-grid" aria-busy="true" aria-label="Deck list">{[0,1].map(g=><section key={g} className="ph-dv-group" aria-hidden="true"><h3 className="ph-dv-head"><span className="ph-dv-skel"/></h3><ul className="ph-dv-cards">{[0,1,2,3,4].map(i=><li key={i}><span className="ph-dv-card is-skeleton"/></li>)}</ul></section>)}</div>
 :<div className="ph-dv-list" aria-busy="true" aria-label="Deck list">{[0,1].map(g=><section key={g} className="ph-dv-list-group" aria-hidden="true"><h3 className="ph-dv-list-head"><span className="ph-dv-skel"/></h3><ul>{[0,1,2,3,4,5].map(i=><li key={i}><span className="ph-dv-skel is-line"/></li>)}</ul></section>)}</div>;

// The chosen view outlives the modal; storage can be missing or blocked, and then Grid it is.
const VIEW_KEY='decklist-view';
const readView=():View=>{try{return localStorage.getItem(VIEW_KEY)==='list'?'list':'grid';}catch{return 'grid';}};
const saveView=(v:View)=>{try{localStorage.setItem(VIEW_KEY,v);}catch{/* the choice lasts this visit */}};
const GridGlyph=()=><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>;
const ListGlyph=()=><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h1.5M6 4h8M2 8h1.5M6 8h8M2 12h1.5M6 12h8"/></svg>;

/** The selected deck: leader and base art, Deck / Entire Pool, a Grid / List switch, curve and type counts, then the cards. */
export function DeckView({cacheKey,load,title,art,sub,pool,onClose}:{cacheKey:string;load:()=>Promise<Cards>;title:ReactNode;art:ReactNode;sub?:ReactNode;pool:boolean;ptp?:string;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 const [cards,setCards]=useState<Cards|null>(null),[error,setError]=useState(false),[tab,setTab]=useState<'deck'|'pool'>('deck'),[preview,setPreview]=useState<Preview|null>(null);
 const [view,setView]=useState<View>(readView);
 useEffect(()=>{dialog.current?.showModal();},[]);
 useEffect(()=>{let live=true;deckCards(cacheKey,load).then(c=>{if(live)setCards(c);},()=>{if(live)setError(true);});return()=>{live=false;};},[cacheKey]);// eslint-disable-line react-hooks/exhaustive-deps
 // Entire Pool is every card the build knows: the chosen leader and base, the deck and the sideboard.
 const groups=useMemo(()=>cards?{deck:grouped(cards,cards.deck),pool:grouped(cards,[...cards.deck,...cards.sideboard])}:null,[cards]);
 const count=(list?:{count:number}[])=>list?.reduce((n,c)=>n+c.count,0)??0;
 // A tapped card stays up until the next touch anywhere, which only dismisses it.
 useEffect(()=>{if(!preview?.centered)return;const off=()=>{setPreview(null);swallowNextClick();};const t=setTimeout(()=>document.addEventListener('pointerdown',off),0);return()=>{clearTimeout(t);document.removeEventListener('pointerdown',off);};},[preview]);
 useEffect(()=>setPreview(null),[tab,view]);
 const choose=(v:View)=>{setView(v);saveView(v);};
 // Hover shows the card beside the dialog, level with the card or name; with no room beside it, or on a tap, it sits centred.
 const show:Show=(row,el,how)=>{
  if(how==='leave'||!el){setPreview(p=>p?.centered?p:null);return;}
  if(how==='side'&&preview?.id===row.id){setPreview(null);return;}
  // Beside the dialog the card takes what room there is (down to 180px wide); centred it is up to 280px.
  const box=dialog.current!.getBoundingClientRect(),r=el.getBoundingClientRect(),room=Math.max(box.left,innerWidth-box.right)-32;
  const beside=how!=='center'&&room>=180,w=beside?Math.min(280,room):Math.min(280,innerWidth-48),h=w/.716;
  const side=!beside?null:innerWidth-box.right>=box.left?box.right+16:box.left-16-w;
  if(side===null&&how==='hover')return;
  const style:CSSProperties=side===null?{width:w,height:h,left:(innerWidth-w)/2,top:Math.max(16,(innerHeight-h)/2)}:{width:w,height:h,left:side,top:Math.min(Math.max(16,r.top+r.height/2-h/2),innerHeight-h-16)};
  setPreview({id:row.id,name:row.card.name,style,centered:side===null});
 };
 const shown=groups?.[tab];
 return <dialog ref={dialog} className="ph-deck-view" aria-label="Decklist" onCancel={e=>{e.preventDefault();if(preview)setPreview(null);else onClose();}} onClick={e=>{if(e.target===dialog.current)onClose();}}>
  <header className="ph-dv-hero">{art}<span className="ph-dv-shade"/><span className="ph-dv-title">{title}{sub&&<span>{sub}</span>}</span>
   <button type="button" className="ph-dv-close" aria-label="Close" onClick={onClose}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg></button>
  </header>
  <div className="ph-dv-bar">
   {pool&&<div className="ph-dv-seg ph-dv-tabs" role="tablist" aria-label="Deck or entire pool">
    <button type="button" role="tab" aria-selected={tab==='deck'} onClick={()=>setTab('deck')}>Deck{cards&&<> <span className="ph-dv-seg-n">{count(cards.deck)}</span></>}</button>
    <button type="button" role="tab" aria-selected={tab==='pool'} onClick={()=>setTab('pool')}>Entire Pool{cards&&<> <span className="ph-dv-seg-n">{count(cards.deck)+count(cards.sideboard)}</span></>}</button>
   </div>}
   <div className="ph-dv-seg ph-dv-views" role="group" aria-label="View">
    <button type="button" aria-pressed={view==='grid'} aria-label="Grid" title="Grid" onClick={()=>choose('grid')}><GridGlyph/><span>Grid</span></button>
    <button type="button" aria-pressed={view==='list'} aria-label="List" title="List" onClick={()=>choose('list')}><ListGlyph/><span>List</span></button>
   </div>
  </div>
  {shown&&!error&&<Summary groups={shown}/>}
  <div className={`ph-dv-body is-${view}`} onScroll={()=>{if(preview&&!preview.centered)setPreview(null);}}>{error?<p role="alert">This decklist could not be loaded. Try again.</p>:shown?(view==='grid'?<Grid groups={shown} onPreview={show}/>:<List groups={shown} onPreview={show}/>):<Skeleton view={view}/>}</div>
  {preview&&<CardPreviewLayer className={`ph-dv-preview${preview.centered?' is-centered':''}`} style={preview.style} label={preview.name}><img src={leaderArt(cardKey(preview.id))} alt=""/></CardPreviewLayer>}
 </dialog>;
}

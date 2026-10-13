import {ContentSkeleton} from '@purrgil/ui/components/ContentSkeleton';
import {useEffect,useState,type CSSProperties,type ReactNode,type SyntheticEvent} from 'react';
import {archetypeName,type FormatKey} from './archetype';
import {leaderArt} from './art';
import leaderArtwork from '@purrgil/ui/engine/leader-art.json';
import deckArt from './deck-art.json';
import {cardKey} from './archetype';

/** Card art cropped to its art window: never show card frame or text. */
export function Crop({src,position,scale=1,className=''}:{src:string;position:string;scale?:number;className?:string}){
 return <span className={`ph-crop ${className}`} aria-hidden="true"><img key={src} src={src} alt="" loading="lazy" style={{objectPosition:position,transform:`scale(${scale})`,transformOrigin:position} as CSSProperties}/></span>;
}
export function useArchetype(leader:string,base:string,format:FormatKey){
 const key=`${leader}:${base}:${format}`;
 const [resolved,setResolved]=useState<{key:string;name:string|null}>();
 useEffect(()=>{let live=true;void archetypeName(leader,base,format).then(name=>{if(live)setResolved({key,name});});return()=>{live=false;};},[key,leader,base,format]);
 return resolved?.key===key?(resolved.name??'Archetype unavailable'):<ContentSkeleton/>;
}
export function Archetype({leader,base,format}:{leader:string;base:string;format:FormatKey}){return <b>{useArchetype(leader,base,format)}</b>;}

// PTP sends limited decks with a leader name, not an id; resolve it so every leader crops the same way.
// The first printing per name and set is the standard one; later numbers are showcase and hyperspace variants.
const leaderIds=new Map<string,string>();
for(const [id,l] of Object.entries(leaderArtwork as Record<string,{name:string;set:string}>).sort(([a],[b])=>a.localeCompare(b,undefined,{numeric:true}))){const k=`${l.name}|${l.set}`;if(!leaderIds.has(k))leaderIds.set(k,id);}
export const leaderIdFor=(name?:string|null,set?:string|null)=>name?leaderIds.get(`${name}|${(set??'').split(',')[0]!.trim().toUpperCase()}`)??[...leaderIds].find(([k])=>k.startsWith(`${name}|`))?.[1]:undefined;
/** A leader's art without its card frame. Unit portraits keep their art 16-59% down the card;
 * landscape fronts (PTP's leader image) keep it on the left. Zoom grows with the box's height. */
export function LeaderArt({id,name,set,src,className='',zoom=1.2}:{id?:string;name?:string|null;set?:string|null;src?:string|null;className?:string;zoom?:number}){
 const key=id??leaderIdFor(name,set);
 if(key)return <Crop className={className} src={leaderArt(key)} position="50% 37%" scale={zoom}/>;
 if(src)return <Crop className={className} src={src} position="18% 42%" scale={1.7}/>;
 return <span className={`ph-crop ${className}`} aria-hidden="true"/>;
}

// Hyperspace printings of every leader and base (scripts/build-deck-art.mjs), keyed by card id.
type DeckArtEntry=[path:string,name:string,base:0|1];
const cards=deckArt as unknown as Record<string,DeckArtEntry>;
const cdn='https://cdn.starwarsunlimited.com/';
const cardsByName=new Map<string,string>();
for(const [id,[,name,base]] of Object.entries(cards).sort(([a],[b])=>a.localeCompare(b,undefined,{numeric:true}))){const k=`${base}|${name}|${id.split('-')[0]}`;if(!cardsByName.has(k))cardsByName.set(k,id);}
const imageOf=(id?:string)=>{const e=id?cards[cardKey(id)]:undefined;return e?(e[0].startsWith('http')?e[0]:cdn+e[0]):undefined;};
const idByName=(name:string|null|undefined,set:string|null|undefined,base:0|1)=>{if(!name)return undefined;const s=(set??'').split(',')[0]!.trim().toUpperCase();return cardsByName.get(`${base}|${name}|${s}`)??[...cardsByName].find(([k])=>k.startsWith(`${base}|${name}|`))?.[1];};
/** A deck as Hyperspace art split on a diagonal: leader on the left, base on the right, art only.
 * Leader fronts keep their art on the left ~45% (rules box to the right): pin the card top-left at 140% of the box
 * width, lifted 11% past the LEADER bar, so the face stays in frame and the rules box stays past the diagonal;
 * bases keep theirs in a band ~18-72% down, so anchor that band. */
export function DeckArt({leader,base,leaderName,baseName,set,className='',portrait=false}:{leader?:string|null;base?:string|null;leaderName?:string|null;baseName?:string|null;set?:string|null;className?:string;portrait?:boolean}){
 const leaderId=leader??idByName(leaderName,set,0);
 // Tall boxes take the leader's portrait unit side (Hyperspace too), whose art window sits 16-59% down.
 const unit=portrait&&leaderId?(leaderArtwork as Record<string,{imageUrl:string}>)[cardKey(leaderId)]?.imageUrl:undefined;
 const l=unit??imageOf(leaderId),b=imageOf(base??idByName(baseName,set,1));
 // The card scans are 400px wide. Only a leader blown up well past that (about 1.5x in CSS pixels, so big banners, not
 // tiles) gets the holo-display scanlines, and only over the leader; a blurry base is fine as it is.
 const [lowRes,setLowRes]=useState(false);
 const measure=(e:SyntheticEvent<HTMLImageElement>)=>{const i=e.currentTarget,r=i.getBoundingClientRect();if(!i.naturalWidth||!r.width)return;const scale=Math.max(r.width/i.naturalWidth,r.height/i.naturalHeight);setLowRes(scale>1.5);};
 const img=(src:string,position:string,scale:number,onLoad?:(e:SyntheticEvent<HTMLImageElement>)=>void)=><img key={src} src={src} alt="" loading="lazy" style={{objectPosition:position,transform:`scale(${scale})`,transformOrigin:position}} onLoad={e=>{e.currentTarget.style.visibility='';onLoad?.(e);}} onError={e=>{e.currentTarget.style.visibility='hidden';}}/>;
 return <span className={`ph-deck-art${b?'':' is-solo'}${lowRes?' is-lowres':''}${className?` ${className}`:''}`} aria-hidden="true">
  {/* A base's art is the band between its title bar and its rules box (about 15-61% down the card): crop to that. */}
  {b&&<span className="ph-deck-art-base">{img(b,'50% 28%',2.2)}</span>}
  {l&&<span className={`ph-deck-art-leader${unit?'':' is-front'}`}>{unit?img(l,'50% 36%',2.6,measure):<img key={l} src={l} alt="" loading="lazy" onLoad={e=>{e.currentTarget.style.visibility='';measure(e);}} onError={e=>{e.currentTarget.style.visibility='hidden';}}/>}{lowRes&&<i className="ph-deck-art-holo"/>}</span>}
  {b&&l&&<i className="ph-deck-art-seam"/>}
 </span>;
}

/** The green check: Valid on a deck, Ready on a seat. */
export const ReadyCheck=({label='Ready'}:{label?:string})=><span className="ph-valid" role="img" aria-label={label} title={label}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>;
/** One seat of a private game: a kicker (You, Host, Opponent), then the same split leader/base banner as Play's deck,
 * with the player's name, their deck and a ready check. With no deck yet, the banner is an open, dashed seat. */
export function SeatBanner({label,name,sub,leader,base,leaderName,baseName,set,ready=false,status,children}:{label:string;name:ReactNode;sub?:ReactNode;leader?:string|null;base?:string|null;leaderName?:string|null;baseName?:string|null;set?:string|null;ready?:boolean;status?:ReactNode;children?:ReactNode}){
 const art=!!(leader||base||leaderName||baseName);
 return <section className="ph-seat-banner" aria-label={label}>
  <span className="ph-kicker">{label}</span>
  <div className={`ph-deck-main${art?'':' is-open'}`}>
   {art&&<DeckArt leader={leader} base={base} leaderName={leaderName} baseName={baseName} set={set}/>}
   <div className="ph-deck-copy">
    <span className="ph-deck-title"><b>{name}</b>{sub&&<span className="ph-deck-meta">{sub}</span>}</span>
    <span className="ph-deck-actions">{ready?<ReadyCheck/>:status}</span>
   </div>
  </div>
  {children}
 </section>;
}

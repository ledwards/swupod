import {useState,useSyncExternalStore,type CSSProperties} from 'react';
import type {TokenPiece} from '../preferences/token-sets';
import {officialTokens,officialChoice,officialTokenPiece,readOfficialTokens,subscribeOfficialTokens,writeOfficialToken,type OfficialTokenRole} from '../preferences/official-tokens';
import {readTokenSet,subscribeTokenSet,tokenSetById} from '../preferences/token-sets';
import {readTokenCards,subscribeTokenCards} from '../preferences/token-cards';
import {TokenArt} from './TokenArt';
import {InUseCheck} from './InUseCheck';
function useOfficialToken(){
 const set=tokenSetById(useSyncExternalStore(subscribeTokenSet,readTokenSet));
 const preferences=useSyncExternalStore(subscribeOfficialTokens,readOfficialTokens);
 useSyncExternalStore(subscribeTokenCards,readTokenCards);
 return {set,preferences};
}
export function OfficialTokenCatalog({role,disabled}:{role:OfficialTokenRole;disabled:boolean}){
 const {set,preferences}=useOfficialToken(),choice=officialChoice(role,preferences);
 const title=role==='force'?'Force tokens':'Credit tokens';
 const fromSet=set.pieces.some(piece=>piece.role===role);
 return <section className="initiative-catalog official-token-catalog" aria-labelledby={`${role}-heading`}>
  <header className="initiative-catalog-head"><div><h2 id={`${role}-heading`}>{title}</h2><p>{role==='force'?'Choose the artwork for the Force token.':'Imperial and Galactic designs each represent one Credit.'}</p></div></header>
  <div className="initiative-grid"><article className="initiative-design initiative-default-tile">
   <div className="initiative-faces"><button type="button" className="initiative-default" aria-label={`Default ${role} token`} aria-pressed={choice==='default'} disabled={disabled} onClick={()=>writeOfficialToken(role,'default')}>
    <span className="initiative-face"><TokenArt piece={officialTokenPiece(role,set)}/></span><small>{fromSet?set.name:role==='force'?'Standard Force token':'Selected Credit card'}</small>{choice==='default'&&<InUseCheck/>}
   </button></div><h4>Default</h4><p>{fromSet?`${set.name} · Follows your token set`:role==='force'?'Standard Force token · Set fallback':'Selected Credit card · Set fallback'}</p>
  </article>{officialTokens.filter(design=>design.role===role).map(design=><article className="initiative-design" key={design.id}>
   <div className="initiative-faces">{design.faces.map((piece,index)=>{const value=`${design.id}:${index}`,selected=value===choice;return <button type="button" key={value} aria-label={`${design.name}${piece.face?` · ${piece.face}`:''}`} aria-pressed={selected} disabled={disabled} onClick={()=>writeOfficialToken(role,value)}><span className="initiative-face"><TokenArt piece={piece}/></span>{piece.face&&<small>{piece.face}</small>}{selected&&<InUseCheck/>}</button>;})}</div>
   <h4>{design.name}</h4><p>{design.release}</p>
  </article>)}</div>
 </section>;
}
export function PlayerToken({role,count,personal=true,interactive=personal}:{role:OfficialTokenRole;count?:number;personal?:boolean;interactive?:boolean}){
 const {set,preferences}=useOfficialToken();
 const choice=personal?officialChoice(role,preferences):'default';
 const piece=officialTokenPiece(role,personal?set:tokenSetById('ffg'),choice);
 const design=officialTokens.find(design=>design.role===role&&design.faces.some((_,i)=>`${design.id}:${i}`===choice));
 if(role==='force'&&interactive&&design&&design.faces.length>1)return <FlippableForce key={choice} front={piece} back={design.faces.find(face=>face!==piece)!}/>;
 return <small className={`player-token player-token-${role}`} title={role==='force'?'Has the Force':`${count} Credit${count===1?'':'s'}`} aria-label={role==='force'?'Has the Force':`${count} Credit${count===1?'':'s'}`}><span className="player-token-art"><TokenArt piece={piece}/></span>{count!==undefined&&<strong>{count}</strong>}</small>;
}
function FlippableForce({front,back}:{front:TokenPiece;back:TokenPiece}){
 const [flipped,setFlipped]=useState(false);
 return <button type="button" className="player-token player-token-force player-token-flip" aria-label="Flip Force token" aria-pressed={flipped} title="Has the Force · Tap to flip" onClick={event=>{event.stopPropagation();setFlipped(value=>!value);}}><span className="player-token-art"><span className={`initiative-flipper${flipped?' is-flipped':''}`}><span className="initiative-side initiative-front"><TokenArt piece={front}/></span><span className="initiative-side initiative-back"><TokenArt piece={back}/></span></span></span></button>;
}

export function CreditRow({count,personal=true}:{count:number;personal?:boolean}){
 const {set,preferences}=useOfficialToken();
 const piece=officialTokenPiece('credit',personal?set:tokenSetById('ffg'),personal?officialChoice('credit',preferences):'default');
 if(count<=0)return null;
 const cards=piece.presentation==='attachment';
 // Keep large banks compact; the caption always reports the exact total.
 const visible=Math.min(count,cards?12:8);
 return <div className={`credits ${cards?'credit-cards':'credit-pile'}`} role="group" aria-label={`Credits ${count}`}>
  <span className="area-counter">Credits <b>{count}</b></span>
  <div className="credit-pieces" style={{'--credit-count':visible,'--credit-spread':`${Math.min(10,22/Math.max(1,visible-1))}px`} as CSSProperties} aria-hidden="true">
   {Array.from({length:visible},(_,index)=><span className="credit-piece" key={index} style={{'--credit-index':index,'--credit-angle':`${Math.max(-16,Math.min(16,(index-(visible-1)/2)*9))}deg`,'--credit-lift':`${Math.abs(index-(visible-1)/2)*2}px`} as CSSProperties}><TokenArt piece={piece}/></span>)}
  </div>
 </div>;
}

import {CosmeticLock} from './CosmeticLock';
import {InUseCheck} from './InUseCheck';
import {artworkUrl} from '../artwork';
import {useSyncExternalStore} from 'react';
import {readTokenCards,subscribeTokenCards,selectedTokenCard,tokenCardNames,tokenCardPrintings,tokenCardImage,writeTokenCard} from '../preferences/token-cards';
export function TokenCards({disabled}:{disabled:boolean}){
 const preferences=useSyncExternalStore(subscribeTokenCards,readTokenCards);
 return <main className="token-card-catalog">
  <p>Choose the card printing for each token. Physical token sets use these cards whenever they don’t have a matching piece.</p>
  {tokenCardNames.map(name=><section key={name} aria-label={`${name} printings`}>
   <h2>{name}</h2>
   <div className="token-card-printings">{tokenCardPrintings.filter(card=>card.name===name).map(card=>{
    const selected=selectedTokenCard(name,preferences)?.id===card.id;
    return <button key={card.id} type="button" className={disabled?'cosmetic-locked':undefined} aria-disabled={disabled} aria-describedby={disabled?`printing-lock-${card.id}`:undefined} aria-pressed={selected} aria-label={`${name} · ${card.number.replace('_',' ')} · ${card.variant}`} onClick={()=>{if(!disabled)writeTokenCard(name,card.id);}}>
     <img src={artworkUrl(tokenCardImage(card))} alt="" loading="lazy"/>
     {disabled&&<CosmeticLock id={`printing-lock-${card.id}`} reason="Become a Friend of the Pod to customize token cards."/>}<strong>{card.number.replace('_',' ')}</strong><span>{card.variant}</span>{selected&&<InUseCheck/>}
    </button>;
   })}</div>
  </section>)}
 </main>;
}

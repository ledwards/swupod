import {useEffect,useRef,type ReactNode} from 'react';
import type {LobbyGame} from '@purrgil/ui/transport/lobby';
import leaderArtwork from '@purrgil/ui/engine/leader-art.json';
import {cardKey} from './archetype';
import {Archetype} from './bits';
import {formatLabel} from './shared';

/** An × drawn on the same 24-unit grid as the More dots, so the two icon buttons centre identically. */
export const CloseGlyph=()=><svg className="ph-close-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>;

/** The one "pick up where you left off" card: faded artwork, the heading with More and delete, title/status, action.
 * More opens the other unfinished items as a popover over the page below; it never moves the page. */
export function ResumeCard({image,title,status,action,href,more,open=false,onToggle,onDelete,deleteLabel,children}:{image?:string|null;title:ReactNode;status:ReactNode;action:string;href:string|undefined;more?:number;open?:boolean;onToggle?:()=>void;onDelete?:()=>void;deleteLabel?:string;children?:ReactNode}){
 const wrap=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(!open||!onToggle)return;
  // A confirm dialog opened from a row is not "outside": it is modal and closes on its own.
  const outside=(e:MouseEvent)=>{const t=e.target as Element|null;if(!wrap.current?.contains(t)&&!t?.closest?.('dialog'))onToggle();};
  const esc=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!document.querySelector('dialog[open]'))onToggle();};
  document.addEventListener('mousedown',outside);document.addEventListener('keydown',esc);
  return()=>{document.removeEventListener('mousedown',outside);document.removeEventListener('keydown',esc);};
 },[open,onToggle]);
 return <div className="ph-resume-wrap" ref={wrap}>
  <aside className={`ph-resume-game ${image?'has-art':''}`} aria-label="Pick up where you left off">
   {image&&<div className="ph-resume-art" aria-hidden="true" style={{backgroundImage:`url("${image}")`}}/>}
   <header className="ph-box-head"><h2>Pick up where you left off</h2>{more||onDelete?<span className="ph-box-tools">
    {more?<button type="button" className="ph-resume-more" aria-expanded={open} aria-label={open?'Show less':`Show ${more} more`} title={open?'Show less':`${more} more`} onClick={onToggle}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></button>:null}
    {onDelete&&<button type="button" className="ph-resume-delete" aria-label={deleteLabel??'Delete item'} title={deleteLabel??'Delete item'} onClick={onDelete}><CloseGlyph/></button>}
   </span>:null}</header>
   <div className="ph-resume-copy"><strong>{title}</strong><span>{status}</span></div>
   <a className="ph-btn" href={href}>{action}</a>
  </aside>
  {open?<div className="ph-resume-pop" role="region" aria-label="Other unfinished items">{children}</div>:null}
 </div>;
}

/** A game in progress, as the card. */
export function ResumeGame({game}:{game:LobbyGame}){
 const seat=game.seat??0,leader=game.leaders?.[seat],base=game.bases?.[seat];
 const image=leader?(leaderArtwork as Record<string,{imageUrl:string}>)[cardKey(leader)]?.imageUrl:undefined;
 const format=game.contract?.format??(game.format==='Limited'?'limited':game.format==='Eternal'?'eternal':'premier');
 const label=game.contract?formatLabel(game.contract):game.format;
 const opponent=game.players?.[1-seat];
 return <ResumeCard image={image} title={leader&&base?<Archetype leader={leader} base={base} format={format}/>:label} status={<>{leader&&base?`${label} · `:''}{opponent?`vs ${opponent} · `:''}Game in progress</>} action="Rejoin game" href={game.url}/>;
}

import {useRef} from 'react';
import {artworkUrl} from '@purrgil/ui/artwork';
import type {PlayMode} from '@purrgil/ui/transport/lobby';
import {modeNames} from '@purrgil/ui/components/ModeIcon';

const modes:PlayMode[]=['queue','private','ai'];
const modeArt:Record<PlayMode,string>={queue:'/assets/lobby/opponent-queue.jpg',private:'/assets/lobby/opponent-private.jpg',ai:'/assets/lobby/opponent-ai.jpg'};

/** Three art choices for how to find an opponent; the Play button follows the choice. Locked (signed out), they show but do nothing. */
export function OpponentSelector({value,onChange,invite,disabled,locked=false}:{value:PlayMode;onChange:(mode:PlayMode)=>void;invite:boolean;disabled:boolean;locked?:boolean}){
 const radios=useRef<(HTMLButtonElement|null)[]>([]);
 return <div className={`lobby-mode-switch${locked?' is-locked':''}`} role="radiogroup" aria-label="Opponent" aria-disabled={locked||undefined}>{modes.map((mode,index)=><button type="button" key={mode} ref={el=>{radios.current[index]=el;}} role="radio" aria-checked={value===mode} aria-disabled={locked||undefined} title={locked?'Log in to play':undefined} tabIndex={value===mode?0:-1} disabled={disabled||(invite&&mode!=='private')} onClick={()=>{if(!locked)onChange(mode);}} onKeyDown={event=>{
   if(locked||invite||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
   event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?2:(index+(['ArrowRight','ArrowDown'].includes(event.key)?1:2))%3;
   onChange(modes[next]);radios.current[next]?.focus();
  }}><span className="lobby-mode-art" style={{backgroundImage:`url("${artworkUrl(modeArt[mode])}")`}}/>{locked&&<svg className="lobby-mode-lock" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>}<span className="lobby-mode-copy"><span className="lobby-mode-name">{modeNames[mode]}</span></span></button>)}</div>;
}

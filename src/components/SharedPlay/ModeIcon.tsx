import type {ReactElement} from 'react';
type PlayMode = 'queue' | 'private' | 'ai';

/** One glyph per way of finding an opponent. Use these wherever a queue, private or AI game is named. */
export const modeNames:Record<PlayMode,string>={queue:'Queue',private:'Private',ai:'vs AI'};

const glyphs:Record<PlayMode,ReactElement>={
 queue:<><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9" r="2.6"/><path d="M15.5 14.3a4.6 4.6 0 0 1 5 4.7"/></>,
 private:<><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7L11.5 6.8"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5"/></>,
 ai:<><rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 3v5M9 3h6"/><circle cx="9.5" cy="13.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="14.5" cy="13.5" r="1.2" fill="currentColor" stroke="none"/><path d="M9.5 16.5h5"/></>,
};

export function ModeIcon({mode,className=''}:{mode:PlayMode;className?:string}){
 return <svg className={`mode-icon mode-icon-${mode}${className?` ${className}`:''}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">{glyphs[mode]}</svg>;
}

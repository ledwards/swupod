import {createContext,useContext,useSyncExternalStore} from 'react';
import {readPreferences,writePreferences} from '../preferences/table';
function subscribe(notify:()=>void){window.addEventListener('purrgil-preferences',notify);window.addEventListener('storage',notify);return()=>{window.removeEventListener('purrgil-preferences',notify);window.removeEventListener('storage',notify);};}
export const KeybindingHintsContext=createContext(true);
export function useKeybindingHints(){const enabled=useContext(KeybindingHintsContext);const saved=useSyncExternalStore(subscribe,()=>readPreferences().showKeybindingHints);return enabled&&saved;}
export function useHintTitle(){const show=useKeybindingHints();return (label:string,key:string)=>show?`${label} (${key})`:label;}
export function KeybindingHint({children}:{children:React.ReactNode}){return useKeybindingHints()?<span className="button-shortcut" aria-hidden="true">{children}</span>:null;}
export function KeybindingHintsToggle(){const show=useSyncExternalStore(subscribe,()=>readPreferences().showKeybindingHints);return <button type="button" className="keybinding-hints-toggle" aria-pressed={show} onClick={()=>writePreferences({...readPreferences(),showKeybindingHints:!show})}>Show Keybinding Hints</button>;}

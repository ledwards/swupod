import {decisionKeyboard} from './decision-keyboard';
import {useHintTitle,KeybindingHint} from './KeybindingHints';
import {dismissCardZooms} from './card-zoom';
import {useLayoutEffect,useRef,useState,type RefObject} from 'react';

export type ModalPlacement='center'|'top'|'bottom'|'left'|'right';
type Entry={element:RefObject<HTMLElement|null>;minimized:boolean;order:number;move:(placement:ModalPlacement)=>void;minimize:()=>void;restore:()=>void};
const windows=new Set<RefObject<Entry>>();
let order=0;
const placementKey='purrgil-modal-placement-v1';
function savedPlacement():ModalPlacement{
 try{
  const value=localStorage.getItem(placementKey);
  if(value==='center'||value==='top'||value==='bottom'||value==='left'||value==='right')return value;
 }catch{/* Storage may be unavailable. */}
 return 'center';
}
export function focusButton(panel:HTMLElement,key:string,selector='button:not(:disabled),select:not(:disabled),input[type="checkbox"]:not(:disabled),input[type="radio"]:not(:disabled),a[href]'){
 const buttons=[...panel.querySelectorAll<HTMLElement>(selector)].filter(button=>button.getClientRects().length&&getComputedStyle(button).visibility!=='hidden'&&!button.closest('[inert],.decision-tools')&&!button.matches('.modal-close,.themes-close,.decision-close')&&!(button.parentElement===panel&&panel.classList.contains('card-inspector')));
 if(!buttons.length)return;
 const current=buttons.find(button=>button===document.activeElement);
 if(!current){(buttons.find(button=>button.matches('.card,.prompt-buttons button,.preset-options button,.dlc-list>button'))??buttons[0]).focus();return;}
 const from=current.getBoundingClientRect(),horizontal=key==='ArrowLeft'||key==='ArrowRight',forward=key==='ArrowRight'||key==='ArrowDown';
 const candidates=buttons.filter(button=>button!==current).map(button=>{
  const rect=button.getBoundingClientRect();
  const dx=rect.x+rect.width/2-from.x-from.width/2,dy=rect.y+rect.height/2-from.y-from.height/2;
  const along=horizontal?dx:dy,across=horizontal?dy:dx;
  return {button,along:along*(forward?1:-1),distance:Math.abs(along)+Math.abs(across)*3};
 }).filter(candidate=>candidate.along>1).sort((a,b)=>a.distance-b.distance);
 const next=candidates[0]?.button??buttons[(buttons.indexOf(current)+(forward?1:-1)+buttons.length)%buttons.length];
 next.focus();
}
function keydown(event:KeyboardEvent){
 if(event.defaultPrevented||event.repeat||event.ctrlKey||event.metaKey||event.altKey||event.key!=='Escape'&&event.target instanceof HTMLElement&&event.target.closest(event.key==='Enter'?'textarea,input:not([type="checkbox"]):not([type="radio"]):not([type="number"]),select,[contenteditable]:not([contenteditable="false"])':'input,textarea,select,[contenteditable]:not([contenteditable="false"])'))return;
 const arrow=['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key);
 const center=event.shiftKey&&(event.code==='Equal'||event.key==='+'||event.key==='=');
 const move=event.shiftKey&&arrow;
 if(event.shiftKey&&!center&&!move)return;
 if(!arrow&&!center&&!['-','=','Escape','Enter',' '].includes(event.key))return;
 const entries=[...windows].map(window=>window.current).sort((a,b)=>b.order-a.order);
 const active=entries.find(entry=>!entry.minimized&&entry.element.current?.getClientRects().length);
 const restore=!event.shiftKey&&event.key==='=';
 const entry=restore?!active?entries.find(entry=>entry.minimized):undefined:active;
 if(!entry||event.key==='Escape'&&!(entry.element.current instanceof HTMLDialogElement))return;
 if(event.key==='Enter'||event.key===' '){decisionKeyboard(entry.element.current!,event);return;}
 event.preventDefault();event.stopImmediatePropagation();
 if(arrow&&!event.shiftKey){focusButton(entry.element.current!,event.key);return;}
 dismissCardZooms();
 if(center)entry.move('center');
 else if(move)entry.move(({ArrowUp:'top',ArrowDown:'bottom',ArrowLeft:'left',ArrowRight:'right'} as const)[event.key as 'ArrowUp'|'ArrowDown'|'ArrowLeft'|'ArrowRight']);
 else if(event.key==='Escape'){
  const cancel=entry.element.current?.querySelector<HTMLButtonElement>('[data-cancel-action]:not(:disabled)');
  if(cancel)cancel.click();else entry.element.current?.dispatchEvent(new Event('cancel',{cancelable:true}));
 }
 else if(restore)entry.restore();
 else if(event.key==='-')entry.minimize();
}

/** True while a movable window can use − / = to minimize or restore. Base shortcuts yield to it. */
export function modalWindowKeysActive(){
 return [...windows].some(({current})=>current.minimized||!!current.element.current?.getClientRects().length);
}

export function useModalControls({element,enabled=true,minimized,onMinimize,onRestore,scope='window'}:{element:RefObject<HTMLElement|null>;enabled?:boolean;minimized:boolean;onMinimize:()=>void;onRestore:()=>void;scope?:'window'|'board'}){
 const [placement,setPlacementState]=useState<ModalPlacement>(savedPlacement);
 const positioned=true;
 const setPlacement=(value:ModalPlacement)=>{
  try{localStorage.setItem(placementKey,value);}catch{/* Moving still works without storage. */}
  setPlacementState(value);
 };
 useLayoutEffect(()=>{
  if(!enabled)return;
  setPlacementState(savedPlacement());
  if(element.current)element.current.dataset.windowPositioned='true';
 },[enabled,element]);
 const entry=useRef<Entry>({element,minimized,order:0,move:setPlacement,minimize:onMinimize,restore:onRestore});
 entry.current={element,minimized,order:entry.current.order,move:setPlacement,minimize:onMinimize,restore:onRestore};
 useLayoutEffect(()=>{
  if(!enabled)return;
  const panel=element.current;
  const bringForward=()=>{entry.current.order=++order;if(panel)panel.style.zIndex=String(300+order);};
  bringForward();windows.add(entry);
  panel?.addEventListener('pointerdown',bringForward);
  panel?.addEventListener('focusin',bringForward);
  if(windows.size===1)window.addEventListener('keydown',keydown,true);
  return()=>{panel?.removeEventListener('pointerdown',bringForward);panel?.removeEventListener('focusin',bringForward);windows.delete(entry);if(!windows.size)window.removeEventListener('keydown',keydown,true);};
 },[enabled,minimized,element]);
 useLayoutEffect(()=>{
  if(!enabled||!element.current)return;
  const panel=element.current;
  const board=scope==='board'?document.querySelector('.table-frame'):null;
  const measure=()=>{
   const viewport=window.visualViewport;
   const top=viewport?.offsetTop??0,bottom=top+(viewport?.height??innerHeight);
   const bounds=board?.getBoundingClientRect();
   panel.style.setProperty('--modal-half-height',`${(bottom-top)/2-24}px`);
   panel.style.setProperty('--modal-edge-left',`${Math.max(viewport?.offsetLeft??0,bounds?.left??0)+16}px`);
   panel.style.setProperty('--modal-edge-right',`${innerWidth-Math.min((viewport?.offsetLeft??0)+(viewport?.width??innerWidth),bounds?.right??innerWidth)+16}px`);
   panel.style.setProperty('--modal-top',`${top+16}px`);
   panel.style.setProperty('--modal-bottom',`${innerHeight-bottom+16}px`);
   panel.style.setProperty('--modal-center',`${(Math.max(top,bounds?.top??top)+Math.min(bottom,bounds?.bottom??bottom))/2}px`);
   panel.style.setProperty('--modal-left',`${bounds?bounds.x+bounds.width/2:(viewport?.offsetLeft??0)+(viewport?.width??innerWidth)/2}px`);
  };
  measure();const observer=new ResizeObserver(measure);if(board)observer.observe(board);
  window.addEventListener('resize',measure);window.visualViewport?.addEventListener('resize',measure);
  return()=>{observer.disconnect();window.removeEventListener('resize',measure);window.visualViewport?.removeEventListener('resize',measure);};
 },[enabled,minimized,element,scope]);
 return {placement,setPlacement,positioned};
}

export function ModalTools({placement,onMove,onMinimize,onClose,closeLabel='Close'}:{placement:ModalPlacement;onMove:(placement:ModalPlacement)=>void;onMinimize:()=>void;onClose?:()=>void;closeLabel?:string}){
 const hintTitle=useHintTitle();
 const up=placement==='bottom';
 return <div className="decision-tools"><button className="decision-move" aria-label={up?'Move to top':'Move to bottom'} aria-keyshortcuts={up?'Shift+ArrowUp':'Shift+ArrowDown'} title={hintTitle(up?'Move to top':'Move to bottom',`${up?'Shift+↑':'Shift+↓'}; left/right Shift+←/→; center Shift+=`)} onClick={()=>{dismissCardZooms();onMove(up?'top':'bottom');}}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={up?'M12 19V5m-6 6 6-6 6 6':'M12 5v14m-6-6 6 6 6-6'}/></svg></button><button className="decision-minimize" aria-label="Minimize" aria-keyshortcuts="-" title={hintTitle('Minimize','-')} onClick={()=>{dismissCardZooms();onMinimize();}}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14"/></svg></button>{onClose&&<button className="decision-close" aria-label={closeLabel} title={hintTitle(closeLabel,'Esc')} aria-keyshortcuts="Escape" onClick={onClose}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>}</div>;
}

export function ModalRestore({label,onRestore,text='Return to decision'}:{label:string;onRestore:()=>void;text?:string}){
 const hintTitle=useHintTitle();
 return <section className="pending-decision" role="status"><strong>{label}</strong><button autoFocus aria-keyshortcuts="=" title={hintTitle(text,'=')} onClick={()=>{dismissCardZooms();onRestore();}}>{text}<KeybindingHint> (=)</KeybindingHint></button></section>;
}

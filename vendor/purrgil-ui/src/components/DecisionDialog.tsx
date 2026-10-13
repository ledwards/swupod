import {ModalTools,ModalRestore,useModalControls} from './ModalControls';
import {useTablePreferences} from '../preferences/table';
import {rulesTextLabel} from './rules-text-format';
import {useEffect,useLayoutEffect,useState,useRef,type CSSProperties,type ReactNode} from 'react';
import {createPortal} from 'react-dom';

export function DecisionDialog({children,label,onClose,mode='modal',className='',cardCount=0,scope='window',pending=false,controls=true,blocking=false}:{children:ReactNode;label:string;onClose?:()=>void;mode?:'modal'|'target';className?:string;cardCount?:number;scope?:'window'|'board';pending?:boolean;controls?:boolean;blocking?:boolean}) {
 const [preferences]=useTablePreferences();
 const [viewingBoard,setViewingBoard]=useState(false);
 const side=pending&&preferences.decisions==='side'&&cardCount===0;
 const [target,setTarget]=useState<Element|null>(null);
 useLayoutEffect(()=>{setTarget(document.querySelector('.app.table-themed')??document.body);},[]);
 const [bounds,setBounds]=useState<DOMRect|null>(null);
 useLayoutEffect(()=>{
  if(scope!=='board'||!target)return;
  const board=target.querySelector('.table-frame');if(!board)return;
  const measure=()=>setBounds(board.getBoundingClientRect());
  measure();const observer=new ResizeObserver(measure);observer.observe(board);
  window.addEventListener('resize',measure);
  return()=>{observer.disconnect();window.removeEventListener('resize',measure);};
 },[scope,target]);
 const ref=useRef<HTMLDialogElement>(null);
 const outsidePress=useRef(false);
 const webpage=target?.classList.contains('lobby-app')===true;
 const outside=(x:number,y:number)=>{const box=ref.current?.getBoundingClientRect();return Boolean(box&&(x<box.left||x>box.right||y<box.top||y>box.bottom));};
 const {placement,setPlacement}=useModalControls({element:ref,enabled:controls&&!webpage&&!!target&&mode==='modal',minimized:viewingBoard,onMinimize:()=>setViewingBoard(true),onRestore:()=>setViewingBoard(false),scope});
 useEffect(()=>{if(mode==='target'||!target||viewingBoard)return;const dialog=ref.current!;const previous=document.activeElement as HTMLElement|null;if(webpage||blocking)dialog.showModal();else dialog.show();dialog.focus();return()=>{dialog.close();previous?.focus();};},[mode,target,viewingBoard,webpage,blocking]);
 if(!target)return null;
 if(mode==='target')return createPortal(<section className="decision-dialog decision-target" aria-label={rulesTextLabel(label)}>{children}</section>,target);
 return createPortal(<><dialog ref={ref} data-modal-placement={blocking?'center':placement} className={`decision-dialog ${cardCount?'decision-cards':'decision-compact'} ${className} ${side?'decision-side':''} ${bounds?'decision-board':''}`} style={{...(bounds?{'--decision-area-width':`${bounds.width}px`,'--decision-area-height':`${bounds.height}px`,'--decision-area-bottom':`${bounds.bottom}px`,left:bounds.x+bounds.width/2,top:bounds.y+bounds.height/2}:{}),'--decision-width':`${cardCount?Math.max(440,Math.min(1080,cardCount*166+64)):440}px`} as CSSProperties} aria-label={rulesTextLabel(label)} tabIndex={-1} onPointerDown={event=>{outsidePress.current=webpage&&event.target===event.currentTarget&&outside(event.clientX,event.clientY);}} onClick={event=>{if(outsidePress.current&&webpage&&event.target===event.currentTarget&&outside(event.clientX,event.clientY))onClose?.();outsidePress.current=false;}} onCancel={event=>{event.preventDefault();onClose?.();}}>{controls&&!webpage&&<ModalTools placement={placement} onMove={setPlacement} onMinimize={()=>setViewingBoard(true)}/>}{children}</dialog>{viewingBoard&&<ModalRestore label={rulesTextLabel(label)} onRestore={()=>setViewingBoard(false)}/>}</>,target);
}

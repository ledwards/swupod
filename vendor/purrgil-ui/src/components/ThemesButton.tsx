import {createPortal} from 'react-dom';
import {ModalTools,ModalRestore,useModalControls} from './ModalControls';
import {useEffect,useRef,useState} from 'react';
import Dlc from './Dlc';
export function ThemesModal({onClose,controls=true}:{onClose:()=>void;controls?:boolean}){
 const ref=useRef<HTMLDialogElement>(null);
 const [minimized,setMinimized]=useState(false);
 const {placement,setPlacement}=useModalControls({element:ref,enabled:controls,minimized,onMinimize:()=>setMinimized(true),onRestore:()=>setMinimized(false)});
 useEffect(()=>{if(minimized)return;const previous=document.activeElement as HTMLElement|null;const dialog=ref.current!;if(controls)dialog.show();else dialog.showModal();return()=>{dialog.close();previous?.focus();};},[minimized,controls]);
 return <><dialog ref={ref} data-modal-placement={placement} className="themes-dialog" aria-label="Themes" onCancel={event=>{event.preventDefault();onClose();}} onClick={event=>{if(!controls&&event.target===event.currentTarget)onClose();}}>{controls?<ModalTools placement={placement} onMove={setPlacement} onMinimize={()=>setMinimized(true)} onClose={onClose} closeLabel="Close themes"/>:<button className="themes-close" aria-label="Close themes" onClick={onClose}>✕</button>}<Dlc/></dialog>{minimized&&<ModalRestore label="Themes" text="Restore themes" onRestore={()=>setMinimized(false)}/>}</>;
}
export function ThemesButton(){
 const [open,setOpen]=useState(false);
 return <><button className="dlc-link header-icon" aria-label="Themes" title="Themes" aria-haspopup="dialog" onClick={()=>setOpen(true)}><svg className="dlc-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18h1.2a2 2 0 0 0 1.5-3.3 1.5 1.5 0 0 1 1.1-2.5H18a3 3 0 0 0 3-3C21 7 17 3 12 3Z"/><circle cx="7.5" cy="10" r=".9"/><circle cx="10.5" cy="6.8" r=".9"/><circle cx="15" cy="7.5" r=".9"/><circle cx="7.5" cy="14.5" r=".9"/></svg></button>{open&&createPortal(<ThemesModal onClose={()=>setOpen(false)}/>,document.querySelector('.app.table-themed')??document.body)}</>;
}

import {useLayoutEffect,useRef,type CSSProperties,type ReactNode} from 'react';
import {createPortal} from 'react-dom';

/** Previews escape both scrolling dialogs and native modal stacking contexts. */
export function CardPreviewLayer({children,className,style,label}:{children:ReactNode;className:string;style?:CSSProperties;label:string}){
 const ref=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{
  const element=ref.current;
  element?.showPopover();
  return()=>{if(element?.matches(':popover-open'))element.hidePopover();};
 },[]);
 return createPortal(<div ref={ref} popover="manual" className={className} style={style} role="img" aria-label={label}>{children}</div>,document.body);
}

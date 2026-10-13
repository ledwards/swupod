import {useOwnerAppearance} from '../preferences/cosmetics';
import {artworkUrl} from '../artwork';
import {useSyncExternalStore} from 'react';
import {readSleeve,subscribeSleeve,sleeves,type Sleeve} from '../preferences/sleeves';
export function SleeveArt({sleeve,alt=''}:{sleeve?:Sleeve;alt?:string}){
 if(!sleeve)return <img className="sleeve-back" src={artworkUrl("/assets/card-back.png")} alt={alt} draggable={false}/>;
 return <svg className="sleeve-back" viewBox={sleeve.crop.join(' ')} role={alt?'img':undefined} aria-label={alt||undefined} aria-hidden={alt?undefined:true} data-sleeve-id={sleeve.id} preserveAspectRatio="none"><image href={artworkUrl(sleeve.image)} width={sleeve.width} height={sleeve.height}/></svg>;
}
export function SleeveBack({alt='',ownerId}:{alt?:string;ownerId?:string}){const appearance=useOwnerAppearance(ownerId);const mapped=sleeves.find(s=>({'gc2026-sleeve-chimaera':'gc2026-chimaera','gc2026-sleeve-bokatan':'gc2026-bo-katan'}[appearance.sleeve?.id??''])===s.id);const id=useSyncExternalStore(subscribeSleeve,readSleeve);return appearance.sleeve&&!mapped?<img className="sleeve-back" src={appearance.sleeve.image} alt={alt} onError={e=>{e.currentTarget.src=artworkUrl('/assets/card-back.png');}}/>:<SleeveArt sleeve={mapped??sleeves.find(s=>s.id===id)} alt={alt}/>;}

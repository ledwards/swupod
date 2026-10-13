import type {CSSProperties} from 'react';
import {art,eternalLeader,packArt} from './art';
import {Crop,DeckArt} from './bits';
import {artworkThumbnailUrl} from '@purrgil/ui/artwork';
import endorTable from '../data/table-themes/endor.json' with {type:'json'};
import kashyyykTable from '../data/table-themes/kashyyyk.json' with {type:'json'};
import tatooineTable from '../data/table-themes/tatooine.json' with {type:'json'};

export type FormatKey='premier'|'eternal'|'draft'|'six'|'eight'|'chaos';
// Each limited format starts on its own Homeworlds table.
export const startTable:Partial<Record<FormatKey,string>>={draft:endorTable.background.image,six:kashyyykTable.background.image,eight:tatooineTable.background.image};
const packsOf:Partial<Record<FormatKey,number>>={draft:3,six:6,eight:8};

/** Packs fanned from one point: 3 for Draft, 6 or 8 for Sealed. */
export function PackFan({n,ptp,set}:{n:number;ptp:string;set:string}){
 return <span className="ph-pack-fan" aria-hidden="true">{Array.from({length:n},(_,i)=><img key={i} src={packArt(ptp,set,i%3+1)} alt="" loading="lazy" style={{'--r':`${(i-(n-1)/2)*(n>3?60/(n-1):14)}deg`} as CSSProperties}/>)}</span>;
}

/** A format's art, the same wherever the format appears: limited packs fanned over their table, Premier's meta art, Eternal's leader. */
export function FormatArt({format,ptp,set}:{format:FormatKey;ptp:string;set:string}){
 const table=startTable[format],packs=packsOf[format];
 if(packs)return <>{table&&<Crop src={artworkThumbnailUrl(table)} position="50% 50%"/>}<PackFan n={packs} ptp={ptp} set={set}/></>;
 if(format==='eternal')return <DeckArt leader={eternalLeader}/>;
 return <Crop src={art.meta.src} position={art.meta.position} scale={art.meta.scale}/>;
}

import {artworkUrl} from '../artwork';
import type {CSSProperties} from 'react';
import type {TokenPiece} from '../preferences/token-sets';
import tokenArtBounds from '../preferences/token-art-bounds.json';
const artBounds:Record<string,{width:number;height:number;box:number[]}>=tokenArtBounds;
// Normalized bounds of each blank face in its atlas; transparent padding is excluded.
const atlasBounds:Record<string,number[][]>={
 'metalfab-experience':[[70,150,850,710]],
 damage:[[12,123,320,318],[350,95,292,366],[674,95,292,366],[25,521,295,390],[339,541,299,361]],
 experience:[[20,70,297,379],[352,85,277,369],[650,188,330,232],[16,537,330,356]],
 modifier:[[20,175,286,246],[350,175,287,246],[651,182,312,243]],
 btst:[[10,228,306,296],[330,252,316,253],[655,247,318,258]],
 shield:[[30,86,295,378],[349,86,283,375],[641,109,339,352],[24,550,306,361],[330,556,353,355]],
 cards:[[11,42,315,445],[337,42,313,445],[662,42,315,445]],
};
export function TokenArt({piece}:{piece:TokenPiece}) {
 if(piece.text){
  const palettes={ffg:['#181b21','#d9d9d2'],gamegenic:['#122c37','#76d9ef'],'gamegenic-pro':['#122c37','#76d9ef'],metalfab:['#302b24','#ecd5a1'],premier:['#172a3a','#a4d7f4'],btst:['#15352b','#81e5b2'],lasergaming:['#102d48','#86caf6']} as const;
  const [fill,ink]=palettes[piece.text.style];
  return <svg className="token-art text-token" viewBox="0 0 160 64" aria-hidden="true">
   <rect x="3" y="3" width="154" height="58" rx="9" fill={fill} stroke={ink} strokeWidth="3"/>
   <text x="80" y="34" textAnchor="middle" dominantBaseline="central" fill={ink} fontFamily="Barlow, sans-serif" fontWeight="800" fontSize={Math.min(26,135/(piece.text.label.length*.6))}>{piece.text.label}</text>
  </svg>;
 }
 if(piece.aggregate||piece.printed){
  const {sheet,cell,marks}=(piece.aggregate??piece.printed)!;
  const standalonePath=`/assets/tokens/aggregated/${sheet}.webp`;
  const standalone=artBounds[standalonePath];
  const bounds=standalone?.box??atlasBounds[sheet]?.[cell];
  const height=bounds?bounds[3]/bounds[2]*100:150;
  return <svg className={`token-art ${piece.aggregate?'aggregated-token':'printed-token'} shape-${piece.shape??'card'}`} viewBox={`0 0 100 ${height}`} aria-hidden="true" data-aggregate-role={piece.aggregate?piece.role:undefined}>
   <svg viewBox={bounds.join(' ')} width="100" height={height}><image href={artworkUrl(standalone?standalonePath:`/assets/tokens/aggregated/${sheet}.png`)} width={standalone?.width??1000} height={standalone?.height??1000}/></svg>
   {marks.map((mark,i)=><text key={i} x={mark.x} y={mark.y*height/100} textAnchor="middle" dominantBaseline="central" fill={mark.color??'#fff'} fontSize={mark.size??28} textLength={Math.min((mark.size??28)*mark.text.length*.55,mark.width??(marks.length>1&&mark.x!==50?Math.min(40,mark.x*1.8,(100-mark.x)*1.8):70))} lengthAdjust="spacingAndGlyphs" fontWeight="900" fontFamily="Barlow, sans-serif" paintOrder="stroke" stroke="#0007" strokeWidth=".5">{mark.text}</text>)}
  </svg>;
 }
 const crop=piece.crop??artBounds[piece.src];
 if(crop){const [, ,width,sourceHeight]=crop.box;const height=piece.aspectRatio?width/piece.aspectRatio:sourceHeight;return <svg className={`token-art shape-${piece.shape??'card'}`} viewBox={`0 0 ${width} ${height}`} aria-hidden="true"><svg viewBox={crop.box.join(' ')} preserveAspectRatio={piece.aspectRatio?'none':undefined} width={width} height={height} overflow="hidden"><image href={artworkUrl(piece.src)} width={crop.width} height={crop.height}/></svg></svg>;}
 return <img className={`token-art shape-${piece.shape??'card'}`} src={artworkUrl(piece.src)} alt="" draggable={false}/>;
}

export function TokenStack({pieces}:{pieces:TokenPiece[]}){
 const step=pieces[0].stack?.step??1;
 return <span className="physical-counter token-stack" style={{'--stack-height':1+(pieces.length-1)*step} as CSSProperties}>
  {pieces.map((piece,index)=><span className="token-stack-piece" key={index} style={{top:`calc(var(--token-height) * ${index*step})`}}><TokenArt piece={piece}/></span>)}
 </span>;
}

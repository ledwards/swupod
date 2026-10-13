import {selectedTokenCard,tokenCardImage} from './token-cards';
import {readPreferenceCookie,writePreferenceCookie} from './cookies';
import {canCustomize} from './access';
export type TokenRole = 'initiative'|'damage'|'shield'|'experience'|'advantage'|'modifier'|'epic'|'sentinel'|'reminder'|'blast'|'weakness'|'force'|'credit';
export type TokenFace = {sheet:string;cell:number;marks:{x:number;y:number;text:string;size?:number;width?:number;color?:string}[]};
export type TokenPiece = {text?:{label:string;style:TokenSetId};aspectRatio?:number;crop?:{width:number;height:number;box:number[]};aggregate?:TokenFace;printed?:TokenFace;role:TokenRole; name:string; src:string; presentation:'on-card'|'attachment'; value?:number; delta?:readonly [number,number]; shape?:'counter'|'initiative'|'modifier'|'circle'|'coin'; printing?:string; face?:string; stack?:{family:string;step:number}};
export type TokenSetId = 'ffg'|'gamegenic'|'gamegenic-pro'|'metalfab'|'premier'|'btst'|'lasergaming';
export type TokenSet = {id:TokenSetId; name:string; pieces:TokenPiece[]};
const onCard=(role:TokenRole,name:string,src:string,extra:Partial<TokenPiece>={}):TokenPiece=>({role,name,src,presentation:'on-card',...extra});
const damage=(src:string,value:number,face?:string):TokenPiece=>onCard('damage',`${value} Damage`,src,{value,shape:'circle',face});
function modifierStack(src:string){
 const family=src.match(/\/(gg|pro|pg|btst)-/)?.[1];
 return family?{family,step:family==='gg'||family==='pro'?.64:family==='pg'?.72:.78}:undefined;
}
const modifier=(src:string,name:string,delta:readonly [number,number]):TokenPiece=>onCard('modifier',name,src,{shape:'modifier',delta,stack:modifierStack(src)});
export function stackTokenPieces(pieces:TokenPiece[]):TokenPiece[][]{
 const groups:TokenPiece[][]=[];
 for(const piece of pieces){
  const previous=groups.at(-1);
  if(piece.stack&&previous?.[0].stack?.family===piece.stack.family)previous.push(piece);
  else groups.push([piece]);
 }
 return groups;
}
// Manufacturer denominations are printed on shared clean faces; arbitrary totals use aggregate instead.
const laserFace=(sheet:string,marks:TokenFace['marks']):TokenFace=>({sheet:`lasergaming-${sheet}`,cell:0,marks});
const laserPair=(value:number,colorLeft='#fff',colorRight='#fff')=>[{x:25,y:48,text:`${value<0?'−':'+'}${Math.abs(value)}`,size:24,width:38,color:colorLeft},{x:75,y:48,text:`${value<0?'−':'+'}${Math.abs(value)}`,size:24,width:38,color:colorRight}];
export const tokenSets:readonly TokenSet[]=[
 {id:'ffg',name:'FFG',pieces:[
  onCard('epic','Epic Action used','/token-markers/ffg-epic.svg'),
  onCard('initiative','Initiative','/assets/tokens/ffg-initiative.png',{shape:'initiative',face:'Front'}),
  onCard('initiative','Initiative','/assets/tokens/ffg-initiative-back.webp',{shape:'initiative',face:'Back'}),
  damage('/assets/tokens/ffg-damage-1.png',1),
  damage('/assets/tokens/ffg-damage-5.png',5),
  damage('/assets/tokens/ffg-damage-10.png',10),
 ]},
 {id:'gamegenic',name:'Gamegenic',pieces:[
  onCard('initiative','Initiative','/assets/tokens/gg-initiative.png',{shape:'initiative'}),
  damage('/assets/tokens/gg-damage-1.png',1,'Single sided'),
  damage('/assets/tokens/gg-damage-5.png',5,'Single sided'),
  damage('/assets/tokens/gg-damage-10.png',10,'Single sided'),
  onCard('shield','Shield','/assets/tokens/gg-shield.png'),
  onCard('experience','Experience +1/+1','/assets/tokens/gg-experience.png',{value:1}),
  onCard('epic','Epic Action','/assets/tokens/gg-epic.png'),
  onCard('reminder','Reminder','/assets/tokens/gg-reminder.png'),
  modifier('/assets/tokens/gg-mod-11.webp','+1 Power / +1 HP',[1,1]),
  modifier('/assets/tokens/gg-mod-10.webp','+1 Power',[1,0]),
  modifier('/assets/tokens/gg-mod-01.webp','+1 HP',[0,1]),
  modifier('/assets/tokens/gg-mod-m11.webp','−1 Power / −1 HP',[-1,-1]),
 ]},
 {id:'gamegenic-pro',name:'Gamegenic Pro',pieces:[
  onCard('initiative','Initiative','/assets/tokens/pro-initiative.webp',{shape:'initiative'}),
  damage('/assets/tokens/pro-damage-1.webp',1,'Front'),
  damage('/assets/tokens/pro-damage-3.webp',3,'Back of the 1'),
  damage('/assets/tokens/pro-damage-5.webp',5,'Front'),
  damage('/assets/tokens/pro-damage-10.webp',10,'Back of the 5'),
  onCard('shield','Shield','/assets/tokens/pro-shield.webp'),
  onCard('experience','Experience +1/+1','/assets/tokens/pro-experience.webp',{value:1}),
  onCard('epic','Epic Action','/assets/tokens/pro-epic.webp'),
  onCard('reminder','Reminder','/assets/tokens/pro-reminder.webp'),
  modifier('/assets/tokens/pro-mod-11.webp','+1 Power / +1 HP',[1,1]),
  modifier('/assets/tokens/pro-mod-10.webp','+1 Power',[1,0]),
  modifier('/assets/tokens/pro-mod-01.webp','+1 HP',[0,1]),
  modifier('/assets/tokens/pro-mod-m11.webp','−1 Power / −1 HP',[-1,-1]),
 ]},
 {id:'metalfab',name:'metalFAB',pieces:[
  onCard('initiative','Initiative','/assets/tokens/mf-initiative.png',{shape:'initiative',face:'Jedi'}),
  onCard('initiative','Initiative','/assets/tokens/mf-initiative-empire.png',{shape:'initiative',face:'Empire, back of Jedi'}),
  damage('/assets/tokens/mf-damage-1.png',1,'Front'),
  damage('/assets/tokens/mf-damage-3.png',3,'Back of the 1'),
  damage('/assets/tokens/mf-damage-5.webp',5,'Front'),
  damage('/assets/tokens/mf-damage-10.png',10,'Back of the 5'),
  onCard('shield','Shield','/assets/tokens/mf-shield.png'),
  onCard('experience','Experience +2/+2','/assets/tokens/mf-exp-1.webp',{value:2,face:'Reverse is +1/+1'}),
  onCard('epic','Epic Action','/assets/tokens/mf-epic.webp'),
  onCard('reminder','Reminder','/assets/tokens/mf-reminder.png',{face:'Back of epic'}),
  onCard('sentinel','Sentinel','/assets/tokens/mf-sentinel.png',{face:'Ground'}),
  onCard('sentinel','Sentinel','/assets/tokens/mf-sentinel-space.png',{face:'Space'}),
 ]},
 {id:'premier',name:'Premier Games',pieces:[
  onCard('initiative','Initiative','/assets/tokens/pg-initiative.png',{shape:'initiative'}),
  damage('/assets/tokens/pg-damage-1.webp',1,'Front'),
  damage('/assets/tokens/pg-damage-3.webp',3,'Back of the 1'),
  damage('/assets/tokens/pg-damage-5.webp',5,'Front'),
  damage('/assets/tokens/pg-damage-10.webp',10,'Back of the 5'),
  onCard('shield','Shield','/assets/tokens/pg-shield.webp'),
  onCard('experience','Experience +1/+1','/assets/tokens/pg-exp-1.webp',{value:1,face:'Front'}),
  onCard('experience','Experience +2/+2','/assets/tokens/pg-exp-2.webp',{value:2,face:'Back of +1/+1'}),
  onCard('epic','Epic Action','/assets/tokens/pg-epic.webp'),
  onCard('reminder','Reminder','/assets/tokens/pg-reminder.webp',{face:'Back of epic'}),
  onCard('sentinel','Sentinel','/assets/tokens/pg-sentinel.webp'),
  onCard('sentinel','Hidden','/assets/tokens/pg-hidden.png',{face:'Back of sentinel'}),
  modifier('/assets/tokens/pg-mod-11.webp','+1 Power / +1 HP',[1,1]),
  modifier('/assets/tokens/pg-mod-10.webp','+1 Power',[1,0]),
  modifier('/assets/tokens/pg-mod-01.webp','+1 HP',[0,1]),
  modifier('/assets/tokens/pg-mod-m11.webp','−1 Power / −1 HP',[-1,-1]),
 ]},
 {id:'btst',name:'Buy The Same Token',pieces:[
  onCard('initiative','Initiative','/assets/tokens/btst-initiative.webp',{shape:'initiative',face:'Open side. Sold in six aspect colours'}),
  damage('/assets/tokens/btst-damage-1.png',1,'Front. Reverse is 2'),
  damage('/assets/tokens/btst-damage-2.webp',2,'Back of the 1'),
  damage('/assets/tokens/btst-damage-3.webp',3,'Front. Reverse is 4'),
  damage('/assets/tokens/btst-damage-4.png',4,'Back of the 3'),
  damage('/assets/tokens/btst-damage-5.webp',5,'Front. Reverse is 10'),
  damage('/assets/tokens/btst-damage-10.png',10,'Back of the 5'),
  onCard('shield','Shield','/assets/tokens/btst-shield.png',{shape:'coin'}),
  onCard('experience','Experience +1/+1','/assets/tokens/btst-xp-1.webp',{value:1,face:'Reverse is +2/+2'}),
  onCard('experience','Experience +2/+2','/assets/tokens/btst-xp-2.webp',{value:2,face:'Back of +1/+1'}),
  onCard('experience','Experience +3/+3','/assets/tokens/btst-xp-3.webp',{value:3,face:'Reverse is +4/+4'}),
  onCard('experience','Experience +4/+4','/assets/tokens/btst-xp-4.webp',{value:4,face:'Back of +3/+3'}),
  onCard('epic','Epic Action','/assets/tokens/btst-epic.png'),
  modifier('/assets/tokens/btst-gen-1.png','+1 Power / +1 HP',[1,1]),
  modifier('/assets/tokens/btst-pwr-1.png','+1 Power',[1,0]),
  modifier('/assets/tokens/btst-hp-1.png','+1 HP',[0,1]),
  modifier('/assets/tokens/btst-gen-m1.png','−1 Power / −1 HP',[-1,-1]),
  modifier('/assets/tokens/btst-pwr-m1.png','−1 Power',[-1,0]),
  onCard('modifier','+2 Power','/assets/tokens/btst-pwr-2.png',{stack:{family:'btst',step:.78},shape:'modifier',delta:[2,0],face:'Back of +1 Power'}),
  onCard('modifier','+3 Power','/assets/tokens/btst-pwr-3.png',{stack:{family:'btst',step:.78},shape:'modifier',delta:[3,0],face:'Reverse is +4 Power'}),
  onCard('modifier','+4 Power','/assets/tokens/btst-pwr-4.png',{stack:{family:'btst',step:.78},shape:'modifier',delta:[4,0],face:'Back of +3 Power'}),
  onCard('modifier','−2 Power','/assets/tokens/btst-pwr-m2.png',{stack:{family:'btst',step:.78},shape:'modifier',delta:[-2,0],face:'Back of −1 Power'}),
  onCard('modifier','+2 HP','/assets/tokens/btst-hp-2.png',{stack:{family:'btst',step:.78},shape:'modifier',delta:[0,2],face:'Back of +1 HP'}),
  onCard('modifier','+2 Power / +2 HP','/assets/tokens/btst-gen-2.png',{stack:{family:'btst',step:.78},shape:'modifier',delta:[2,2],face:'Back of +1/+1'}),
  onCard('modifier','+3 Power / +3 HP','/assets/tokens/btst-gen-3.png',{stack:{family:'btst',step:.78},shape:'modifier',delta:[3,3],face:'Reverse is +4/+4'}),
  onCard('modifier','+4 Power / +4 HP','/assets/tokens/btst-gen-4.png',{stack:{family:'btst',step:.78},shape:'modifier',delta:[4,4],face:'Back of +3/+3'}),
  onCard('modifier','−2 Power / −2 HP','/assets/tokens/btst-gen-m2.webp',{stack:{family:'btst',step:.78},shape:'modifier',delta:[-2,-2],face:'Back of −1/−1'}),
 ]},
 {id:'lasergaming',name:'LaserGaming',pieces:[
  onCard('initiative','Initiative','/assets/tokens/lg-initiative.webp',{shape:'initiative'}),
  ...[1,3,5,10].map(value=>({...damage('/assets/tokens/aggregated/lasergaming-damage.webp',value,value===1||value===5?'Front':`Back of the ${value===3?1:5}`),printed:laserFace('damage',[{x:50,y:50,text:String(value),size:54,width:62}])})),
  onCard('shield','Shield','/assets/tokens/lg-shield-original.webp',{shape:'coin'}),
  ...[1,2,3,4].map(value=>onCard('experience',`Experience +${value}/+${value}`,'/assets/tokens/aggregated/lasergaming-experience.webp',{value,shape:'modifier',face:value%2?'Front':`Back of +${value-1}/+${value-1}`,printed:laserFace('experience',laserPair(value))})),
  ...[1,2,3,4].map(value=>onCard('modifier',`+${value} Power / +${value} HP`,'/assets/tokens/aggregated/lasergaming-modifier.webp',{delta:[value,value],shape:'modifier',stack:{family:'lasergaming',step:.8},printed:laserFace('modifier',laserPair(value,'#ce382e','#2c71bd'))})),
  ...[-1,-2,-3,-4].map(value=>onCard('modifier',`−${Math.abs(value)} Power / −${Math.abs(value)} HP`,'/assets/tokens/aggregated/lasergaming-negative.webp',{delta:[value,value],shape:'modifier',stack:{family:'lasergaming',step:.8},printed:laserFace('negative',laserPair(value,'#f55335','#69a5ff'))})),
  ...[1,2,3,4,-1,-2,-3,-4].flatMap(value=>[0,1].map(axis=>onCard('modifier',`${value<0?'−':'+'}${Math.abs(value)} ${axis?'HP':'Power'}`,`/assets/tokens/aggregated/lasergaming-${axis?'hp':'power'}.webp`,{delta:axis?[0,value]:[value,0],shape:'modifier',stack:{family:axis?'lasergaming-hp':'lasergaming-power',step:.8},printed:laserFace(axis?'hp':'power',[{x:50,y:50,text:`${value<0?'−':'+'}${Math.abs(value)}`,size:32}])}))),
  onCard('epic','Epic Action','/assets/tokens/lg-epic.webp'),
  onCard('reminder','Reminder','/assets/tokens/lg-reminder.webp'),
  onCard('sentinel','Sentinel','/assets/tokens/lg-sentinel.webp'),
 ]},
];
const legacyIds:Record<string,TokenSetId>={'default-1':'ffg','default-2':'gamegenic-pro','burger':'btst'};
const storageKey='purrgil-token-set-v1';
let memory:TokenSetId='ffg';
function resolveTokenSetId(id:string|null):TokenSetId{const resolved=id?legacyIds[id]??id:id;return tokenSets.some(set=>set.id===resolved)?resolved as TokenSetId:'ffg';}
export function readTokenSet():TokenSetId{if(!canCustomize())return 'ffg';try{return resolveTokenSetId(readPreferenceCookie(storageKey)??localStorage.getItem(storageKey));}catch{return memory;}}
export function writeTokenSet(id:TokenSetId){if(!canCustomize())return;memory=id;writePreferenceCookie(storageKey,id);try{localStorage.setItem(storageKey,id);}catch{/* Private storage: retain the choice for this session. */}window.dispatchEvent(new Event(storageKey));}
export function tokenSetById(id:string):TokenSet{const resolved=resolveTokenSetId(id);return tokenSets.find(set=>set.id===resolved)??tokenSets[0];}
export function subscribeTokenSet(notify:()=>void){window.addEventListener('storage',notify);window.addEventListener(storageKey,notify);return()=>{window.removeEventListener('storage',notify);window.removeEventListener(storageKey,notify);};}
export function textTokenPiece(set:TokenSet,role:TokenRole,label:string):TokenPiece{
 return {role,name:label,src:'',presentation:'on-card',text:{label,style:set.id}};
}
/** Selected pack, default pack, token card, then styled text; never borrow another manufacturer. */
export function resolveTokenPiece(set:TokenSet,role:TokenRole,arena?:string):TokenPiece|undefined{
 const find=(pieces:TokenPiece[])=>{
  const matches=pieces.filter(piece=>piece.role===role&&(role!=='sentinel'||piece.name==='Sentinel'));
  return matches.find(piece=>piece.face===(arena==='spaceArena'?'Space':'Ground'))??matches[0];
 };
 const physical=find(set.pieces)??find(tokenSets[0].pieces);
 if(physical)return physical;
 if(['shield','experience','advantage','weakness'].includes(role)){
  const card=selectedTokenCard(role);
  if(card)return {role,name:card.name,src:tokenCardImage(card),presentation:'attachment',printing:`${card.number} · ${card.variant}`,...(role==='experience'?{value:1}:{})};
 }
 return textTokenPiece(set,role,role==='epic'?'Epic Action':role[0].toUpperCase()+role.slice(1));
}
export function upgradeToken(set:TokenSet,code?:string){
 if(!code?.startsWith('TOKEN-'))return;
 const role=code.slice(6).toLowerCase();
 if(!['shield','experience','advantage','weakness'].includes(role))return;
 const own=resolveTokenPiece(set,role as TokenRole);
 if(own)return own;
 return tokenSets[0].pieces.find(piece=>piece.role===role);
}
export type ComposedPieces={pieces:{piece:TokenPiece;count:number}[];remainder:number};
/** Largest fitting denomination first. A remainder is an amount no piece in the set can make. */
export function composeDenominations(options:{piece:TokenPiece;value:number}[],amount:number):ComposedPieces{
 const result:{piece:TokenPiece;count:number}[]=[];let remaining=amount;
 for(const option of options.filter(option=>option.value>0).sort((a,b)=>b.value-a.value)){const count=Math.floor(remaining/option.value);if(count){result.push({piece:option.piece,count});remaining-=count*option.value;}}
 return {pieces:result,remainder:remaining};
}
export function damagePieces(set:TokenSet,amount:number){return composeDenominations(set.pieces.filter(piece=>piece.role==='damage'&&piece.value).map(piece=>({piece,value:piece.value!})),amount).pieces;}
export function experiencePieces(set:TokenSet,amount:number){const own=set.pieces.filter(piece=>piece.role==='experience'&&piece.value);const fallback=resolveTokenPiece(set,'experience');return composeDenominations((own.length?own:fallback?[fallback]:[]).map(piece=>({piece,value:piece.value!})),amount);}
function along(delta:readonly [number,number],dir:readonly [number,number]){
 let value:number|undefined;
 for(let i=0;i<2;i++){
  if(dir[i]===0){if(delta[i]!==0)return undefined;continue;}
  const next=delta[i]/dir[i];
  if(!Number.isInteger(next)||next<=0||(value!==undefined&&next!==value))return undefined;
  value=next;
 }
 return value;
}
function signed(amount:number){return `${amount>=0?'+':''}${amount}`;}
/** Shared +N/+N first, then leftover Power and HP, each from that set's real modifier faces. */
export function modifierPieces(set:TokenSet,power:number,hp:number){
 const shared=power>0&&hp>0?Math.min(power,hp):power<0&&hp<0?Math.max(power,hp):0;
 const buckets:[number,number][]=[];if(shared)buckets.push([shared,shared]);if(power-shared)buckets.push([power-shared,0]);if(hp-shared)buckets.push([0,hp-shared]);
 const pieces:TokenPiece[]=[];const labels:string[]=[];
 for(const [p,h] of buckets){
  const dir=[Math.sign(p),Math.sign(h)] as const;
  const matching=(pieces:TokenPiece[])=>pieces.filter(piece=>piece.role==='modifier'&&piece.delta).flatMap(piece=>{const value=along(piece.delta!,dir);return value?[{piece,value}]:[];});
  const ownOptions=matching(set.pieces);
  // Only the default pack can supply missing modifier faces.
  const options=ownOptions.length?ownOptions:matching(tokenSets[0].pieces);
  const composed=composeDenominations(options,Math.max(Math.abs(p),Math.abs(h)));
  for(const {piece,count} of composed.pieces)for(let i=0;i<count;i++)pieces.push(piece);
  if(!composed.remainder)continue;
  const left=Math.sign(p)*composed.remainder,right=Math.sign(h)*composed.remainder;
  pieces.push({...textTokenPiece(set,'modifier',`${signed(left)}/${signed(right)}`),delta:[left,right],shape:'modifier'});
 }
 return {pieces,labels};
}

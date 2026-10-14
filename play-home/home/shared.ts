import {useCallback,useEffect,useRef,useState} from 'react';

// The same contract PTP validates and the queue pairs on.
export type Contract={format:'premier'|'eternal'|'limited';limited:'draft'|'six'|'eight'|'chaos';pool:'current'|'next';set:string;policy?:string};
export type LimitedDeck={poolShareId:string;name:string;leaderName?:string;baseName?:string;leaderImageUrl?:string;setCode:string;poolType:string;packCount:number|null;ready:boolean;blocker?:string;mainDeckCount?:number;hasDeck?:boolean;poolRootShareId?:string;createdAt?:string|null;updatedAt?:string|null;statsUrl?:string;listStats?:DeckListStats|null};
/** PTP deck list summary: deck cards at cost 0..7+, per aspect (most first), and average cost. */
export type DeckListStats={curve:number[];aspects:{aspect:string;count:number}[];avgCost:number};
/** A PTP pool with every build the player made from it (PTP `decks` with byPool). */
export type LimitedPool={poolShareId:string;name:string|null;setCode:string;setName:string|null;poolType:string;packCount:number|null;createdAt:string|null;decks:LimitedDeck[]};
export const limitedContract=(d:{poolType:string;packCount:number|null;setCode:string}):Contract=>({format:'limited',limited:d.poolType==='draft'?'draft':d.packCount===8?'eight':'six',set:d.setCode,pool:'current'});
/** Leebo's own constructed decks (PTP's catalogue); the decklist itself stays on PTP. */
export type AiDeck={id:string;name:string;leader:string;base:string;formats:('premier'|'eternal')[]};
/** A private game's seat as the other player sees it. */
export type Seat={name:string;leader:string|null;base:string|null;deckName?:string|null};
/** What an invitation link shows: the host's seat and format, or why it cannot be joined. */
export type InviteView={status:'waiting';contract:Contract;format:string;host:Seat;expiresAt:number}|{status:'invalid'|'used'|'expired'|'outdated'};
export type SharedState={devSession?:boolean;currentPolicy?:string;aiDecks?:AiDeck[];signedIn:boolean;enabled:boolean;ptpOrigin:string;playOrigin:string;sets:{code:string;name:string}[];pools:{id:string;name:string}[];queues:{key:string;contract:Contract;label:string;waiting:number}[];pods:{id:string;name:string;set:string;players:number;capacity:number}[];active:null|{id:string;status:string;format:string;contract:Contract;mode:string;invite?:string;error?:string;opponent?:Seat};queue:null|{contract:Contract;label:string;joinedAt:number}};
export type DeckExport={leader:{id:string;count:number};base:{id:string;count:number};deck:{id:string;count:number}[];sideboard:{id:string;count:number}[];metadata?:{name?:string}};
export type PlayedDeck={key:string;format:'premier'|'eternal';leader:string;base:string;mainCount:number;sideboardCount:number;lastPlayedAt:number;games:number;wins:number;losses:number;draws:number;source:'swuforge'|'json';sourceUrl:string|null;name:string|null;export:DeckExport};

/** The host page's own set list (PTP renders it into data-play-sets), so set pickers never wait on, or fail with, the lobby state call. */
export function hostSets():{code:string;name:string}[]{
 if(typeof document==='undefined')return [];
 try{const v=JSON.parse(document.querySelector('[data-play-sets]')?.getAttribute('data-play-sets')??'[]');return Array.isArray(v)?v.filter(s=>typeof s?.code==='string'&&typeof s?.name==='string'):[];}catch{return [];}
}
export const setsOf=(state?:SharedState)=>state?.sets?.length?state.sets:hostSets();
/** PTP renders its own session into data-play-signed-in, so a signed-in player is never asked to log in while the lobby state call is slow or fails. */
export const hostSignedIn=()=>typeof document!=='undefined'&&document.querySelector('[data-play-signed-in]')?.getAttribute('data-play-signed-in')==='true';
export const signedInOf=(state?:SharedState)=>!!state?.signedIn||hostSignedIn();
/** PTP's origin; on a PTP-hosted page that is this page, even before (or without) the lobby state. */
// Running inside a PTP page, PTP links stay on that page's origin (local, preview or production) whatever the lobby state says.
// Prerendering PTP's shell there is no page yet: PTP paths stay relative, so the shell's links and pack art load from whichever PTP serves it.
export const ptpOriginOf=(state?:SharedState)=>typeof document==='undefined'?'':document.querySelector('[data-play-sets]')?location.origin:state?.ptpOrigin??'https://www.protectthepod.com';

export const premier:Contract={format:'premier',limited:'six',pool:'current',set:''};
export const formatLabel=(c:Contract)=>c.format==='limited'?(c.limited==='chaos'?'Limited Chaos':`${c.set} ${c.limited==='draft'?'Draft':'Sealed'}`):c.format==='eternal'?'Eternal':'Premier';
export const formatDetail=(c:Contract)=>c.format==='limited'?(c.limited==='chaos'?'Any legal limited deck':c.limited==='draft'?'3 packs · drafted':`${c.limited==='eight'?8:6} packs`):c.format==='eternal'?'Every card ever printed':'Current rotation';
export const sameQueue=(a:Contract,b:Contract)=>a.format===b.format&&a.pool===b.pool&&(a.format!=='limited'||a.limited===b.limited&&(a.limited==='chaos'||a.set===b.set));
/** A pool of this tab's kind: the set, and draft, six or eight packs. Other kinds never show on the tab. */
export const sameKind=(c:Contract,d:LimitedDeck)=>c.format==='limited'&&(c.limited==='chaos'||d.setCode===c.set&&(c.limited==='draft'?d.poolType==='draft'&&d.packCount===3:d.poolType==='sealed'&&d.packCount===(c.limited==='six'?6:8)));
export const fits=(c:Contract,d:LimitedDeck)=>d.ready&&sameKind(c,d);
/** Website routes are owned by PTP; retained entry hooks keep SSR and mounting uniform. */
export const markPtpSite=()=>{};
export const onPtpSite=()=>true;
export type SiteView='home'|'history'|'decks'|'stats'|'spectate';
const ptpPaths:Record<SiteView,string>={home:'/',history:'/history',decks:'/decks',stats:'/me',spectate:'/watch'};
export const sitePath=(view:SiteView)=>ptpPaths[view];
export const playBase=()=>'/play';
export const isPlayPath=(p:string)=>/^\/play\/?$/.test(p)||/\/constructed\/?$/.test(p);
/** The Play page's address for a contract, in the scheme the format tabs write; extra params (pool) ride along. */
export const playPath=(c:Contract,extra:Record<string,string>={})=>{
 const q=new URLSearchParams();
 if(c.format!=='limited')q.set('format',c.format);
 else if(c.limited==='draft')q.set('format','draft');
 else{q.set('format','sealed');if(c.limited==='eight'||c.limited==='chaos')q.set('limited',c.limited);}
 if(c.format==='limited'&&c.limited!=='chaos'&&c.set)q.set('set',c.set);
 for(const [k,v] of Object.entries(extra))q.set(k,v);
 return `${playBase()}?${q}`;
};
export const waitingFor=(state:SharedState|undefined,c:Contract)=>state?.queues.filter(q=>sameQueue(c,q.contract)&&(!state.currentPolicy||q.contract.policy===state.currentPolicy)).reduce((n,q)=>n+q.waiting,0)??0;

// One independent reservation per local test tab; the server decides who may use it.
let developmentSeatPromise:Promise<string|undefined>|undefined;
function developmentSeat():Promise<string|undefined>{
 if(typeof location==='undefined'||!['localhost','127.0.0.1','[::1]'].includes(location.hostname))return Promise.resolve(undefined);
 return developmentSeatPromise??=new Promise(resolve=>{
  try{
   let seat=sessionStorage.getItem('ptp-dev-queue-seat')??crypto.randomUUID();
   // Duplicating a tab copies sessionStorage. Ask living tabs before reusing that seat.
   const instance=crypto.randomUUID(),channel=new BroadcastChannel('ptp-dev-queue-seats');
   let claimed=false;
   channel.onmessage=({data})=>{
    if(data.seat!==seat||data.instance===instance)return;
    if(data.kind==='probe'&&claimed)channel.postMessage({kind:'occupied',seat,instance});
    if(!claimed&&(data.kind==='occupied'||data.kind==='probe'&&data.instance<instance))seat=crypto.randomUUID();
   };
   channel.postMessage({kind:'probe',seat,instance});
   setTimeout(()=>{claimed=true;sessionStorage.setItem('ptp-dev-queue-seat',seat);resolve(seat);},150);
   window.addEventListener('pagehide',()=>channel.close(),{once:true});
  }catch{resolve(undefined);}
 });
}
/** What a player sees when a request fails: the server's own message, or plain copy for parse, network and timeout failures. */
export function playerFacingError(error:unknown,fallback:string):string{
 if(!(error instanceof Error))return fallback;
 if(['SyntaxError','TypeError','AbortError','TimeoutError'].includes(error.name))return fallback;
 if(/json|failed to fetch|networkerror|load failed|unexpected (end|token)/i.test(error.message))return fallback;
 return error.message||fallback;
}
/** Browser calls go to Purrgil, which forwards them to PTP with the signed-in identity. */
export async function sharedCall<T>(input?:Record<string,unknown>,signal?:AbortSignal):Promise<T>{
 const timeout=AbortSignal.timeout(30000),devSeat=await developmentSeat();
 const headers:Record<string,string>={...(input?{'content-type':'application/json'}:{}),...(devSeat?{'x-ptp-dev-seat':devSeat}:{})};
 const res=await fetch('/api/lobby/shared',{credentials:'same-origin',cache:'no-store',headers,signal:signal?AbortSignal.any([signal,timeout]):timeout,...(input?{method:'POST',body:JSON.stringify(input)}:{})});
 const data=await res.json().catch(()=>null);
 if(!res.ok||!data)throw Error(typeof data?.error==='string'?data.error:data?.error?.message??'Play is unavailable. Try again.');
 return data;
}
export function useShared(){
 const [state,setState]=useState<SharedState>(),[error,setError]=useState(''),sequence=useRef(0);
 const refresh=useCallback(async(signal?:AbortSignal)=>{const n=++sequence.current;try{const next=await sharedCall<SharedState>(undefined,signal);if(n===sequence.current){setState(next);setError('');}}catch(e){if(!signal?.aborted&&n===sequence.current)setError(playerFacingError(e,"Couldn't reach the game server. Try again in a moment."));}},[]);
 useEffect(()=>{const c=new AbortController();void refresh(c.signal);const timer=setInterval(()=>void refresh(c.signal),5000);return()=>{c.abort();clearInterval(timer);};},[refresh]);
 return {state,error,refresh};
}
export async function lobbyJson<T>(path:string,body?:unknown):Promise<T>{
 const res=await fetch(path,{credentials:'same-origin',signal:AbortSignal.timeout(15000),...(body===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})});
 const data=await res.json().catch(()=>null);if(!res.ok||!data)throw Error(data?.error?.message??data?.error??'Request failed. Try again.');return data as T;
}

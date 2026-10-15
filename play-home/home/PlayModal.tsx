import {ContentSkeleton} from '@purrgil/ui/components/ContentSkeleton';
import {ReservationError} from '../components/ReservationError';
import {OpponentSelector} from '../components/OpponentSelector';
import {ModeIcon} from '@purrgil/ui/components/ModeIcon';
import {DiscordMark} from '@purrgil/ui/components/DiscordMark';
import type {PlayMode} from '@purrgil/ui/transport/lobby';
import {useCallback,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {setArt} from './art';
import {cardName} from './archetype';
import {Archetype,Crop,DeckArt,SeatBanner} from './bits';
import {fits,formatLabel,isPlayPath,lobbyJson,maintenanceOf,playPath,ptpOriginOf,sameKind,sameQueue,setsOf,sharedCall,signedInOf,waitingFor,premier,type Contract,type DeckExport,type InviteView,type LimitedDeck,type PlayedDeck,type SharedState} from './shared';
import {rememberSeat} from './seat';
import {DeckView,deckCards} from './DeckView';
import {artworkThumbnailUrl} from '@purrgil/ui/artwork';
import {readImported,saveImported} from './importedDecks';
import {FormatArt,PackFan,startTable,type FormatKey} from './FormatArt';

type Choice={kind:'played';deck:PlayedDeck}|{kind:'imported';deck:DeckExport;source:'swuforge'|'json';url?:string;name:string}|{kind:'limited';deck:LimitedDeck};
type Check={valid:true;main:number;side:number}|{valid:false;message:string};
const sum=(cards:{count:number}[])=>cards.reduce((n,c)=>n+c.count,0);
const day=(v?:string|null)=>{const t=v?Date.parse(v):NaN;return Number.isNaN(t)?'':new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric'}).format(t);};
const setOf=(id:string)=>id.split(/[_-]/)[0]!.toUpperCase();
const exportOrigin='https://api.swuapi.com';

/** Play setup: format, deck, opponent, one button. */
export function PlayModal({contract:initial,deckKey,fresh=false,shared,invite,loginUrl,onClose,onStarted}:{contract:Contract;deckKey?:string;fresh?:boolean;shared?:SharedState;invite?:string;loginUrl:string;onClose:()=>void;onStarted:(mode:PlayMode,contract:Contract)=>void}){
 const [contract,setContract]=useState(initial);
 const limited=contract.format==='limited';
 const [played,setPlayed]=useState<PlayedDeck[]>(),[limitedDecks,setLimitedDecks]=useState<LimitedDeck[]>();
 const [choice,setChoice]=useState<Choice|undefined>(()=>typeof history==='undefined'?undefined:history.state?.ptpPlay?.choice);
 const [checks,setChecks]=useState<Record<string,Check>>({});
 const [opponent,setOpponent]=useState<PlayMode>(()=>(typeof history==='undefined'?undefined:history.state?.ptpPlay?.opponent)??(invite?'private':fresh?'ai':'queue'));
 const [anonymous,setAnonymous]=useState(false),[aiDeck,setAiDeck]=useState<string>(),[aiAll,setAiAll]=useState(false);
 const [importOpen,setImportOpen]=useState(false),[allDecks,setAllDecks]=useState(false),[query,setQuery]=useState(''),[menu,setMenu]=useState(false),[share,setShare]=useState(false),[viewing,setViewing]=useState(false),[note,setNote]=useState('');
 const [imported,setImported]=useState(readImported);
 const [urlText,setUrlText]=useState(''),[jsonText,setJsonText]=useState(''),[pasteError,setPasteError]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const request=useRef({key:'',id:''});
 // Keep this entry's setup when browser Back/Forward remounts the page.
 useEffect(()=>{if(isPlayPath(location.pathname))history.replaceState({...history.state,ptpPlay:{...history.state?.ptpPlay,contract,choice,opponent,deckKey,fresh,invite}},'');},[contract,choice,opponent,deckKey,fresh,invite]);
 const signedIn=signedInOf(shared);
 const ptp=ptpOriginOf(shared),sets=setsOf(shared),latest=sets[0]?.code??'HMW';
 // Set key art is 1920px wide, so the wide deck panel stays sharp (a single card's art blurs at this size).
 const panelArt={src:`${ptp}/expansion-art/sor.jpg`,position:'50% 38%'};
 const formatKey:FormatKey=contract.format==='limited'?contract.limited:contract.format;
 // Each tab keeps its own pick; a deck of another kind is never carried over (a 6-pack pool is not an 8-pack deck).
 const picks=useRef<Partial<Record<FormatKey,Choice>>>({});
 const keyFor=(c:Contract):FormatKey=>c.format==='limited'?c.limited:c.format;
 const suits=(c:Contract,pick?:Choice)=>!pick?undefined:c.format==='limited'?(pick.kind==='limited'&&sameKind(c,pick.deck)?pick:undefined):pick.kind==='limited'||pick.kind==='played'&&pick.deck.format!==c.format?undefined:pick;
 const switchTo=(next:Contract)=>{if(choice)picks.current[formatKey]=choice;setChoice(suits(next,picks.current[keyFor(next)]));setContract(next);history.replaceState({...history.state},'',playPath(next));};
 const chooseFormat=(f:FormatKey)=>switchTo(f==='premier'||f==='eternal'?{...contract,format:f}:{...contract,format:'limited',limited:f,set:contract.set||sets[0]?.code||''});
 // A limited contract always names a set; default to the newest.
 const newest=sets[0]?.code;
 useEffect(()=>{if(limited&&!contract.set&&newest)setContract(c=>({...c,set:newest}));},[limited,contract.set,newest]);

 // Invitations fix the format; the host already chose it.
 // Only signed-in players see the host's seat; an invitation that cannot be joined says why.
 const [inviteView,setInviteView]=useState<InviteView>();
 useEffect(()=>{if(!invite||!signedIn)return;let stale=false;sharedCall<InviteView>({action:'invite',invite}).then(v=>{if(stale)return;setInviteView(v);if(v.status==='waiting')setContract(v.contract);}).catch(e=>{if(!stale)setError(e.message);});return()=>{stale=true;};},[invite,signedIn]);
 useEffect(()=>{if(!signedIn)return;
  lobbyJson<{decks:PlayedDeck[]}>('/api/lobby/decks/played').then(r=>setPlayed(r.decks)).catch(()=>setPlayed([]));
  sharedCall<{decks:LimitedDeck[]}>({action:'decks'}).then(r=>setLimitedDecks(r.decks)).catch(()=>setLimitedDecks([]));
 },[signedIn]);

 // Only decks this format has seen; Premier decks stay on Premier, Eternal on Eternal.
 const recent=useMemo(()=>(played??[]).filter(d=>d.format===contract.format).slice(0,5),[played,contract.format]);
 // Imported decks (kept in this browser) join them, newest first; one already played from the same link shows once.
 const constructedList=useMemo(()=>[
  ...imported.filter(d=>!d.url||!recent.some(p=>p.sourceUrl===d.url)).map(d=>({at:d.importedAt,c:{kind:'imported',deck:d.deck,source:d.source,url:d.url,name:d.name} as Choice})),
  ...recent.map(d=>({at:d.lastPlayedAt,c:{kind:'played',deck:d} as Choice})),
 ].sort((a,b)=>b.at-a.at).map(x=>x.c),[imported,recent]);
 // Pools with no deck yet belong on My Decks, not in a list of decks to play. Only this tab's kind, newest first.
 const when=(d:LimitedDeck)=>Date.parse(d.updatedAt??d.createdAt??'')||0;
 const limitedList=useMemo(()=>(limitedDecks??[]).filter(d=>d.hasDeck!==false&&sameKind(contract,d)).sort((a,b)=>when(b)-when(a)),[limitedDecks,contract]);
 // Preselect: the most recent deck of this tab's kind.
 useEffect(()=>{
  if(choice&&suits(contract,choice))return;
  // A deck picked on My Decks (or the pool just built) wins, even if it is older than the last five.
  if(deckKey){const l=limitedList.find(d=>d.poolShareId===deckKey),p=played?.find(d=>d.key===deckKey&&d.format===contract.format);if(limited&&l){setChoice({kind:'limited',deck:l});return;}if(!limited&&p){setChoice({kind:'played',deck:p});return;}if(limited?limitedDecks===undefined:played===undefined)return;}
  if(limited){const d=limitedList[0];if(d)setChoice({kind:'limited',deck:d});else setChoice(undefined);}
  else{const c=constructedList[0];if(c)setChoice(c);else setChoice(undefined);}
 },[limited,limitedList,constructedList,contract,choice,deckKey,limitedDecks,played]);

 const keyOf=(c:Choice)=>c.kind==='played'?c.deck.key:c.kind==='imported'?`imported:${c.url??c.name}`:c.deck.poolShareId;
 const exportOf=(c:Choice)=>c.kind==='played'?c.deck.export:c.kind==='imported'?c.deck:undefined;
 // The eye's decklist: constructed decks are already in hand; a limited deck's list and pool come from PTP's export,
 // fetched as soon as the deck is selected so the eye opens on it.
 const cardsKey=(c:Choice)=>`${c.kind}:${keyOf(c)}`;
 const cardsLoad=(c:Choice)=>()=>{const e=exportOf(c);return e?Promise.resolve({leader:e.leader,base:e.base,deck:e.deck,sideboard:e.sideboard}):sharedCall<{deck:Omit<DeckExport,'metadata'>}>({action:'export',contract,poolShareId:(c as {deck:LimitedDeck}).deck.poolShareId}).then(r=>({leader:r.deck.leader,base:r.deck.base,deck:r.deck.deck,sideboard:r.deck.sideboard}));};
 useEffect(()=>{if(choice?.kind==='limited')deckCards(cardsKey(choice),cardsLoad(choice)).catch(()=>{});},[choice]);// eslint-disable-line react-hooks/exhaustive-deps
 // PTP is the only judge of legality; ask it, per deck and format.
 const validate=useCallback(async(c:Choice,k:string)=>{
  if(c.kind==='limited'){setChecks(v=>({...v,[k]:fits(contract,c.deck)?{valid:true,main:c.deck.mainDeckCount??0,side:0}:{valid:false,message:c.deck.blocker||`Built for ${c.deck.setCode} ${c.deck.poolType==='draft'?'Draft':`Sealed (${c.deck.packCount} packs)`}, not this queue.`}}));return;}
  try{const r=await sharedCall<{deck:DeckExport}>({action:'validate',contract,deck:exportOf(c)});setChecks(v=>({...v,[k]:{valid:true,main:sum(r.deck.deck),side:sum(r.deck.sideboard)}}));}
  catch(e){setChecks(v=>({...v,[k]:{valid:false,message:e instanceof Error?e.message:'This deck is not valid for this format.'}}));}
 },[contract]);
 const checkKey=(c:Choice)=>`${contract.format}:${contract.limited}:${contract.set}:${keyOf(c)}`;
 useEffect(()=>{if(!signedIn)return;const all:Choice[]=[...(choice?[choice]:[]),...(limited?limitedList.map(d=>({kind:'limited',deck:d}) as Choice):constructedList)];
  for(const c of all){const k=checkKey(c);if(!(k in checks)){setChecks(v=>({...v,[k]:v[k]}));void validate(c,k);}}
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[choice,constructedList,limitedList,contract,signedIn]);

 const check=choice?checks[checkKey(choice)]:undefined;
 const ready=!!choice&&check?.valid===true;
 // Maintenance closes the queue and private games; Leebo stays open.
 const paused=!!maintenanceOf(shared)&&(invite?true:opponent!=='ai');
 async function readPaste(paste:'url'|'json'){
  if(busy)return;
  const pasteText=paste==='url'?urlText:jsonText;
  setPasteError('');setBusy(true);
  try{
   let next:Extract<Choice,{kind:'imported'}>;
   if(paste==='url'){const r=await lobbyJson<{deck:DeckExport;url:string}>('/api/lobby/import-url',{url:pasteText.trim()});next={kind:'imported',deck:r.deck,source:'swuforge',url:r.url,name:r.deck.metadata?.name??'SWUForge deck'};}
   else{const deck=JSON.parse(pasteText) as DeckExport;if(!deck?.leader?.id||!deck?.base?.id||!Array.isArray(deck.deck))throw Error('That JSON has no leader, base and deck. Paste the deck JSON export.');next={kind:'imported',deck,source:'json',name:deck.metadata?.name??'Pasted deck'};}
   // Kept in this browser, so the deck is still in the list after a reload.
   setImported(list=>saveImported({deck:next.deck,source:next.source,...(next.url?{url:next.url}:{}),name:next.name,importedAt:Date.now()},list));
   setChoice(next);
   if(paste==='url')setUrlText('');else setJsonText('');
   // The imported deck is now the choice: the form folds away; Import opens it again. A failure keeps it open with the error.
   setImportOpen(false);
  }catch(e){setPasteError(e instanceof SyntaxError?'That is not valid JSON. Paste the deck JSON export.':e instanceof Error?e.message:'Unable to read that deck.');}
  finally{setBusy(false);}
 }
 // Every deck file comes from swuapi so PTP and the shell export identical files.
 async function exportDeck(destination:'copy'|'save',format:'JSON'|'CSV'|'Melee'|'PNG'){
  if(!choice)return;setShare(false);setNote('');
  try{
   const r=await sharedCall<{deck:Omit<DeckExport,'metadata'>}>({action:'export',contract,...(choice.kind==='limited'?{poolShareId:choice.deck.poolShareId}:{deck:exportOf(choice)})});
   const name=choice.kind==='limited'?choice.deck.name:choice.kind==='imported'?choice.name:choice.deck.name??`${cardName(choice.deck.leader)} ${cardName(choice.deck.base)}`;
   const png=format==='PNG',res=await fetch(png?`${exportOrigin}/deck-image`:`${exportOrigin}/deck-export?format=${format.toLowerCase()}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...r.deck,metadata:{name},...(png?{title:name,layout:limited?'limited':'default'}:{})}),signal:AbortSignal.timeout(30000)});
   if(!res.ok)throw Error('Export is unavailable. Try again.');
   const blob=await res.blob();
   if(destination==='copy'&&!png)await navigator.clipboard.writeText(await blob.text());
   else{const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${name.replace(/[^a-zA-Z0-9 _-]/g,'').trim()||'deck'}.${png?'png':format==='JSON'?'json':format==='CSV'?'csv':'txt'}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
   setNote(`${format} ${destination==='copy'&&!png?'copied':'saved'}.`);
  }catch(e){setNote(e instanceof Error?e.message:'Export failed.');}
 }
 async function play(){
  if(!choice||!ready||busy)return;setBusy(true);setError('');
  const deckSource=choice.kind==='imported'?{source:choice.source,url:choice.url,name:choice.name}:choice.kind==='played'?{source:choice.deck.source,url:choice.deck.sourceUrl??undefined,name:choice.deck.name??undefined}:undefined;
  const input={contract,mode:opponent,anonymous,...(opponent==='ai'&&!invite?aiChoice?.input:{}),...(choice.kind==='limited'?{poolShareId:choice.deck.poolShareId}:{deck:exportOf(choice),deckSource}),...(invite?{invite}:{})};
  const key=JSON.stringify(input);if(request.current.key!==key)request.current={key,id:crypto.randomUUID()};
  try{
   await sharedCall({action:'play',...input,requestId:request.current.id});
   rememberSeat(choice.kind==='limited'?{name:choice.deck.name,leaderName:choice.deck.leaderName,baseName:choice.deck.baseName,set:choice.deck.setCode}:choice.kind==='played'?{leader:choice.deck.leader,base:choice.deck.base,format:choice.deck.format}:{leader:choice.deck.leader.id,base:choice.deck.base.id,format:contract.format==='eternal'?'eternal':'premier',name:choice.name});
   // The page moves on to the waiting screen at its own address (Lobby pushes it); joining an invite waits the same way.
   onStarted(invite?'private':opponent,contract);
  }
  catch(e){setError(e instanceof Error?e.message:'Could not start. Try again.');}
  finally{setBusy(false);}
 }

 // An invalid deck from a link is fixed where it lives: the CTA opens that deck on its site, in a new tab.
 const editUrl=!choice?undefined:choice.kind==='imported'?choice.url:choice.kind==='played'?choice.deck.sourceUrl??undefined:undefined;
 const editSite=editUrl&&/swuforge\.com/.test(editUrl)?'SWUForge':'its site';
 const problems=check&&!check.valid?check.message.split('\n').map(l=>l.trim()).filter(Boolean):[];
 const cta=!signedIn?null:!choice?'Choose a deck to play':!ready?(check?'Fix your deck to play':'Checking deck…'):invite?'Join private game':opponent==='queue'?'Join matchmaking':opponent==='private'?'Create invite':'Play vs AI';
 const status=!choice?null:check===undefined?<span className="ph-chip ph-chip-wait">Checking…</span>:check.valid?<span className="ph-valid" role="img" aria-label="Valid" title="Valid"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>:<span className="ph-chip ph-chip-bad">Not valid</span>;
 const fan=(n:number)=><PackFan n={n} ptp={ptp} set={contract.set||latest}/>;
 // Format tabs use the same art as the homepage queues: packs over their table, Premier's meta art, Eternal's leader.
 const formats:[Exclude<FormatKey,'chaos'>,string,ReactNode][]=([['draft','Draft'],['six','Sealed 6-pack'],['eight','Sealed 8-pack'],['premier','Premier'],['eternal','Eternal']] as const).map(([f,l])=>[f,l,<FormatArt format={f} ptp={ptp} set={contract.set||latest}/>]);
 const leader=choice?.kind==='played'?choice.deck.leader:choice?.kind==='imported'?choice.deck.leader.id:undefined;
 const base=choice?.kind==='played'?choice.deck.base:choice?.kind==='imported'?choice.deck.base.id:undefined;
 const draft=contract.limited==='draft';
 const pods=(shared?.pods??[]).filter(p=>!contract.set||p.set===contract.set);
 // Every public queue, busiest first, so players can pick the fastest path to a game.
 const queues=useMemo(()=>{const base:Contract={format:'premier',limited:'six',pool:contract.pool,set:''};const all:Contract[]=[{...base},{...base,format:'eternal'},...(sets[0]?(['draft','six','eight'] as const).map(l=>({...base,format:'limited',limited:l,set:sets[0]!.code} as Contract)):[]),{...base,format:'limited',limited:'chaos'},...(shared?.queues??[]).filter(q=>q.contract.format==='limited'&&q.waiting>0).map(q=>q.contract)];return all.filter((c,i)=>all.findIndex(o=>sameQueue(o,c))===i).map(c=>({c,n:waitingFor(shared,c),decks:c.format==='limited'&&limitedDecks?limitedDecks.filter(d=>fits(c,d)).length:undefined})).sort((a,b)=>b.n-a.n);},[shared,sets,contract.pool,limitedDecks]);
 const queueName=(c:Contract)=>c.format==='limited'&&(c.limited==='six'||c.limited==='eight')?`${formatLabel(c)} ${c.limited==='eight'?8:6}-pack`:formatLabel(c);
 const pickQueue=(c:Contract)=>switchTo({...contract,format:c.format,limited:c.format==='limited'?c.limited:contract.limited,set:c.format==='limited'?c.set:contract.set});
 // Rough wait from how many are already waiting: someone waiting means a near-instant pairing.
 const eta=(n:number)=>n?`~${Math.max(1,Math.round(4/n))} min`:'—';
 const isNew=(c?:Choice)=>fresh&&!!c&&!!deckKey&&(c.kind==='limited'?c.deck.poolShareId:c.kind==='played'?c.deck.key:'')===deckKey;
 const deckTiles:Choice[]=limited?limitedList.map(d=>({kind:'limited',deck:d}) as Choice):constructedList;
 const searchText=(c:Choice)=>(c.kind==='limited'?[c.deck.name,c.deck.leaderName,c.deck.baseName,c.deck.setCode]:c.kind==='played'?[c.deck.name,cardName(c.deck.leader),cardName(c.deck.base)]:[c.name]).join(' ').toLowerCase();
 // Past three decks, the last slot opens the full, searchable list.
 const more=deckTiles.length>3;
 const shownTiles=allDecks?deckTiles.filter(c=>searchText(c).includes(query.trim().toLowerCase())):deckTiles.slice(0,more?2:3);
 // Other builds from the same PTP pool.
 const builds=choice?.kind==='limited'?(limitedDecks??[]).filter(d=>d.hasDeck!==false&&d.poolShareId!==choice.deck.poolShareId&&(d.poolRootShareId??d.poolShareId)===(choice.deck.poolRootShareId??choice.deck.poolShareId)):[];
 const loading=limited?limitedDecks===undefined:played===undefined;
 const artFor=(c:Choice,className?:string)=>c.kind==='limited'?<DeckArt className={className} leaderName={c.deck.leaderName} baseName={c.deck.baseName} set={c.deck.setCode}/>:c.kind==='played'?<DeckArt className={className} leader={c.deck.leader} base={c.deck.base}/>:<DeckArt className={className} leader={c.deck.leader.id} base={c.deck.base.id}/>;
 const nameFor=(c:Choice)=>c.kind==='limited'?<b>{c.deck.name}</b>:c.kind==='imported'?<b>{c.name}</b>:<Archetype leader={c.deck.leader} base={c.deck.base} format={c.deck.format}/>;
 const meta=!choice?'':choice.kind==='limited'?[choice.deck.leaderName,choice.deck.baseName,`${choice.deck.setCode} ${choice.deck.poolType==='draft'?'Draft':`Sealed ${choice.deck.packCount??''}`.trim()}`,choice.deck.mainDeckCount?`${choice.deck.mainDeckCount} cards`:''].filter(Boolean).join(' · ')
  :[leader&&cardName(leader),base&&cardName(base),check?.valid?`${check.main} cards${check.side?` + ${check.side} sideboard`:''}`:''].filter(Boolean).join(' · ');
 // Leebo plays one of his own decks (or opens his own pool), the same deck, or any of your decks ready for this format.
 type AiOption={key:string;name:ReactNode;art:ReactNode;ok:boolean;input?:Record<string,unknown>};
 const leebo:AiOption[]=limited?[{key:'pool',name:<b>Leebo's pool</b>,art:<Crop src={setArt(ptp,contract.set||latest)} position="50% 40%"/>,ok:true,input:{opponentPool:'leebo'}}]
  :(shared?.aiDecks??[]).filter(d=>d.formats.includes(contract.format as 'premier'|'eternal')).map(d=>({key:`preset:${d.id}`,name:<b>{d.name}</b>,art:<DeckArt leader={d.leader} base={d.base}/>,ok:true,input:{opponentPreset:d.id}}));
 const same:AiOption[]=choice?[{key:'same',name:<b>Same deck</b>,art:artFor(choice),ok:true}]:[];
 const yours:AiOption[]=deckTiles.filter(c=>!choice||keyOf(c)!==keyOf(choice)).map(c=>{const v=checks[checkKey(c)];return {key:keyOf(c),name:nameFor(c),art:artFor(c),ok:v?.valid===true,input:c.kind==='limited'?{opponentPoolShareId:c.deck.poolShareId}:{opponentDeck:exportOf(c)}};});
 const aiOptions=[...leebo.slice(0,4),...same,...leebo.slice(4),...yours];
 const aiShown=aiAll?aiOptions:aiOptions.filter((o,i)=>i<5||o.key===aiDeck);
 const aiChoice=aiOptions.find(o=>o.key===aiDeck&&o.ok);
 // Default to Leebo's strongest deck for this format; keep any valid pick.
 const aiDefault=leebo[0]?.key,aiValid=!!aiChoice;
 useEffect(()=>{if(!aiValid&&aiDefault)setAiDeck(aiDefault);},[aiValid,aiDefault]);
 const buildLink=limited?(draft?`${ptp}/draft/setup`:contract.limited==='chaos'?`${ptp}/sealed`:`${ptp}/pools/new?set=${encodeURIComponent(contract.set)}&packs=${contract.limited==='eight'?8:6}`):'';
 // Signed out, logging in (your decks) and starting fresh (packs or a draft, no account needed) are separate choices, each saying what it does.
 const startLabel=draft?'Draft a deck':contract.limited==='chaos'?'Open packs':`Open ${contract.limited==='eight'?8:6} packs`;
 const table=startTable[formatKey],packs=draft?3:contract.limited==='eight'?8:6;
 // No deck of this kind yet: the whole panel starts one, over the format's own table.
 const startTile=<a className="ph-deck-main ph-deck-empty ph-deck-start" href={buildLink}>{table&&<Crop src={artworkThumbnailUrl(table)} position="50% 50%"/>}{fan(packs)}<span className="ph-deck-empty-label"><span className="ph-deck-empty-plus" aria-hidden="true">+</span><span className="ph-deck-empty-sub">{startLabel}</span></span></a>;
 const signedOutStart=<>{startTile}
  <p className="ph-deck-or">or <a className="ph-btn ph-sm ph-discord" href={loginUrl}><DiscordMark/>Login with Discord</a> to use previous decks</p></>;
 // Beside your decks, the same start in miniature; finishing the deck returns here with it selected.
 const newPoolTile=<a className="ph-import-tile ph-new-pool" href={buildLink}>{table&&<Crop src={artworkThumbnailUrl(table)} position="50% 50%"/>}{fan(packs)}<span className="ph-new-pool-label">{draft?'Draft a New Pool':'Open a New Pool'}</span></a>;
 const loginTile=(label:string)=><a className="ph-deck-main ph-deck-empty ph-deck-login" href={loginUrl}><Crop src={panelArt.src} position={limited?'22% 38%':panelArt.position}/><span className="ph-deck-empty-label"><span className="ph-deck-login-mark" aria-hidden="true"><DiscordMark/></span><span className="ph-deck-empty-sub">{label}</span></span></a>;
 if(invite&&!signedIn)return <section className="ph-play" aria-label="Private game"><div className="ph-invite-gone"><h2>You're invited to a private game</h2><p>Log in to see your opponent and take your seat.</p><a className="ph-btn ph-lg ph-discord" href={loginUrl}><DiscordMark/>Login with Discord</a></div></section>;
 if(invite&&inviteView&&inviteView.status!=='waiting'){
  const [head,body]=inviteView.status==='used'?['This invite was already used','Someone has already taken the other seat. Ask your friend for a new link.']:inviteView.status==='expired'?['This invite has expired','Invites last an hour. Ask your friend for a new link.']:inviteView.status==='outdated'?['This invite is out of date','Ask your friend to create a new invite.']:['This invite link is not valid','Check the link, or ask your friend to send it again.'];
  return <section className="ph-play" aria-label="Private game"><div className="ph-invite-gone" role="alert"><h2>{head}</h2><p>{body}</p><a className="ph-btn ph-go" href={playPath(premier)}>Go to Play</a></div></section>;
 }
 const host=invite&&inviteView?.status==='waiting'?inviteView.host:undefined;
 return <section className="ph-play-page" aria-label="Play">
  <header className="ph-play-head">
   {invite?<><span className="ph-format-pill">{formatLabel(contract)}</span><span className="ph-private-status" role="status">{!inviteView?'Opening the invite…':!signedIn?'Your friend is ready · Log in to take your seat':!ready?'Your friend is ready · Choose your deck':'Both ready · Join to start'}</span></>:<div className="ph-formats" role="group" aria-label="Format">{formats.map(([f,l,a])=><button key={f} className="ph-art-tile" aria-pressed={formatKey===f} disabled={busy} onClick={()=>chooseFormat(f)}>{a}<span>{l.includes(' ')?<>{l.slice(0,l.lastIndexOf(' '))} <span className="ph-nowrap">{l.slice(l.lastIndexOf(' ')+1)}</span></>:l}</span></button>)}</div>}
  </header>
  {limited&&!invite&&<a className="ph-link" href={choice?.kind==='limited'?`/pools/${encodeURIComponent(choice.deck.poolShareId)}/play`:'/play?library=limited'}>Saved decks and tournaments</a>}
  {limited&&!invite&&<div className="ph-limited-options">
   {contract.limited!=='chaos'&&<SetCarousel>{sets.map((s,i)=><button key={s.code} className={`ph-art-tile${i===0?' is-current':''}`} aria-pressed={contract.set===s.code} disabled={busy} onClick={()=>{setChoice(undefined);setContract(c=>({...c,set:s.code}));}}><Crop src={setArt(ptp,s.code)} position="50% 40%"/><span>{i===0?s.name:s.code}</span></button>)}</SetCarousel>}
  </div>}
  <div className="ph-play-grid">
   <section className="ph-modal-deck" aria-label="Your deck">
    {invite&&<span className="ph-kicker ph-seat-kicker">You</span>}
    {!signedIn?(invite?loginTile('Log in to join'):limited?signedOutStart:loginTile('Log in to play'))
    :!loading&&!choice&&deckTiles.length===0?(limited?startTile
     :<button type="button" className="ph-deck-main ph-deck-empty" aria-label="Import Deck" aria-expanded={importOpen} aria-controls="ph-deck-imports" onClick={()=>{setImportOpen(open=>!open);setPasteError('');}}><Crop src={panelArt.src} position={panelArt.position}/><span className="ph-deck-empty-label"><span className="ph-deck-empty-plus" aria-hidden="true">+</span><span className="ph-deck-empty-sub">Import your first deck</span></span></button>)
    :<div className="ph-deck-main">
     {choice?artFor(choice):<Crop src={panelArt.src} position={panelArt.position}/>}
     <div className="ph-deck-copy">
      <span className="ph-deck-title">{choice?nameFor(choice):loading?<b>Your deck</b>:<b>No deck</b>}{meta&&<span className="ph-deck-meta">{meta}</span>}</span>
      <span className="ph-deck-actions">{isNew(choice)&&<span className="ph-chip ph-chip-new">New</span>}{status}{builds.length>0&&<DeckMenu label="⋯" name="Deck menu" open={menu} onToggle={setMenu}>
       {builds.map(d=><button key={d.poolShareId} type="button" role="menuitem" onClick={()=>{setChoice({kind:'limited',deck:d});setMenu(false);}}>{d.name}</button>)}
      </DeckMenu>}</span>
     </div>
     {choice&&<span className="ph-deck-tools">
      <button type="button" className="ph-icon-btn" aria-label="View decklist" title="View decklist" aria-haspopup="dialog" onClick={()=>{setShare(false);setViewing(true);}}><EyeGlyph/></button>
      <DeckMenu className="ph-share" icon label={<ShareGlyph/>} name="Share" open={share} onToggle={setShare}>
       {(['copy','save'] as const).map(d=><div key={d} className="ph-menu-row"><span>{d==='copy'?'Copy':'Save'}</span>{(['JSON','CSV','Melee'] as const).map(f=><button key={f} type="button" role="menuitem" onClick={()=>void exportDeck(d,f)}>{f}</button>)}{d==='save'&&<button type="button" role="menuitem" onClick={()=>void exportDeck('save','PNG')}>PNG</button>}</div>)}
      </DeckMenu>
     </span>}
    </div>}
    {viewing&&choice&&<DeckView cacheKey={cardsKey(choice)} load={cardsLoad(choice)} title={nameFor(choice)} art={artFor(choice)} sub={meta} pool={choice.kind==='limited'} ptp={ptp} onClose={()=>setViewing(false)}/>}
    {signedIn&&allDecks&&<input className="ph-deck-search" type="search" aria-label="Search decks" placeholder="Search" value={query} onChange={e=>setQuery(e.target.value)}/>}
    {signedIn&&<div className={`ph-deck-tiles${allDecks?' is-all':''}${more?' has-more':''}`}>
     {loading?<ContentSkeleton/>:shownTiles.map(c=><button key={keyOf(c)} className="ph-deck-row ph-art-tile" aria-pressed={!!choice&&keyOf(choice)===keyOf(c)} onClick={()=>setChoice(c)}>{artFor(c)}<span>{nameFor(c)}</span></button>)}
     {!loading&&more&&<button type="button" className="ph-import-tile" aria-expanded={allDecks} onClick={()=>{setAllDecks(v=>!v);setQuery('');}}>{allDecks?'Less':'More'}</button>}
     {deckTiles.length===0&&!loading&&!choice?null:limited?newPoolTile
     :<button type="button" className="ph-import-tile" aria-label="Import Deck" aria-expanded={importOpen} aria-controls="ph-deck-imports" onClick={()=>{setImportOpen(open=>!open);setPasteError('');}}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Import</button>}
    </div>}
    {signedIn&&!limited&&<div id="ph-deck-imports" className={`ph-deck-imports${importOpen?' is-open':''}`} aria-hidden={!importOpen}>
     <form className="ph-paste-box" onSubmit={e=>{e.preventDefault();void readPaste('url');}}>
      <label htmlFor="ph-deck-url">SWUForge URL</label>
      <div className="ph-url-row"><input id="ph-deck-url" type="url" placeholder="https://swuforge.com/decks/…" value={urlText} disabled={busy} onChange={e=>{setUrlText(e.target.value);setPasteError('');}}/><button className="ph-btn ph-sm ph-go" disabled={busy||!urlText.trim()}>Import</button></div>
     </form>
     <div className="ph-import-or">OR</div>
     <form className="ph-paste-box" onSubmit={e=>{e.preventDefault();void readPaste('json');}}>
      <label htmlFor="ph-deck-json">Paste JSON</label>
      <textarea id="ph-deck-json" aria-label="Deck JSON" rows={5} maxLength={32000} placeholder="Deck JSON" value={jsonText} disabled={busy} onChange={e=>{setJsonText(e.target.value);setPasteError('');}}/>
      <button className="ph-btn ph-sm ph-go" disabled={busy||!jsonText.trim()}>Use JSON</button>
     </form>
    </div>}
    {note&&<p className="ph-sub" role="status">{note}</p>}
    {pasteError&&<p className="ph-problem" role="alert">{pasteError}</p>}
    {problems.length>0&&<div className="ph-deck-problems" role="alert" aria-label="Deck problems"><b>Not valid for {formatLabel(contract)}</b><ul>{problems.map(p=><li key={p}>{p}</li>)}</ul></div>}
   </section>
   <section className="ph-modal-right" aria-label="Opponent">
    {draft&&limited&&!invite&&<div className="ph-pods" role="group" aria-label="Active Pods">
     <div className="ph-row-between"><b>Active Pods</b><a className="ph-link" href={`${ptp}/draft`}>Create a pod</a></div>
     {pods.map(p=><div className="ph-pod" key={p.id}><span><b>{p.name}</b><span className="ph-seats" role="img" aria-label={`${p.players} of ${p.capacity} seats`}>{Array.from({length:Math.min(p.capacity,8)},(_,i)=><i key={i} data-filled={i<p.players}/>)}</span></span><a className="ph-btn ph-sm" href={`${ptp}/draft/${encodeURIComponent(p.id)}`}>Join</a></div>)}
    </div>}
    {invite?<SeatBanner label="Host" name={host?.name??'Your friend'} sub={host?.deckName??(host?.leader&&host.base?<Archetype leader={host.leader} base={host.base} format={contract.format==='eternal'?'eternal':contract.format==='limited'?'limited':'premier'}/>:undefined)} leader={host?.leader} base={host?.base} ready={!!host}/>
    :<OpponentSelector value={opponent} onChange={setOpponent} invite={false} disabled={busy} locked={!signedIn}/>}
    {opponent==='ai'&&!invite&&signedIn&&<div className="ph-ai-decks" role="group" aria-label="Leebo's deck">
     <span className="ph-kicker">Leebo's deck</span>
     <div className={`ph-deck-tiles${aiAll?' is-all':''}`}>{aiShown.map(o=><button key={o.key} className="ph-deck-row ph-art-tile" aria-pressed={aiDeck===o.key} disabled={busy||!o.ok} onClick={()=>setAiDeck(o.key)}>{o.art}<span>{o.name}</span></button>)}
      {aiOptions.length>aiShown.length||aiAll?<button type="button" className="ph-import-tile" aria-expanded={aiAll} onClick={()=>setAiAll(v=>!v)}>{aiAll?'Less':'More'}</button>:null}</div>
    </div>}
    {!invite&&(shared?.pools.length??0)>1&&<div className="ph-seg ph-pool" role="group" aria-label="Card pool">{shared!.pools.map(p=><button key={p.id} aria-pressed={contract.pool===p.id} disabled={busy} onClick={()=>setContract(c=>({...c,pool:p.id as Contract['pool']}))}>{p.name}</button>)}</div>}
    {!invite&&queues.some(q=>q.n>0)&&<div className="ph-queues" role="group" aria-label="Queues">{queues.filter(q=>q.n>0).map(({c,n,decks})=><button key={`${c.format}:${c.limited}:${c.set}`} aria-pressed={sameQueue(contract,c)} disabled={busy} onClick={()=>pickQueue(c)}><span className="ph-queue-name">{queueName(c)}{decks!==undefined&&<small>{decks} {decks===1?'deck':'decks'}</small>}</span><span className="ph-queue-count"><i className={`lobby-live-dot${n?'':' is-idle'}`}/>{n}</span><span className="ph-queue-eta">{eta(n)}</span></button>)}</div>}
    {opponent!=='ai'&&<button type="button" role="switch" aria-checked={anonymous} className="lobby-switch ph-hide-name" disabled={!signedIn||busy} onClick={()=>setAnonymous(!anonymous)}><i/>Hide my name</button>}
    {error&&<ReservationError message={error} onCleared={()=>{setError('');request.current={key:'',id:''};void play();}}/>}
    <div className="ph-cta-bar">{signedIn&&choice&&check&&!check.valid&&editUrl?<a className="ph-btn ph-lg ph-block ph-cta ph-cta-fix" href={editUrl} target="_blank" rel="noopener noreferrer">Fix your deck on {editSite}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg></a>:signedIn?<button className="ph-btn ph-go ph-lg ph-block ph-cta" disabled={!ready||busy||paused||!shared?.enabled||(opponent==='ai'&&!invite&&!aiChoice)} onClick={()=>void play()}><ModeIcon mode={opponent}/>{busy?'Starting…':paused?'Maintenance':!shared?.enabled?'New games are paused':cta}</button>:<a className="ph-btn ph-lg ph-block ph-cta ph-discord" href={loginUrl}><DiscordMark/>Login with Discord</a>}</div>
   </section>
  </div>
 </section>;
}

/** A banner button that opens a small menu: Share (exports) and ⋯ (other builds of this pool). */
/** Outline glyphs on the 24-unit grid the header icons use, so the banner's eye and share are one pair. */
const EyeGlyph=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>;
const ShareGlyph=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V3.5M7.5 8 12 3.5 16.5 8"/><path d="M5 12v7.5h14V12"/></svg>;
function DeckMenu({label,name,className='',icon=false,open,onToggle,children}:{label:ReactNode;name:string;className?:string;icon?:boolean;open:boolean;onToggle:(v:boolean)=>void;children:ReactNode}){
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(!open)return;const close=(e:MouseEvent)=>{if(!ref.current?.contains(e.target as Node))onToggle(false);};const esc=(e:KeyboardEvent)=>{if(e.key==='Escape')onToggle(false);};document.addEventListener('mousedown',close);document.addEventListener('keydown',esc);return()=>{document.removeEventListener('mousedown',close);document.removeEventListener('keydown',esc);};},[open,onToggle]);
 return <div className={`ph-deck-menu${className?` ${className}`:''}`} ref={ref}>
  <button type="button" className={icon?'ph-icon-btn':'ph-btn ph-sm'} aria-label={name} title={icon?name:undefined} aria-haspopup="menu" aria-expanded={open} onClick={()=>onToggle(!open)}>{label}</button>
  {open&&<div className="ph-menu" role="menu" aria-label={name}>{children}</div>}
 </div>;
}

/** One row of set art that scrolls sideways with snap; the arrows page through it. */
function SetCarousel({children}:{children:ReactNode}){
 const track=useRef<HTMLDivElement>(null),[ends,setEnds]=useState({start:true,end:false});
 const measure=useCallback(()=>{const t=track.current;if(t)setEnds({start:t.scrollLeft<=2,end:t.scrollLeft+t.clientWidth>=t.scrollWidth-2});},[]);
 useEffect(()=>{measure();window.addEventListener('resize',measure);return()=>window.removeEventListener('resize',measure);},[measure,children]);
 const page=(dir:1|-1)=>track.current?.scrollBy({left:dir*track.current.clientWidth*0.8,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
 return <div className="ph-carousel">
  <button type="button" className="ph-carousel-arrow" aria-label="Previous sets" disabled={ends.start} onClick={()=>page(-1)}>‹</button>
  <div className="ph-set-tiles" role="group" aria-label="Set" ref={track} onScroll={measure}>{children}</div>
  <button type="button" className="ph-carousel-arrow" aria-label="Next sets" disabled={ends.end} onClick={()=>page(1)}>›</button>
 </div>;
}

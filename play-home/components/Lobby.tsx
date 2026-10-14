import {GameTransition} from '@purrgil/ui/components/GameTransition';
import {ResumeGame} from '../home/ResumeGame';
import {ContentSkeleton} from '@purrgil/ui/components/ContentSkeleton';
import {ModeIcon} from '@purrgil/ui/components/ModeIcon';
import {ReleaseNotesButton} from '@purrgil/ui/components/ReleaseNotes';
import {DiscordMark} from '@purrgil/ui/components/DiscordMark';
import {ThemesModal} from '@purrgil/ui/components/ThemesButton';
import {LobbyStats} from './LobbyStats';
import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {Settings} from '@purrgil/ui/components/Settings';
import {useTableTheme} from '@purrgil/ui/preferences/use-table-theme';
import {artworkThumbnailUrl} from '@purrgil/ui/artwork';
import {themeById,themeProperties} from '@purrgil/ui/preferences/theme-contract';
import {useTablePreferences,writePreferences} from '@purrgil/ui/preferences/table';
import {lobbyRequest,type LobbyState,type LobbyGame,type PlayMode} from '@purrgil/ui/transport/lobby';
import '../lobby.css';
import '../home/home.css';
import {LobbyAccount} from './LobbyAccount';
import {HomePage} from '../home/HomePage';
import {PlayModal} from '../home/PlayModal';
import {LiveStrip} from '../home/LiveStrip';
import {DecksAndHistory} from '../home/DecksAndHistory';
import {isPlayPath,playBase,playPath,sitePath,ptpOriginOf,limitedContract,premier,sharedCall,signedInOf,useShared,playerFacingError,type Contract,type LimitedDeck} from '../home/shared';

function GameList({games}:{games:LobbyGame[]}){
 return <ul className="lobby-games">{games.map(game=><li key={game.id} ><div className="lobby-game-details"><strong>{game.players.join(' · ')}</strong><span>{game.mode&&<ModeIcon mode={game.mode}/>} {game.format==='Constructed'?'Premier':game.format} · In progress</span></div><a className="lobby-watch-button" href={game.url}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10.5" stroke="currentColor" strokeWidth="1.5"/><path d="M9.75 8.25v7.5l6-3.75-6-3.75z" fill="currentColor"/></svg>Watch</a></li>)}</ul>;
}
type View='home'|'spectate'|'history'|'decks'|'stats';
/** The Play page's ?format= covers constructed and limited alike. */
// ?set=CODE and ?limited=eight|chaos pick the set, the 8-pack pool or Chaos; otherwise the newest set and 6 packs.
const contractFor=(f:string|null,q:URLSearchParams=new URLSearchParams()):Contract=>{
 const set=(q.get('set')??'').toUpperCase().replace(/[^A-Z0-9]/g,''),l=q.get('limited');
 if(f==='eternal')return {...premier,format:'eternal'};
 if(f==='draft'||f==='limited'&&l==='draft')return {...premier,format:'limited',limited:'draft',set};
 if(f==='sealed'||f==='chaos'||f==='limited')return {...premier,format:'limited',limited:l==='chaos'||f==='chaos'?'chaos':l==='eight'?'eight':'six',set:l==='chaos'||f==='chaos'?'':set};
 return premier;
};
const viewOf=(location:Pick<Location,'pathname'|'hash'>):View=>{const p=location.pathname;return p.startsWith('/profile')||p.startsWith('/lobby/stats')||/^\/me\/?$/.test(p)?'stats':p.includes('/spectate')||/^\/watch\/?$/.test(p)||location.hash==='#spectate'?'spectate':p.includes('/history')||location.hash==='#history'?'history':p.includes('/decks')?'decks':'home';};

export default function Lobby({ptpHome=true,initialUrl='/'}:{ptpHome?:boolean;initialUrl?:string}){
 const externalHeader=ptpHome&&typeof document!=='undefined'&&document.body.hasAttribute('data-site-theme');
 const [,setHistoryRevision]=useState(0);
 const pageLocation=typeof location==='undefined'?new URL(initialUrl,'https://www.protectthepod.com'):location;
 const [state,setState]=useState<LobbyState>();const [error,setError]=useState('');
 const view=viewOf(pageLocation);
 const [settings,setSettings]=useState(!externalHeader&&new URLSearchParams(pageLocation.search).get('settings')==='account');
 const [themePicker,setThemePicker]=useState(false);
 const [preferences,setPreferences]=useTablePreferences();const refreshSequence=useRef(0);
 const {themes,error:themeError}=useTableTheme(preferences.theme);
 const theme=themes.length?themeById(themes,preferences.theme):undefined;
 const invite=new URLSearchParams(pageLocation.search).get('invite')??undefined;
 // PTP's "Ready to Play" lands here with the deck it just saved.
 const readyPool=new URLSearchParams(pageLocation.search).get('pool')??undefined;
 // Matchmaking, a private game's waiting room or a vs AI game starting: Play's address with ?waiting=<mode>, never "/",
 // so the header shows the page title and Back returns to Play setup.
 const waiting=new URLSearchParams(pageLocation.search).get('waiting')??undefined;
 const shared=useShared();
 const [play,setPlay]=useState<{contract:Contract;deckKey?:string;fresh?:boolean;invite?:string}|null>(()=>invite?{contract:premier,invite}:isPlayPath(pageLocation.pathname)&&!waiting||readyPool?((typeof history==='undefined'?undefined:history.state?.ptpPlay)??{contract:contractFor(new URLSearchParams(pageLocation.search).get('format'),new URLSearchParams(pageLocation.search)),...(readyPool?{deckKey:readyPool,fresh:true}:{})}):null);
 // Play has its own address: a ?pool or ?invite link that lands elsewhere moves to it, so the header shows Play, not the homepage.
 useEffect(()=>{if((invite||readyPool)&&!isPlayPath(location.pathname))history.replaceState({...history.state},'',`${playBase()}${location.search}`);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 const refresh=async(signal?:AbortSignal)=>{const sequence=++refreshSequence.current;try{const next=await lobbyRequest<LobbyState>('',undefined,signal);if(sequence===refreshSequence.current){setState({...next,history:next.history.filter(game=>game.status==='complete')});setError('');}}catch(e){if(!signal?.aborted&&sequence===refreshSequence.current)setError(playerFacingError(e,"Couldn't reach the game server. Try again in a moment."));}};
 const awaitingGame=Boolean(state?.queue||state?.active?.status==='waiting'||state?.active?.status==='starting');
 useEffect(()=>{const controller=new AbortController();void refresh(controller.signal);const timer=setInterval(()=>{void refresh(controller.signal);},awaitingGame?1000:10000);return()=>{controller.abort();clearInterval(timer);};},[awaitingGame]);
 // Only a game this page queued or hosted opens on its own; an older game offers Rejoin instead.
 const [devLaunch,setDevLaunch]=useState<{id:string;url:string}>();
 const devMatch=shared.state?.devSession&&shared.state.active?.status==='in_progress'?shared.state.active.id:undefined;
 useEffect(()=>{if(!devMatch)return;let live=true;void sharedCall<{launchUrl:string}>({action:'launch',matchId:devMatch}).then(r=>{if(live)setDevLaunch({id:devMatch,url:r.launchUrl});}).catch(e=>{if(live)setError(playerFacingError(e,"Couldn't open that game. Try again in a moment."));});return()=>{live=false;};},[devMatch]);
 const gameUrl=shared.state?.devSession?(devLaunch?.id===devMatch?devLaunch?.url:undefined):state?.user&&state.active?.status==='in_progress'?state.active.url:undefined;
 const sawReservation=useRef(false);
 if(shared.state?.queue||shared.state?.active&&(waiting||shared.state.devSession||shared.state.active.status!=='in_progress'))sawReservation.current=true;
 // A private game shows its filled seats for a moment before the table opens; other games open at once.
 const launching=!!gameUrl&&sawReservation.current&&shared.state?.active?.mode==='private';
 useEffect(()=>{if(!gameUrl||!sawReservation.current)return;if(launching)void shared.refresh();const t=setTimeout(()=>location.assign(gameUrl),launching?2500:0);return()=>clearTimeout(t);},[gameUrl,launching]);// eslint-disable-line react-hooks/exhaustive-deps
 const loginUrl=`/api/auth/signin/discord?return_to=${encodeURIComponent(pageLocation.pathname+pageLocation.search+pageLocation.hash)}`;
 useEffect(()=>{
  if(!readyPool||!shared.state)return;
  if(!shared.state.signedIn){setPlay(p=>p??{contract:premier});return;}
  let live=true;
  void sharedCall<{decks:LimitedDeck[]}>({action:'decks',poolShareId:readyPool}).then(r=>{
   if(!live)return;
   const deck=r.decks.find(d=>d.poolShareId===readyPool);
   if(deck){const next={contract:limitedContract(deck),deckKey:deck.poolShareId,fresh:true};window.history.replaceState({...history.state,ptpPlay:next},'',playPath(next.contract,{pool:deck.poolShareId}));setPlay(next);}else location.assign(`${sitePath('decks')}#limited`);
  }).catch(()=>{if(live)location.assign(`${sitePath('decks')}#limited`);});
  return()=>{live=false;};
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[readyPool,shared.state?.signedIn,!!shared.state]);
 const ptp=ptpOriginOf(shared.state);
 // Page titles live in the header, centred; the logo goes home.
 const [libraryTab,setLibraryTab]=useState<'decks'|'history'>();
 const reserved=shared.state?.queue?'Matchmaking':shared.state?.active&&shared.state.active.status!=='in_progress'?(shared.state.active.mode==='private'?'Private game':'Matchmaking'):undefined;
 // While waiting, the seats refresh every second, so the other player's seat fills in as soon as they join.
 const waitingNow=!!reserved;
 useEffect(()=>{if(!waitingNow)return;const t=setInterval(()=>void shared.refresh(),1000);return()=>clearInterval(t);},[waitingNow]);// eslint-disable-line react-hooks/exhaustive-deps
 const title=play?(play.invite?'Private game':'Play'):view==='stats'?'Stats':view==='decks'||view==='history'?((libraryTab??view)==='decks'?'Decks and Pools':'History'):view==='spectate'?'Watch':reserved;
 const openPlay=(contract:Contract,deckKey?:string)=>{const next={contract,deckKey};history.pushState({...history.state,ptpPlay:next},'',playPath(contract));setPlay(next);};
 const closePlay=()=>{history.pushState({...history.state,ptpPlay:null},'',ptpHome?'/':'/lobby');setPlay(null);};
 const started=useRef(false);
 const matchReady=sawReservation.current&&!!(gameUrl||shared.state?.active&&['starting','in_progress'].includes(shared.state.active.status));
 const loadingGame=!play&&(waiting==='ai'||matchReady||!!waiting&&(!shared.state||started.current&&!shared.state.queue&&!shared.state.active));
 const matched=waiting!=='ai'&&shared.state?.active?.mode!=='ai'&&matchReady;
 const launchError=error||shared.error||shared.state?.active?.error;
 const startPlay=(mode:string,contract:Contract)=>{started.current=true;sawReservation.current=true;history.pushState({...history.state,ptpPlay:null},'',playPath(contract,{waiting:mode}));setPlay(null);void shared.refresh();void refresh();};
 // Once the wait is over (cancelled, or a stale link), the waiting address gives way to the homepage's.
 const seenWait=useRef(false);if(reserved)seenWait.current=true;
 useEffect(()=>{if(!waiting||play||!shared.state||reserved)return;if(gameUrl||shared.state.active||waiting==='ai'&&started.current)return;if(started.current&&!seenWait.current)return;history.replaceState({...history.state},'',ptpHome?'/':'/lobby');setHistoryRevision(n=>n+1);},[waiting,play,shared.state,reserved,ptpHome]);
 useEffect(()=>{const back=()=>{const query=new URLSearchParams(location.search);setHistoryRevision(n=>n+1);setPlay(isPlayPath(location.pathname)&&!query.get('waiting')?(history.state?.ptpPlay??{contract:contractFor(query.get('format'),query)}):null);};window.addEventListener('popstate',back);return()=>window.removeEventListener('popstate',back);},[]);
 const themeChoices=<>{themeError&&<p role="alert">{themeError}</p>}<div className="lobby-theme-options">{themes.map(t=><button key={t.id} aria-pressed={preferences.theme===t.id} onClick={()=>{setPreferences(writePreferences({...preferences,theme:t.id}));}}><img src={artworkThumbnailUrl(t.background.image)} alt="" loading="lazy"/><span>{t.name}</span></button>)}</div></>;
 return <div className="app table-themed lobby-app ph-shell" data-theme={theme?.id??'purrgil'} style={theme?themeProperties(theme) as CSSProperties:undefined}>
  {!externalHeader&&<header className="lobby-header"><div className="lobby-brand"><a href={ptpHome?'/':'/lobby'} aria-label={ptpHome?'Protect the Pod home':'Purrgil home'}><img src={ptpHome?'/ptp_logo400.png':'/assets/purrgil-logo.png'} alt={ptpHome?'Protect the Pod':'Purrgil'}/></a>{!ptpHome&&<a className="lobby-attribution" href="https://www.protectthepod.com/" aria-label="by Protect the Pod"><span>by</span><strong>Protect the Pod</strong></a>}</div>{title&&<h1 className="lobby-header-title">{title}</h1>}<nav aria-label="Lobby"><ReleaseNotesButton brand={ptpHome?'Protect the Pod':'Purrgil'}/><button className="header-icon" aria-label="Themes" title="Themes" onClick={()=>setThemePicker(true)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18h1.2a2 2 0 0 0 1.5-3.3 1.5 1.5 0 0 1 1.1-2.5H18a3 3 0 0 0 3-3C21 7 17 3 12 3Z"/><circle cx="7.5" cy="10" r=".9"/><circle cx="10.5" cy="6.8" r=".9"/><circle cx="15" cy="7.5" r=".9"/></svg></button><button className="header-icon" aria-label="Settings" title="Settings" onClick={()=>setSettings(true)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 3-.6 2.2-2 .9-2-.6L2.5 9.7l1.6 1.6v2.3l-1.6 1.6 2.4 4.2 2-.6 2 .9.6 2.3h5l.6-2.3 2-.9 2 .6 2.4-4.2-1.6-1.6v-2.3l1.6-1.6-2.4-4.2-2 .6-2-.9-.6-2.2z"/><circle cx="12" cy="12.5" r="3.2"/></svg></button>{state?.user?<LobbyAccount user={state.user}/>:<a className="lobby-login" href={loginUrl}><DiscordMark/>Log in with Discord</a>}</nav></header>}
  <main className="lobby-main ph-main">
   {externalHeader&&title&&<h1 className="ph-page-title" data-site-title="shell">{title}</h1>}
   {view!=='home'&&view!=='stats'&&gameUrl&&!sawReservation.current&&state?.active&&<ResumeGame game={state.active}/>}
   {error&&view!=='home'&&<p role="alert" className="lobby-notice">{error}<button onClick={()=>void refresh()}>Retry</button></p>}
   {loadingGame?<GameTransition matched={matched} error={launchError} onRetry={()=>{void refresh();void shared.refresh();}}/>:play?<PlayModal key={`${play.contract.format}:${play.contract.limited}:${play.contract.set}:${play.deckKey??''}:${play.invite??''}`} contract={play.contract} deckKey={play.deckKey} fresh={play.fresh} invite={play.invite} shared={shared.state} loginUrl={loginUrl} onClose={closePlay} onStarted={startPlay}/>:view==='stats'?<LobbyStats state={state} refresh={refresh}/>
   :view==='home'?<HomePage ptpHome={ptpHome} launching={launching} resumeGame={gameUrl&&!sawReservation.current?state?.active??undefined:undefined} lobby={state} shared={shared.state} sharedError={shared.error} onPlay={openPlay} onLimited={flow=>location.assign(`${ptp}/${flow}`)} refreshShared={()=>shared.refresh()}/>
   :view==='decks'||view==='history'?<DecksAndHistory tab={view} onTab={setLibraryTab} shared={shared.state} history={state?.history?.filter(g=>g.status==='complete')} signedIn={!!state?.user||signedInOf(shared.state)} loginUrl={loginUrl} ptp={ptp} onPlay={openPlay}/>
   :<section className="ph-page" aria-label="Watch"><div className="ph-page-head"><span className="ph-sub">{state?.games.length??0} live {state?.games.length===1?'game':'games'}</span></div>{state?.games.length?<GameList games={state.games}/>:<div className="ph-panel ph-empty"><p>{state?'No live games right now. Finished games stay watchable in History.':<ContentSkeleton/>}</p></div>}</section>}
  </main>
  <LiveStrip games={state?.games??[]}/>
  <footer className="lobby-footer"><div className="lobby-footer-links"><nav aria-label="Legal and support"><a href={`${ptp}/support-the-pod`}>Support the Pod</a><a href={`${ptp}/privacy-policy`}>Privacy Policy</a><a href={`${ptp}/terms-of-service`}>Terms of Service</a><a href="https://discord.gg/u6fkdDzWqF">Join the Discord</a><a href="https://patreon.com/ProtectthePod">Patreon</a><a href="https://swag.protectthepod.com">Swag</a><a href="https://plugin.wayfinder.news" target="_blank" rel="noopener noreferrer">Companion</a><a href="https://github.com/ledwards/swupod" target="_blank" rel="noopener noreferrer">GitHub</a></nav></div><p>Protect the Pod is in no way affiliated with Disney or Fantasy Flight Games. Star Wars characters, cards, logos, and art are property of Disney and/or Fantasy Flight Games.</p></footer>
  {themePicker&&<ThemesModal controls={false} onClose={()=>setThemePicker(false)}/>}
  {settings&&<Settings themePicker={themeChoices} account={state?.user??null} controls={false} value={preferences} onChange={p=>setPreferences(writePreferences(p))} onClose={()=>setSettings(false)}/>}
 </div>;
}

'use client'
import {useEntryParams} from './EntryRoute'
import {useEffect,useRef,useState} from 'react'
import {useRouter} from 'next/navigation'
import type {SoloStatus} from '@/lib/play/soloStatus'
import Button from '../Button'
import ReplayWatchLink from '../ReplayWatchLink'
import {useToast} from '../Toast'
import EntryShell from './EntryShell'
import LeaderArtwork from './LeaderArtwork'
import {requestGameLaunch} from '@/src/services/entry/gameLaunch'
import './entry-bracket.css'

type Run=NonNullable<SoloStatus['run']>
type Match=Run['matches'][number]
type Player=Match['players'][number]
const rounds=['Quarterfinals','Semifinals','Final']
function Identity({player,large=false,score,winner=false}:{player:Player;large?:boolean;score?:number;winner?:boolean}) {
 return <div className={`tournament-player ${large?'tournament-player-hero':''} ${winner?'is-winner':''}`}>
  <div className="tournament-art" aria-hidden="true">{player.leaderImageUrl&&<LeaderArtwork src={player.leaderImageUrl}/>}</div>
  <div className="tournament-identity"><strong>{player.name} ({player.wins}-{player.losses})</strong><p>{player.archetype}</p>
   {large&&<div className="tournament-cards">{[{name:player.leaderName,detail:player.leaderSubtitle,image:player.leaderImageUrl},{name:player.baseName,detail:player.basePlanet,image:player.baseImageUrl}].map((card,i)=>card.image&&<figure key={i}><img src={card.image} alt={card.name??(i?'Base':'Leader')}/><figcaption>{card.name}{card.detail&&<span className="tournament-card-detail">{card.detail}</span>}</figcaption></figure>)}</div>}
  </div>
  {score!==undefined&&<strong className="tournament-score" aria-label={`${player.name} game wins`}>{score}</strong>}
  {!large&&player.baseImageUrl&&<img className="tournament-base" src={player.baseImageUrl} alt={player.baseName??'Base'} title={player.baseName??'Base'}/>}
 </div>
}
export default function EntryBracket({format='elimination'}:{format?:'elimination'|'swiss'}) {
 const {showToast}=useToast(),pollFailed=useRef(false)
 const swiss=format==='swiss',params=useEntryParams(),router=useRouter(),pool=params.get('pool')
 const [request,setRequest]=useState<string|null>(()=>params.get('request')??(params.has('new')?crypto.randomUUID():null))
 const [bestOf,setBestOf]=useState<1|3>(3),[selectedRound,setSelectedRound]=useState<number|null>(null)
 const [status,setStatus]=useState<SoloStatus|null>(null),[busy,setBusy]=useState(false)
 const [refresh,setRefresh]=useState(0),inFlight=useRef(false),run=status?.run
 const awaitingResult=!!run?.currentGame&&params.get('finished')===run.currentGame.id
 useEffect(()=>{
  if(!pool||busy)return
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>
  async function poll(){try{
   const response=await fetch(`/api/play/native/solo?format=${format}&pool=${encodeURIComponent(pool!)}${request?`&request=${request}`:''}`,{signal:controller.signal})
   const data=await response.json();if(!response.ok)throw Error(data.error??'Unable to load tournament.')
   if(!controller.signal.aborted&&!inFlight.current){setStatus(data);pollFailed.current=false;if(data.run && !location.pathname.startsWith('/runs/'))router.replace(`/runs/${data.run.id}`)}
  }catch{if(!controller.signal.aborted&&!pollFailed.current){pollFailed.current=true;showToast({text:'Something went wrong. Try again later.',kind:'danger'})}}
   if(!controller.signal.aborted)timer=setTimeout(poll,5000)
  }void poll();return()=>{controller.abort();clearTimeout(timer)}
 },[pool,request,busy,refresh,format,router,showToast])
 async function action(kind:'prepare'|'play'|'retry'|'replay',gameId?:string){
  if(!pool||inFlight.current)return
  const replayWindow=kind==='replay'?window.open('about:blank','_blank'):null
  if(kind==='replay'&&!replayWindow){showToast({text:'Allow pop-ups to open the replay.',kind:'danger'});return}
  if(replayWindow){replayWindow.opener=null;replayWindow.document.title='Opening replay…'}
  inFlight.current=true;setBusy(true)
  const key=`ptp-tournament-request:${format}:${pool}`
  let id=run?.requestId??request
  if(!id){try{id=sessionStorage.getItem(key)}catch{};id??=crypto.randomUUID()}
  setRequest(id);try{sessionStorage.setItem(key,id)}catch{}
  let navigating=false
  try{
   const payload={action:kind,gameId,poolShareId:pool,requestId:id,eventFormat:format,matchBestOf:run?.matchBestOf??bestOf}
   let data
   if(kind==='play')data=await requestGameLaunch('/api/play/native/solo',payload)
   else {
    const response=await fetch('/api/play/native/solo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
    data=await response.json();if(!response.ok)throw Error(data.error??'Unable to continue tournament.')
   }
   if(data.launchUrl){if(replayWindow)replayWindow.location.replace(data.launchUrl);else {location.assign(data.launchUrl);navigating=true}}
   else if(data.runId){try{sessionStorage.removeItem(key)}catch{};router.replace(`/runs/${data.runId}`)}
   else setRefresh(v=>v+1)
  }catch{replayWindow?.close();showToast({text:'Something went wrong. Try again later.',kind:'danger'})}finally{if(!navigating){inFlight.current=false;setBusy(false)}}
 }
 function newTournament(){router.push(`/pools/${encodeURIComponent(pool!)}/play/${swiss?'swiss':'bracket'}?new=1`)}
 const humanMatch=run?.matches.filter(m=>m.players.some(p=>p.id==='human')).at(-1)
 const final=run?.matches.find(m=>m.round===3)
 const champion=run?.complete?(swiss?run.standings[0]?.username:final?.players.find(p=>p.id===final.winner)?.name):null
 function games(match:Match){return <div className="entry-bracket-games">{match.games.map(g=><div key={g.id}>{g.result?<ReplayWatchLink disabled={busy} onClick={()=>void action('replay',g.id)}>Watch game {g.number} replay{g.result==='draw'?' · Draw':''}</ReplayWatchLink>:g.error?<><p role="alert">{g.error}</p><Button size="sm" disabled={busy} onClick={()=>void action('retry',g.id)}>Retry game {g.number}</Button></>:<span>Game {g.number} · {g.waitingForHuman?`When you start game ${g.number}`:g.started?'Playing':'Ready'}</span>}</div>)}{match.stalled&&<p role="alert">This match reached its game limit without a winner.</p>}</div>}
 function pairing(match:Match){return <article key={match.id} className={`tournament-pairing ${match.players.some(p=>p.id==='human')?'is-your-match':''}`}>
  {match.players.map((player,seat)=><Identity key={player.id} player={player} score={match.wins[seat]??0} winner={match.winner===player.id}/>)}
  {games(match)}
 </article>}
 return <EntryShell back={{label:'Back',onClick:()=>router.push(pool?`/pools/${encodeURIComponent(pool)}/play`:'/play')}}>
  <div className="tournament-heading"><div><p className="tournament-eyebrow">Solo draft · {swiss?'Swiss':'Single elimination'}</p><h1>{run?.complete?'Final results':swiss?'Swiss rounds':'Draft bracket'}</h1></div><p>{run?`Best of ${run.matchBestOf===1?'one':'three'} · ${run.complete?'Complete':`Round ${run.round} of 3`}`:'8 players · 3 rounds'}</p></div>
  {!pool?<p>Select a completed solo draft on the Play page.</p>:!status?<div className="tournament-hero entry-bracket-skeleton" aria-busy="true" role="status" aria-label="Loading tournament"/>:<>
   {status.unavailableReason&&<p role="alert">{status.unavailableReason}</p>}
   {!run?<section className="tournament-setup"><div className="entry-bracket-actions">
    <fieldset className="entry-ai-style"><legend>Match length</legend><div className="entry-ai-style-options">{([1,3] as const).map(n=><Button key={n} variant="toggle" active={n===bestOf} aria-pressed={n===bestOf} disabled={busy} onClick={()=>setBestOf(n)}>BO{n}</Button>)}</div></fieldset>
    <Button variant="primary" disabled={busy||!!status.unavailableReason} onClick={()=>void action('prepare')}>{swiss?'Start Swiss rounds':'Create bracket'} <span className="entry-beta">Alpha</span></Button>
   </div></section>:<>
    {humanMatch&&<section className="tournament-hero" aria-label="Your matchup"><div className="tournament-hero-heading"><h2>{run.complete?'Your final match':humanMatch.winner?'Your last match':'Your matchup'}</h2><span>{swiss?`Round ${humanMatch.round}`:rounds[humanMatch.round-1]} · {humanMatch.wins.join(' – ')}</span></div><div className="tournament-versus">{humanMatch.players.map((player,i)=><div className="tournament-contender" key={player.id}>{i===1&&<span className="tournament-vs" aria-hidden="true">VS</span>}<Identity player={player} large/></div>)}</div>
     <div className="tournament-play-action">
      {awaitingResult?<div className="tournament-pending" aria-busy="true" role="status" aria-label="Saving game result"/>:run.currentGame?<Button variant="primary" size="lg" disabled={busy} onClick={()=>void action('play')}>{run.currentGame.started?'Resume game':`Play game ${run.currentGame.number}`} <span className="entry-beta">Alpha</span></Button>:run.complete?<><strong>{champion} wins {swiss?'the tournament':'the bracket'}</strong><Button onClick={newTournament}>Start new {swiss?'Swiss tournament':'bracket'} <span className="entry-beta">Alpha</span></Button></>:<p role="status">{!swiss&&run.eliminated?'You were eliminated. Follow the remaining matches below.':'Your match is complete. Waiting for the remaining matches.'}</p>}
     </div>
    </section>}
    {run.preparing&&<Button disabled={busy} onClick={()=>void action('prepare')}>Finish preparing tournament</Button>}
    {swiss?<div className="tournament-swiss-layout"><section aria-label="Round pairings"><div className="tournament-section-heading"><h2>Pairings</h2><nav className="entry-filters" aria-label="Swiss rounds">{[1,2,3].map(n=><Button key={n} size="sm" variant="toggle" active={(selectedRound??run.round)===n} aria-pressed={(selectedRound??run.round)===n} disabled={n>run.round} onClick={()=>setSelectedRound(n)}>Round {n}</Button>)}</nav></div><div className="entry-swiss-pairings">{run.matches.filter(m=>m.round===(selectedRound??run.round)).map(pairing)}</div></section>
     <section className="entry-swiss-standings" aria-label={run.complete?'Final standings':'Standings'}><h2>{run.complete?'Final standings':'Standings'}</h2><ol className="tournament-standings">{run.standings.map(player=><li key={player.id} className={player.id==='human'?'is-you':''}><span className="tournament-rank">{player.rank}</span><div className="tournament-standing-art" aria-hidden="true">{player.leaderImageUrl&&<LeaderArtwork src={player.leaderImageUrl}/>}</div><div><strong>{player.username}{player.id==='human'?' (You)':''}</strong><p>{player.archetype}</p><small>Opponent win {Math.round(player.omwPercent*100)}%</small></div><strong>{player.wins}–{player.losses}</strong></li>)}</ol></section>
    </div>:<section className="tournament-tree" aria-label="Tournament bracket"><h2>Tournament bracket</h2><div className="entry-bracket"><svg className="tournament-connectors" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="M31 12.5 H33 V37.5 H31 M33 25 H35 M31 62.5 H33 V87.5 H31 M33 75 H35 M65 25 H67 V75 H65 M67 50 H69"/></svg>{rounds.map((name,i)=><section key={name} aria-label={name}><h3>{name}</h3><div className="entry-bracket-round">{Array.from({length:4>>i},(_,index)=>{const match=run.matches.filter(m=>m.round===i+1)[index];return match?pairing(match):<div className="tournament-pairing" key={`pending-${index}`}>{[0,1].map(offset=>{const prior=run.matches.filter(m=>m.round===i)[index*2+offset];const winner=prior?.players.find(p=>p.id===prior.winner);return winner?<Identity key={offset} player={winner}/>:<div className="tournament-awaiting" key={offset}><span>Awaiting winner</span><small>{rounds[i-1]} {index*2+offset+1}</small></div>})}</div>})}</div></section>)}</div></section>}
   </>}
  </>}
 </EntryShell>
}

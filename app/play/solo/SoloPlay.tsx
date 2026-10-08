'use client'
import {useEffect,useState} from 'react'
import ReplayWatchLink from '@/src/components/ReplayWatchLink'
import type {SoloStatus} from '@/lib/play/soloStatus'
import {useSearchParams} from 'next/navigation'
import LeaderDraftResults from '@/src/components/LeaderDraftResults'
import Button from '@/src/components/Button'
import {loadPool,claimPool} from '@/src/utils/poolApi'
import {getKarabastCardPool} from '@/src/utils/setConfigs/latest'
import {useAuth} from '@/src/contexts/AuthContext'

type DeckCard={name?:string;imageUrl?:string}
type DeckSummary={name:string;set:string;format:string;leader:DeckCard|undefined;base:DeckCard|undefined;count:number}
export default function SoloPlay({aiEnabled=false}:{aiEnabled?:boolean}){
 const params=useSearchParams(),pool=params.get('pool'),savedRequest=params.get('request')
 const {user,loading}=useAuth() as {user:{id?:string;is_admin?:boolean;is_alpha_tester?:boolean}|null;loading:boolean}
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[statusError,setStatusError]=useState(''),[checkingStatus,setCheckingStatus]=useState(true)
 const [requestId,setRequestId]=useState(savedRequest)
 const beta=user?.is_admin||user?.is_alpha_tester
 const [status,setStatus]=useState<SoloStatus>({run:null,unavailableReason:null}),[round,setRound]=useState<number|null>(null)
 const run=status.run
 const [deck,setDeck]=useState<DeckSummary|null>(null),[exportJson,setExportJson]=useState(''),[copyMessage,setCopyMessage]=useState(''),[deckError,setDeckError]=useState('')
 const [origin,setOrigin]=useState('')
 useEffect(()=>{
  setOrigin(location.origin)
  if(!pool||loading)return
  setDeckError('');setDeck(null);setExportJson('')
  let cancelled=false
  async function load(){
   try{
    let saved=await loadPool(pool!)
    if(user&&!saved.owner){await claimPool(pool!);saved=await loadPool(pool!)}
    const state=saved.deckBuilderState as {poolName?:string;activeLeader?:string;activeBase?:string;cardPositions?:Record<string,{card:DeckCard}>}|undefined
    const response=await fetch(`/api/pools/${encodeURIComponent(pool!)}/deck.json`)
    const json=await response.json()
    if(!response.ok)throw Error(json.error??'Save your deck in the builder before playing.')
    if(!cancelled){
     setExportJson(JSON.stringify(json,null,2))
     setDeck({name:state?.poolName||saved.name||'Your deck',set:String(saved.setCode),format:saved.poolType==='draft'?'Solo Draft':'Solo Sealed',
      leader:state?.cardPositions?.[state?.activeLeader??'']?.card,base:state?.cardPositions?.[state?.activeBase??'']?.card,
      count:(json.deck??[]).reduce((sum:number,c:{count:number})=>sum+c.count,0)})
    }
   }catch(e){if(!cancelled)setDeckError(e instanceof Error?e.message:'Unable to load your deck.')}
  }
  void load();return ()=>{cancelled=true}
 },[pool,loading,user?.id])
 const deckUrl=pool?`${origin}/api/pools/${encodeURIComponent(pool)}/deck.json`:''
 async function copy(kind:'json'|'url'){
  try{await navigator.clipboard.writeText(kind==='json'?exportJson:deckUrl);setCopyMessage(kind==='json'?'Deck JSON copied.':'Deck URL copied.')}
  catch{setCopyMessage('Copy was blocked. Select and copy the deck text below.')}
 }

 useEffect(()=>{
  // The launch POST creates the run. Polling its new request ID before that
  // finishes produces a false run_not_found and can race the launch error.
  if(!aiEnabled||!pool||!beta||busy||!deck)return
  let stopped=false,timer:ReturnType<typeof setTimeout>
  async function refresh(){
   try{
    const response=await fetch(`/api/play/native/solo?pool=${encodeURIComponent(pool!)}${requestId?'&request='+requestId:''}`)
    const data=await response.json()
    if(!response.ok)throw Error(data.error??'Unable to load results.')
    if(!stopped){setStatusError('');setCheckingStatus(false);setStatus(data);if(data.run&&!requestId)setRequestId(data.run.requestId)}
   }catch(e){if(!stopped){setCheckingStatus(false);setStatusError(e instanceof Error?e.message:'Unable to load results.')}}
   if(!stopped)timer=setTimeout(refresh,5000)
  }
  void refresh()
  return ()=>{stopped=true;clearTimeout(timer)}
 },[aiEnabled,pool,beta,requestId,busy,deck])
 async function replay(gameId:string,action='replay'){
  setBusy(true);setError('')
  try{
   const response=await fetch('/api/play/native/solo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,gameId})})
   const data=await response.json();if(!response.ok)throw Error(data.error??'Unable to open replay.')
   if(action==='replay')location.assign(data.launchUrl);else setBusy(false)
  }catch(e){setError(e instanceof Error?e.message:'Unable to open replay.');setBusy(false)}
 }
 async function play(newRun=false){
  if(!pool||busy)return
  // Persist the retry URL before preparation; refresh resumes the same pool/decks.
  const request=newRun?crypto.randomUUID():requestId??crypto.randomUUID()
  setRequestId(request)
  history.replaceState(null,'',`/play/solo?pool=${encodeURIComponent(pool)}&request=${request}`)
  setBusy(true);setError('')
  try{
   const response=await fetch('/api/play/native/solo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({poolShareId:pool,requestId:request})})
   const data=await response.json()
   if(!response.ok)throw Error(data.error??'Unable to prepare your opponent.')
   location.assign(data.launchUrl)
  }catch(e){setError(e instanceof Error?e.message:'Unable to start your game.');setBusy(false)}
 }
 const returnTo=`/play/solo?${params.toString()}`
 return <main className="solo-play-page page-background"><div className="solo-play-shell">
  <header className="solo-page-heading">
   <a href="/" className="solo-brand"><img src="/ptp_logo400.png" alt="Protect the Pod"/></a>
   <h1>{run?.complete?'Results':'Play'}</h1>
   {run&&<p>Round {run.round} of {run.rounds} · Best of three</p>}
  </header>
  {pool&&<div className="solo-back"><Button variant="back" size="sm" onClick={()=>location.assign(`/pool/${encodeURIComponent(pool)}/deck`)}>← Back to deck</Button></div>}
  <div className="solo-ready">
   <aside className="solo-deck" aria-label="Selected deck" aria-busy={!!pool&&!deck&&!deckError}>
    {deck?<>
     <p className="solo-format">{deck.set} · {deck.format} · {deck.count} cards</p>
     <div className="solo-deck-art">{[deck.leader,deck.base].map((card,i)=>card?.imageUrl&&<img key={i} src={card.imageUrl} alt={card.name??(i?'Base':'Leader')}/>)}</div>
     <h2>{deck.name==='Your deck'||/Sealed Pool.*\d{4}-\d{2}-\d{2}/.test(deck.name)?deck.leader?.name??deck.name:deck.name}</h2>
     <p>{deck.base?.name}</p>
    </>:deckError?<p role="alert">{deckError}</p>:pool?<div role="status" aria-label="Loading saved deck">
     <div className="solo-skeleton solo-skeleton-line" aria-hidden="true" />
     <div className="solo-deck-art" aria-hidden="true">
      <div className="solo-skeleton solo-skeleton-card" />
      <div className="solo-skeleton solo-skeleton-card" />
     </div>
     <div className="solo-skeleton solo-skeleton-title" aria-hidden="true" />
     <div className="solo-skeleton solo-skeleton-line" aria-hidden="true" />
    </div>:null}
   </aside>
   <div className="solo-options">
    {aiEnabled&&<section className="solo-ai-option" aria-labelledby="solo-ai-title">
     <div className="solo-option-heading"><h2 id="solo-ai-title">Play vs AI</h2><span className="solo-beta">Alpha</span></div>
     <p>{deck?.format==='Solo Draft'?'Face the bots from your draft in three rounds of best-of-three matches.':'Your opponent opens its own sealed pool, builds a deck, and plays you in a best-of-three match.'}</p>
     {error&&<p className="solo-error" role="alert">{error}</p>}
     {status.unavailableReason&&<p role="status" className="solo-error">{status.unavailableReason}</p>}
   {statusError&&<p role="alert" className="solo-error">{statusError}</p>}
   <div className="solo-primary-action">
   {!pool?<p>Finish a solo draft or sealed pool and save your deck first.</p>:loading?<div className="solo-skeleton solo-skeleton-action" role="status" aria-label="Checking access" />:!user?<a className="btn btn--md btn--discord" href={`/api/auth/signin/discord?return_to=${encodeURIComponent(returnTo)}`}>Sign in with Discord</a>:!beta?<p>AI play is currently available to alpha users only.</p>:run?.complete?null:<Button variant="primary" size="lg" disabled={!deck||busy||checkingStatus||!!statusError||!!status.unavailableReason||!!run&&!run.currentGame&&!run.preparing} onClick={()=>play()}>{busy||checkingStatus?<span className="solo-skeleton solo-skeleton-action" role="status" aria-label={busy?'Preparing game':'Checking game'} />:run?.complete?'Run complete':run?.currentGame?(run.currentGame.started?'Resume game':`Start game ${run.currentGame.number}`):run&&!run.preparing?'Other matches are playing…':'Play vs AI'}</Button>}

     {run?.complete&&<Button variant="primary" disabled={busy||!deck} onClick={()=>play(true)}>Start new run</Button>}
     </div>
     <p className="solo-fine-print">Experimental AI · Available to alpha users</p>
    </section>}
    <section className="solo-export" aria-labelledby="solo-export-title">
     <h2 id="solo-export-title">Play on Karabast</h2>
     <ol>
      <li>Copy your deck JSON or URL below.</li>
      <li>Open <a href="https://karabast.net" target="_blank" rel="noopener noreferrer">Karabast ↗</a> and paste it as your decklist.</li>
      <li>Create or join a lobby with <strong>Format: Limited</strong> and <strong>Card Pool: {getKarabastCardPool(deck?.set)}</strong>.</li>
     </ol>
     <div className="solo-export-actions">
      <Button variant="secondary" size="sm" disabled={!exportJson} onClick={()=>copy('json')}>Copy JSON</Button>
      <Button variant="secondary" size="sm" disabled={!exportJson} onClick={()=>copy('url')}>Copy URL</Button>
     </div>
     {/localhost|127\.0\.0\.1/.test(origin)&&<p className="solo-fine-print">Testing locally? Use JSON. Karabast cannot fetch a localhost URL.</p>}
     <p className="solo-copy-status" role="status">{copyMessage}</p>
     {copyMessage.startsWith('Copy was blocked')&&<textarea aria-label="Deck JSON" readOnly value={exportJson} onFocus={e=>e.target.select()}/>}
    </section>
   </div>
  </div>
  {pool && deck?.format === 'Solo Draft' && <LeaderDraftResults poolShareId={pool} collapsed />}
  {run&&run.matches.length>0&&<section className="solo-results" aria-label="Results"><details open={run.complete}><summary>Matches &amp; replays</summary>
   <div className="solo-rounds">{Array.from({length:run.round},(_,i)=><Button key={i} variant={(round??run.round)===i+1?'primary':'secondary'} size="sm" onClick={()=>setRound(i+1)}>Round {i+1}</Button>)}</div>
   <div className="solo-matches">{run.matches.filter(m=>m.round===(round??run.round)).map(m=><div key={m.id} className="solo-match">
    <strong>{m.players[0]?.name} <span>{m.wins[0]} – {m.wins[1]}</span> {m.players[1]?.name}</strong>
    <div className="solo-games">{m.games.map(g=><span key={g.id}>{g.result?<ReplayWatchLink disabled={busy} onClick={()=>replay(g.id)} ariaLabel={`Replay game ${g.number}: ${m.players.map(p=>p.name).join(' vs ')}`}>Game {g.number}{g.result==='draw'?' · Draw':''}</ReplayWatchLink>:g.error?<span role="status">Game {g.number}: {g.error} <Button size="sm" variant="secondary" disabled={busy} onClick={()=>replay(g.id,'retry')}>Retry</Button></span>:<span>Game {g.number}: {g.started?'Playing':'Ready'}</span>}</span>)}</div>
    {m.stalled&&<p role="alert">This match reached the game limit without a winner. Its replays are saved.</p>}
   </div>)}
   </div>
   {run.rounds>1&&<details><summary>Standings</summary>{run.standings.map(p=><p key={p.id}>{p.rank}. {p.username} · {p.wins}–{p.losses}</p>)}</details>}
  </details></section>}
 </div></main>
}

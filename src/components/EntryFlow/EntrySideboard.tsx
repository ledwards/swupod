'use client'
import {useEntryParams} from './EntryRoute'
import {useEffect, useRef, useState} from 'react'
import {useRouter} from 'next/navigation'
import Button from '../Button'
import Card from '../Card'
import EntryShell from './EntryShell'
import {EntrySkeleton} from './EntrySkeleton'
import {sideboardErrors, sideboardMinimum, type SideboardData, type SideboardSelection, type SideboardCard} from '../../services/play/solo/sideboard'
import './entry-sideboard.css'

export default function EntrySideboard() {
  const run = useEntryParams().get('run'), router = useRouter()
  const [data,setData] = useState<SideboardData|null>(null), [selection,setSelection] = useState<SideboardSelection|null>(null)
  const [build,setBuild] = useState(''), [error,setError] = useState(''), [busy,setBusy] = useState(false), [retry,setRetry] = useState(0)
  const [query,setQuery] = useState('')
  const inFlight = useRef(false)
  useEffect(()=>{
    if (!run) {setError('Open sideboarding from your match.'); return}
    let live = true
    fetch(`/api/entry/ai/sideboard?run=${encodeURIComponent(run)}`).then(async response=>{
      const value = await response.json()
      if (!response.ok) throw Error(value.error??'Unable to load your pool.')
      if (live) {setData(value);setSelection(value.selection);setError('')}
    }).catch(e=>{if(live)setError(e.message)})
    return ()=>{live=false}
  },[run,retry])
  if (!data || !selection) return error ? <EntryShell><h1>Sideboard</h1><p role="alert">{error}</p><Button onClick={()=>{setError('');setRetry(n=>n+1)}}>Try again</Button><Button variant="back" onClick={()=>router.back()}>Back</Button></EntryShell> : <EntrySkeleton page="ai" />
  const editingLocked = busy || data.locked === true
  const errors = sideboardErrors(selection,data.cards)
  const count = Object.values(selection.deck).reduce((sum,n)=>sum+n,0)
  const minimum = sideboardMinimum(data.cards.find(c=>c.id===selection.base))
  const ordinary = data.cards.filter(c=>['Unit','Event','Upgrade'].includes(c.type))
  const visible = (c: SideboardCard) => `${c.name} ${c.subtitle??''}`.toLowerCase().includes(query.toLowerCase())
  function move(card: SideboardCard, amount: number) {
    if (editingLocked) return
    setSelection(old=>old?{...old,deck:{...old.deck,[card.id]:Math.max(0,Math.min(card.count,(old.deck[card.id]??0)+amount))}}:old)
  }
  async function proceed() {
    if (!data || !selection || (!data.locked && errors.length) || inFlight.current) return
    inFlight.current=true;setBusy(true);setError('')
    try {
      const response = await fetch('/api/entry/ai/sideboard',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({runId:run,gameId:data.gameId,selection,...(build?{buildShareId:build}:{})})})
      const value = await response.json()
      if (!response.ok) throw Error(value.error??'Unable to save your deck.')
      window.location.assign(value.launchUrl)
    } catch (e) {setError(e instanceof Error?e.message:'Unable to continue.');setBusy(false);inFlight.current=false}
  }
  function cardButton(card: SideboardCard, inDeck: boolean) {
    const quantity = inDeck ? selection!.deck[card.id] : card.count-(selection!.deck[card.id]??0)
    const label = inDeck ? `Move ${card.name} to sideboard` : `Add ${card.name} to deck`
    return <Button key={card.id} className="sideboard-card" aria-label={label} disabled={editingLocked||(!inDeck&&!card.supported)} onClick={()=>move(card,inDeck?-1:1)}>
      <Card card={card}/><span className="sideboard-card-caption">{quantity}× {card.name}</span>
      {!card.supported&&<small>Not yet supported</small>}
    </Button>
  }
  return <EntryShell back={{label:'Back',onClick:()=>router.push(data.returnUrl)}}>
    {data.locked&&<p role="status">Your deck is saved for this game. Resume to continue.</p>}
    <header className="sideboard-heading"><div><h1>Sideboard</h1><p>Prepare for game {data.gameNumber}. Click a card to move one copy in or out.</p></div>
      <label>Saved build<select disabled={editingLocked} value={build} onChange={event=>{
        const id=event.target.value;setBuild(id)
        setSelection(id?data.builds.find(b=>b.shareId===id)!.selection:data.selection)
      }}><option value="">Last game’s deck</option>{data.builds.map(b=><option key={b.shareId} value={b.shareId}>{b.name}</option>)}</select></label>
    </header>
    <div className="sideboard-commanders">{(['Leader','Base'] as const).map(type=>{
      const key=type==='Leader'?'leader':'base'
      const active=data.cards.find(c=>c.id===selection[key])
      return <fieldset key={type}><legend>{type}</legend>
        <div className="sideboard-selected">{active&&<Card card={active}/>}<label>Choose {type.toLowerCase()}
          <select aria-label={`Choose ${type.toLowerCase()}`} disabled={editingLocked} value={selection[key]} onChange={event=>setSelection({...selection,[key]:event.target.value})}>
            <option value="">Select {type.toLowerCase()}</option>{data.cards.filter(c=>c.type===type).map(c=><option key={c.id} value={c.id} disabled={!c.supported}>{c.name}{c.subtitle?` · ${c.subtitle}`:''}{!c.supported?' (not yet supported)':''}</option>)}
          </select></label></div>
      </fieldset>
    })}</div>
    <div className="sideboard-toolbar"><input type="search" aria-label="Search pool cards" placeholder="Search cards" value={query} onChange={event=>setQuery(event.target.value)}/></div>
    <div className="sideboard-columns">
      <fieldset><legend>Your Deck ({count} cards)</legend><div className="sideboard-grid">{ordinary.filter(c=>(selection.deck[c.id]??0)>0&&visible(c)).map(c=>cardButton(c,true))}</div>{!count&&<p>Add cards from your sideboard.</p>}</fieldset>
      <fieldset><legend>Sideboard ({ordinary.reduce((n,c)=>n+c.count-(selection.deck[c.id]??0),0)} cards)</legend><div className="sideboard-grid">{ordinary.filter(c=>c.count>(selection.deck[c.id]??0)&&visible(c)).map(c=>cardButton(c,false))}</div></fieldset>
    </div>
    <div className="sideboard-continue" aria-busy={busy}>
      <div aria-live="polite"><strong aria-label={`${count} of ${minimum} cards, ${errors.length?'invalid':'legal'} deck`}><span className={errors.length?'sideboard-count-invalid':'sideboard-count-valid'}>{count}</span> / {minimum}</strong>{error&&<p role="alert">{error}</p>}</div>
      <Button variant="primary" size="lg" disabled={busy||(!data.locked&&errors.length>0)} onClick={()=>void proceed()}>{busy?<span className="entry-skeleton-line" role="status" aria-label="Saving deck and preparing game"/>:data.locked?'Resume game':'Continue to game'}{!busy && <span className="entry-beta">Alpha</span>}</Button>
    </div>
  </EntryShell>
}

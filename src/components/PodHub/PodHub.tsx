'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { HubView } from '../../services/pods/hubTypes'
import LiveStrip from '../PlayHomepage/LiveStrip'
import DeckArt from './DeckArt'
import RoundView from './RoundView'
import StandingsView from './StandingsView'
import BracketView from './BracketView'
import EventSettings from './EventSettings'
import { CheckIcon, LogIcon, SettingsIcon, ShareIcon } from './icons'
import './pod-hub.css'

/**
 * The pod page for draft night: deckbuilding, then the online tournament the
 * pod plays (Swiss with an optional top cut, or single elimination). Results
 * come from the games and rounds advance on their own; this page polls.
 */
export default function PodHub({ shareId }: { shareId: string }) {
  const [view, setView] = useState<HubView | null>(null)
  const [error, setError] = useState<{ code: string; message: string } | null>(null)
  const [tab, setTab] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const fetchedAt = useRef(Date.now())
  const lastCurrent = useRef<string | null>(null)
  const phone = usePhone()
  const tabsRef = useRef<HTMLElement>(null)
  // On a phone the tab strip scrolls; keep the open tab in view.
  useEffect(() => { tabsRef.current?.querySelector<HTMLElement>('[aria-current=page]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) }, [tab, phone])

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/draft/${encodeURIComponent(shareId)}/tournament`, { credentials: 'include', cache: 'no-store' })
      const body = await response.json().catch(() => null)
      if (!response.ok) { setError({ code: body?.code ?? 'error', message: body?.error ?? 'This pod could not load.' }); return }
      fetchedAt.current = Date.now()
      setError(null)
      setView(body as HubView)
    } catch { /* Keep the last view; the next poll retries. */ }
  }, [shareId])

  useEffect(() => {
    void load()
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void load() }, 5000)
    const focus = () => void load()
    window.addEventListener('focus', focus)
    return () => { clearInterval(timer); window.removeEventListener('focus', focus) }
  }, [load])

  // Follow the event: when a new round becomes current, move along with it unless the viewer browsed elsewhere.
  const current = view?.tabs.find(t => t.state === 'current')?.key ?? 'deckbuilding'
  useEffect(() => {
    if (!view) return
    if (tab === null || tab === lastCurrent.current) setTab(current)
    lastCurrent.current = current
  }, [view, current]) // eslint-disable-line react-hooks/exhaustive-deps

  // Bots build at the end of the draft; a pod that missed it gets them built when the host arrives.
  const askedBots = useRef(false)
  useEffect(() => {
    if (!view?.viewer.isHost || askedBots.current) return
    if (view.players.some(p => p.isBot && !p.isReady)) {
      askedBots.current = true
      void fetch(`/api/draft/${encodeURIComponent(shareId)}/build-bot-decks`, { method: 'POST', credentials: 'include' }).then(() => load())
    }
  }, [view, shareId, load])

  const share = async () => {
    try { await navigator.clipboard.writeText(`${location.origin}/draft/${shareId}/pod`); setCopied(true); setTimeout(() => setCopied(false), 1600) } catch { /* nothing to copy into */ }
  }

  if (error) return <section className="pod-hub pod-hub--empty" aria-label="Pod">
    <h1>Pod</h1>
    <p role="alert">{error.message}</p>
    {error.code === 'still_drafting' && <Link className="pod-sec" href={`/draft/${shareId}`}>Back to the draft</Link>}
  </section>
  if (!view) return <section className="pod-hub" aria-label="Pod" aria-busy="true"><h1 data-site-title="skip" className="pod-visually-hidden">Pod</h1><div className="pod-skeleton"/></section>

  const t = view.tournament
  const swissRound = (key: string) => t?.rounds.find(r => r.key === key)
  const selected = tab ?? current
  const roundNow = t?.rounds.filter(r => r.stage === 'swiss').at(-1)
  const subtitle = phone && t && t.stage === 'swiss' && t.status === 'running' && roundNow?.matches.some(m => m.status === 'playing')
    ? `Round ${roundNow.round} of ${view.settings.rounds}`
    : [view.pod.setCode, view.subtitle].filter(Boolean).join(' · ')
  const visibleTabs = view.tabs.filter(x => !(phone && t && x.key === 'deckbuilding'))
  const elimination = t?.rounds.filter(r => r.stage === 'elimination') ?? []

  return <section className="pod-hub" aria-label="Pod">
    <h1>{view.pod.name}</h1>
    <p>{subtitle}</p>
    <div className="pod-toolbar">
      <button type="button" className="pod-ic" aria-label={copied ? 'Link copied' : 'Share pod'} title={copied ? 'Link copied' : 'Share pod'} onClick={() => void share()}><ShareIcon/></button>
      <Link className="pod-ic" aria-label="Draft log" title="Draft log" href={`/draft/${shareId}/log`}><LogIcon/></Link>
      {view.viewer.isHost && <button type="button" className="pod-ic" aria-label="Event settings" title="Event settings" onClick={() => setSettingsOpen(true)}><SettingsIcon/></button>}
    </div>
    <nav className="pod-tabs" aria-label="Rounds" ref={tabsRef}>
      {visibleTabs.map(x => {
        const open = x.state !== 'upcoming' || (x.key.startsWith('elim-') && elimination.length > 0)
        return <button key={x.key} type="button" className={`pod-tab${x.key === 'standings' ? ' is-end' : ''}${x.state === 'upcoming' ? ' is-off' : ''}`}
          aria-current={selected === x.key ? 'page' : undefined} disabled={!open} onClick={() => setTab(x.key)}>{x.label}</button>
      })}
    </nav>
    {selected === 'deckbuilding' || !t ? <Deckbuilding view={view} shareId={shareId} onEdit={() => setSettingsOpen(true)}/>
      : selected === 'standings' ? <StandingsView view={view} fetchedAt={fetchedAt.current} onDue={load}/>
      : selected === 'cut' || selected.startsWith('elim-') ? <BracketView view={view} shareId={shareId}/>
      : swissRound(selected) ? <RoundView view={view} round={swissRound(selected)!} shareId={shareId} onChanged={load}/>
      : <p className="pod-hint">This round has not started.</p>}
    {settingsOpen && view.viewer.isHost && <EventSettings view={view} shareId={shareId} onClose={() => setSettingsOpen(false)} onChanged={load}/>}
    <LiveStrip/>
  </section>
}

function Deckbuilding({ view, shareId, onEdit }: { view: HubView; shareId: string; onEdit: () => void }) {
  const ready = view.players.filter(p => p.isReady).length
  const me = view.players.find(p => p.isYou)
  const waiting = view.players.filter(p => !p.isReady && !p.isBot).map(p => p.name)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState('')
  const start = async () => {
    setStarting(true); setStartError('')
    try {
      const response = await fetch(`/api/draft/${encodeURIComponent(shareId)}/tournament/start`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(view.settings) })
      const body = await response.json().catch(() => null)
      if (!response.ok) setStartError(body?.error ?? 'Round 1 could not start.')
      else location.reload()
    } finally { setStarting(false) }
  }
  return <div className="pod-grid pod-grid--deckbuilding">
    <section aria-label="Players">
      <div className="pod-section-head"><span className="pod-k">Players</span><span className="pod-hint">{ready} of {view.players.length} ready</span></div>
      <div className="pod-seats">
        {view.players.map(p => p.isReady && p.deck
          ? <div key={p.id} className={`pod-seat${p.isYou ? ' is-you' : ''}`}>
              <DeckArt deck={p.deck} portrait/><span className="pod-shade"/>
              <span className="pod-seat-no">Seat {p.seat}</span>
              <div className="pod-seat-foot"><b>{p.name}{p.isBot && <span className="pod-bot">AI</span>}</b><span className="pod-ok" aria-label="Ready" role="img"><CheckIcon/></span></div>
            </div>
          : <div key={p.id} className={`pod-seat is-building${p.isYou ? ' is-you' : ''}`}>
              <span className="pod-k">Seat {p.seat}</span>
              <b>{p.name}{p.isBot && <span className="pod-bot">AI</span>}</b>
              <span className="pod-hint">Building</span>
            </div>)}
      </div>
    </section>
    <aside className="pod-aside">
      {me && view.myPoolShareId && <section className="pod-pn pod-card">
        <span className="pod-k">Your deck</span>
        <div className="pod-deck-banner"><DeckArt deck={me.deck}/><span className="pod-shade"/><b>{me.deck?.leaderName ?? 'No deck yet'}</b></div>
        <Link className="pod-sec pod-sec--wide" href={`/pools/${encodeURIComponent(view.myPoolShareId)}/deck`}>Edit deck</Link>
      </section>}
      {view.viewer.isHost && <section className="pod-pn pod-card pod-host">
        <span className="pod-k">Host</span>
        <div className="pod-host-summary"><span>{view.summary}</span>{!view.tournament && <button type="button" className="pod-link" onClick={onEdit}>Edit</button>}</div>
        {!view.tournament && view.settings.format !== 'none' && <>
          <button type="button" className="pod-go" disabled={starting} onClick={() => void start()}>Start Round 1</button>
          {startError ? <span className="pod-hint pod-center" role="alert">{startError}</span>
            : waiting.length > 0 && <span className="pod-hint pod-center">Waiting on {listNames(waiting)}</span>}
        </>}
      </section>}
    </aside>
  </div>
}

export function listNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? ''
  if (names.length > 3) return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

function usePhone() {
  const [phone, setPhone] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(max-width: 640px)')
    const update = () => setPhone(query.matches)
    update(); query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return phone
}

export const useNow = (every = 1000) => {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), every); return () => clearInterval(id) }, [every])
  return now
}

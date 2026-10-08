'use client'
import {requestGameLaunch} from '@/src/services/entry/gameLaunch'
import {useEntryParams} from './EntryRoute'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '../Button'
import { type AiStyle } from '../../services/play/solo/aiStyles'
import '../YourStats/YourStats.css'
import '../Lobby/DeckPicker.css'
import EntryDeckCard from './EntryDeckCard'
import EntryShell from './EntryShell'
import EntryFilterCheckbox from './EntryFilterCheckbox'
import { EntrySkeleton, EntryDeckSkeleton } from './EntrySkeleton'
import type { EntryDeck } from './EntryPlay'
import type { SoloStatus } from '@/lib/play/soloStatus'
type Data = {
  deck: EntryDeck
  savedDecks: EntryDeck[]
  bots: { id: string; name: string; archetype: string | null; leaderImageUrl: string | null; mainDeckCount?: number; isDefault: boolean }[]
  status: SoloStatus | null
  opponent: Opponent | null
  choice: string
  aiStyle?: AiStyle | null
}
type Opponent = {
  runId: string
  name: string
  archetype?: string | null
  baseName?: string
  leaderName?: string
  leaderImageUrl?: string
  leaderBackImageUrl?: string | null
  mainDeckCount: number
}
async function api(url: string, body?: object) {
  const r = await fetch(
    url,
    body
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : undefined
  )
  const j = await r.json()
  if (!r.ok) throw Object.assign(Error(j.error ?? 'Unable to prepare this game.'), { code: j.code, status: r.status })
  return j
}
export default function EntryAi() {
  const router = useRouter(),
    params = useEntryParams(),
    pool = params.get('pool'),
    savedRequest = params.get('request')
  const [data, setData] = useState<Data | null>(null),
    [choice, setChoice] = useState('default'),
    [opponentSource, setOpponentSource] = useState<'preset' | 'saved'>('preset'),
    [pickerOpen, setPickerOpen] = useState(false),
    [opponent, setOpponent] = useState<Opponent | null>(null),
    [busy, setBusy] = useState(false),
    [launching, setLaunching] = useState(false),
    [error, setError] = useState(''),
    [failedAction, setFailedAction] = useState<'load' | 'prepare' | 'play' | 'convert'>('load'),
    [retry, setRetry] = useState(0),
    [completeOnly, setCompleteOnly] = useState(true),
    [opponentSet, setOpponentSet] = useState<string | null>(null),
    [query, setQuery] = useState(''),
    [preparationBlocked, setPreparationBlocked] = useState(false)
  const request = useRef<string | null>(savedRequest),
    started = useRef(false),
    inFlight = useRef(false)
  useEffect(() => {
    if (!pool) return
    let live = true
    api(
      `/api/entry/ai?pool=${encodeURIComponent(pool)}${savedRequest ? `&request=${savedRequest}` : ''}`
    )
      .then((j) => {
        if (live) {
          setData(j)
          if (j.opponent) setOpponent(j.opponent)
          setChoice(j.choice)
          setOpponentSource(j.choice?.startsWith('saved:') ? 'saved' : 'preset')
        }
      })
      .catch((e) => {
        if (live) { setFailedAction('load'); setError(aiErrorMessage(e)) }
      })
    return () => {
      live = false
    }
  }, [pool, savedRequest, retry])
  async function prepare(selection = choice, fresh = false, collapse = false) {
    if (inFlight.current || !pool || !data?.deck.ready || preparationBlocked) return
    inFlight.current = true
    setBusy(true)
    setError('')
    setOpponent(null)
    if (fresh || !request.current) request.current = crypto.randomUUID()
    try {
      const j = await api('/api/entry/ai', {
        action: 'prepare',
        poolShareId: pool,
        requestId: request.current,
        ...(selection.startsWith('saved:')
          ? { opponentPoolShareId: selection.slice(6) }
          : selection.startsWith('draft:')
            ? { opponentParticipantId: selection.slice(6) }
            : {}),
      })
      setOpponent(j)
      if (collapse) setPickerOpen(false)
      window.history.replaceState(
        null,
        '',
        `/runs/${j.runId}`
      )
    } catch (e) {
      if (e instanceof Error && 'code' in e && e.code === 'unverified_source') {
        setPreparationBlocked(true)
      } else { setFailedAction('prepare'); setError(aiErrorMessage(e)) }
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }
  useEffect(() => {
    if (data?.status?.run?.currentGame?.started && !data.status.run.complete) {
      const timer = setTimeout(() => setRetry((n) => n + 1), 5000)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [data])
  useEffect(() => {
    if (data && !savedRequest && !started.current) {
      started.current = true
      if (data.deck?.ready && (data.deck.poolType === 'sealed' || data.bots.length)) void prepare()
    }
  }, [data, savedRequest])
  const sideboardStarted = useRef(false)
  useEffect(() => {
    const finished = params.get('finished'), run = data?.status?.run
    if (!finished || !run || run.singleGame || run.complete || sideboardStarted.current) return
    const recorded = run.matches.some(match => match.games.some(game => game.id === finished && game.result))
    const next = run.currentGame
    if (!recorded || !next || next.started || next.number < 2) return
    sideboardStarted.current = true
    window.location.assign(`/runs/${run.id}/sideboard`)
  }, [data, params])
  async function play() {
    const runId = opponent?.runId ?? data?.status?.run?.id
    if (!runId || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError('')
    setLaunching(true)
    try {
      const action = completedMatchSelected ? 'rematch' : 'resume'
      const j = await requestGameLaunch('/api/entry/ai', { action, runId })
      window.location.assign(j.launchUrl)
    } catch (e) {
      if (e instanceof Error && 'code' in e && e.code === 'unverified_source') {
        setPreparationBlocked(true)
      } else { setFailedAction('play'); setError(aiErrorMessage(e)) }
      setLaunching(false)
      setBusy(false)
      inFlight.current = false
    }
  }
  async function convertToBo3() {
    if (!data?.status?.run || inFlight.current) return
    inFlight.current = true; setBusy(true); setError('')
    try {
      const result = await api('/api/entry/ai', {action:'bo3',runId:data.status.run.id})
      window.location.assign(result.launchUrl)
    } catch (e) { setFailedAction('convert'); setError(aiErrorMessage(e)); setBusy(false); inFlight.current = false }
  }
  const conversionStarted = useRef(false)
  useEffect(() => {
    if (params.get('convert') !== 'bo3' || !data?.status?.run || conversionStarted.current) return
    if (params.get('run') !== data.status.run.id) return
    conversionStarted.current = true
    // Consume the navigation intent once; the existing owner-checked conversion
    // endpoint reconciles game one and opens the sideboarding screen.
    const url = new URL(window.location.href)
    url.searchParams.delete('convert')
    window.history.replaceState(window.history.state, '', url)
    void convertToBo3()
  }, [data, params])
  function change(value: string) {
    setChoice(value)
    setPickerOpen(false)
    void prepare(value, true, true)
  }
  if (!pool)
    return (
      <EntryShell>
        <h1>Play vs AI</h1>
        <Button onClick={() => router.push('/play')}>Choose your deck</Button>
      </EntryShell>
    )
  if (!data && !error) return <EntrySkeleton page="ai" />
  const sourceMatchesChoice = (opponentSource === 'saved') === choice.startsWith('saved:')
  const run = data?.status?.run,
    complete = run?.complete,
    locked = !!run?.currentGame?.started,
    result = run?.matches.flatMap((m) => m.games).find((g) => g.result)?.result
  const completedMatchSelected = !!complete && (!opponent || opponent.runId === run?.id)
  const refreshControl = opponentSource === 'preset' && data?.deck.poolType === 'sealed' && (!locked || complete) ? (
    <Button variant="icon" className="entry-opponent-refresh" aria-label="Generate another opponent" title="Generate another opponent" disabled={busy || !data.deck.ready || preparationBlocked} onClick={() => {
      setChoice('default')
      void prepare('default', true)
    }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 7v5h-5" /><path d="M4 17v-5h5" /><path d="M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3A7 7 0 0 0 17.9 17" />
      </svg>
    </Button>
  ) : null
  const errorNotice = error ? (
    <div className="entry-ai-error" role="alert">
      <div>
        <strong>{failedAction === 'convert' ? 'Couldn’t open sideboarding' : failedAction === 'play' ? 'Couldn’t start your game' : failedAction === 'prepare' ? 'Couldn’t prepare your opponent' : 'Couldn’t load your decks'}</strong>
        <p>{error}</p>
      </div>
      <Button size="sm" disabled={busy} onClick={() => {
        setError('')
        if (failedAction === 'convert') void convertToBo3()
        else if (failedAction === 'play') void play()
        else if (failedAction === 'prepare') void prepare()
        else setRetry(n => n + 1)
      }}>Try again</Button>
    </div>
  ) : null
  return (
    <EntryShell setCode={data?.deck.setCode} back={{ label: 'Back to decks', onClick: () => router.push(`/pools/${encodeURIComponent(pool)}/play`) }}>
      <h1>
        Play vs AI <span className="entry-beta">Alpha</span>
      </h1>
      {!data && error && <section className="entry-panel">{errorNotice}</section>}
      {data && (
        <div className="entry-layout entry-ai-layout">
          <section className="entry-panel">
            <h2>Your deck</h2>
            <EntryDeckCard deck={data.deck}>
              <Button size="sm" disabled={data.deck.editLocked} onClick={() => router.push(`/pools/${data.deck.poolShareId}/deck`)}>Edit deck</Button>
            </EntryDeckCard>
          </section>
          <aside className="entry-panel entry-summary">
            <div className="entry-opponent-heading">
              <h2>{complete ? run?.singleGame === false ? 'Match complete' : 'Game complete' : 'AI opponent'}</h2>
              {(!locked || complete) && <Button size="sm" disabled={busy} aria-expanded={pickerOpen} aria-controls="entry-opponent-picker" onClick={() => setPickerOpen(open => !open)}>{pickerOpen ? 'Hide picker' : 'Change deck'}</Button>}
            </div>
            {locked && !complete ? (
              <p>Your opponent is saved for this game.</p>
            ) : pickerOpen ? (
              <div id="entry-opponent-picker" className="entry-opponent-picker">
                <div className="entry-toggle entry-opponent-source" role="group" aria-label="Opponent deck source">
                  <Button variant="toggle" active={opponentSource === 'preset'} aria-pressed={opponentSource === 'preset'} disabled={busy} onClick={() => {
                    setOpponentSource('preset')
                    if (data.deck.poolType === 'sealed' && choice.startsWith('saved:')) change('default')
                  }}>{data.deck.poolType === 'sealed' ? 'Generated deck' : 'Draft opponent'}</Button>
                  <Button variant="toggle" active={opponentSource === 'saved'} aria-pressed={opponentSource === 'saved'} disabled={busy} onClick={() => setOpponentSource('saved')}>My saved decks</Button>
                </div>
                {opponentSource === 'preset' && data.deck.poolType === 'draft' && <div className="entry-action-stack">
                  {data.bots.map(b => {
                    const selected = choice === `draft:${b.id}` || (choice === 'default' && b.isDefault)
                    return <EntryDeckCard key={b.id} onSelect={()=>change(`draft:${b.id}`)} disabled={busy || !data.deck.ready || preparationBlocked} selected={selected} deck={{...data.deck, name:b.name, leaderName:b.archetype, baseName:null, leaderImageUrl:b.leaderImageUrl, leaderBackImageUrl:null, mainDeckCount:b.mainDeckCount ?? 30, complete:true, ready:true, editLocked:false}}>
                      {b.isDefault && <small>Across the table</small>}

                    </EntryDeckCard>
                  })}
                </div>}
                {opponentSource === 'saved' && <div className="entry-action-stack entry-saved-picker">
                <h3>Use one of your saved {data.deck?.poolType === 'draft' ? 'Draft' : 'Sealed'} decks</h3>
                <div className="entry-picker-toolbar">
                <input className="entry-deck-search lobby-deck-search" type="search" aria-label="Search saved decks" placeholder="Search decks or leaders" value={query} onChange={event => setQuery(event.target.value)} />
                <EntryFilterCheckbox label="Complete decks only" checked={completeOnly} onChange={setCompleteOnly} />
                <select aria-label="Opponent deck set" value={opponentSet ?? data.deck.setCode} onChange={event => setOpponentSet(event.target.value)}>
                  <option value="">All sets</option>
                  {[...new Set([data.deck.setCode, ...data.savedDecks.map(d => d.setCode)])].map(code => <option key={code} value={code}>{code}</option>)}
                </select>
                </div>
                {data.savedDecks.filter(d => (!(opponentSet ?? data.deck.setCode) || d.setCode === (opponentSet ?? data.deck.setCode)) && (!completeOnly || (d.complete ?? d.ready)) && [d.name, d.leaderName, d.baseName, d.setCode].join(' ').toLowerCase().includes(query.trim().toLowerCase())).map(d => (
                  <EntryDeckCard key={d.poolShareId} deck={d} selected={choice === `saved:${d.poolShareId}`} disabled={busy || !(d.aiOpponentReady ?? d.ready) || !data.deck.ready || preparationBlocked} onSelect={() => change(`saved:${d.poolShareId}`)} />
                ))}
              </div>}
              </div>
            ) : null}

            {!pickerOpen && (!sourceMatchesChoice ? (
              <p>Select one of your saved decks for the AI opponent.</p>
            ) : busy && !opponent ? (
              <><div className="entry-opponent-preview"><EntryDeckSkeleton />{refreshControl}</div><p>{run?.singleGame === false ? `Best of three · ${run.matches[0]?.wins.join(' – ')}` : 'One practice game'}</p></>
            ) : opponent ? (
              <>
                <div className="entry-opponent-preview"><EntryDeckCard deck={{ ...data.deck, name: opponent.name, leaderName: opponent.archetype ?? opponent.leaderName ?? null, baseName: null, leaderImageUrl: opponent.leaderImageUrl ?? null, leaderBackImageUrl: opponent.leaderBackImageUrl ?? null, mainDeckCount: opponent.mainDeckCount, complete: true, ready: true }} />{refreshControl}</div>
                <p>{run?.singleGame === false ? `Best of three · ${run.matches[0]?.wins.join(' – ')}` : 'One practice game'}</p>
              </>
            ) : run ? (
              <p>
                {complete
                  ? result === 'draw'
                    ? 'Draw'
                    : result === 'player1'
                      ? 'You won'
                      : 'Opponent won'
                  : 'Ready to resume your practice game.'}
              </p>
            ) : (
              <p>Choose an opponent deck to prepare your game.</p>
            ))}
            {errorNotice}
            <div className="entry-summary-actions">
            {completedMatchSelected && run?.singleGame && <Button variant="primary" disabled={busy} onClick={() => void convertToBo3()}>Convert to best of three <span className="entry-beta">Alpha</span></Button>}
            {!(completedMatchSelected && run?.singleGame === false) && <Button
              className="entry-go"
              variant="primary"
              disabled={!sourceMatchesChoice || preparationBlocked || (!completedMatchSelected && !data.deck.ready) || busy || (!opponent && !run)}
              onClick={play}
            >
              {launching ? 'Starting game…' : completedMatchSelected ? 'Rematch' : locked && !complete ? 'Resume game' : run?.singleGame === false ? 'Sideboard for next game' : 'Play vs AI'} <span className="entry-beta">Alpha</span>
            </Button>}
            </div>
          </aside>
        </div>
      )}
    </EntryShell>
  )
}



function aiErrorMessage(error: unknown): string {
  const code = error instanceof Error && 'code' in error ? error.code : null
  if (code === 'runtime_unavailable' || code === 'runtime_not_found' || error instanceof TypeError)
    return 'Please try again. Your deck and opponent are saved.'
  return error instanceof Error ? error.message : 'Please try again.'
}

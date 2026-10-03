'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Button from '../Button'
import '../YourStats/YourStats.css'
import '../Lobby/DeckPicker.css'
import EntryDeckCard from './EntryDeckCard'
import { useAuth } from '@/src/contexts/AuthContext'
import EntryShell from './EntryShell'
import EntryFilterCheckbox from './EntryFilterCheckbox'
import { EntrySkeleton } from './EntrySkeleton'
export type EntryDeck = {
  poolShareId: string
  name: string
  setCode: string
  poolType: string
  leaderName: string | null
  leaderImageUrl: string | null
  leaderBackImageUrl?: string | null
  baseName?: string | null
  setName?: string | null
  mainDeckCount: number
  ready: boolean
  aiOpponentReady?: boolean
  complete?: boolean
  blocker: string | null
  editLocked: boolean
  packCount: number | null
}
export default function EntryPlay() {
  const { user } = useAuth() as { user: { id: string } | null }
  const router = useRouter(),
    params = useSearchParams()
  const [decks, setDecks] = useState<EntryDeck[] | null>(null),
    [selected, setSelected] = useState(params.get('pool') ?? ''),
    [filter, setFormatFilter] = useState('all'),
    [query, setQuery] = useState(''),
    [completeOnly, setCompleteOnly] = useState(true),
    [setFilter, setSetFilter] = useState(''),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0)
  useEffect(() => {
    const a = new AbortController()
    fetch('/api/play/native/decks', { signal: a.signal })
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) throw Error(j.error)
        setDecks(j.decks)
        setError('')
        setSelected((v) => v || j.decks.find((d: EntryDeck) => d.ready || d.aiOpponentReady)?.poolShareId || '')
      })
      .catch((e) => {
        if (!a.signal.aborted) setError(e.message)
      })
    return () => a.abort()
  }, [retry])
  const actionRequest = useRef<{ key: string; id: string } | null>(null)
  const [busy, setBusy] = useState(false)
  async function start(action: 'find' | 'invite') {
    if (busy || !selected) return
    setBusy(true)
    setError('')
    const key =
      action === 'find'
        ? `native-public-request:${user?.id}:${selected}:find`
        : `native-invite-request:${user?.id}:${selected}:false`
    if (actionRequest.current?.key !== key) {
      let id: string | null = null
      try {
        id = sessionStorage.getItem(key)
      } catch {}
      actionRequest.current = { key, id: id ?? crypto.randomUUID() }
      try {
        sessionStorage.setItem(key, actionRequest.current.id)
      } catch {}
    }
    try {
      const r = await fetch(
        action === 'find' ? '/api/play/native/public' : '/api/play/native/invitations',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ poolShareId: selected, requestId: actionRequest.current.id }),
        }
      )
      const j = await r.json()
      if (!r.ok) throw Error(j.error)
      if (action === 'invite') {
        try {
          sessionStorage.removeItem(key)
        } catch {}
      }
      actionRequest.current = null
      router.push(
        action === 'invite'
          ? `/play/native?invite=${encodeURIComponent(j.token)}&pool=${encodeURIComponent(selected)}`
          : `/play?pool=${encodeURIComponent(selected)}`
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to start.')
      setBusy(false)
    }
  }
  const filteredDecks = (decks ?? []).filter(d =>
    (!completeOnly || (d.complete ?? d.ready)) && (filter === 'all' || d.poolType === filter) && (!setFilter || d.setCode === setFilter) &&
    [d.name, d.leaderName, d.baseName, d.setCode, d.setName].join(' ').toLowerCase().includes(query.trim().toLowerCase())
  )
  const clearFilters = () => { setQuery(''); setFormatFilter('all'); setSetFilter(''); setCompleteOnly(false) }
  const deck = decks?.find((d) => d.poolShareId === selected)
  if (!decks && !error) return <EntrySkeleton page="play" />
  return (
    <EntryShell setCode={setFilter || deck?.setCode} back={{ label: 'Back', onClick: () => router.push('/') }}>
      <h1>Play</h1>
      {error && (
        <div role="alert">
          <p>{error}</p>
          <Button onClick={() => setRetry((x) => x + 1)}>Retry</Button>
        </div>
      )}
      <div className="entry-layout">
        <section>
          <h2>Choose your deck</h2>
          <input className="entry-deck-search lobby-deck-search" type="search" aria-label="Search decks" placeholder="Search decks or leaders" value={query} onChange={event => setQuery(event.target.value)} />
          <div className="entry-filters">
            {['all', 'draft', 'sealed'].map((f) => (
              <Button
                key={f}
                variant="toggle"
                active={filter === f}
                aria-pressed={filter === f}
                onClick={() => setFormatFilter(f)}
              >
                {f === 'all' ? 'All decks' : f === 'draft' ? 'Draft' : 'Sealed'}
              </Button>
            ))}
            <select aria-label="Deck set" value={setFilter} onChange={event => setSetFilter(event.target.value)}>
              <option value="">All sets</option>
              {[...new Set((decks ?? []).map(d => d.setCode))].sort().map(code => <option key={code} value={code}>{code}</option>)}
            </select>
          </div>
          <div className="entry-filters">
            <EntryFilterCheckbox label="Complete decks only" checked={completeOnly} onChange={setCompleteOnly} />
          </div>
          <div className="entry-decks">
            {filteredDecks.map((d) => (
                <EntryDeckCard key={d.poolShareId} deck={d} selected={selected === d.poolShareId}>
                    <Button
                      variant={selected === d.poolShareId ? "toggle" : "secondary"}
                      size="sm"
                      active={selected === d.poolShareId}
                      aria-pressed={selected === d.poolShareId}
                      disabled={!(d.ready || d.aiOpponentReady) || busy}
                      onClick={() => setSelected(d.poolShareId)}
                    >
                      {selected === d.poolShareId ? 'Selected' : 'Select'}
                    </Button>
                    <Button
                      size="sm"
                      disabled={d.editLocked}
                      onClick={() => router.push(`/pool/${d.poolShareId}/deck`)}
                    >
                      Edit deck
                    </Button>
                </EntryDeckCard>
              ))}
          </div>
          {!!decks?.length && <p>{filteredDecks.length} of {decks.length} decks</p>}
          {!!decks?.length && !filteredDecks.length && <div><p>No decks match these filters.</p><Button onClick={clearFilters}>Clear filters</Button></div>}
          {selected && !filteredDecks.some(d => d.poolShareId === selected) && <p>Your selected deck is outside these filters.</p>}
          {decks?.length === 0 && <p>You haven’t saved a Draft or Sealed deck yet.</p>}
        </section>
        <aside className="entry-panel entry-summary">
          <h2>{deck?.name ?? 'Select a deck'}</h2>
          <div className="entry-action-stack">
            <Button disabled={!deck?.ready || busy} onClick={() => void start('find')}>
              Find opponent
              <span>Join or open a public table for this format</span>
            </Button>
            <Button disabled={!deck?.ready || busy} onClick={() => void start('invite')}>
              Invite friend
              <span>Create a private table and share its link</span>
            </Button>
            <Button
              disabled={!(deck?.aiOpponentReady ?? deck?.ready) || busy}
              onClick={() => router.push(`/limited/ai?pool=${encodeURIComponent(selected)}`)}
            >
              Play vs AI <span className="entry-beta">Beta</span>
              <span>Choose the AI’s deck and play one practice game</span>
            </Button>
          </div>
        </aside>
      </div>
    </EntryShell>
  )
}

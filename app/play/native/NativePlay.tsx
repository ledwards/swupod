'use client'

import ContentSkeleton from '../../../src/components/ContentSkeleton'
import {useEntryParams} from '@/src/components/EntryFlow/EntryRoute'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import Button from '@/src/components/Button'
import ReplayWatchLink from '@/src/components/ReplayWatchLink'
import NativeDeckPicker, { type NativeDeck } from './NativeDeckPicker'
import NativePublicLobby, { type PublicSeat } from './NativePublicLobby'
import { useAuth } from '@/src/contexts/AuthContext'
import type { PlayDeckSummary } from '@/src/services/play/playState'

type MatchStatus = 'waiting' | 'starting' | 'active' | 'complete' | 'cancelled' | 'failed'
interface NativeMatch {
  visibility?: 'public' | 'private'
  matchId: string
  status: MatchStatus
  seat: number | null
  result?: 'player1' | 'player2' | 'draw' | null
  allowMismatch?: boolean
  setCode?: string
  poolType?: string
  packCount?: number
}
interface InvitationCreated extends NativeMatch { token: string }
interface NativeMatchListing extends NativeMatch { visibility?: 'public' | 'private'; token?: string | null; poolShareId: string }
interface RematchState { status: 'waiting' | 'declined' | 'ready'; accepted: boolean[]; matchId: string | null }
class RequestError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) { super(message) }
}
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...init })
  const value = await response.json() as { error?: string; message?: string; code?: string; data?: T }
  if (!response.ok) throw new RequestError(value.error ?? value.message ?? 'Unable to complete that request. Please retry.', response.status, value.code)
  return value as T
}
const post = (value?: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) })
const messageFor = (error: unknown) => error instanceof Error ? error.message : 'Unable to complete that request. Please retry.'

export default function NativePlay({ publicLobby = false }: { publicLobby?: boolean }) {
  const { user, loading: authLoading } = useAuth() as { user: { id: string; is_admin?:boolean; is_alpha_tester?:boolean } | null; loading: boolean }
  const params = useEntryParams()
  const router = useRouter(), pathname=usePathname(), search=useSearchParams()
  const token = params.get('invite')
  const queryMatch = params.get('match')
  const requestedPool = params.get('pool')
  const [localAiTesting, setLocalAiTesting] = useState(false)
  const [localTesting, setLocalTesting] = useState(false)
  const [publicBusy, setPublicBusy] = useState(false)
  const [publicSeat, setPublicSeat] = useState<PublicSeat | null>(null)
  const [recentMatches, setRecentMatches] = useState<NativeMatchListing[]>([])
  const [rematch, setRematch] = useState<RematchState | null>(null)
  const [decks, setDecks] = useState<NativeDeck[]>([])
  const [hiddenCount, setHiddenCount] = useState(0)
  const [selected, setSelected] = useState(requestedPool ?? '')
  const [match, setMatch] = useState<NativeMatch | null>(null)
  const [allowMismatch, setAllowMismatch] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [authRequired, setAuthRequired] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [origin, setOrigin] = useState('')
  const [refresh, setRefresh] = useState(0)
  const autoLaunch = useRef(false)
  const launchInFlight = useRef(false)
  const launchedInvite = useRef<string | null>(null)
  const rematchIntent = useRef(false)
  const launchedRematch = useRef<string | null>(null)
  const creation = useRef<{ key: string; requestId: string } | null>(null)
  const currentUser = useRef(user?.id)
  currentUser.current = user?.id

  const returnPath = `${pathname}${search.size ? `?${search}` : ''}`
  const loginUrl = `/api/auth/signin/discord?return_to=${encodeURIComponent(returnPath)}`
  const existingTable = recentMatches.find(game => ['waiting', 'starting', 'active'].includes(game.status) && (!publicLobby || game.visibility !== 'public') && game.matchId !== match?.matchId && game.matchId !== publicSeat?.matchId)
  const selectedDeck = decks.find(deck => deck.poolShareId === selected)
  const inviteUrl = token && origin ? `${origin}/lobbies/${encodeURIComponent(token)}` : ''
  const isSeat = match?.seat === 0 || match?.seat === 1
  const canJoin = Boolean(token && match?.status === 'waiting' && !isSeat)
  const chooseDeck = !queryMatch && (!token || canJoin)
  const deckMismatch = (deck: PlayDeckSummary) => Boolean(canJoin && !match?.allowMismatch && ((match?.setCode && deck.setCode !== match.setCode) || (match?.poolType && deck.poolType !== match.poolType) || (match?.packCount && (deck as PlayDeckSummary & {packCount?:number|null}).packCount !== match.packCount)))
  const gameDeck = recentMatches.find(game => game.matchId === match?.matchId)?.poolShareId
  const deckOptions = useMemo(() => [...decks].sort((a, b) => Number(b.poolShareId === requestedPool) - Number(a.poolShareId === requestedPool) || Number(b.ready) - Number(a.ready)), [decks, requestedPool])

  const fail = useCallback((failure: unknown, background = false) => {
    if (background) setSyncError(messageFor(failure))
    else setError(messageFor(failure))
    if (failure instanceof RequestError) {
      if (failure.status === 401) setAuthRequired(true)
      if (failure.code === 'native_disabled') setUnavailable(true)
    }
  }, [])

  useEffect(() => { setOrigin(window.location.origin) }, [])
  useEffect(() => { if (publicSeat) setSelected(publicSeat.poolShareId) }, [publicSeat?.matchId, publicSeat?.poolShareId])
  useEffect(() => {
    if (requestedPool) setSelected(requestedPool)
  }, [requestedPool])

  useEffect(() => {
    if (authLoading) return
    if (!user) { setLoading(false); return }
    const abort = new AbortController()
    setLoading(true)
    void api<{ decks: NativeDeck[]; hiddenCount?: number; localTesting?: boolean; localAiTesting?: boolean }>(`/api/play/native/decks${requestedPool ? `?pool=${encodeURIComponent(requestedPool)}` : ''}`, { signal: abort.signal }).then(response => {
      const next = response.decks ?? []
      setDecks(next)
      setHiddenCount(response.hiddenCount ?? 0)
      setLocalTesting(response.localTesting === true)
      setLocalAiTesting(response.localAiTesting === true)
      setSelected(current => current || next.find(deck => deck.ready)?.poolShareId || next.find(deck => deck.practiceReady)?.poolShareId || '')
    }).catch(failure => { if (!abort.signal.aborted) fail(failure) }).finally(() => { if (!abort.signal.aborted) setLoading(false) })
    return () => abort.abort()
  }, [user?.id, authLoading, refresh, fail, requestedPool])

  useEffect(() => {
    if (!user) { setRecentMatches([]); return }
    const abort = new AbortController()
    void api<{ matches: NativeMatchListing[] }>('/api/play/native/matches', { signal: abort.signal })
      .then(result => { setRecentMatches(result.matches ?? []); setUnavailable(false) })
      .catch(failure => { if (!abort.signal.aborted) fail(failure) })
    return () => abort.abort()
  }, [user?.id, refresh, fail])

  const launch = useCallback(async (matchId: string) => {
    if (launchInFlight.current) return
    launchInFlight.current = true
    setBusy('launch')
    setError(null)
    try {
      const result = await api<{ launchUrl?: string } & Partial<NativeMatch>>(`/api/play/native/matches/${encodeURIComponent(matchId)}/launch`, post())
      if (result.launchUrl) {
        window.location.assign(result.launchUrl)
        return
      }
      if (result.status === 'complete') setMatch(result as NativeMatch)
      else throw new Error('The table is not ready yet. Your reserved deck is safe; try opening it again.')
    } catch (failure) { fail(failure) }
    finally { launchInFlight.current = false; setBusy(null); autoLaunch.current = false }
  }, [fail])

  useEffect(() => {
    if (!user || (!token && !queryMatch)) { setMatch(null); return }
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const abort = new AbortController()
    const load = async () => {
      try {
        const path = token ? `/api/play/native/invitations/${encodeURIComponent(token)}` : `/api/play/native/matches/${encodeURIComponent(queryMatch!)}`
        let next = await api<NativeMatch>(path, { signal: abort.signal })
        if (token && next.status === 'complete' && next.seat !== null) {
          next = await api<NativeMatch>(`/api/play/native/matches/${encodeURIComponent(next.matchId)}`, { signal: abort.signal })
        }
        if (disposed) return
        setMatch(next)
        setSyncError(null)
        // An invite page represents intent to play. A return-to-result match page does not.
        if (token && next.seat !== null && ['starting', 'active'].includes(next.status) && (autoLaunch.current || next.seat === 0 || next.seat === 1) && launchedInvite.current !== next.matchId) {
          launchedInvite.current = next.matchId
          autoLaunch.current = false
          void launch(next.matchId)
        }
        if (!['complete', 'cancelled', 'failed'].includes(next.status)) timer = setTimeout(() => void load(), 2500)
      } catch (failure) {
        if (disposed) return
        fail(failure, true)
        if (!(failure instanceof RequestError && [401, 403, 404].includes(failure.status))) timer = setTimeout(() => void load(), 5000)
      }
    }
    void load()
    return () => { disposed = true; abort.abort(); if (timer) clearTimeout(timer) }
  }, [user?.id, token, queryMatch, refresh, fail, launch])

  useEffect(() => {
    setRematch(null)
    if (!user || match?.status !== 'complete' || match.seat === null) return
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const abort = new AbortController()
    const matchId = match.matchId
    const seat = match.seat
    const load = async () => {
      try {
        const next = await api<RematchState>(`/api/play/native/matches/${encodeURIComponent(matchId)}/rematch`, { signal: abort.signal })
        if (disposed) return
        setRematch(next)
        if (next.status === 'waiting' && next.accepted[seat]) rematchIntent.current = true
        if (next.status === 'ready' && next.matchId && rematchIntent.current && launchedRematch.current !== next.matchId) {
          launchedRematch.current = next.matchId
          void launch(next.matchId)
        }
        if (next.status === 'waiting') timer = setTimeout(() => void load(), 2500)
      } catch (failure) { if (!disposed) { fail(failure, true); timer = setTimeout(() => void load(), 5000) } }
    }
    void load()
    return () => { disposed = true; abort.abort(); if (timer) clearTimeout(timer) }
  }, [user?.id, match?.matchId, match?.status, match?.seat, launch, fail, refresh])

  async function respondToRematch(accept: boolean) {
    if (!match || busy) return
    setBusy('rematch'); setError(null)
    try {
      const next = await api<RematchState>(`/api/play/native/matches/${encodeURIComponent(match.matchId)}/rematch`, post({ accept }))
      setRematch(next); rematchIntent.current = accept
      if (accept && next.status === 'ready' && next.matchId) { launchedRematch.current = next.matchId; await launch(next.matchId) }
    } catch (failure) { fail(failure) }
    finally { setBusy(null) }
  }

  async function watchReplay(matchId: string) {
    if (busy) return
    setBusy('replay'); setError(null)
    try { const result = await api<{ launchUrl: string }>(`/api/play/native/matches/${encodeURIComponent(matchId)}/replay-launch`, post()); window.location.assign(result.launchUrl) }
    catch (failure) { fail(failure) }
    finally { setBusy(null) }
  }

  async function createInvite() {
    if (!selectedDeck?.ready || busy || !user) return
    setBusy('create'); setError(null)
    const key = `${user.id}:${selected}:${allowMismatch}`
    if (creation.current?.key !== key) {
      const storageKey = `native-invite-request:${key}`
      let requestId: string | null = null
      try { requestId = sessionStorage.getItem(storageKey) } catch { /* Private browsing may restrict storage. */ }
      requestId ||= crypto.randomUUID()
      creation.current = { key, requestId }
      try { sessionStorage.setItem(storageKey, requestId) } catch { /* The in-memory key still makes retries idempotent. */ }
    }
    try {
      const result = await api<InvitationCreated>('/api/play/native/invitations', post({ poolShareId: selected, requestId: creation.current.requestId, allowMismatch }))
      if (currentUser.current !== user.id) return
      setMatch({ ...result, seat: 0 }); autoLaunch.current = true
      try { sessionStorage.removeItem(`native-invite-request:${key}`) } catch { /* Optional retry storage. */ }
      creation.current = null
      router.replace(`/lobbies/${encodeURIComponent(result.token)}`)
    } catch (failure) { fail(failure) }
    finally { setBusy(null) }
  }

  async function joinInvite() {
    if (!token || !selectedDeck?.ready || deckMismatch(selectedDeck) || busy) return
    setBusy('join'); setError(null)
    try {
      const result = await api<NativeMatch>(`/api/play/native/invitations/${encodeURIComponent(token)}`, post({ poolShareId: selected }))
      setMatch(result); autoLaunch.current = true
      await launch(result.matchId)
    } catch (failure) { fail(failure) }
    finally { setBusy(null) }
  }

  async function cancelInvite() {
    if (!token || busy) return
    setBusy('cancel'); setError(null)
    try { const result = await api<NativeMatch>(`/api/play/native/invitations/${encodeURIComponent(token)}`, { method: 'DELETE' }); setMatch(result); autoLaunch.current = false; setRefresh(value => value + 1) }
    catch (failure) { fail(failure) }
    finally { setBusy(null) }
  }

  async function copyInvite() {
    try { await navigator.clipboard.writeText(inviteUrl); setNotice('Invite link copied. Share it with your friend.') }
    catch { setNotice('Select the link below to copy it manually.') }
  }

  const heading = match?.status === 'complete' ? 'Game complete' : token ? 'Your private table' : publicLobby ? 'Play' : 'Play with a friend'
  const outcome = match?.result === 'draw' ? 'Draw' : match?.result ? ((match.result === 'player1' ? 0 : 1) === match.seat ? 'You won' : 'Your opponent won') : 'Result pending'
  const testAction = localTesting && <div className="native-local-testing">{localAiTesting && <Button size="sm" variant="primary" disabled={!selectedDeck?.practiceReady || Boolean(busy) || Boolean(publicSeat) || publicBusy} onClick={() => router.push(`/play/test?pool=${encodeURIComponent(selected)}&request=${crypto.randomUUID()}&opponent=ai&seat=0`)}>Play vs AI · Alpha</Button>}<Button size="sm" disabled={!selectedDeck?.practiceReady || Boolean(busy) || Boolean(publicSeat) || publicBusy} onClick={() => router.push(`/play/test?pool=${encodeURIComponent(selected)}&request=${crypto.randomUUID()}`)}>Test both sides</Button><span>Same account · two windows</span></div>
  const privateAction = <div className="native-private-action">
    <Button variant={publicLobby && !token ? 'secondary' : 'primary'} size="lg" disabled={!selectedDeck?.ready || (selectedDeck ? deckMismatch(selectedDeck) : false) || Boolean(busy) || Boolean(existingTable) || Boolean(publicSeat) || publicBusy} onClick={() => void (token ? joinInvite() : createInvite())}>{busy === 'create' ? 'Reserving your table…' : busy === 'join' || busy === 'launch' ? 'Opening your game…' : token ? 'Join and play' : 'Invite a friend'}</Button>
    {!token && <details className="native-private-options"><summary>Private table options</summary><label className="native-play-mismatch"><input type="checkbox" checked={allowMismatch} disabled={Boolean(busy) || Boolean(publicSeat) || publicBusy} onChange={event => setAllowMismatch(event.currentTarget.checked)} /><span>Allow different sets, formats, or pack counts</span></label></details>}
  </div>
  if(!authLoading&&user&&!user.is_admin&&!user.is_alpha_tester)return null;
  return <main className="native-play-page page-background"><section className="native-play-shell">
    <header className="native-play-heading"><h1>{heading}</h1><p>{publicLobby ? 'Choose a saved limited deck. Find an opponent or invite a friend.' : 'Choose a saved limited deck and share a table with a friend.'}</p></header>
    {authLoading ? <p role="status">Checking your sign-in…</p> : !user || authRequired ? <section className="native-play-panel"><h2>Sign in to play</h2><a className="btn btn--md btn--discord native-play-login" href={loginUrl}>Sign in with Discord</a></section> : <>
      {(error || syncError) && <section className="native-play-error" role="alert"><p>{error || syncError}</p><Button size="sm" onClick={() => { setError(null); setSyncError(null); setRefresh(value => value + 1) }}>Retry</Button></section>}
      {notice && <p className="native-play-notice" role="status">{notice}</p>}
      {loading && <ContentSkeleton kind="row"/>}
      {unavailable ? <section className="native-play-panel"><h2>Play is temporarily unavailable</h2><p>Your Saved Decks are unchanged. You can keep building and try again later.</p><a href="/history">Your decks</a></section> : <>
        {token && !match && !error && <p role="status">Finding your invitation…</p>}
        {existingTable && <section className="native-play-panel"><h2>You already have a table</h2><p>{existingTable.setCode} · {existingTable.poolType} · {existingTable.status === 'waiting' ? 'Waiting for your friend' : 'Game in progress'}</p><a className="btn btn--md btn--primary" href={existingTable.visibility === 'public' ? '/lobbies' : existingTable.token ? `/lobbies/${encodeURIComponent(existingTable.token)}` : `/matches/${encodeURIComponent(existingTable.matchId)}`}>Resume your table</a></section>}
        {match?.status === 'waiting' && match.visibility !== 'public' && isSeat && <section className="native-play-panel native-play-waiting"><span className="native-play-eyebrow">Table reserved</span><h2>Waiting for your friend</h2><p>Share this private link over Discord or anywhere you chat. Your game opens when they join.</p><div className="native-play-share"><label htmlFor="native-invite-link">Invite link</label><input id="native-invite-link" readOnly value={inviteUrl} onFocus={event => event.currentTarget.select()} /><Button variant="primary" onClick={() => void copyInvite()}>Copy invite link</Button></div><p className="native-play-format">{match.allowMismatch ? 'Different sets, formats, and pack counts are allowed. Both decks must still be legal and supported.' : 'Your friend needs a deck with the same set, format, and pack count.'}</p>{match.seat === 0 && <Button size="sm" disabled={Boolean(busy)} onClick={() => void cancelInvite()}>Cancel invitation</Button>}</section>}
        {match?.status === 'waiting' && match.visibility === 'public' && isSeat && <section className="native-play-panel"><h2>Finding your opponent</h2><p>Your public seat is still reserved.</p><a className="btn btn--md btn--primary" href="/play">Return to the lobby</a></section>}
        {canJoin && <section className="native-play-invite-summary"><h2>A friend saved you a seat</h2><p>{match?.allowMismatch ? 'This table allows different sets, formats, and pack counts. Choose any legal, supported limited deck.' : `Choose a matching deck${match?.setCode ? `: ${match.setCode} ${match.poolType ?? ''}${match.packCount ? ` · ${match.packCount} packs` : ''}` : ' with the same set, format, and pack count'}.`}</p></section>}
        {requestedPool && !loading && !decks.some(deck => deck.poolShareId === requestedPool) && <section className="native-play-panel"><h2>This deck is not available for play</h2><p>Native play currently supports verified draft and sealed decks. Pack Wars, Pack Blitz, imported pools, and decks belonging to another player cannot enter this lobby.</p><a href={`/pools/${encodeURIComponent(requestedPool)}`}>Return to this deck</a></section>}
        {chooseDeck && !loading && <div className="native-play-workspace">
          <NativeDeckPicker decks={deckOptions} hiddenCount={hiddenCount} selected={selected} reserved={publicSeat?.poolShareId} disabled={Boolean(busy) || Boolean(publicSeat) || publicBusy} mismatch={deckMismatch} onSelect={id => { setSelected(id); setError(null) }} />
          <aside className="native-play-panel native-play-seat" aria-label="Play with selected deck">
            <h2>Your Deck</h2>
            {selectedDeck ? <div className="native-selected-deck">
              {selectedDeck.leaderImageUrl && <img src={selectedDeck.leaderImageUrl} alt="" />}
              <div><strong>{selectedDeck.name}</strong><span>{selectedDeck.leaderName} · {selectedDeck.baseName}</span><span>{selectedDeck.setCode} · {selectedDeck.poolType}{selectedDeck.packCount ? ` · ${selectedDeck.packCount} packs` : ''}</span></div>
            </div> : <p>Choose a deck from your library.</p>}
            {selectedDeck?.blocker && <p className="native-selected-blocker">{selectedDeck.practiceReady ? 'Matchmaking: ' : ''}{selectedDeck.blocker}</p>}
            {publicLobby && !token && !queryMatch ? <NativePublicLobby deck={selectedDeck} userId={user.id} blocked={Boolean(existingTable) || Boolean(busy)} onReservation={setPublicSeat} onBusy={setPublicBusy} launch={launch} secondaryAction={privateAction} extraAction={testAction} /> : <>{privateAction}{testAction}</>}
          </aside>
        </div>}

        {match && ['starting', 'active'].includes(match.status) && isSeat && <section className="native-play-panel"><h2>{busy === 'launch' ? 'Opening your game…' : 'Your game is ready'}</h2><p>Both seats are reserved. Resume with the same deck and game state.</p><Button variant="primary" disabled={Boolean(busy)} onClick={() => void launch(match.matchId)}>{busy === 'launch' ? 'Connecting…' : 'Resume game'}</Button></section>}
        {match?.status === 'complete' && isSeat && <section className="native-play-panel"><span className="native-play-eyebrow">Final result</span><h2>{outcome}</h2><ReplayWatchLink disabled={Boolean(busy)} onClick={() => void watchReplay(match.matchId)}>{busy === 'replay' ? 'Opening replay…' : 'Watch replay'}</ReplayWatchLink><div className="native-play-rematch">{rematch?.status === 'declined' ? <p>Rematch declined. You can choose a deck and start another table.</p> : rematch?.status === 'ready' && rematch.matchId ? <Button variant="primary" disabled={Boolean(busy)} onClick={() => void launch(rematch.matchId!)}>Open rematch</Button> : rematch ? <><p>{rematch.accepted[match.seat ?? 0] ? 'Waiting for your friend to accept the rematch.' : rematch.accepted[1 - (match.seat ?? 0)] ? 'Your friend wants a rematch with the same decks.' : 'Play again with these exact decks. Both players must accept.'}</p><div className="native-play-actions"><Button variant="primary" disabled={Boolean(busy) || rematch.accepted[match.seat ?? 0]} onClick={() => void respondToRematch(true)}>{rematch.accepted[match.seat ?? 0] ? 'Rematch requested' : 'Rematch'}</Button><Button disabled={Boolean(busy)} onClick={() => void respondToRematch(false)}>No rematch</Button></div></> : <p>Checking rematch availability…</p>}</div><div className="native-play-actions"><a className="btn btn--md btn--secondary" href="/play">Choose another deck</a>{gameDeck && <a className="native-play-secondary-link" href={`/pools/${encodeURIComponent(gameDeck)}`}>Adjust your deck</a>}</div></section>}
        {match && ['cancelled', 'failed'].includes(match.status) && <section className="native-play-panel"><h2>{match.status === 'cancelled' ? 'This invitation was cancelled' : 'This game could not start'}</h2><p>Your deck is still saved.</p><a className="btn btn--md btn--primary" href="/play/native">Start a new table</a></section>}
        {token && match && !isSeat && match.status !== 'waiting' && <section className="native-play-panel"><h2>This table is no longer available</h2><p>Ask your friend for a new invitation, or start a table of your own.</p><a href="/play/native">Create a private table</a></section>}
        {!token && !queryMatch && recentMatches.some(game => game.status === 'complete') && <details className="native-play-recent"><summary>Recent Games</summary>{recentMatches.filter(game => game.status === 'complete').slice(0, 3).map(game => <div className="native-play-recent-row" key={game.matchId}><a href={`/matches/${encodeURIComponent(game.matchId)}`}>{game.setCode} · {game.poolType}<span>View result and rematch</span></a><ReplayWatchLink disabled={Boolean(busy)} onClick={() => void watchReplay(game.matchId)}>Watch replay</ReplayWatchLink></div>)}</details>}
      </>}
    </>}
  </section></main>
}

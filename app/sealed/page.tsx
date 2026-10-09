"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../src/contexts/AuthContext'
import EntryShell from '../../src/components/EntryFlow/EntryShell'
import ConfirmModal from '../../src/components/ConfirmModal'
import ContentSkeleton from '../../src/components/ContentSkeleton'
import { SET_CONFIGS, type SetConfig } from '../../src/utils/setConfigs'
import { getUnavailableSetReason } from '../../src/utils/setAvailability'
import { getPackArtUrl } from '../../src/utils/packArt'
import { STANDARD_SEALED_PACKS_PER_PLAYER } from '../../src/utils/sealedPodConfig'
import { readSealedPackCountPreference, saveSealedPackCountPreference } from '../../src/utils/sealedPackCountPreference'
import { eligibleCount, type QueueContract } from '../../src/components/SharedPlay/deck-library'
import { trackEvent } from '../../src/hooks/useAnalytics'
import { getOrCreateLimitedFlowId, LimitedAnalyticsEvents } from '../../src/analytics/limitedEvents'
import '../../src/App.css'
import '../../src/components/SharedPlay/shared-play.css'

type Deck = { poolShareId: string; name: string; setCode: string; poolType: string; packCount: number | null; ready: boolean; hasDeck?: boolean; editUrl?: string }
type Shared = { signedIn: boolean; queues: { contract: QueueContract; waiting: number }[] }
const sameQueue = (a: QueueContract, b: QueueContract) => a.format === b.format && a.limited === b.limited && a.set === b.set

export default function SealedPage() {
  const router = useRouter()
  const { user, isAuthenticated, loading: authLoading } = useAuth()
  const sets = Object.values(SET_CONFIGS as Record<string, SetConfig>)
    .filter(c => !getUnavailableSetReason(c.setCode, user))
    .sort((a, b) => b.setNumber - a.setNumber)
  const [setCode, setSetCode] = useState('')
  const chosen = setCode || sets[0]?.setCode || ''
  const [packCount, setPackCount] = useState(() => readSealedPackCountPreference(STANDARD_SEALED_PACKS_PER_PLAYER))
  const [shared, setShared] = useState<Shared>()
  const [decks, setDecks] = useState<Deck[]>()
  const [deleting, setDeleting] = useState<Deck | null>(null)
  const [busy, setBusy] = useState(false)

  const load = async (signal?: AbortSignal) => {
    try {
      const state = await fetch('/api/play/native/shared', { credentials: 'same-origin', cache: 'no-store', ...(signal ? { signal } : {}) }).then(r => r.json())
      setShared(state)
      if (state.signedIn) {
        const result = await fetch('/api/play/native/shared', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'decks' }), ...(signal ? { signal } : {}) }).then(r => r.json())
        setDecks(Array.isArray(result.decks) ? result.decks : [])
      } else setDecks([])
    } catch { /* keep what we have */ }
  }
  useEffect(() => { const c = new AbortController(); void load(c.signal); const t = setInterval(() => void load(c.signal), 10000); return () => { c.abort(); clearInterval(t) } }, [])

  const choosePackCount = (n: number) => { setPackCount(n); saveSealedPackCountPreference(n) }
  const openPacks = () => {
    const flowId = getOrCreateLimitedFlowId('sealed:solo')
    trackEvent(LimitedAnalyticsEvents.LIMITED_FLOW_STARTED, { format: 'sealed', mode: 'solo', surface: 'sealed_landing', source_route: '/sealed', flow_id: flowId, set_code: chosen, pack_count: packCount })
    const flowParam = flowId ? `&flowId=${encodeURIComponent(flowId)}` : ''
    window.location.href = `/pools/new?set=${chosen}&packs=${packCount}${flowParam}`
  }
  const deletePool = async () => {
    if (!deleting) return
    setBusy(true)
    try { await fetch(`/api/pools/${encodeURIComponent(deleting.poolShareId)}`, { method: 'DELETE', credentials: 'include' }); setDeleting(null); await load() } finally { setBusy(false) }
  }

  const queues: QueueContract[] = (['six', 'eight'] as const).map(limited => ({ format: 'limited', limited, set: chosen, pool: 'current' }))
  const waitingFor = (c: QueueContract) => (shared?.queues ?? []).filter(q => sameQueue(q.contract, c)).reduce((n, q) => n + q.waiting, 0)
  const unbuilt = (decks ?? []).filter(d => d.poolType === 'sealed' && d.hasDeck === false)
  const setName = sets.find(c => c.setCode === chosen)?.setName ?? chosen

  return (
    <EntryShell back={{ label: 'Back', onClick: () => router.push('/') }}>
      <section className="sp-workspace" aria-label="Sealed">
        <header className="sp-title"><h1>Sealed</h1></header>
        <div className="sp-layout">
          <section aria-label="Open a sealed pool">
            <fieldset className="sp-field">
              <legend>Set</legend>
              <div className="sp-setgrid">
                {sets.map((c) => {
                  const art = getPackArtUrl(c.setCode)
                  return <button key={c.setCode} type="button" className="sp-set" aria-pressed={chosen === c.setCode} style={art ? { backgroundImage: `url("${art}")` } : undefined} onClick={() => setSetCode(c.setCode)}>
                    <span><b>{c.setCode}</b><small>{c.setName}</small></span>
                  </button>
                })}
              </div>
            </fieldset>
            <fieldset className="sp-field">
              <legend>Packs</legend>
              <div className="sp-choices">
                {[6, 8].map(n => <button key={n} type="button" aria-pressed={packCount === n} onClick={() => choosePackCount(n)}>{n} packs</button>)}
              </div>
            </fieldset>
            <div className="sp-contract"><strong>{setName} · Sealed · {packCount} packs</strong></div>
            <div className="sp-actions">
              {isAuthenticated
                ? <button type="button" className="sp-primary" disabled={!chosen || authLoading} onClick={openPacks}>Open Packs</button>
                : <button type="button" className="sp-primary" disabled={authLoading} onClick={() => { window.location.href = '/api/auth/signin/discord?return_to=%2Fsealed' }}>Log in with Discord</button>}
            </div>
          </section>
          <aside>
            <section className="sp-panel" aria-label="Sealed queues">
              <h2>Sealed queues</h2>
              {queues.map(c => {
                const eligible = decks ? eligibleCount(c, decks) : null
                return <div className="sp-queue" key={c.limited}>
                  <strong>{chosen} · Sealed · {c.limited === 'six' ? 6 : 8} packs</strong>
                  <small>{shared ? waitingFor(c) : '—'} waiting{eligible !== null && shared?.signedIn && <> · {eligible} eligible {eligible === 1 ? 'deck' : 'decks'}</>}</small>
                  <button type="button" onClick={() => router.push(`/play?limited=${c.limited}&set=${encodeURIComponent(chosen)}`)}>Play</button>
                </div>
              })}
            </section>
            {isAuthenticated && (
              <section className="sp-panel" aria-label="Pools without a deck">
                <h2>Pools without a deck</h2>
                {decks === undefined ? <ContentSkeleton kind="row"/> : unbuilt.length === 0 ? <p className="sp-empty">Every sealed pool has a deck.</p> : unbuilt.map(d => (
                  <div className="sp-queue" key={d.poolShareId}>
                    <strong>{d.name}</strong>
                    <small>{d.setCode} · {d.packCount ?? '?'} packs</small>
                    <button type="button" onClick={() => router.push(`/pool/${encodeURIComponent(d.poolShareId)}/deck`)}>Build deck</button>
                    <button type="button" className="sp-row-del" aria-label={`Delete ${d.name}`} title="Delete pool" onClick={() => setDeleting(d)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                  </div>
                ))}
              </section>
            )}
          </aside>
        </div>
        <ConfirmModal isOpen={!!deleting} title="Delete pool?" confirmLabel="Delete" confirming={busy} onConfirm={deletePool} onCancel={() => setDeleting(null)}>
          <p>This removes the pool and its cards. This cannot be undone.</p>
        </ConfirmModal>
      </section>
    </EntryShell>
  )
}

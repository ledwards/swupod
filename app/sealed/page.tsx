'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../src/contexts/AuthContext'
import { usePublicPodsSocket } from '../../src/hooks/usePublicPodsSocket'
import EntryShell from '../../src/components/EntryFlow/EntryShell'
import ContentSkeleton from '../../src/components/ContentSkeleton'
import { SET_CONFIGS, type SetConfig } from '../../src/utils/setConfigs'
import { getUnavailableSetReason } from '../../src/utils/setAvailability'
import { STANDARD_SEALED_PACKS_PER_PLAYER } from '../../src/utils/sealedPodConfig'
import { readSealedPackCountPreference, saveSealedPackCountPreference } from '../../src/utils/sealedPackCountPreference'
import { STANDARD_SEALED_NEW_PATH } from '../../src/utils/draftCreationRoutes'
import { trackEvent } from '../../src/hooks/useAnalytics'
import { getOrCreateLimitedFlowId, LimitedAnalyticsEvents } from '../../src/analytics/limitedEvents'
import '../../src/App.css'
import '../../src/components/SharedPlay/shared-play.css'

interface SealedPod {
  id: string
  shareId: string
  setCode: string
  setName?: string
  podName?: string
  status: string
  currentPlayers: number
  isHost: boolean
  createdAt: string
  poolShareId?: string
}

const statusLabel = (status: string) => status === 'waiting' ? 'Lobby' : status === 'active' ? 'In Progress' : status === 'complete' ? 'Complete' : status
const formatDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

export default function SealedPage() {
  const router = useRouter()
  const { user, isAuthenticated, loading: authLoading } = useAuth()
  const [packCount, setPackCount] = useState(() => readSealedPackCountPreference(STANDARD_SEALED_PACKS_PER_PLAYER))
  const sets = Object.values(SET_CONFIGS as Record<string, SetConfig>)
    .filter(c => !getUnavailableSetReason(c.setCode, user))
    .sort((a, b) => b.setNumber - a.setNumber)
  const [setCode, setSetCode] = useState('')
  const chosenSet = setCode || sets[0]?.setCode || ''
  const sealedPods = usePublicPodsSocket().filter(p => p.podType === 'sealed')
  const [history, setHistory] = useState<SealedPod[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  useEffect(() => {
    if (!isAuthenticated) { setHistory([]); return }
    const controller = new AbortController()
    setHistoryLoading(true)
    fetch('/api/sealed/history', { credentials: 'include', signal: controller.signal })
      .then(async r => { const j = await r.json(); setHistory(j.data?.pods ?? j.pods ?? []) })
      .catch(() => {})
      .finally(() => { if (!controller.signal.aborted) setHistoryLoading(false) })
    return () => controller.abort()
  }, [isAuthenticated])

  const choosePackCount = (count: number) => { setPackCount(count); saveSealedPackCountPreference(count) }
  const openSolo = () => {
    const flowId = getOrCreateLimitedFlowId('sealed:solo')
    trackEvent(LimitedAnalyticsEvents.LIMITED_FLOW_STARTED, { format: 'sealed', mode: 'solo', surface: 'sealed_landing', source_route: '/sealed', flow_id: flowId, set_code: chosenSet, pack_count: packCount })
    const flowParam = flowId ? `&flowId=${encodeURIComponent(flowId)}` : ''
    window.location.href = `/pools/new?set=${chosenSet}&packs=${packCount}${flowParam}`
  }
  const seats = (current: number, max: number) => Array.from({ length: Math.min(max, 8) }, (_, i) => <i key={i} data-filled={i < current} />)

  return (
    <EntryShell back={{ label: 'Back', onClick: () => router.push('/') }}>
      <section className="sp-workspace" aria-label="Sealed">
        <header className="sp-title"><h1>Sealed</h1><p>Open {packCount} packs, build the best deck in them, then play.</p></header>
        <div className="sp-layout">
          <section aria-label="Start a sealed pool">
            <fieldset className="sp-field">
              <legend>Packs</legend>
              <div className="sp-choices">
                {[6, 8].map(n => <button key={n} type="button" aria-pressed={packCount === n} onClick={() => choosePackCount(n)}>{n} packs</button>)}
              </div>
            </fieldset>
            <fieldset className="sp-field">
              <legend>Set</legend>
              <div className="sp-choices">
                {sets.map(c => <button key={c.setCode} type="button" aria-pressed={chosenSet === c.setCode} onClick={() => setSetCode(c.setCode)}>{c.setCode}</button>)}
              </div>
            </fieldset>
            <p className="sp-help">{packCount === 8 ? 'Eight packs: a deeper pool and the standard for pods.' : 'Six packs: the quick sealed pool.'} Remembered for next time.</p>
            <div className="sp-contract">
              <strong>{sets.find(c => c.setCode === chosenSet)?.setName ?? chosenSet} · Sealed · {packCount} packs</strong>
              <small>Build your deck after opening, then play it from Decks & History or Play</small>
            </div>
            <div className="sp-actions">
              <div className="sp-action-pair">
                <button type="button" className="sp-primary" disabled={!chosenSet} onClick={openSolo}>Open packs solo <span>(build and play right now)</span></button>
                {isAuthenticated
                  ? <button type="button" disabled={authLoading} onClick={() => router.push(STANDARD_SEALED_NEW_PATH)}>Start a sealed pod <span>(everyone opens together)</span></button>
                  : <button type="button" disabled={authLoading} onClick={() => { window.location.href = '/api/auth/signin/discord?return_to=%2Fsealed' }}>Log in with Discord <span>(to start or join a pod)</span></button>}
              </div>
            </div>
          </section>
          <aside>
            <section className="sp-pods">
              <div className="sp-section-heading"><h2>Sealed pods forming</h2></div>
              <p>Everyone opens the same number of packs at the same time.</p>
              {sealedPods.length ? sealedPods.map(pod => (
                <div className="sp-pod" key={`public-${pod.shareId}`}>
                  <div>
                    <strong>{pod.setName || pod.setCode}</strong>
                    <small>{pod.host.username} · {pod.currentPlayers}/{pod.maxPlayers} players</small>
                    <div className="sp-seats" aria-hidden="true">{seats(pod.currentPlayers, pod.maxPlayers)}</div>
                  </div>
                  <a href={`/sealed/${pod.shareId}`} onClick={e => { e.preventDefault(); router.push(`/sealed/${pod.shareId}`) }}>Join pod</a>
                </div>
              )) : <p className="sp-empty">No pods forming right now.</p>}
            </section>
            {isAuthenticated && (
              <section>
                <div className="sp-section-heading"><h2>Your sealed pods</h2></div>
                {historyLoading ? <ContentSkeleton kind="row"/> : history.length === 0 ? <p className="sp-empty">No sealed pods yet.</p> : history.map(pod => (
                  <div className="sp-queue" key={pod.id}>
                    <strong>{pod.podName || pod.setName || pod.setCode}{pod.isHost && <small> · Host</small>}</strong>
                    <small>{statusLabel(pod.status)} · {pod.currentPlayers} players · {formatDate(pod.createdAt)}</small>
                    <button type="button" onClick={() => router.push(`/sealed/${pod.shareId}`)}>Open</button>
                  </div>
                ))}
              </section>
            )}
          </aside>
        </div>
      </section>
    </EntryShell>
  )
}

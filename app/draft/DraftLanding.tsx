'use client'

import ContentSkeleton from '../../src/components/ContentSkeleton'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../src/contexts/AuthContext'
import { usePublicPodsSocket } from '../../src/hooks/usePublicPodsSocket'
import { createDraft, dropFromDraft } from '../../src/utils/draftApi'
import { trackEvent, AnalyticsEvents } from '../../src/hooks/useAnalytics'
import { getOrCreateLimitedFlowId, LimitedAnalyticsEvents } from '../../src/analytics/limitedEvents'
import ConfirmModal from '../../src/components/ConfirmModal'
import { PATREON_URL } from '../../src/utils/membership'
import { getPackArtUrl } from '../../src/utils/packArt'
import { SET_CONFIGS, type SetConfig } from '../../src/utils/setConfigs'
import { getUnavailableSetReason } from '../../src/utils/setAvailability'
import { STANDARD_DRAFT_NEW_PATH } from '../../src/utils/draftCreationRoutes'
import '../../src/App.css'
import EntryShell from '../../src/components/EntryFlow/EntryShell'
import '../../src/components/SharedPlay/shared-play.css'
import { ArtRow, ArtRows, isFresh } from '../../src/components/SharedPlay/ArtRows'
import './draft.css'

interface DraftPod {
  id: string
  shareId: string
  isSolo?: boolean
  poolShareId?: string
  setName?: string
  setCode: string
  status: string
  isHost: boolean
  isBot?: boolean
  currentPlayers: number
  maxPlayers: number
  createdAt: string
}

interface DeleteConfirmState {
  shareId: string
  poolShareId?: string | undefined
  isHost: boolean
}

interface DropConfirmState {
  shareId: string
}

export default function DraftLandingPage() {
  const router = useRouter()
  const { user, isAuthenticated, isPatron, loading: authLoading } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [wasRemoved, setWasRemoved] = useState(false)
  const [mode, setMode] = useState<'standard' | 'competitive'>('standard')
  const [isPublic, setIsPublic] = useState(true)
  const [creating, setCreating] = useState(false)
  const [creatingSolo, setCreatingSolo] = useState(false)
  useEffect(() => { try { setIsPublic(localStorage.getItem('pod-visibility') !== 'private') } catch { /* default public */ } }, [])
  const chooseVisibility = (pub: boolean) => { setIsPublic(pub); try { localStorage.setItem('pod-visibility', pub ? 'public' : 'private') } catch { /* fine */ } }
  const [setCode, setSetCode] = useState('')
  const [pools, setPools] = useState<{ poolShareId: string; name: string; setCode: string; poolType: string; hasDeck?: boolean; createdAt?: string | null }[]>()
  const [poolDelete, setPoolDelete] = useState<{ poolShareId: string; name: string } | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('removed') === '1') {
      setWasRemoved(true)
    }
  }, [])

  const [history, setHistory] = useState<DraftPod[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const publicPods = usePublicPodsSocket()
  const draftPods = publicPods.filter(p => p.podType === 'draft')
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [isDeletingPool, setIsDeletingPool] = useState(false)
  const [dropConfirm, setDropConfirm] = useState<DropConfirmState | null>(null)
  const [isDropping, setIsDropping] = useState(false)

  // Fetch draft history when authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      setHistory([])
      return
    }

    const fetchHistory = async () => {
      setHistoryLoading(true)
      try {
        const response = await fetch('/api/draft/history?unfinished=1', {
          credentials: 'include',
        })
        if (response.ok) {
          const data = await response.json()
          const allPods = data.data?.pods || data.pods || []

          setHistory(allPods)
        }
      } catch (err) {
        console.error('Failed to fetch draft history:', err)
      } finally {
        setHistoryLoading(false)
      }
    }

    fetchHistory()
  }, [isAuthenticated, user])

  const createPod = async () => {
    if (creating || !chosen) return
    setCreating(true); setError(null)
    const competitive = mode === 'competitive'
    const flowId = getOrCreateLimitedFlowId('draft:group')
    trackEvent(LimitedAnalyticsEvents.LIMITED_FLOW_STARTED, { format: 'draft', mode: 'group', surface: 'draft_landing', source_route: '/draft', flow_id: flowId, set_code: chosen, is_public: isPublic, competitive })
    try {
      const result = await createDraft(chosen, { isPublic, competitive, flowId })
      trackEvent(AnalyticsEvents.DRAFT_CREATED, { set_code: chosen })
      router.push(`/draft/${result.shareId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create the pod')
      setCreating(false)
    }
  }

  const startSolo = async () => {
    if (creatingSolo || !chosen) return
    setCreatingSolo(true)
    setError(null)
    let shareId: string | undefined
    try {
      const flowId = getOrCreateLimitedFlowId('draft:solo')
      trackEvent(LimitedAnalyticsEvents.LIMITED_FLOW_STARTED, { format: 'draft', mode: 'solo', surface: 'draft_landing', source_route: '/draft', flow_id: flowId, set_code: chosen })
      const draft = await createDraft(chosen, { isPublic: false, flowId, settings: { isSolo: true } })
      shareId = draft.shareId
      trackEvent(AnalyticsEvents.DRAFT_CREATED, { set_code: chosen, solo: true })
      const bots = await fetch(`/api/draft/${shareId}/dev/add-bots?count=7`, { method: 'POST', credentials: 'include' })
      if (!bots.ok) throw new Error('Could not add draft bots')
      router.push(`/draft/${shareId}`)
    } catch (err) {
      // Keep the created pod resumable if setup fails instead of creating duplicates.
      if (shareId) router.push(`/draft/${shareId}`)
      else {
        setError(err instanceof Error ? err.message : 'Could not start the draft')
        setCreatingSolo(false)
      }
    }
  }

  const handleLogin = () => {
    const returnUrl = encodeURIComponent(STANDARD_DRAFT_NEW_PATH)
    window.location.href = `/api/auth/signin/discord?return_to=${returnUrl}`
  }


  const handleDeleteDraft = async () => {
    if (!deleteConfirm || isDeleting) return
    setActionError(null)
    setIsDeleting(true)
    try {
      // Use the draft shareId to delete via draft API
      const response = await fetch(`/api/draft/${deleteConfirm.shareId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (response.ok) {
        setHistory(prev => prev.filter(pod => pod.shareId !== deleteConfirm.shareId))
        setDeleteConfirm(null)
      } else {
        const body = await response.json().catch(() => null)
        setActionError(body?.error || 'Could not delete this pod. Please try again.')
      }
    } catch (err) {
      setActionError('Could not delete this pod. Check your connection and try again.')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleDropFromDraft = async () => {
    if (!dropConfirm || isDropping) return
    setActionError(null)
    setIsDropping(true)
    try {
      await dropFromDraft(dropConfirm.shareId)
      // Remove from local state (user dropped, so they no longer see it)
      setHistory(prev => prev.filter(pod => pod.shareId !== dropConfirm.shareId))
      setDropConfirm(null)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not leave this pod. Please try again.')
    } finally {
      setIsDropping(false)
    }
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return ''
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'waiting': return 'Lobby'
      case 'active': return 'In Progress'
      case 'complete': return 'Complete'
      default: return status
    }
  }

  const competitiveLocked = !isPatron
  const sets = Object.values(SET_CONFIGS as Record<string, SetConfig>)
    .filter(c => !getUnavailableSetReason(c.setCode, user))
    .sort((a, b) => b.setNumber - a.setNumber)
  const chosen = setCode || sets[0]?.setCode || ''
  useEffect(() => {
    if (!isAuthenticated) { setPools([]); return }
    const c = new AbortController()
    fetch('/api/play/native/shared', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'decks' }), signal: c.signal })
      .then(r => r.json()).then(j => setPools(Array.isArray(j.decks) ? j.decks : [])).catch(() => {})
    return () => c.abort()
  }, [isAuthenticated])
  const unbuilt = (pools ?? []).filter(p => p.poolType === 'draft' && p.hasDeck === false && isFresh(p.createdAt))
  const inProgress = history.filter(p => p.status !== 'complete')
  const deletePool = async () => {
    if (!poolDelete || isDeletingPool) return
    setIsDeletingPool(true)
    setActionError(null)
    try {
      const response = await fetch(`/api/pools/${encodeURIComponent(poolDelete.poolShareId)}`, { method: 'DELETE', credentials: 'include' })
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error || 'Could not delete this pool. Please try again.')
      }
      setPools(prev => prev?.filter(p => p.poolShareId !== poolDelete.poolShareId))
      setPoolDelete(null)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not delete this pool. Please try again.')
    } finally {
      setIsDeletingPool(false)
    }
  }
  const trash = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>

  const inProgressRows = (
    <section className="sp-panel" aria-label="Unfinished pods">
      <h2>Unfinished Pods</h2>
      {historyLoading || pools === undefined ? <ContentSkeleton kind="row"/> : inProgress.length + unbuilt.length === 0 ? <p className="sp-empty">Nothing waiting on you.</p> : (
        <ArtRows items={[...inProgress.map(pod => ({ kind: 'pod' as const, key: pod.id, pod })), ...unbuilt.map(p => ({ kind: 'pool' as const, key: p.poolShareId, p }))]} keyOf={r => r.key} render={r => r.kind === 'pod' ? (
          <ArtRow setCode={r.pod.setCode} title={<>{r.pod.setName || r.pod.setCode}{r.pod.isSolo ? ' · Solo' : r.pod.isHost ? ' · Host' : ''}</>} meta={<>{getStatusLabel(r.pod.status)} · {r.pod.currentPlayers}/{r.pod.maxPlayers} players · {formatDate(r.pod.createdAt)}</>}>
            <button type="button" onClick={() => router.push(`/draft/${r.pod.shareId}`)}>Resume</button>
            {r.pod.isHost
              ? <button type="button" className="sp-row-del" aria-label="Delete draft" title="Delete draft" onClick={() => { setActionError(null); setDeleteConfirm({ shareId: r.pod.shareId, poolShareId: r.pod.poolShareId, isHost: r.pod.isHost }) }}>{trash}</button>
              : !r.pod.isBot && <button type="button" className="sp-row-del" aria-label="Drop from draft" title="Drop from draft" onClick={() => { setActionError(null); setDropConfirm({ shareId: r.pod.shareId }) }}>{trash}</button>}
          </ArtRow>
        ) : (
          <ArtRow setCode={r.p.setCode} title={r.p.name} meta={`${r.p.setCode} · drafted, no deck yet`}>
            <button type="button" onClick={() => router.push(`/pool/${encodeURIComponent(r.p.poolShareId)}/deck`)}>Build deck</button>
            <button type="button" className="sp-row-del" aria-label={`Delete ${r.p.name}`} title="Delete pool" onClick={() => { setActionError(null); setPoolDelete(r.p) }}>{trash}</button>
          </ArtRow>
        )}/>
      )}
    </section>
  )

  const left = (
    <section aria-label="Draft">
      <fieldset className="sp-field sp-field--quiet">
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
      <div className="draft-start-options">
      <section className="sp-panel draft-start-option" aria-label="Solo draft">
        <h2>Solo Draft</h2>
        <p className="sp-mode-note">Draft against bots using {sets.find(c => c.setCode === chosen)?.setName ?? chosen}.</p>
        <div className="sp-actions">
          {isAuthenticated
            ? <button type="button" className="sp-primary" disabled={authLoading || !chosen || creatingSolo} onClick={() => void startSolo()} aria-busy={creatingSolo}>Start Draft</button>
            : <button type="button" className="sp-primary" disabled={authLoading} onClick={handleLogin}>Log in with Discord</button>}
        </div>
      </section>
      <div className="draft-start-or" aria-hidden="true">OR</div>
      <section className="sp-panel sp-create draft-start-option" aria-label="Create a pod">
        <h2>Create a Pod</h2>
        <div className="sp-create-grid">
          <fieldset className="sp-field" aria-label="Draft mode">
            <div className="sp-choices">
              <button type="button" aria-pressed={mode === 'standard'} onClick={() => setMode('standard')}>Standard</button>
              <button type="button" aria-pressed={mode === 'competitive'} onClick={() => setMode('competitive')}>Competitive</button>
            </div>
          </fieldset>
          <fieldset className="sp-field">
            <legend>Visibility</legend>
            <div className="sp-choices">
              <button type="button" aria-pressed={isPublic} onClick={() => chooseVisibility(true)}>Public</button>
              <button type="button" aria-pressed={!isPublic} onClick={() => chooseVisibility(false)}>Private</button>
            </div>
          </fieldset>
        </div>
        <p className="sp-mode-note">
          {mode === 'standard'
            ? <>Up to 8 players, 3 packs each. Bots fill empty seats. </>
            : <>Appendix C pick timers, then best-of-three rounds between the drafters.{competitiveLocked && <> Hosting needs <a href={PATREON_URL} target="_blank" rel="noopener noreferrer">Friend of the Pod</a>; anyone can join. </>}{!competitiveLocked && ' '}</>}
          {isPublic ? 'Listed under Join a Pod for anyone to join.' : 'Only people with your link can join.'}
        </p>
        <div className="sp-actions">
          {isAuthenticated
            ? <button type="button" className="sp-primary" disabled={authLoading || creating || !chosen || (mode === 'competitive' && competitiveLocked)} onClick={() => void createPod()}>{creating ? 'Creating…' : 'Create Pod'}</button>
            : <button type="button" className="sp-primary" disabled={authLoading} onClick={handleLogin}>Log in with Discord</button>}
        </div>
      </section>
      </div>
    </section>
  )

  const pods = (
    <section className="sp-panel" aria-label="Join a pod">
      <h2>Join a Pod</h2>
      {draftPods.length ? (
        <ArtRows items={draftPods} keyOf={pod => pod.shareId} render={pod => (
          <ArtRow setCode={pod.setCode} title={pod.setName || pod.setCode} meta={<>{pod.host.username} · {pod.currentPlayers}/{pod.maxPlayers} players</>}>
            <button type="button" onClick={() => router.push(`/draft/${pod.shareId}`)}>Join</button>
          </ArtRow>
        )}/>
      ) : <p className="sp-empty">No pods forming right now.</p>}
    </section>
  )

  return (
    <EntryShell back={{ label: 'Back', onClick: () => router.push('/') }}>
      <section className="sp-workspace" aria-label="Draft">
        <header className="sp-title"><h1>Draft</h1></header>
        {wasRemoved && <div className="sp-error" role="alert">You were removed from the pod by the host.</div>}
        {error && <div className="sp-error" role="alert">{error}</div>}
        <div className="sp-layout">
          {left}
          <aside>{pods}{isAuthenticated && inProgressRows}</aside>
        </div>

        <ConfirmModal isOpen={!!deleteConfirm} title="Delete Draft?" confirmLabel="Delete" confirming={isDeleting} onConfirm={handleDeleteDraft} onCancel={() => setDeleteConfirm(null)}>
          <p>This deletes the pod and its drafted pools for every player. This cannot be undone.</p>
          {actionError && <p role="alert">{actionError}</p>}
        </ConfirmModal>
        <ConfirmModal isOpen={!!dropConfirm} title="Drop from Draft?" confirmLabel="Drop from Draft" cancelLabel="Go Back" confirming={isDropping} onConfirm={handleDropFromDraft} onCancel={() => setDropConfirm(null)}>
          {actionError && <p role="alert">{actionError}</p>}
          <p>Are you sure you want to drop from this draft? A bot will take over your picks and you will lose access to your drafted cards.</p>
        </ConfirmModal>
        <ConfirmModal isOpen={!!poolDelete} title="Delete pool?" confirmLabel="Delete" confirming={isDeletingPool} onConfirm={deletePool} onCancel={() => setPoolDelete(null)}>
          {actionError && <p role="alert">{actionError}</p>}
          <p>This removes the drafted pool and its cards. This cannot be undone.</p>
        </ConfirmModal>
      </section>
    </EntryShell>
  )
}

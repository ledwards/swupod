// @ts-nocheck
'use client'

import ContentSkeleton from '../../src/components/ContentSkeleton'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../src/contexts/AuthContext'
import { usePublicPodsSocket } from '../../src/hooks/usePublicPodsSocket'
import { dropFromDraft } from '../../src/utils/draftApi'
import ConfirmModal from '../../src/components/ConfirmModal'
import { PATREON_URL } from '../../src/utils/membership'
import { getPackArtUrl } from '../../src/utils/packArt'
import { SET_CONFIGS, type SetConfig } from '../../src/utils/setConfigs'
import { getUnavailableSetReason } from '../../src/utils/setAvailability'
import { COMPETITIVE_DRAFT_NEW_PATH, STANDARD_DRAFT_NEW_PATH } from '../../src/utils/draftCreationRoutes'
import '../../src/App.css'
import EntryShell from '../../src/components/EntryFlow/EntryShell'
import '../../src/components/SharedPlay/shared-play.css'
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
  poolShareId?: string
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
  const [setCode, setSetCode] = useState('')
  const [pools, setPools] = useState<{ poolShareId: string; name: string; setCode: string; poolType: string; hasDeck?: boolean }[]>()
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
        const response = await fetch('/api/draft/history', {
          credentials: 'include',
        })
        if (response.ok) {
          const data = await response.json()
          const allPods = data.data?.pods || data.pods || []

          // Always show the most recent draft, plus any active/waiting drafts
          const filteredPods = allPods.filter((pod: DraftPod, index: number) => {
            // Always include the most recent draft (index 0)
            if (index === 0) return true
            // Include any other waiting or active drafts
            return pod.status === 'waiting' || pod.status === 'active'
          })
          setHistory(filteredPods)
        }
      } catch (err) {
        console.error('Failed to fetch draft history:', err)
      } finally {
        setHistoryLoading(false)
      }
    }

    fetchHistory()
  }, [isAuthenticated, user])

  const handleCreateStandard = () => {
    router.push(STANDARD_DRAFT_NEW_PATH)
  }

  const handleCreateCompetitive = () => {
    router.push(COMPETITIVE_DRAFT_NEW_PATH)
  }

  const handleLogin = () => {
    const returnUrl = encodeURIComponent(STANDARD_DRAFT_NEW_PATH)
    window.location.href = `/api/auth/signin/discord?return_to=${returnUrl}`
  }

  const handleBack = () => {
    router.push('/')
  }

  const handleDeleteDraft = async () => {
    if (!deleteConfirm) return
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
        console.error('Failed to delete draft')
      }
    } catch (err) {
      console.error('Failed to delete draft:', err)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleDropFromDraft = async () => {
    if (!dropConfirm) return
    setIsDropping(true)
    try {
      await dropFromDraft(dropConfirm.shareId)
      // Remove from local state (user dropped, so they no longer see it)
      setHistory(prev => prev.filter(pod => pod.shareId !== dropConfirm.shareId))
      setDropConfirm(null)
    } catch (err) {
      console.error('Failed to drop from draft:', err)
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

  const startPod = mode === 'competitive' ? handleCreateCompetitive : handleCreateStandard
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
  const unbuilt = (pools ?? []).filter(p => p.poolType === 'draft' && p.hasDeck === false)
  const inProgress = history.filter(p => p.status !== 'complete')
  const deletePool = async () => {
    if (!poolDelete) return
    await fetch(`/api/pools/${encodeURIComponent(poolDelete.poolShareId)}`, { method: 'DELETE', credentials: 'include' }).catch(() => {})
    setPools(p => (p ?? []).filter(x => x.poolShareId !== poolDelete.poolShareId)); setPoolDelete(null)
  }
  const seats = (current: number, max: number) => Array.from({ length: Math.min(max, 8) }, (_, i) => <i key={i} data-filled={i < current} />)
  const trash = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>

  const solo = (
    <section aria-label="Solo draft">
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
      <div className="sp-contract"><strong>{sets.find(c => c.setCode === chosen)?.setName ?? chosen} · Solo draft</strong><small>Seven bots draft with you</small></div>
      <div className="sp-actions">
        {isAuthenticated
          ? <button type="button" className="sp-primary" disabled={authLoading || !chosen} onClick={() => router.push(`/draft/solo?set=${encodeURIComponent(chosen)}`)}>Start Draft</button>
          : <button type="button" className="sp-primary" disabled={authLoading} onClick={handleLogin}>Log in with Discord</button>}
      </div>
      {isAuthenticated && (
        <section className="sp-panel" aria-label="In progress" style={{ marginTop: 18 }}>
          <h2>In Progress</h2>
          {historyLoading || pools === undefined ? <ContentSkeleton kind="row"/> : inProgress.length + unbuilt.length === 0 ? <p className="sp-empty">Nothing waiting on you.</p> : <>
            {inProgress.map(pod => (
              <div className="sp-queue" key={pod.id}>
                <strong>{pod.setName || pod.setCode}{pod.isSolo ? <small> · Solo</small> : pod.isHost ? <small> · Host</small> : null}</strong>
                <small>{getStatusLabel(pod.status)} · {pod.currentPlayers}/{pod.maxPlayers} players · {formatDate(pod.createdAt)}</small>
                <button type="button" onClick={() => router.push(`/draft/${pod.shareId}`)}>Resume</button>
                {pod.isHost
                  ? <button type="button" className="sp-row-del" aria-label="Delete draft" title="Delete draft" onClick={() => setDeleteConfirm({ shareId: pod.shareId, poolShareId: pod.poolShareId, isHost: pod.isHost })}>{trash}</button>
                  : !pod.isBot && <button type="button" className="sp-row-del" aria-label="Drop from draft" title="Drop from draft" onClick={() => setDropConfirm({ shareId: pod.shareId })}>{trash}</button>}
              </div>
            ))}
            {unbuilt.map(p => (
              <div className="sp-queue" key={p.poolShareId}>
                <strong>{p.name}</strong>
                <small>{p.setCode} · drafted, no deck yet</small>
                <button type="button" onClick={() => router.push(`/pool/${encodeURIComponent(p.poolShareId)}/deck`)}>Build deck</button>
                <button type="button" className="sp-row-del" aria-label={`Delete ${p.name}`} title="Delete pool" onClick={() => setPoolDelete(p)}>{trash}</button>
              </div>
            ))}
          </>}
        </section>
      )}
    </section>
  )

  const pods = (
    <section className="sp-panel" aria-label="Join a pod">
      <h2>Join a Pod</h2>
      {draftPods.length ? draftPods.map((pod) => (
        <div className="sp-pod" key={`public-${pod.shareId}`}>
          <div>
            <strong>{pod.setName}</strong>
            <small>{pod.host.username} · {pod.currentPlayers}/{pod.maxPlayers} players</small>
            <div className="sp-seats" aria-hidden="true">{seats(pod.currentPlayers, pod.maxPlayers)}</div>
          </div>
          <a href={`/draft/${pod.shareId}`} onClick={(e) => { e.preventDefault(); router.push(`/draft/${pod.shareId}`) }}>Join</a>
        </div>
      )) : <p className="sp-empty">No pods forming right now.</p>}
    </section>
  )

  const create = (
    <section className="sp-panel" aria-label="Create a pod">
      <h2>Create a Pod</h2>
      <fieldset className="sp-field">
        <legend>Mode</legend>
        <div className="sp-choices">
          <button type="button" aria-pressed={mode === 'standard'} onClick={() => setMode('standard')}>Standard</button>
          <button type="button" aria-pressed={mode === 'competitive'} onClick={() => setMode('competitive')}>Competitive Mode</button>
        </div>
      </fieldset>
      {mode === 'standard'
        ? <p className="sp-mode-note">Up to 8 players, 3 packs each. Bots fill empty seats.</p>
        : <p className="sp-mode-note">Appendix C pick timers, then best-of-three rounds between the drafters.{competitiveLocked && <> Hosting needs <a href={PATREON_URL} target="_blank" rel="noopener noreferrer">Friend of the Pod</a>; anyone can join.</>}</p>}
      <div className="sp-actions">
        {isAuthenticated
          ? <button type="button" className="sp-primary" disabled={authLoading || (mode === 'competitive' && competitiveLocked)} onClick={startPod}>Create Pod</button>
          : <button type="button" className="sp-primary" disabled={authLoading} onClick={handleLogin}>Log in with Discord</button>}
      </div>
    </section>
  )

  return (
    <EntryShell back={{ label: 'Back', onClick: () => router.push('/') }}>
      <section className="sp-workspace" aria-label="Draft">
        <header className="sp-title"><h1>Draft</h1></header>
        {wasRemoved && <div className="sp-error" role="alert">You were removed from the pod by the host.</div>}
        {error && <div className="sp-error" role="alert">{error}</div>}
        <div className="sp-layout">
          {solo}
          <aside>{pods}{create}</aside>
        </div>

        <ConfirmModal isOpen={!!deleteConfirm} title="Delete Draft?" confirmLabel="Delete" confirming={isDeleting} onConfirm={handleDeleteDraft} onCancel={() => setDeleteConfirm(null)}>
          <p>Are you sure you want to delete this draft? This action cannot be undone.</p>
        </ConfirmModal>
        <ConfirmModal isOpen={!!dropConfirm} title="Drop from Draft?" confirmLabel="Drop from Draft" cancelLabel="Go Back" confirming={isDropping} onConfirm={handleDropFromDraft} onCancel={() => setDropConfirm(null)}>
          <p>Are you sure you want to drop from this draft? A bot will take over your picks and you will lose access to your drafted cards.</p>
        </ConfirmModal>
        <ConfirmModal isOpen={!!poolDelete} title="Delete pool?" confirmLabel="Delete" onConfirm={deletePool} onCancel={() => setPoolDelete(null)}>
          <p>This removes the drafted pool and its cards. This cannot be undone.</p>
        </ConfirmModal>
      </section>
    </EntryShell>
  )
}

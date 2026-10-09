// @ts-nocheck
'use client'

import ContentSkeleton from '../../src/components/ContentSkeleton'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../src/contexts/AuthContext'
import { usePublicPodsSocket } from '../../src/hooks/usePublicPodsSocket'
import { dropFromDraft } from '../../src/utils/draftApi'
import { ChatPanel } from '../../src/components/ChatPanel'
import ConfirmModal from '../../src/components/ConfirmModal'
import { PATREON_URL } from '../../src/utils/membership'
import { COMPETITIVE_DRAFT_NEW_PATH, STANDARD_DRAFT_NEW_PATH } from '../../src/utils/draftCreationRoutes'
import '../../src/App.css'
import EntryShell from '../../src/components/EntryFlow/EntryShell'
import '../../src/components/SharedPlay/shared-play.css'
import './draft.css'

interface DraftPod {
  id: string
  shareId: string
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
    const date = new Date(dateString)
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
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
  const startPod = mode === 'competitive' ? handleCreateCompetitive : handleCreateStandard
  const seats = (current: number, max: number) =>
    Array.from({ length: Math.min(max, 8) }, (_, i) => <i key={i} data-filled={i < current} />)

  const controls = (
    <section aria-label="Start a draft">
      <fieldset className="sp-field">
        <legend>Draft mode</legend>
        <div className="sp-choices">
          <button type="button" aria-pressed={mode === 'standard'} onClick={() => setMode('standard')}>Standard</button>
          <button type="button" aria-pressed={mode === 'competitive'} onClick={() => setMode('competitive')}>Competitive Practice</button>
        </div>
      </fieldset>
      {mode === 'competitive' ? (
        <p className="sp-help">
          Appendix C pick timers, then best-of-three rounds between the drafters, like a real event.
          {competitiveLocked && <> Hosting one needs <a href={PATREON_URL} target="_blank" rel="noopener noreferrer">Friend of the Pod</a>; anyone can join.</>}
        </p>
      ) : (
        <p className="sp-help">Up to 8 players, 3 packs each, picks rotate around the table. Empty seats are filled by bots.</p>
      )}
      <div className="sp-contract">
        <strong>{mode === 'competitive' ? 'Competitive Practice draft' : 'Standard draft'}</strong>
        <small>Build your deck after the draft, then play it from Decks & History or Play</small>
      </div>
      {isAuthenticated ? (
        <div className="sp-actions">
          <div className="sp-action-pair">
            <button type="button" className="sp-primary" disabled={authLoading || (mode === 'competitive' && competitiveLocked)} onClick={startPod}>
              Start a draft pod <span>(invite friends or open it to everyone)</span>
            </button>
            <button type="button" disabled={authLoading} onClick={() => router.push('/draft/solo')}>
              Practice solo <span>(draft against bots right now)</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="sp-actions">
          <button type="button" className="sp-primary" disabled={authLoading} onClick={handleLogin}>
            Log in with Discord <span>(to start or join a pod)</span>
          </button>
          <button type="button" onClick={() => router.push('/draft/solo')}>
            Practice solo <span>(draft against bots right now)</span>
          </button>
        </div>
      )}
    </section>
  )

  const pods = (
    <section className="sp-pods">
      <div className="sp-section-heading"><h2>Draft pods forming</h2></div>
      <p>Take a seat in an open pod. It starts when the host is ready.</p>
      {draftPods.length ? draftPods.map((pod) => (
        <div className="sp-pod" key={`public-${pod.shareId}`}>
          <div>
            <strong>{pod.name || pod.setName}</strong>
            <small>{pod.host.username} · {pod.currentPlayers}/{pod.maxPlayers} players</small>
            <div className="sp-seats" aria-hidden="true">{seats(pod.currentPlayers, pod.maxPlayers)}</div>
          </div>
          <a href={`/draft/${pod.shareId}`} onClick={(e) => { e.preventDefault(); router.push(`/draft/${pod.shareId}`) }}>Join draft</a>
        </div>
      )) : <p className="sp-empty">No pods forming right now.</p>}
    </section>
  )

  const drafts = isAuthenticated && (
    <section>
      <div className="sp-section-heading"><h2>Your drafts</h2></div>
      {historyLoading ? (
        <ContentSkeleton kind="row"/>
      ) : history.length === 0 ? (
        <p className="sp-empty">No drafts yet.</p>
      ) : history.map((pod) => (
        <div className="sp-queue" key={pod.id}>
          <strong>{pod.setName || pod.setCode}{pod.isHost && <small> · Host</small>}</strong>
          <small>{getStatusLabel(pod.status)} · {pod.currentPlayers}/{pod.maxPlayers} players · {formatDate(pod.createdAt)}</small>
          <button type="button" onClick={() => router.push(`/draft/${pod.shareId}`)}>Open</button>
          {pod.isHost && (
            <button type="button" aria-label="Delete draft" title="Delete draft" onClick={() => setDeleteConfirm({ shareId: pod.shareId, poolShareId: pod.poolShareId, isHost: pod.isHost })}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          )}
          {!pod.isHost && !pod.isBot && (
            <button type="button" aria-label="Drop from draft" title="Drop from draft" onClick={() => setDropConfirm({ shareId: pod.shareId })}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          )}
        </div>
      ))}
    </section>
  )

  return (
    <EntryShell back={{ label: 'Back', onClick: () => router.push('/') }}>
      <section className="sp-workspace" aria-label="Draft">
        <header className="sp-title">
          <h1>Draft</h1>
          <p>Open 3 packs, pick in turns, then build and play.</p>
        </header>
        {wasRemoved && <div className="sp-error" role="alert">You were removed from the pod by the host.</div>}
        {error && <div className="sp-error" role="alert">{error}</div>}
        <div className="sp-layout">
          {controls}
          <aside>{pods}{drafts}</aside>
        </div>

        {/* Delete Confirmation Modal */}
        <ConfirmModal
          isOpen={!!deleteConfirm}
          title="Delete Draft?"
          confirmLabel="Delete"
          confirming={isDeleting}
          onConfirm={handleDeleteDraft}
          onCancel={() => setDeleteConfirm(null)}
        >
          <p>Are you sure you want to delete this draft? This action cannot be undone.</p>
        </ConfirmModal>

        {/* Drop Confirmation Modal */}
        <ConfirmModal
          isOpen={!!dropConfirm}
          title="Drop from Draft?"
          confirmLabel="Drop from Draft"
          cancelLabel="Go Back"
          confirming={isDropping}
          onConfirm={handleDropFromDraft}
          onCancel={() => setDropConfirm(null)}
        >
          <p>Are you sure you want to drop from this draft? A bot will take over your picks and you will lose access to your drafted cards.</p>
        </ConfirmModal>
      </section>
      <ChatPanel lobbyType="draft" />
    </EntryShell>
  )
}

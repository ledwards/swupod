// @ts-nocheck
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../src/contexts/AuthContext'
import { usePublicPodsSocket } from '../../src/hooks/usePublicPodsSocket'
import { dropFromDraft } from '../../src/utils/draftApi'
import { ChatPanel } from '../../src/components/ChatPanel'
import '../../src/App.css'
import '../../src/components/LandingPage.css'
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
  const [competitiveInfoOpen, setCompetitiveInfoOpen] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('removed') === '1') {
      setWasRemoved(true)
    }
  }, [])

  useEffect(() => {
    if (!competitiveInfoOpen) return
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.draft-competitive-info-wrapper')) {
        setCompetitiveInfoOpen(false)
      }
    }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [competitiveInfoOpen])
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
    router.push('/draft/new')
  }

  const handleCreateCompetitive = () => {
    router.push('/draft/new?competitive=1')
  }

  const handleLogin = () => {
    const returnUrl = encodeURIComponent('/draft/new')
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

  return (
    <div className="draft-page-bg page-with-chat">
      <div className="draft-landing page-content">
        <h1>Draft Pod</h1>
        <p className="draft-description">
          Draft with up to 8 players. Each player opens 3 booster packs and drafts cards
          in a rotating pick order.
        </p>

        {wasRemoved && (
          <div className="removed-banner">You were removed from the pod by the host.</div>
        )}
        {error && <div className="error-message">{error}</div>}

        <div className="draft-options">
          <div className="draft-option">
            <h2>Create New Draft</h2>
            <p>Start a new draft pod and invite your friends</p>
            {isAuthenticated ? (
              <div className="draft-mode-buttons">
                <button
                  className="primary-button create-draft-button"
                  onClick={handleCreateStandard}
                  disabled={authLoading}
                >
                  Standard Draft
                </button>
                <div className="draft-competitive-info-wrapper">
                  <button
                    className="primary-button create-draft-button draft-competitive-button"
                    onClick={handleCreateCompetitive}
                    disabled={authLoading || !isPatron}
                    title={isPatron ? 'Competitive Practice — Appendix C timers, BO3 matchmaking' : 'Friends of the Pod only'}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 7 7 7 7"/>
                      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5C17 4 17 7 17 7"/>
                      <path d="M4 22h16"/>
                      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22"/>
                      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22"/>
                      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
                    </svg>
                    <span>Competitive Draft</span>
                  </button>
                  {!isPatron && (
                    <span
                      className="draft-competitive-info-icon"
                      role="button"
                      tabIndex={0}
                      aria-label="About Competitive Draft"
                      onClick={(e) => {
                        e.stopPropagation()
                        setCompetitiveInfoOpen((v) => !v)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setCompetitiveInfoOpen((v) => !v)
                        }
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="16" x2="12" y2="12"/>
                        <line x1="12" y1="8" x2="12.01" y2="8"/>
                      </svg>
                    </span>
                  )}
                  {competitiveInfoOpen && (
                    <div className="draft-competitive-info-popover" role="dialog">
                      <p>
                        Competitive Draft uses Appendix C pick timers and pairs players into best-of-three matches between rounds — practice like it&apos;s a real event.
                      </p>
                      {!isPatron && (
                        <p>
                          Requires <a href="https://patreon.com/ProtectthePod" target="_blank" rel="noopener noreferrer">Friend of the Pod</a>.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <>
                <p className="auth-note">Draft requires login to track players in multiplayer</p>
                <button
                  className="primary-button create-draft-button"
                  onClick={handleLogin}
                  disabled={authLoading}
                >
                  Login with Discord
                </button>
              </>
            )}
          </div>
        </div>

        {draftPods.length > 0 && (
          <div className="draft-history">
            <h2>Join a Draft</h2>
            <div className="history-list">
              {draftPods.map((pod) => (
                <div
                  key={`public-${pod.shareId}`}
                  className="history-item"
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(`/draft/${pod.shareId}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      router.push(`/draft/${pod.shareId}`)
                    }
                  }}
                >
                  <div className="history-item-main">
                    <span className="history-set">{pod.name || pod.setName}</span>
                    <span className="history-status waiting">Open</span>
                  </div>
                  <div className="history-item-meta">
                    <span className="history-date">
                      {pod.host.username} · {pod.currentPlayers}/{pod.maxPlayers} players
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {isAuthenticated && (
          <div className="draft-history">
            <h2>My Drafts</h2>
            {historyLoading ? (
              <p className="history-loading">Loading...</p>
            ) : history.length === 0 ? (
              <p className="history-empty">No drafts yet</p>
            ) : (
              <div className="history-list">
                {history.map((pod) => (
                  <div key={pod.id} className="history-item-wrapper">
                    <a
                      href={`/draft/${pod.shareId}`}
                      className="history-item"
                      onClick={(e) => {
                        e.preventDefault()
                        router.push(`/draft/${pod.shareId}`)
                      }}
                    >
                      <div className="history-item-main">
                        <span className="history-set">{pod.setName || pod.setCode}</span>
                        {pod.isHost && <span className="host-badge">(Host)</span>}
                        <span className={`history-status ${pod.status}`}>
                          {getStatusLabel(pod.status)}
                        </span>
                      </div>
                      <div className="history-item-meta">
                        <span className="history-players">
                          {pod.currentPlayers}/{pod.maxPlayers} players
                        </span>
                        <span className="history-date">{formatDate(pod.createdAt)}</span>
                      </div>
                    </a>
                    {pod.isHost && (
                      <button
                        className="draft-history-delete-button"
                        onClick={() => setDeleteConfirm({ shareId: pod.shareId, poolShareId: pod.poolShareId, isHost: pod.isHost })}
                        title="Delete Draft"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6"></polyline>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                      </button>
                    )}
                    {!pod.isHost && !pod.isBot && (
                      <button
                        className="draft-history-drop-button"
                        onClick={() => setDropConfirm({ shareId: pod.shareId })}
                        title="Drop from Draft"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18"></line>
                          <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deleteConfirm && (
          <div className="draft-delete-confirm-overlay" onClick={() => setDeleteConfirm(null)}>
            <div className="draft-delete-confirm-modal" onClick={(e) => e.stopPropagation()}>
              <h2>Delete Draft?</h2>
              <p>Are you sure you want to delete this draft? This action cannot be undone.</p>
              <div className="draft-delete-confirm-buttons">
                <button
                  className="draft-delete-confirm-cancel"
                  onClick={() => setDeleteConfirm(null)}
                  disabled={isDeleting}
                >
                  Cancel
                </button>
                <button
                  className="draft-delete-confirm-delete"
                  onClick={handleDeleteDraft}
                  disabled={isDeleting}
                >
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Drop Confirmation Modal */}
        {dropConfirm && (
          <div className="draft-drop-confirm-overlay" onClick={() => setDropConfirm(null)}>
            <div className="draft-drop-confirm-modal" onClick={(e) => e.stopPropagation()}>
              <h2>Drop from Draft?</h2>
              <p>Are you sure you want to drop from this draft? A bot will take over your picks and you will lose access to your drafted cards.</p>
              <div className="draft-drop-confirm-buttons">
                <button
                  className="draft-drop-confirm-cancel"
                  onClick={() => setDropConfirm(null)}
                  disabled={isDropping}
                >
                  Go Back
                </button>
                <button
                  className="draft-drop-confirm-drop"
                  onClick={handleDropFromDraft}
                  disabled={isDropping}
                >
                  {isDropping ? 'Dropping...' : 'Drop from Draft'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <ChatPanel lobbyType="draft" />
    </div>
  )
}

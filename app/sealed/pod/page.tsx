// @ts-nocheck
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../../src/contexts/AuthContext'
import { usePublicPodsSocket } from '../../../src/hooks/usePublicPodsSocket'
import { ChatPanel } from '../../../src/components/ChatPanel'
import ConfirmModal from '../../../src/components/ConfirmModal'
import '../../../src/App.css'
import '../../../src/components/LandingPage.css'
import '../../draft/draft.css'

interface SealedPod {
  id: string
  shareId: string
  poolShareId?: string
  setName?: string
  setCode: string
  podName?: string
  status: string
  isHost: boolean
  currentPlayers: number
  createdAt: string
}

interface DeleteConfirmState {
  shareId: string
  isHost: boolean
}

interface LeaveConfirmState {
  shareId: string
}

export default function SealedPodLandingPage() {
  const router = useRouter()
  const { user, isAuthenticated, loading: authLoading } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<SealedPod[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const publicPods = usePublicPodsSocket()
  const sealedPods = publicPods.filter(p => p.podType === 'sealed')
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [leaveConfirm, setLeaveConfirm] = useState<LeaveConfirmState | null>(null)
  const [isLeaving, setIsLeaving] = useState(false)

  // Fetch sealed pod history when authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      setHistory([])
      return
    }

    const fetchHistory = async () => {
      setHistoryLoading(true)
      try {
        const response = await fetch('/api/sealed/history', {
          credentials: 'include',
        })
        if (response.ok) {
          const data = await response.json()
          const allPods = data.data?.pods || data.pods || []

          // Always show the most recent pod, plus any active/waiting pods
          const filteredPods = allPods.filter((pod: SealedPod, index: number) => {
            if (index === 0) return true
            return pod.status === 'waiting'
          })
          setHistory(filteredPods)
        }
      } catch (err) {
        console.error('Failed to fetch sealed pod history:', err)
      } finally {
        setHistoryLoading(false)
      }
    }

    fetchHistory()
  }, [isAuthenticated, user])

  const handleCreateSealed = () => {
    router.push('/sealed/new')
  }

  const handleLogin = () => {
    const returnUrl = encodeURIComponent('/sealed/pod')
    window.location.href = `/api/auth/signin/discord?return_to=${returnUrl}`
  }

  const handleBack = () => {
    router.push('/')
  }

  const handleDeletePod = async () => {
    if (!deleteConfirm) return
    setIsDeleting(true)
    try {
      const response = await fetch(`/api/sealed/${deleteConfirm.shareId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (response.ok) {
        setHistory(prev => prev.filter(pod => pod.shareId !== deleteConfirm.shareId))
        setDeleteConfirm(null)
      } else {
        console.error('Failed to delete sealed pod')
      }
    } catch (err) {
      console.error('Failed to delete sealed pod:', err)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleLeavePod = async () => {
    if (!leaveConfirm) return
    setIsLeaving(true)
    try {
      const response = await fetch(`/api/sealed/${leaveConfirm.shareId}/leave`, {
        method: 'POST',
        credentials: 'include',
      })
      if (response.ok) {
        setHistory(prev => prev.filter(pod => pod.shareId !== leaveConfirm.shareId))
        setLeaveConfirm(null)
      } else {
        console.error('Failed to leave sealed pod')
      }
    } catch (err) {
      console.error('Failed to leave sealed pod:', err)
    } finally {
      setIsLeaving(false)
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
        <h1>Sealed Pod</h1>
        <p className="draft-description">
          Open 6 booster packs and build a deck with friends. Everyone opens packs at the
          same time and builds from their own pool.
        </p>

        {error && <div className="error-message">{error}</div>}

        <div className="draft-options">
          <div className="draft-option">
            <h2>Create New Sealed</h2>
            <p>Start a new sealed pod and invite your friends</p>
            {isAuthenticated ? (
              <button
                className="primary-button create-draft-button"
                onClick={handleCreateSealed}
                disabled={authLoading}
              >
                Create Sealed Pod
              </button>
            ) : (
              <>
                <p className="auth-note">Sealed pods require login to track players in multiplayer</p>
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

        {sealedPods.length > 0 && (
          <div className="draft-history">
            <h2>Join a Sealed Pod</h2>
            <div className="history-list">
              {sealedPods.map((pod) => (
                <div
                  key={`public-${pod.shareId}`}
                  className="history-item"
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(`/sealed/${pod.shareId}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      router.push(`/sealed/${pod.shareId}`)
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
            <h2>My Sealed Pods</h2>
            {historyLoading ? (
              <p className="history-loading">Loading...</p>
            ) : history.length === 0 ? (
              <p className="history-empty">No sealed pods yet</p>
            ) : (
              <div className="history-list">
                {history.map((pod) => (
                  <div key={pod.id} className="history-item-wrapper">
                    <a
                      href={pod.poolShareId ? `/pool/${pod.poolShareId}/deck` : `/sealed/${pod.shareId}`}
                      className="history-item"
                      onClick={(e) => {
                        e.preventDefault()
                        router.push(pod.poolShareId ? `/pool/${pod.poolShareId}/deck` : `/sealed/${pod.shareId}`)
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
                        <span className="history-date">{formatDate(pod.createdAt)}</span>
                      </div>
                    </a>
                    {pod.isHost && (
                      <button
                        className="draft-history-delete-button"
                        onClick={() => setDeleteConfirm({ shareId: pod.shareId, isHost: pod.isHost })}
                        title="Delete Sealed Pod"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6"></polyline>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                      </button>
                    )}
                    {!pod.isHost && pod.status === 'waiting' && (
                      <button
                        className="draft-history-drop-button"
                        onClick={() => setLeaveConfirm({ shareId: pod.shareId })}
                        title="Leave Sealed Pod"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                          <polyline points="16 17 21 12 16 7"></polyline>
                          <line x1="21" y1="12" x2="9" y2="12"></line>
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
        <ConfirmModal
          isOpen={!!deleteConfirm}
          title="Delete Sealed Pod?"
          confirmLabel="Delete"
          confirming={isDeleting}
          onConfirm={handleDeletePod}
          onCancel={() => setDeleteConfirm(null)}
        >
          <p>Are you sure you want to delete this sealed pod? This action cannot be undone.</p>
        </ConfirmModal>

        {/* Leave Confirmation Modal */}
        <ConfirmModal
          isOpen={!!leaveConfirm}
          title="Leave Sealed Pod?"
          confirmLabel="Leave Pod"
          cancelLabel="Go Back"
          confirming={isLeaving}
          onConfirm={handleLeavePod}
          onCancel={() => setLeaveConfirm(null)}
        >
          <p>Are you sure you want to leave this sealed pod?</p>
        </ConfirmModal>
      </div>
      <ChatPanel lobbyType="sealed" />
    </div>
  )
}

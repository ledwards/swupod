// @ts-nocheck
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/src/contexts/AuthContext'
import { deletePool } from '@/src/utils/poolApi'
import { FORMAT_MODES } from '@/src/config/formatModes'
import '../draft/draft.css'
import './page.css'

interface FormatPool {
  id: string
  shareId: string
  setCode: string
  setName: string
  poolType: string
  name: string
  createdAt: string
}

interface DeleteConfirmState {
  shareId: string
  name: string
}

// Map pool types to route paths
const POOL_TYPE_ROUTES: Record<string, string> = {
  'chaos_sealed': '/pool',
  'pack_wars': '/formats/pack-wars',
  'pack_blitz': '/formats/pack-blitz',
  'chaos_draft': '/draft',
  'rotisserie': '/formats/rotisserie',
}

// Map pool types to display names
const POOL_TYPE_NAMES: Record<string, string> = {
  'chaos_sealed': 'Chaos Sealed',
  'pack_wars': 'Pack Wars',
  'pack_blitz': 'Pack Blitz',
  'chaos_draft': 'Chaos Draft',
  'rotisserie': 'Rotisserie',
}

export default function OtherFormatsPage() {
  const router = useRouter()
  const { user, isAuthenticated } = useAuth()
  const hasBetaAccess = user?.is_beta_tester || user?.is_admin
  const [history, setHistory] = useState<FormatPool[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Fetch format history when authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      setHistory([])
      return
    }

    const fetchHistory = async () => {
      setHistoryLoading(true)
      try {
        const response = await fetch('/api/formats/history', {
          credentials: 'include',
        })
        if (response.ok) {
          const data = await response.json()
          const pools = data.pools || data.data?.pools || []
          setHistory(pools)
        }
      } catch (err) {
        console.error('Failed to fetch format history:', err)
      } finally {
        setHistoryLoading(false)
      }
    }

    fetchHistory()
  }, [isAuthenticated, user])

  const handleModeSelect = (mode: FormatMode) => {
    if (mode.access === 'coming-soon' && !hasBetaAccess) return
    if (mode.access === 'beta' && !hasBetaAccess) return
    router.push(`/formats/${mode.id}`)
  }

  const handleDeletePool = async () => {
    if (!deleteConfirm) return
    setIsDeleting(true)
    try {
      await deletePool(deleteConfirm.shareId)
      setHistory(prev => prev.filter(pool => pool.shareId !== deleteConfirm.shareId))
      setDeleteConfirm(null)
    } catch (err) {
      console.error('Failed to delete pool:', err)
    } finally {
      setIsDeleting(false)
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

  const getPoolUrl = (pool: FormatPool) => {
    const baseRoute = POOL_TYPE_ROUTES[pool.poolType] || '/pool'
    return `${baseRoute}/${pool.shareId}`
  }

  const getPoolTypeClass = (poolType: string) => {
    if (poolType === 'chaos_sealed' || poolType === 'chaos_draft') return 'type-chaos'
    if (poolType === 'rotisserie') return 'type-rotisserie'
    return 'type-default'
  }

  return (
    <div className="formats-page">
      <div className="formats-container">
        <h1>Other Formats</h1>
        <p className="formats-subtitle">Alternative limited formats</p>

        <div className="formats-modes-grid">
          {FORMAT_MODES.map((mode) => {
            const isLocked = (mode.access === 'beta' || mode.access === 'coming-soon') && !hasBetaAccess
            const lockClass = !hasBetaAccess && mode.access === 'beta' ? 'beta-locked' : (!hasBetaAccess && mode.access === 'coming-soon' ? 'coming-soon' : '')
            return (
              <button
                key={mode.id}
                className={`format-mode-card ${lockClass} ${mode.artType ? `art-${mode.artType}` : ''} ${mode.glowColor ? `glow-${mode.glowColor}` : ''}`}
                onClick={() => handleModeSelect(mode)}
                disabled={isLocked}
              >
                {mode.cardArt && (
                  <div
                    className="format-mode-card-art"
                    style={{ backgroundImage: `url("${mode.cardArt}")` }}
                  />
                )}
                <div className="format-mode-card-content">
                  <h3>{mode.name}</h3>
                  <p>{mode.description}</p>
                </div>
                {mode.access === 'coming-soon' && !hasBetaAccess && (
                  <span className="coming-soon-badge">Coming Soon</span>
                )}
                {mode.access === 'beta' && !hasBetaAccess && (
                  <span className="beta-badge-overlay">Beta</span>
                )}
              </button>
            )
          })}
        </div>

        {isAuthenticated && (
          <div className="draft-history">
            <h2>My Other Format Pools</h2>
            {historyLoading ? (
              <p className="history-loading">Loading...</p>
            ) : history.length === 0 ? (
              <p className="history-empty">No pools yet</p>
            ) : (
              <div className="history-list">
                {history.map((pool) => (
                  <div key={pool.id} className="history-item-wrapper">
                    <a
                      href={getPoolUrl(pool)}
                      className="history-item"
                      onClick={(e) => {
                        e.preventDefault()
                        router.push(getPoolUrl(pool))
                      }}
                    >
                      <div className="history-item-main">
                        <span className="history-set">{pool.name || pool.setName || pool.setCode}</span>
                        <span className={`history-type ${getPoolTypeClass(pool.poolType)}`}>
                          {POOL_TYPE_NAMES[pool.poolType] || pool.poolType}
                        </span>
                      </div>
                      <div className="history-item-meta">
                        <span className="history-date">{formatDate(pool.createdAt)}</span>
                      </div>
                    </a>
                    <button
                      className="draft-history-delete-button"
                      onClick={() => setDeleteConfirm({ shareId: pool.shareId, name: pool.name || pool.setName })}
                      title="Delete Pool"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                      </svg>
                    </button>
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
              <h2>Delete Pool?</h2>
              <p>Are you sure you want to delete "{deleteConfirm.name}"? This action cannot be undone.</p>
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
                  onClick={handleDeletePool}
                  disabled={isDeleting}
                >
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

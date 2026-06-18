// @ts-nocheck
'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '../../src/contexts/AuthContext'
import { fetchUserPools, updatePool, deletePool } from '../../src/utils/poolApi'
import { dropFromDraft } from '../../src/utils/draftApi'
import { useRouter } from 'next/navigation'
import { getSetConfig } from '../../src/utils/setConfigs'
import EditableTitle from '../../src/components/EditableTitle'
import Button from '../../src/components/Button'
import ConfirmModal from '../../src/components/ConfirmModal'
import '../../src/App.css'
import './History.css'

interface SealedPool {
  id: string
  shareId: string
  setCode: string
  name?: string
  leaderName?: string
  baseName?: string
  mainDeckCount?: number
  createdAt: string
  poolType?: string
  hidden?: boolean
  isInfinitePool?: boolean
  sessionId?: string | null
}

interface FormatPool {
  id: string
  shareId: string
  setCode: string
  setName: string
  poolType: string
  name: string
  leaderName?: string
  baseName?: string
  mainDeckCount?: number
  createdAt: string
  hidden?: boolean
  isInfinitePool?: boolean
  sessionId?: string | null
}

interface DraftPod {
  id: string
  shareId: string
  poolShareId?: string
  setCode: string
  status: string
  draftName?: string
  leaderName?: string
  baseName?: string
  mainDeckCount?: number
  createdAt: string
  isHost?: boolean
  isBot?: boolean
  hidden?: boolean
}

// Check if a deck is valid for play (has leader, base, and 30+ main deck cards)
function isDeckPlayable(leaderName?: string, baseName?: string, mainDeckCount?: number): boolean {
  return !!leaderName && !!baseName && (mainDeckCount || 0) >= 30
}

interface DeleteConfirmState {
  shareId: string
  type: 'sealed' | 'draft' | 'formats'
  isActiveDraft?: boolean
}

// Map pool types to route paths for other formats
const FORMAT_POOL_TYPE_ROUTES: Record<string, string> = {
  'chaos_sealed': '/pool',
  'pack_wars': '/formats/pack-wars',
  'pack_blitz': '/formats/pack-blitz',
  'chaos_draft': '/draft',
  'rotisserie': '/formats/rotisserie',
}

// Map pool types to display names
const FORMAT_POOL_TYPE_NAMES: Record<string, string> = {
  'chaos_sealed': 'Chaos Sealed',
  'pack_wars': 'Pack Wars',
  'pack_blitz': 'Pack Blitz',
  'chaos_draft': 'Chaos Draft',
  'rotisserie': 'Rotisserie',
}

interface DropConfirmState {
  shareId: string
}

interface SharedPool {
  shareId: string
  name?: string | null
  setCode?: string | null
  poolType?: string | null
  ownerUsername?: string | null
  viewedAt: string
  createdAt: string
}

export default function HistoryPage() {
  const { user, loading: authLoading } = useAuth()
  const [activeTab, setActiveTab] = useState<'solo' | 'multiplayer' | 'shared'>('solo')
  const [sealedPools, setSealedPools] = useState<SealedPool[]>([])
  const [draftPods, setDraftPods] = useState<DraftPod[]>([])
  const [formatPools, setFormatPools] = useState<FormatPool[]>([])
  const [sharedPools, setSharedPools] = useState<SharedPool[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [dropConfirm, setDropConfirm] = useState<DropConfirmState | null>(null)
  const [isDropping, setIsDropping] = useState(false)
  const [showHiddenSolo, setShowHiddenSolo] = useState(false)
  const [showHiddenMulti, setShowHiddenMulti] = useState(false)
  const [multiSealedPods, setMultiSealedPods] = useState<any[]>([])
  const router = useRouter()

  useEffect(() => {
    if (!authLoading && !user) {
      window.location.href = '/'
      return
    }

    if (user) {
      setLoading(true)

      // Fetch user pools, drafts, sealed pods, format pools, and shared pools.
      // allSettled so one failed endpoint degrades only its own section to an
      // empty list instead of blanking the entire page.
      Promise.allSettled([
        fetchUserPools(user.id),
        fetch('/api/draft/history', { credentials: 'include' }).then(r => r.json()),
        fetch('/api/formats/history', { credentials: 'include' }).then(r => r.json()),
        fetch('/api/sealed/history', { credentials: 'include' }).then(r => r.json()),
        fetch('/api/pools/shared', { credentials: 'include' }).then(r => r.ok ? r.json() : { data: { pools: [] } }),
      ])
        .then((results) => {
          const settled = (i, fallback) => results[i].status === 'fulfilled' ? results[i].value : fallback
          const poolsData = settled(0, [])
          const draftData = settled(1, {})
          const formatsData = settled(2, {})
          const sealedData = settled(3, {})
          const sharedData = settled(4, { data: { pools: [] } })

          // Only show a page-level error if every source failed.
          if (results.every(r => r.status === 'rejected')) {
            console.error('Failed to fetch history:', results)
            setError("We couldn't load your history right now. Please try again.")
          }

          // Handle sealed pools (filter out draft pools and other format pool types)
          const formatPoolTypes = ['chaos_sealed', 'pack_wars', 'pack_blitz', 'chaos_draft', 'rotisserie']
          if (poolsData && Array.isArray(poolsData)) {
            const sealed = poolsData
              .filter(p => p.poolType !== 'draft' && !formatPoolTypes.includes(p.poolType))
              .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            setSealedPools(sealed)
          } else {
            setSealedPools([])
          }

          // Handle draft pods - show ALL drafts (unfiltered for history)
          if (draftData && (draftData.data?.pods || draftData.pods)) {
            const allDrafts = (draftData.data?.pods || draftData.pods)
              .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            setDraftPods(allDrafts)
          } else {
            setDraftPods([])
          }

          // Handle other format pools
          if (formatsData && (formatsData.pools || formatsData.data?.pools)) {
            const pools = (formatsData.pools || formatsData.data?.pools)
              .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            setFormatPools(pools)
          } else {
            setFormatPools([])
          }

          // Handle multiplayer sealed pods (all statuses)
          if (sealedData && (sealedData.data?.pods || sealedData.pods)) {
            const pods = (sealedData.data?.pods || sealedData.pods)
              .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            setMultiSealedPods(pods)
          } else {
            setMultiSealedPods([])
          }

          // Handle shared pools (pools the user has viewed but doesn't own)
          const shared = sharedData?.data?.pools || sharedData?.pools || []
          setSharedPools(shared)
        })
        .catch(err => {
          console.error('Failed to fetch history:', err)
          setError("We couldn't load your history right now. Please try again.")
        })
        .finally(() => {
          setLoading(false)
        })
    }
  }, [user, authLoading])

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'waiting': return 'Waiting'
      case 'leader_draft': return 'Leader Draft'
      case 'pack_draft': return 'Pack Draft'
      case 'complete': return 'Complete'
      default: return status
    }
  }

  const getSetName = (setCode: string) => {
    const config = getSetConfig(setCode)
    return config?.setName || setCode
  }

  const handleRenamePool = async (shareId: string, newName: string) => {
    try {
      // Update deckBuilderState.poolName (source of truth) - API handles the merge
      await updatePool(shareId, { poolName: newName })
      // Update local state
      setSealedPools(pools =>
        pools.map(pool =>
          pool.shareId === shareId ? { ...pool, name: newName } : pool
        )
      )
    } catch (err) {
      console.error('Failed to rename pool:', err)
    }
  }

  const handleRenameDraft = async (poolShareId: string | undefined, newName: string) => {
    if (!poolShareId) return
    try {
      // Update deckBuilderState.poolName (source of truth) - API handles the merge
      await updatePool(poolShareId, { poolName: newName })
      // Update local state
      setDraftPods(pods =>
        pods.map(pod =>
          pod.poolShareId === poolShareId ? { ...pod, draftName: newName } : pod
        )
      )
    } catch (err) {
      console.error('Failed to rename draft:', err)
    }
  }

  const handleRenameFormat = async (shareId: string, newName: string) => {
    try {
      await updatePool(shareId, { poolName: newName })
      setFormatPools(pools =>
        pools.map(pool =>
          pool.shareId === shareId ? { ...pool, name: newName } : pool
        )
      )
    } catch (err) {
      console.error('Failed to rename format pool:', err)
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    setIsDeleting(true)
    try {
      if (deleteConfirm.isActiveDraft) {
        // Use draft API to delete active drafts
        const response = await fetch(`/api/draft/${deleteConfirm.shareId}`, {
          method: 'DELETE',
          credentials: 'include',
        })
        if (!response.ok) {
          throw new Error('Failed to cancel draft')
        }
        setDraftPods(pods => pods.filter(p => p.shareId !== deleteConfirm.shareId))
      } else {
        await deletePool(deleteConfirm.shareId)
        // Remove from local state
        if (deleteConfirm.type === 'sealed') {
          setSealedPools(pools => pools.filter(p => p.shareId !== deleteConfirm.shareId))
        } else if (deleteConfirm.type === 'formats') {
          setFormatPools(pools => pools.filter(p => p.shareId !== deleteConfirm.shareId))
        } else {
          setDraftPods(pods => pods.filter(p => p.poolShareId !== deleteConfirm.shareId))
        }
      }
      setDeleteConfirm(null)
    } catch (err) {
      console.error('Failed to delete:', err)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleDrop = async () => {
    if (!dropConfirm) return
    setIsDropping(true)
    try {
      await dropFromDraft(dropConfirm.shareId)
      // Remove from local state (user dropped, so they no longer see it as active)
      setDraftPods(pods => pods.filter(p => p.shareId !== dropConfirm.shareId))
      setDropConfirm(null)
    } catch (err) {
      console.error('Failed to drop from draft:', err)
    } finally {
      setIsDropping(false)
    }
  }

  const handleToggleHidden = async (shareId: string, currentHidden: boolean | undefined, type: 'sealed' | 'draft' | 'formats') => {
    try {
      await updatePool(shareId, { hidden: !currentHidden })
      if (type === 'sealed') {
        setSealedPools(pools => pools.map(p =>
          p.shareId === shareId ? { ...p, hidden: !currentHidden } : p
        ))
      } else if (type === 'formats') {
        setFormatPools(pools => pools.map(p =>
          p.shareId === shareId ? { ...p, hidden: !currentHidden } : p
        ))
      } else {
        setDraftPods(pods => pods.map(p =>
          p.poolShareId === shareId ? { ...p, hidden: !currentHidden } : p
        ))
      }
    } catch (err) {
      console.error('Failed to toggle hidden:', err)
    }
  }

  // Filter pools into visible and hidden
  const visibleSealedPools = sealedPools.filter(p => !p.hidden)
  const hiddenSealedPools = sealedPools.filter(p => p.hidden)
  const visibleDraftPods = draftPods.filter(p => !p.hidden)
  const hiddenDraftPods = draftPods.filter(p => p.hidden)
  const visibleFormatPools = formatPools.filter(p => !p.hidden)
  const hiddenFormatPools = formatPools.filter(p => p.hidden)

  // Merged arrays for Solo/Multiplayer tabs
  const soloItems = [
    ...sealedPools.map(p => ({ ...p, format: p.isInfinitePool ? 'Limited' : 'Sealed', itemType: 'sealed' })),
    ...formatPools.map(p => ({ ...p, format: FORMAT_POOL_TYPE_NAMES[p.poolType] || p.poolType, itemType: 'formats' })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  const visibleSoloItems = soloItems.filter(p => !p.hidden)
  const hiddenSoloItems = soloItems.filter(p => p.hidden)

  const multiplayerItems = [
    ...draftPods.map(p => ({ ...p, format: 'Draft', itemType: 'draft' })),
    ...multiSealedPods.map(p => ({
      id: p.id, shareId: p.shareId, setCode: p.setCode, status: p.status,
      draftName: p.poolName || p.podName, leaderName: p.leaderName, baseName: p.baseName,
      mainDeckCount: p.mainDeckCount, createdAt: p.createdAt, isHost: p.isHost,
      poolShareId: p.poolShareId, hidden: false, isBot: false,
      format: 'Sealed', itemType: 'multi-sealed',
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  const visibleMultiItems = multiplayerItems.filter(p => !p.hidden)
  const hiddenMultiItems = multiplayerItems.filter(p => p.hidden)

  // Helper function to get URL for format pool
  const getFormatPoolUrl = (pool: FormatPool) => {
    const baseRoute = FORMAT_POOL_TYPE_ROUTES[pool.poolType] || '/pool'
    return `${baseRoute}/${pool.shareId}`
  }

  const getLimitedDeckbuilderEditUrl = (item: SealedPool) => {
    const params = new URLSearchParams({
      set: item.setCode,
      session: item.sessionId || item.shareId,
      playShareId: item.shareId,
    })
    return `/deckbuilder/build?${params.toString()}`
  }

  if (authLoading || loading) {
    return (
      <div className="app">
        <div className="history-page">
          <div className="history-header">
            <h1>History</h1>
          </div>
          <div className="history-tabs">
            {['Solo', 'Multiplayer'].map(label => (
              <button key={label} className={`history-tab ${label === 'Solo' ? 'active' : ''}`} disabled>
                {label}
              </button>
            ))}
          </div>
          <div className="history-table-container">
            <table className="history-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Format</th>
                  <th>Leader</th>
                  <th>Base</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3, 4, 5].map(i => (
                  <tr key={i}>
                    <td><div className="skeleton-line" style={{ width: '120px' }} /></td>
                    <td><div className="skeleton-line" style={{ width: '80px' }} /></td>
                    <td><div className="skeleton-line" style={{ width: '100px' }} /></td>
                    <td><div className="skeleton-line" style={{ width: '90px' }} /></td>
                    <td><div className="skeleton-line" style={{ width: '110px' }} /></td>
                    <td><div className="skeleton-line" style={{ width: '50px' }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="app">
        <div className="history-page">
          <div className="history-header">
            <h1>History</h1>
          </div>
          <div className="history-error">
            <p>{error}</p>
            <Button variant="primary" onClick={() => window.location.reload()} style={{ marginTop: '1rem' }}>
              Try Again
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <div className="history-page">
        <div className="history-header">
          <h1>History</h1>
        </div>

        <div className="history-tabs">
          <button
            className={`history-tab ${activeTab === 'solo' ? 'active' : ''}`}
            onClick={() => setActiveTab('solo')}
          >
            Solo
          </button>
          <button
            className={`history-tab ${activeTab === 'multiplayer' ? 'active' : ''}`}
            onClick={() => setActiveTab('multiplayer')}
          >
            Multiplayer
          </button>
          <button
            className={`history-tab ${activeTab === 'shared' ? 'active' : ''}`}
            onClick={() => setActiveTab('shared')}
          >
            Shared
          </button>
        </div>

        {activeTab === 'solo' && (
          <>
            {soloItems.length === 0 ? (
              <div className="history-empty">
                <p>No pools found. Create your first pool to get started!</p>
              </div>
            ) : (
              <>
                {visibleSoloItems.length > 0 && (
                  <div className="history-table-container">
                    <table className="history-table">
                      <thead>
                        <tr>
                          <th>Title</th>
                          <th>Format</th>
                          <th>Leader</th>
                          <th>Base</th>
                          <th>Date</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleSoloItems.map((item) => {
                          const isFormat = item.itemType === 'formats'
                          const isLimitedDeck = !isFormat && item.isInfinitePool
                          const viewUrl = isFormat
                            ? getFormatPoolUrl(item) + '/deck'
                            : isLimitedDeck
                              ? getLimitedDeckbuilderEditUrl(item)
                              : `/pool/${item.shareId}/deck`
                          const playUrl = isFormat ? getFormatPoolUrl(item) + '/deck/play' : `/pool/${item.shareId}/deck/play`
                          const handleRename = isFormat
                            ? (newName) => handleRenameFormat(item.shareId, newName)
                            : (newName) => handleRenamePool(item.shareId, newName)
                          const deleteType = isFormat ? 'formats' : 'sealed'
                          return (
                            <tr key={`${item.itemType}-${item.id}`}>
                              <td>
                                <EditableTitle
                                  value={item.name}
                                  onSave={handleRename}
                                  onTitleClick={() => window.location.href = viewUrl}
                                  isEditable={true}
                                  placeholder={item.isInfinitePool ? 'Custom Limited Deck' : 'Untitled Pool'}
                                  className="history-editable-title"
                                />
                              </td>
                              <td style={{ color: 'white', fontWeight: '600' }}>
                                {item.format}
                              </td>
                              <td style={{ color: 'rgba(255, 255, 255, 0.8)' }}>
                                {item.leaderName || '-'}
                              </td>
                              <td style={{ color: 'rgba(255, 255, 255, 0.8)' }}>
                                {item.baseName || '-'}
                              </td>
                              <td>{formatDate(item.createdAt)}</td>
                              <td className="history-actions-cell">
                                <div className="actions-wrapper">
                                  <button className="history-view-button" onClick={() => window.location.href = viewUrl}>View</button>
                                  {isDeckPlayable(item.leaderName, item.baseName, item.mainDeckCount) && (
                                    <button className="history-play-button" onClick={() => window.location.href = playUrl} title="Play">
                                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                                    </button>
                                  )}
                                  <button className="history-hide-button" onClick={() => handleToggleHidden(item.shareId, item.hidden, deleteType)} title="Hide">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                                      <line x1="1" y1="1" x2="23" y2="23"></line>
                                    </svg>
                                  </button>
                                  <button className="history-delete-button" onClick={() => setDeleteConfirm({ shareId: item.shareId, type: deleteType })} title="Delete">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <polyline points="3 6 5 6 21 6"></polyline>
                                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                    </svg>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {hiddenSoloItems.length > 0 && (
                  <div className="hidden-pools-section">
                    <button
                      className={`hidden-pools-toggle ${showHiddenSolo ? 'expanded' : ''}`}
                      onClick={() => setShowHiddenSolo(!showHiddenSolo)}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                        style={{ transform: showHiddenSolo ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                        <polyline points="9 18 15 12 9 6"></polyline>
                      </svg>
                      Hidden ({hiddenSoloItems.length})
                    </button>
                    {showHiddenSolo && (
                      <div className="history-table-container hidden-pools-table-container">
                        <table className="history-table">
                          <thead>
                            <tr>
                              <th>Title</th>
                              <th>Format</th>
                              <th>Leader</th>
                              <th>Base</th>
                              <th>Date</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {hiddenSoloItems.map((item) => {
                              const isFormat = item.itemType === 'formats'
                              const isLimitedDeck = !isFormat && item.isInfinitePool
                              const viewUrl = isFormat
                                ? getFormatPoolUrl(item) + '/deck'
                                : isLimitedDeck
                                  ? getLimitedDeckbuilderEditUrl(item)
                                  : `/pool/${item.shareId}/deck`
                              const playUrl = isFormat ? getFormatPoolUrl(item) + '/deck/play' : `/pool/${item.shareId}/deck/play`
                              const handleRename = isFormat
                                ? (newName) => handleRenameFormat(item.shareId, newName)
                                : (newName) => handleRenamePool(item.shareId, newName)
                              const deleteType = isFormat ? 'formats' : 'sealed'
                              return (
                                <tr key={`${item.itemType}-${item.id}`}>
                                  <td>
                                    <EditableTitle
                                      value={item.name}
                                      onSave={handleRename}
                                      onTitleClick={() => window.location.href = viewUrl}
                                      isEditable={true}
                                      placeholder={item.isInfinitePool ? 'Custom Limited Deck' : 'Untitled Pool'}
                                      className="history-editable-title"
                                    />
                                  </td>
                                  <td style={{ color: 'white', fontWeight: '600' }}>{item.format}</td>
                                  <td style={{ color: 'rgba(255, 255, 255, 0.8)' }}>{item.leaderName || '-'}</td>
                                  <td style={{ color: 'rgba(255, 255, 255, 0.8)' }}>{item.baseName || '-'}</td>
                                  <td>{formatDate(item.createdAt)}</td>
                                  <td className="history-actions-cell">
                                    <div className="actions-wrapper">
                                      <button className="history-view-button" onClick={() => window.location.href = viewUrl}>View</button>
                                      {isDeckPlayable(item.leaderName, item.baseName, item.mainDeckCount) && (
                                        <button className="history-play-button" onClick={() => window.location.href = playUrl} title="Play">
                                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                                        </button>
                                      )}
                                      <button className="history-unhide-button" onClick={() => handleToggleHidden(item.shareId, item.hidden, deleteType)} title="Show">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                          <circle cx="12" cy="12" r="3"></circle>
                                        </svg>
                                      </button>
                                      <button className="history-delete-button" onClick={() => setDeleteConfirm({ shareId: item.shareId, type: deleteType })} title="Delete">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                          <polyline points="3 6 5 6 21 6"></polyline>
                                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                        </svg>
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {visibleSoloItems.length === 0 && hiddenSoloItems.length > 0 && !showHiddenSolo && (
                  <div className="history-empty">
                    <p>All pools are hidden. Click "Hidden" above to show them.</p>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {activeTab === 'multiplayer' && (
          <>
            {multiplayerItems.length === 0 ? (
              <div className="history-empty">
                <p>No multiplayer pods found. Join or create a pod to get started!</p>
              </div>
            ) : (
              <>
                {visibleMultiItems.length > 0 && (
                  <div className="history-table-container">
                    <table className="history-table">
                      <thead>
                        <tr>
                          <th>Title</th>
                          <th>Format</th>
                          <th>Status</th>
                          <th>Leader</th>
                          <th>Base</th>
                          <th>Date</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleMultiItems.map((pod) => {
                          const isDraft = pod.itemType === 'draft'
                          const isSealed = pod.itemType === 'multi-sealed'
                          const isActive = pod.status === 'waiting' || pod.status === 'active' || pod.status === 'leader_draft' || pod.status === 'pack_draft'
                          const handleTitleClick = () => {
                            if (isDraft) {
                              if (isActive) {
                                window.location.href = `/draft/${pod.shareId}`
                              } else if (pod.poolShareId) {
                                window.location.href = `/draft_pool/${pod.poolShareId}/`
                              }
                            } else {
                              if (isActive) {
                                window.location.href = `/sealed/${pod.shareId}`
                              } else if (pod.poolShareId) {
                                window.location.href = `/pool/${pod.poolShareId}/deck`
                              }
                            }
                          }
                          return (
                            <tr key={`${pod.itemType}-${pod.id}`}>
                              <td>
                                <EditableTitle
                                  value={isActive ? null : pod.draftName}
                                  onSave={(newName) => isDraft && handleRenameDraft(pod.poolShareId, newName)}
                                  onTitleClick={handleTitleClick}
                                  isEditable={isDraft && !isActive && !!pod.poolShareId}
                                  placeholder={isActive ? (isDraft ? "Active Draft" : "Active Sealed Pod") : (isDraft ? "Untitled Draft" : "Untitled Sealed")}
                                  className="history-editable-title"
                                />
                              </td>
                              <td style={{ color: 'white', fontWeight: '600' }}>
                                {pod.format}
                              </td>
                              <td>
                                <span style={{
                                  color: isActive ? '#4ade80' : 'rgba(255, 255, 255, 0.6)',
                                  fontWeight: isActive ? '600' : '400'
                                }}>
                                  {isActive ? 'Active' : 'Completed'}
                                </span>
                              </td>
                              <td style={{ color: 'rgba(255, 255, 255, 0.8)' }}>
                                {pod.leaderName || '-'}
                              </td>
                              <td style={{ color: 'rgba(255, 255, 255, 0.8)' }}>
                                {pod.baseName || '-'}
                              </td>
                              <td>{formatDate(pod.createdAt)}</td>
                              <td className="history-actions-cell">
                                <div className="actions-wrapper">
                                  <button className="history-view-button" onClick={() => {
                                    if (isDraft) window.location.href = `/draft/${pod.shareId}`
                                    else if (isActive) window.location.href = `/sealed/${pod.shareId}`
                                    else if (pod.poolShareId) window.location.href = `/pool/${pod.poolShareId}/deck`
                                  }}>View</button>
                                  {isDraft && isActive && pod.isHost && (
                                    <button className="history-delete-button" onClick={() => setDeleteConfirm({ shareId: pod.shareId, type: 'draft', isActiveDraft: true })} title="Cancel Draft">
                                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <line x1="18" y1="6" x2="6" y2="18"></line>
                                        <line x1="6" y1="6" x2="18" y2="18"></line>
                                      </svg>
                                    </button>
                                  )}
                                  {isDraft && isActive && !pod.isHost && !pod.isBot && (
                                    <button className="history-drop-button" onClick={() => setDropConfirm({ shareId: pod.shareId })} title="Drop from Draft">
                                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                                        <polyline points="16 17 21 12 16 7"></polyline>
                                        <line x1="21" y1="12" x2="9" y2="12"></line>
                                      </svg>
                                    </button>
                                  )}
                                  {isDraft && !isActive && (
                                    <button className="history-log-button" onClick={() => window.location.href = `/draft/${pod.shareId}/log`} title="Draft Log">
                                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                        <polyline points="14 2 14 8 20 8"></polyline>
                                        <line x1="16" y1="13" x2="8" y2="13"></line>
                                        <line x1="16" y1="17" x2="8" y2="17"></line>
                                        <polyline points="10 9 9 9 8 9"></polyline>
                                      </svg>
                                    </button>
                                  )}
                                  {!isActive && pod.poolShareId && isDeckPlayable(pod.leaderName, pod.baseName, pod.mainDeckCount) && (
                                    <button className="history-play-button" onClick={() => window.location.href = isDraft ? `/draft_pool/${pod.poolShareId}/play` : `/pool/${pod.poolShareId}/deck/play`} title="Play">
                                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                                    </button>
                                  )}
                                  {isDraft && !isActive && pod.poolShareId && (
                                    <>
                                      <button className="history-hide-button" onClick={() => handleToggleHidden(pod.poolShareId, pod.hidden, 'draft')} title="Hide">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                                          <line x1="1" y1="1" x2="23" y2="23"></line>
                                        </svg>
                                      </button>
                                      <button className="history-delete-button" onClick={() => setDeleteConfirm({ shareId: pod.poolShareId, type: 'draft', isActiveDraft: false })} title="Delete">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                          <polyline points="3 6 5 6 21 6"></polyline>
                                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                        </svg>
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {hiddenMultiItems.length > 0 && (
                  <div className="hidden-pools-section">
                    <button
                      className={`hidden-pools-toggle ${showHiddenMulti ? 'expanded' : ''}`}
                      onClick={() => setShowHiddenMulti(!showHiddenMulti)}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                        style={{ transform: showHiddenMulti ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                        <polyline points="9 18 15 12 9 6"></polyline>
                      </svg>
                      Hidden ({hiddenMultiItems.length})
                    </button>
                    {showHiddenMulti && (
                      <div className="history-table-container hidden-pools-table-container">
                        <table className="history-table">
                          <thead>
                            <tr>
                              <th>Title</th>
                              <th>Format</th>
                              <th>Status</th>
                              <th>Leader</th>
                              <th>Base</th>
                              <th>Date</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {hiddenMultiItems.map((pod) => {
                              const isDraft = pod.itemType === 'draft'
                              return (
                                <tr key={`${pod.itemType}-${pod.id}`}>
                                  <td>
                                    <EditableTitle
                                      value={pod.draftName}
                                      onSave={(newName) => isDraft && handleRenameDraft(pod.poolShareId, newName)}
                                      onTitleClick={() => {
                                        if (isDraft && pod.poolShareId) window.location.href = `/draft_pool/${pod.poolShareId}/`
                                        else if (pod.poolShareId) window.location.href = `/pool/${pod.poolShareId}/deck`
                                      }}
                                      isEditable={isDraft && !!pod.poolShareId}
                                      placeholder={isDraft ? "Untitled Draft" : "Untitled Sealed"}
                                      className="history-editable-title"
                                    />
                                  </td>
                                  <td style={{ color: 'white', fontWeight: '600' }}>{pod.format}</td>
                                  <td><span style={{ color: 'rgba(255, 255, 255, 0.6)', fontWeight: '400' }}>Completed</span></td>
                                  <td style={{ color: 'rgba(255, 255, 255, 0.8)' }}>{pod.leaderName || '-'}</td>
                                  <td style={{ color: 'rgba(255, 255, 255, 0.8)' }}>{pod.baseName || '-'}</td>
                                  <td>{formatDate(pod.createdAt)}</td>
                                  <td className="history-actions-cell">
                                    <div className="actions-wrapper">
                                      <button className="history-view-button" onClick={() => {
                                        if (isDraft) window.location.href = `/draft/${pod.shareId}`
                                        else if (pod.poolShareId) window.location.href = `/pool/${pod.poolShareId}/deck`
                                      }}>View</button>
                                      {pod.poolShareId && isDeckPlayable(pod.leaderName, pod.baseName, pod.mainDeckCount) && (
                                        <button className="history-play-button" onClick={() => window.location.href = isDraft ? `/draft_pool/${pod.poolShareId}/play` : `/pool/${pod.poolShareId}/deck/play`} title="Play">
                                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                                        </button>
                                      )}
                                      {isDraft && pod.poolShareId && (
                                        <>
                                          <button className="history-unhide-button" onClick={() => handleToggleHidden(pod.poolShareId, pod.hidden, 'draft')} title="Show">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                              <circle cx="12" cy="12" r="3"></circle>
                                            </svg>
                                          </button>
                                          <button className="history-delete-button" onClick={() => setDeleteConfirm({ shareId: pod.poolShareId, type: 'draft', isActiveDraft: false })} title="Delete">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                              <polyline points="3 6 5 6 21 6"></polyline>
                                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                            </svg>
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {visibleMultiItems.length === 0 && hiddenMultiItems.length > 0 && !showHiddenMulti && (
                  <div className="history-empty">
                    <p>All pods are hidden. Click "Hidden" above to show them.</p>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {activeTab === 'shared' && (
          <>
            {sharedPools.length === 0 ? (
              <div className="history-empty">
                <p>No shared pools yet. When you visit someone else's pool, it'll show up here.</p>
              </div>
            ) : (
              <div className="history-table-container">
                <table className="history-table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Format</th>
                      <th>Owner</th>
                      <th>Last Viewed</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sharedPools.map((pool) => {
                      const fmt = pool.poolType === 'draft' ? 'Draft' : 'Sealed'
                      const viewUrl = `/pool/${pool.shareId}/deck`
                      return (
                        <tr key={pool.shareId}>
                          <td>
                            <a
                              href={viewUrl}
                              className="history-shared-title"
                              onClick={(e) => { e.preventDefault(); window.location.href = viewUrl }}
                              style={{ color: 'white', textDecoration: 'none' }}
                            >
                              {pool.name || `${(pool.setCode || '').toUpperCase()} ${fmt} Pool`}
                            </a>
                          </td>
                          <td style={{ color: 'white', fontWeight: '600' }}>{fmt}</td>
                          <td style={{ color: 'rgba(255, 255, 255, 0.8)' }}>{pool.ownerUsername || 'Anonymous'}</td>
                          <td>{formatDate(pool.viewedAt)}</td>
                          <td className="history-actions-cell">
                            <div className="actions-wrapper">
                              <button className="history-view-button" onClick={() => window.location.href = viewUrl}>View</button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* Delete Confirmation Modal */}
        <ConfirmModal
          isOpen={!!deleteConfirm}
          title={deleteConfirm?.isActiveDraft ? 'Cancel Draft?' : 'Delete Deck?'}
          confirmLabel={deleteConfirm?.isActiveDraft ? 'Cancel Draft' : 'Delete'}
          cancelLabel="Go Back"
          confirming={isDeleting}
          onConfirm={handleDelete}
          onCancel={() => setDeleteConfirm(null)}
        >
          <p>
            {deleteConfirm?.isActiveDraft
              ? 'Are you sure you want to cancel this draft? All players will be removed and this action cannot be undone.'
              : 'Are you sure you want to delete this deck? This action cannot be undone.'}
          </p>
        </ConfirmModal>

        {/* Drop Confirmation Modal */}
        {dropConfirm && (
          <div className="drop-confirm-overlay" onClick={() => setDropConfirm(null)}>
            <div className="drop-confirm-modal" onClick={(e) => e.stopPropagation()}>
              <h2>Drop from Draft?</h2>
              <p>
                Are you sure you want to drop from this draft? A bot will take over your picks and you will lose access to your drafted cards.
              </p>
              <div className="drop-confirm-buttons">
                <button
                  className="drop-confirm-cancel"
                  onClick={() => setDropConfirm(null)}
                  disabled={isDropping}
                >
                  Go Back
                </button>
                <button
                  className="drop-confirm-drop"
                  onClick={handleDrop}
                  disabled={isDropping}
                >
                  {isDropping ? 'Dropping...' : 'Drop from Draft'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// @ts-nocheck
'use client'

import { useState, useEffect, useRef, use } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../../src/contexts/AuthContext'
import { useSealedPodSocket } from '../../../src/hooks/useSealedPodSocket'
import { usePresence } from '../../../src/hooks/usePresence'
import { getPackArtUrl, getCyclingPackImageUrls } from '../../../src/utils/packArt'
import { sealedPacksPerPlayer } from '../../../src/utils/sealedPodConfig'
import { loadPool } from '../../../src/utils/poolApi'
import SealedPodLobby from '../../../src/components/SealedPodLobby'
import PackOpeningAnimation from '../../../src/components/PackOpeningAnimation'
import SealedPod from '../../../src/components/SealedPod'
import Button from '../../../src/components/Button'
import Modal from '../../../src/components/Modal'
import ChatPanel from '../../../src/components/ChatPanel'
import '../../../src/App.css'
import '../../draft/draft.css'
import '../../draft/[shareId]/pod/pod.css'
import '../../../src/components/ChatPanel.css'

interface PageProps {
  params: Promise<{ shareId: string }>
}

// Post-start phases: animation → pool review → deckbuilder
type PostStartPhase = 'animation' | 'pool-review'

export default function SealedPodPage({ params }: PageProps) {
  const resolvedParams = use(params)
  const router = useRouter()
  const { user, isAuthenticated, loading: authLoading } = useAuth()
  usePresence(user?.id)
  const [shareId, setShareId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [hasLeft, setHasLeft] = useState(false)

  const [removeConfirmPlayer, setRemoveConfirmPlayer] = useState<{ id: string, username: string } | null>(null)
  const [isRemoving, setIsRemoving] = useState(false)

  // Post-start state
  const [postStartPhase, setPostStartPhase] = useState<PostStartPhase | null>(null)
  const [poolShareId, setPoolShareId] = useState<string | null>(null)
  const [poolData, setPoolData] = useState<any>(null)
  const [poolLoading, setPoolLoading] = useState(false)

  useEffect(() => {
    setShareId(resolvedParams.shareId)
  }, [resolvedParams])

  const {
    pod,
    loading,
    error: syncError,
    deleted,
    refresh,
  } = useSealedPodSocket(shareId, { enabled: !!shareId && isAuthenticated })

  // Detect when current user is kicked (was a player, now isn't, still in waiting)
  const wasPlayerRef = useRef(false)
  useEffect(() => {
    if (pod?.isPlayer) {
      wasPlayerRef.current = true
    } else if (wasPlayerRef.current && !pod?.isPlayer && pod?.status === 'waiting' && !hasLeft && !loading) {
      wasPlayerRef.current = false
      router.push('/?removed=1')
    }
  }, [pod?.isPlayer, pod?.status, hasLeft, loading, router])

  // Redirect if pod was deleted
  useEffect(() => {
    if (deleted) {
      router.push('/')
    }
  }, [deleted, router])

  // When pod completes, fetch pool data and start the animation flow
  useEffect(() => {
    if (pod?.status === 'complete' && shareId && !postStartPhase && !poolShareId) {
      const fetchPool = async () => {
        try {
          setPoolLoading(true)
          const poolRes = await fetch(`/api/sealed/${shareId}/pool`, {
            credentials: 'include',
          })
          if (!poolRes.ok) return
          const poolJson = await poolRes.json()
          const pShareId = (poolJson.data || poolJson).poolShareId
          if (pShareId) {
            setPoolShareId(pShareId)
            // Load the full pool data for animation and review
            const pool = await loadPool(pShareId)
            setPoolData(pool)
            setPostStartPhase('animation')
          }
        } catch (err) {
          console.error('Failed to get pool:', err)
        } finally {
          setPoolLoading(false)
        }
      }
      fetchPool()
    }
  }, [pod?.status, shareId, postStartPhase, poolShareId])

  // Auto-join on load if authenticated and not already in pod
  useEffect(() => {
    if (!shareId || !isAuthenticated || loading || pod?.isPlayer || pod?.status !== 'waiting' || hasLeft) return

    const autoJoin = async () => {
      try {
        await fetch(`/api/sealed/${shareId}/join`, {
          method: 'POST',
          credentials: 'include',
        })
        // No refresh needed — the join API broadcasts via socket,
        // which updates public state instantly and fetches user data
      } catch (err) {
        console.error('Failed to auto-join:', err)
      }
    }

    autoJoin()
  }, [shareId, isAuthenticated, loading, pod?.isPlayer, pod?.status, refresh, hasLeft])

  const handleStart = async () => {
    if (!shareId || starting) return
    setStarting(true)
    setError(null)
    try {
      const response = await fetch(`/api/sealed/${shareId}/start`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.message || 'Failed to start')
      }
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start')
      setStarting(false)
    }
  }

  const handleLeave = async () => {
    if (!shareId) return
    setHasLeft(true)
    try {
      await fetch(`/api/sealed/${shareId}/leave`, {
        method: 'POST',
        credentials: 'include',
      })
      router.push('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to leave')
    }
  }

  const handleCancel = async () => {
    if (!shareId) return
    try {
      const response = await fetch(`/api/sealed/${shareId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.message || 'Failed to cancel pod')
      }
      router.push('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel pod')
    }
  }

  const handleSettingsChange = async (settings: Record<string, unknown>) => {
    if (!shareId) return
    try {
      await fetch(`/api/sealed/${shareId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(settings),
      })
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update settings')
    }
  }

  const handleRemovePlayer = (userId: string) => {
    const player = (pod?.players || []).find((p: { id: string }) => p.id === userId)
    if (player) {
      setRemoveConfirmPlayer({ id: player.id, username: player.username || 'Player' })
    }
  }

  const handleConfirmRemove = async () => {
    if (!shareId || !removeConfirmPlayer || isRemoving) return
    setIsRemoving(true)
    try {
      const response = await fetch(`/api/sealed/${shareId}/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ playerId: removeConfirmPlayer.id }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.message || 'Failed to remove player')
      }
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove player')
    } finally {
      setIsRemoving(false)
      setRemoveConfirmPlayer(null)
    }
  }

  const handleLogin = () => {
    const returnUrl = encodeURIComponent(`/sealed/${shareId}`)
    window.location.href = `/api/auth/signin/discord?return_to=${returnUrl}`
  }

  if (authLoading) {
    return (
      <div className="draft-page-bg">
        <div className="loading"></div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="draft-page-bg">
        <div className="auth-prompt-container">
          <h2>Login Required</h2>
          <p>Join this sealed pod by logging in with Discord.</p>
          <Button variant="discord" size="lg" onClick={handleLogin}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" fill="currentColor"/></svg>
            Login with Discord
          </Button>
        </div>
      </div>
    )
  }

  if (loading || poolLoading) {
    return (
      <div className="draft-page-bg">
        <div className="loading"></div>
      </div>
    )
  }

  if (syncError && !pod) {
    return (
      <div className="draft-page-bg">
        <div className="error-container">
          <h2>Error</h2>
          <p>{syncError}</p>
          <Button variant="back" onClick={() => router.push('/')}>
            Back
          </Button>
        </div>
      </div>
    )
  }

  if (!pod) return null

  // The pod's configured pack count (6 or 8; Competitive Sealed is always 8).
  // Shown read-only in the lobby, and used as the pack-opening fallback when
  // the pool's own packs haven't loaded.
  const configuredPackCount = sealedPacksPerPlayer(
    pod.competitive === true,
    pod.settings?.packsPerPlayer
  )

  // Phase: Pack Opening Animation
  if (postStartPhase === 'animation' && poolData) {
    const packs = poolData.packs && poolData.packs.length > 0
      ? poolData.packs
      : poolData.cards ? [{ cards: poolData.cards }] : null

    return (
      <div className="app">
        <PackOpeningAnimation
          packCount={packs?.length || configuredPackCount}
          packImageUrls={getCyclingPackImageUrls(pod.setCode, packs?.length || configuredPackCount)}
          packs={packs}
          onComplete={() => setPostStartPhase('pool-review')}
          setCode={pod.setCode}
        />
      </div>
    )
  }

  // Phase: Pool Review
  if (postStartPhase === 'pool-review' && poolData) {
    const packs = poolData.packs && poolData.packs.length > 0
      ? poolData.packs
      : poolData.cards ? [{ cards: poolData.cards }] : null

    const getPoolName = () => {
      if (poolData.deckBuilderState) {
        const state = typeof poolData.deckBuilderState === 'string'
          ? JSON.parse(poolData.deckBuilderState)
          : poolData.deckBuilderState
        if (state.poolName) return state.poolName
      }
      return poolData.name || null
    }

    return (
      <div className="app">
        <SealedPod
          setCode={poolData.setCode}
          setName={poolData.setName}
          poolType="sealed"
          poolName={getPoolName()}
          createdAt={poolData.createdAt}
          onBack={() => router.push('/')}
          onBuildDeck={() => {
            router.push(`/pool/${poolShareId}/deck`)
          }}
          initialPacks={packs}
          shareId={poolData.shareId}
          isLoading={false}
          poolOwnerId={poolData.owner?.id || poolData.userId}
        />
      </div>
    )
  }

  const packArtUrl = getPackArtUrl(pod.setCode)

  // Phase: Lobby (waiting for players / host to start)
  // `.competitive` on the page root applies the gold competitive theme (draft.css)
  return (
    <div className={`page-with-chat${pod.competitive ? ' competitive' : ''}`}>
      <div className="page-content">
        <div className="pod-page">
          {packArtUrl && (
            <div className="set-art-header" style={{
              backgroundImage: `url("${packArtUrl}")`,
            }}></div>
          )}

          <div className="pod-content">
            <SealedPodLobby
              setName={pod.setName}
              podName={pod.name}
              shareId={pod.shareId}
              players={pod.players}
              isHost={pod.isHost}
              isPlayer={pod.isPlayer}
              currentUserId={user?.id}
              hostId={pod?.host?.id}
              maxPlayers={pod?.maxPlayers}
              isPublic={pod?.isPublic}
              competitive={pod?.competitive === true}
              packsPerPlayer={configuredPackCount}
              onStart={handleStart}
              onLeave={handleLeave}
              onCancel={handleCancel}
              onBack={() => router.push('/')}
              onRemovePlayer={handleRemovePlayer}
              onSettingsChange={handleSettingsChange}
              onRenamePod={(name) => handleSettingsChange({ name })}
              starting={starting}
              error={error || syncError}
              isAdmin={user?.is_admin === true}
            />
          </div>
        </div>
      </div>
      {/* Remove Player Confirmation Modal */}
      <Modal
        isOpen={!!removeConfirmPlayer}
        onClose={() => setRemoveConfirmPlayer(null)}
        title="Remove Player?"
        variant="danger"
      >
        <Modal.Body>
          <p>Are you sure you want to remove <strong>{removeConfirmPlayer?.username}</strong> from the pod?</p>
        </Modal.Body>
        <Modal.Actions>
          <Button variant="secondary" onClick={() => setRemoveConfirmPlayer(null)} disabled={isRemoving}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleConfirmRemove} disabled={isRemoving}>
            {isRemoving ? 'Removing...' : 'Remove'}
          </Button>
        </Modal.Actions>
      </Modal>

      <ChatPanel shareId={shareId} isHost={!!pod?.isHost} isPublic={pod?.isPublic} onMakePublic={() => handleSettingsChange({ isPublic: true })} defaultOpen={false} />
    </div>
  )
}

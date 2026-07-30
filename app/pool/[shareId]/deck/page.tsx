// @ts-nocheck
'use client'

import { useState, useEffect, useRef, useCallback, use } from 'react'
import DeckBuilder from '../../../../src/components/DeckBuilder'
import PoolBuilds from '../../../../src/components/PoolBuilds'
import ChatPanel from '../../../../src/components/ChatPanel'
import { loadPool, loadPoolWithRetry, updatePool } from '../../../../src/utils/poolApi'
import { usePoolBuildsSocket } from '../../../../src/hooks/usePoolBuildsSocket'
import { useDraftSocket } from '../../../../src/hooks/useDraftSocket'
import { useAuth } from '../../../../src/contexts/AuthContext'
import { useTrackPoolView } from '../../../../src/hooks/useTrackPoolView'
import '../../../../src/App.css'
import '../../../../src/components/ChatPanel.css'

interface CardType {
  id?: string
  name?: string
  [key: string]: unknown
}

interface PackType {
  cards: CardType[]
  [key: string]: unknown
}

interface PoolOwner {
  id: string
  username?: string
  [key: string]: unknown
}

interface PoolData {
  shareId: string
  setCode: string
  cards?: CardType[]
  packs?: PackType[]
  poolType?: string
  deckBuilderState?: string | Record<string, unknown>
  createdAt?: string
  name?: string
  owner?: PoolOwner
  userId?: string
  draftShareId?: string
  parentShareId?: string | null
  buildCount?: number
}

interface PageProps {
  params: Promise<{ shareId: string }>
}

export default function DeckBuilderPage({ params }: PageProps) {
  const resolvedParams = use(params)
  const { user } = useAuth()
  const [pool, setPool] = useState<PoolData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [shareId, setShareId] = useState<string | null>(null)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const pendingStateRef = useRef<Record<string, unknown> | null>(null)

  useEffect(() => {
    setShareId(resolvedParams.shareId)
  }, [resolvedParams])

  useTrackPoolView(shareId)

  useEffect(() => {
    async function fetchPool() {
      if (!shareId) return

      try {
        setLoading(true)
        // Retry briefly: a just-created pool may still be committing its
        // fire-and-forget save, and bouncing to /sealed during that window is
        // exactly bug #37. loading stays true across retries so the redirect
        // guard below can't fire mid-retry.
        const poolData = await loadPoolWithRetry(shareId)
        setPool(poolData)
      } catch (err) {
        console.error('Failed to load pool:', err)
        setError(err instanceof Error ? err.message : 'Failed to load pool')
      } finally {
        setLoading(false)
      }
    }

    fetchPool()

    // Refresh pool data when window regains focus (in case name was changed elsewhere)
    const handleFocus = () => {
      if (shareId) {
        loadPool(shareId).then(setPool).catch(console.error)
      }
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [shareId])

  useEffect(() => {
    if (error || (!loading && !pool)) {
      window.location.href = '/sealed'
    }
  }, [error, loading, pool])

  const handleBack = () => {
    if (shareId) {
      window.location.href = `/pool/${shareId}`
    }
  }

  const handleDeckStateChange = useCallback((deckBuilderState: Record<string, unknown>) => {
    // Debounced auto-save - only save after 2 seconds of no changes
    pendingStateRef.current = deckBuilderState

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    saveTimeoutRef.current = setTimeout(async () => {
      if (pool && pool.shareId && pendingStateRef.current) {
        try {
          await updatePool(pool.shareId, { deckBuilderState: pendingStateRef.current })
          const root = pool.parentShareId || pool.shareId
          window.dispatchEvent(new CustomEvent('wf:builds-changed', { detail: { rootShareId: root } }))
        } catch (err) {
          console.error('Failed to save deck builder state:', err)
        }
      }
    }, 2000)
  }, [pool])

  // Save pending state on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
      // Flush any pending save immediately on unmount
      if (pendingStateRef.current && pool?.shareId) {
        updatePool(pool.shareId, { deckBuilderState: pendingStateRef.current }).catch(() => {})
      }
    }
  }, [pool])

  // Save pending state on page refresh/close using sendBeacon
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (pendingStateRef.current && pool?.shareId) {
        // Use sendBeacon for reliable delivery during page unload
        const data = JSON.stringify({
          shareId: pool.shareId,
          deckBuilderState: pendingStateRef.current
        })
        navigator.sendBeacon('/api/pools/save-state', data)
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [pool])

  // Always render DeckBuilder immediately - show UI structure even while loading
  // Cards will be empty initially and populate once pool data loads
  // For draft pools, use pool.cards (drafted cards including leaders) not pool.packs (original pack cards)
  const allCards = pool
    ? (pool.poolType === 'draft'
        ? pool.cards || []
        : (pool.packs ? pool.packs.flatMap(pack => pack.cards) : pool.cards) || [])
    : []
  const setCode = pool?.setCode || null
  // Handle deckBuilderState - it might be a string or object
  const savedState = pool?.deckBuilderState
    ? (typeof pool.deckBuilderState === 'string'
        ? pool.deckBuilderState
        : JSON.stringify(pool.deckBuilderState))
    : null

  // Extract pool name from deckBuilderState (source of truth) or fall back to pool.name
  const getPoolNameFromState = () => {
    if (pool?.deckBuilderState) {
      const state = typeof pool.deckBuilderState === 'string'
        ? JSON.parse(pool.deckBuilderState)
        : pool.deckBuilderState
      if (state.poolName) return state.poolName
    }
    return pool?.name || null
  }
  const poolName = getPoolNameFromState()

  const draftShareId = pool?.draftShareId || null
  // Pools that can belong to a competitive pod: draft pools always have a pod;
  // sealed pools only when they came from a sealed pod (draftShareId resolves via
  // card_pools.pod_id). Solo sealed pools have no pod and stay out of this path.
  const isPodPool = Boolean(draftShareId) && (
    pool?.poolType === 'draft' || pool?.poolType === 'sealed' || pool?.poolType === 'sealed_pod'
  )
  const isOwner = user && pool?.owner && user.id === (pool.owner.id || pool.userId)
  // Anonymous pools (no owner) are editable + auto-saved by anyone, matching the
  // API (PUT /api/pools/:id allows edits when user_id is null) and the create
  // flow. Gated on `pool` being loaded so a mid-load null owner never grants edit
  // rights on someone else's pool.
  const isAnonymousPool = Boolean(pool && !pool?.owner?.id && !pool?.userId)
  const canEdit = Boolean(isOwner) || isAnonymousPool

  const [deckBuildDeadline, setDeckBuildDeadline] = useState<string | null>(null)
  const [draftLimitedMode, setDraftLimitedMode] = useState<'solo' | 'group' | null>(null)
  const [competitive, setCompetitive] = useState(false)

  useEffect(() => {
    // Competitive pods exist for draft AND sealed pods — the /api/draft/[shareId]
    // route serves both (it has no pod_type filter).
    if (!draftShareId || !isPodPool) {
      setDraftLimitedMode(null)
      setCompetitive(false)
      return
    }
    fetch(`/api/draft/${draftShareId}`)
      .then(res => res.ok ? res.json() : null)
      .then(payload => {
        // /api/draft/[shareId] wraps its body in { success, data, message }, so
        // the draft fields live under .data. Reading the top level made
        // `competitive` (and deckBuildDeadline / isSolo) silently undefined,
        // which made the Play button route competitive pods to /draft/[id]/pod
        // instead of the single /pool/[id]/deck/play (Swiss) page.
        const data = payload?.data ?? payload
        if (data?.deckBuildDeadline) {
          setDeckBuildDeadline(data.deckBuildDeadline)
        }
        setDraftLimitedMode(data?.settings?.isSolo === true ? 'solo' : 'group')
        setCompetitive(data?.competitive === true)
      })
      .catch(() => {})
  }, [draftShareId, pool?.poolType])

  // Live competitive lock state. Owner toggles propagate to every player via the
  // draft socket, so the locked deckbuilder unlocks/relocks in real time.
  // Enabled for any pod-backed pool (draft pods and sealed pods alike).
  const {
    draft: competitiveDraft,
    isHost: isCompetitiveHost,
  } = useDraftSocket(draftShareId, { enabled: !!draftShareId && isPodPool })

  const isCompetitivePod = competitiveDraft?.competitive === true
  const matchmakingStatus = competitiveDraft?.matchmakingStatus || 'deck_building'
  const decksUnlocked = competitiveDraft?.decksUnlocked === true
  // The primary competitive deck is frozen once Swiss Practice is underway
  // (matchmaking active) OR the build deadline has passed — unless the pod owner
  // has flipped the pod-level override. Child builds (forked decks) are never
  // locked; players edit those freely.
  const deadlinePassed = Boolean(
    deckBuildDeadline && new Date(deckBuildDeadline).getTime() <= Date.now()
  )
  // A Swiss event is "long over" once the pod is 7+ days old. `matchmakingStatus`
  // is live draft-socket state that can get stuck at 'active'/'deck_building' if
  // the event ended without a clean 'complete' transition — which would otherwise
  // strand the lock + "in progress" banner forever. Age is the backstop: after a
  // week, treat the Swiss as over regardless of the (stale) live status.
  const SWISS_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
  const swissLongOver = Boolean(
    pool?.createdAt && (Date.now() - new Date(pool.createdAt).getTime()) >= SWISS_MAX_AGE_MS
  )
  // Once the Swiss event is complete the deck is free again — no lock, no
  // "in progress" banner — even though the build deadline is (permanently) in
  // the past. `deadlinePassed` alone would otherwise keep the pod locked forever.
  const swissPracticeActive =
    matchmakingStatus !== 'complete' && !swissLongOver &&
    (matchmakingStatus === 'active' || deadlinePassed)
  const isChildBuildForLock = Boolean(pool?.parentShareId)
  const deckIsLocked = Boolean(
    isCompetitivePod && swissPracticeActive && !decksUnlocked && !isChildBuildForLock
  )
  // Same Swiss-active, non-child context as the lock, but AFTER the owner has
  // unlocked: the deck is editable again, yet the build deadline has passed, so we
  // show the lock area in its "tap to lock again" state instead of a dead "0:00"
  // build timer.
  const deckUnlockedDuringSwiss = Boolean(
    isCompetitivePod && swissPracticeActive && decksUnlocked && !isChildBuildForLock
  )
  // Hide Stats / Draft Log / Draft Report in the header while the competitive
  // event is underway — they reappear once the Swiss event is complete.
  const swissEventInProgress = Boolean(isCompetitivePod && matchmakingStatus !== 'complete' && !swissLongOver)

  const handleToggleLock = useCallback(async () => {
    if (!draftShareId || !isCompetitiveHost) return
    try {
      await fetch(`/api/draft/${draftShareId}/unlock-decks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ unlocked: !decksUnlocked }),
      })
      // The socket broadcast updates decksUnlocked for everyone (including us).
    } catch (err) {
      console.error('Failed to toggle deck lock:', err)
    }
  }, [draftShareId, isCompetitiveHost, decksUnlocked])

  const rootShareId = pool?.parentShareId || pool?.shareId || null
  const isChildBuild = Boolean(pool?.parentShareId)
  const limitedMode = pool?.poolType === 'draft' && draftShareId
    ? draftLimitedMode
    : draftShareId
      ? 'group'
      : 'solo'

  usePoolBuildsSocket(rootShareId)

  return (
    <div className={draftShareId ? 'page-with-chat' : ''}>
      <div className={draftShareId ? 'page-content' : ''}>
        <div className="app">
          <DeckBuilder
            cards={allCards}
            setCode={setCode}
            onBack={handleBack}
            savedState={savedState}
            onStateChange={(canEdit && !deckIsLocked) ? handleDeckStateChange : undefined}
            shareId={shareId}
            poolCreatedAt={canEdit ? pool?.createdAt : undefined}
            poolType={pool?.poolType}
            poolName={poolName}
            poolOwnerUsername={pool?.owner?.username}
            poolOwnerId={pool?.owner?.id || pool?.userId}
            anonymousEditable={isAnonymousPool}
            draftShareId={draftShareId}
            deckBuildDeadline={deckBuildDeadline}
            rootShareId={rootShareId}
            currentUserId={user?.id || null}
            limitedMode={limitedMode}
            competitive={competitive}
            swissLocked={deckIsLocked}
            swissUnlocked={deckUnlockedDuringSwiss}
            swissInProgress={swissEventInProgress}
            swissCanUnlock={isCompetitiveHost}
            onToggleSwissLock={handleToggleLock}
            poolParentShareId={pool?.parentShareId || null}
          />
        </div>
      </div>
      {draftShareId && <ChatPanel shareId={draftShareId} defaultOpen={false} />}
    </div>
  )
}

// @ts-nocheck
'use client'

import { useState, useEffect, useRef, use, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { loadPool, updatePool, claimPool } from '../../../../../src/utils/poolApi'
import { getPackArtUrl } from '../../../../../src/utils/packArt'
import { getSetConfig } from '../../../../../src/utils/setConfigs'
import { getLatestReleasedSetCode, getKarabastCardPool } from '../../../../../src/utils/setConfigs/latest'
import { useAuth } from '../../../../../src/contexts/AuthContext'
import EditableTitle from '../../../../../src/components/EditableTitle'
import PluginCTA, { usePluginCTA } from '../../../../../src/components/PluginCTA'
import { getCachedCards, initializeCardCache } from '../../../../../src/utils/cardCache'
// Fetch-based loader (NOT cardData) — 'use client' page; a cardData import
// would embed the 8 MB cards.json in this bundle (U5, foundations hardening).
import { loadAllCards } from '../../../../../src/utils/cardDataClient'
import { getBaseSetCode } from '../../../../../src/utils/carboniteConstants'
import { buildBaseCardMap, getBaseCardId } from '../../../../../src/utils/variantDowngrade'
import { jsonParse } from '../../../../../src/utils/json'
import { resolveArchetypeUuid, fetchArchetypeNickname } from '../../../../../src/utils/deckBuilderSharing'
import { archetypeShortName } from '../../../../../src/utils/archetypeName'
import { formatRecord } from '../../../../../src/utils/deckRecord'
import { wayfinderMatchesUrl } from '../../../../../src/utils/wayfinderUrls'
import { renderDeckImageBlob, renderPoolImageBlob } from '../../../../../src/services/deckImage'
import { calculateAspectPenalty } from '../../../../../src/services/cards/aspectPenalties'
import Card from '../../../../../src/components/Card'
import CardWithPreview from '../../../../../src/components/CardWithPreview'
import Modal from '../../../../../src/components/Modal'
import Button from '../../../../../src/components/Button'
import DraftReportButton from '../../../../../src/components/DraftReportButton'
import PlayInstructions from '../../../../../src/components/PlayInstructions'
import ChatPanel from '../../../../../src/components/ChatPanel'
import MatchmakingPanel from '../../../../../src/components/MatchmakingPanel'
import ResultReportModal from '../../../../../src/components/ResultReportModal'
import { useWayfinderDetection } from '../../../../../src/hooks/useWayfinderDetection'
import { useWayfinderPracticeLaunch } from '../../../../../src/hooks/useWayfinderPracticeLaunch'
import { useDraftSocket } from '../../../../../src/hooks/useDraftSocket'
import { trackEvent } from '../../../../../src/hooks/useAnalytics'
import {
  buildLimitedContext,
  getOrCreateLimitedFlowId,
  LimitedAnalyticsEvents,
  LimitedPlayActions,
} from '../../../../../src/analytics/limitedEvents'
import '../../../../../src/App.css'
import '../../../../../src/components/ChatPanel.css'
import './play.css'

function WldBadge({
  wins, losses, draws, matchIds
}: {
  wins: number; losses: number; draws: number; matchIds: string[]
}) {
  const wayfinder = process.env.NEXT_PUBLIC_WAYFINDER_URL ?? 'https://plugin.wayfinder.news'
  return (
    <div className="play-record-line">
      <span className="play-record-badge">{formatRecord(wins, losses, draws)}</span>
      {matchIds.map((id, i) => (
        <a
          key={id}
          href={`${wayfinder}/matches/${id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="play-record-match-link"
        >
          Match {i + 1}
        </a>
      ))}
    </div>
  )
}

interface CardType {
  id?: string
  name?: string
  subtitle?: string
  type?: string
  imageUrl?: string
  isBase?: boolean
  isLeader?: boolean
  [key: string]: unknown
}

interface CardPosition {
  card: CardType
  section: string
  enabled?: boolean
  [key: string]: unknown
}

interface DeckBuilderState {
  cardPositions?: Record<string, CardPosition>
  activeLeader?: string
  activeBase?: string
  poolName?: string
  [key: string]: unknown
}

interface PoolOwner {
  id: string
  username?: string
  name?: string
  [key: string]: unknown
}

interface PoolData {
  shareId: string
  setCode: string
  poolType?: string
  deckBuilderState?: string | DeckBuilderState
  name?: string
  owner?: PoolOwner | null
  userId?: string
  draftShareId?: string
  createdAt?: string
  wins?: number
  losses?: number
  draws?: number
  wayfinderMatchIds?: string[]
}

interface Player {
  id: string
  username?: string
  isHost?: boolean
  [key: string]: unknown
}

interface PageProps {
  params: Promise<{ shareId: string }>
}

export default function PlayPage({ params }: PageProps) {
  const resolvedParams = use(params)
  const router = useRouter()
  const { user, isPatron } = useAuth()
  const [pool, setPool] = useState<PoolData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [shareId, setShareId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [messageType, setMessageType] = useState<string | null>(null)
  const [firstOpponent, setFirstOpponent] = useState<Player | null>(null)
  const [hasBye, setHasBye] = useState(false)
  const [isSoloDraft, setIsSoloDraft] = useState(false)
  const [opponentChecked, setOpponentChecked] = useState(false)
  const [deckImageModal, setDeckImageModal] = useState<string | null>(null)
  const [generatingImage, setGeneratingImage] = useState(false)
  const [poolImageUrl, setPoolImageUrl] = useState<string | null>(null)
  const [showingPool, setShowingPool] = useState(false)
  const [loadingPool, setLoadingPool] = useState(false)
  const [postingToDiscord, setPostingToDiscord] = useState(false)
  const [discordJustPosted, setDiscordJustPosted] = useState(false)
  const [postedToDiscord, setPostedToDiscord] = useState(() => {
    if (typeof window !== 'undefined' && resolvedParams?.shareId) {
      return localStorage.getItem(`postedToDiscord_${resolvedParams.shareId}`) === 'true'
    }
    return false
  })
  const [baseCardMap, setBaseCardMap] = useState<Map<string, string> | null>(null)
  const [claiming, setClaiming] = useState(false)
  const deckBuilderState = useMemo(() => jsonParse(pool?.deckBuilderState, {}), [pool?.deckBuilderState])
  // Deck (archetype) name. NEVER a made-up "Leader / Base" slash — use the
  // canonical swuapi archetype nickname, falling back to the consistent
  // "Leader Color HP" form (archetypeShortName) while it resolves.
  const leaderCard = deckBuilderState?.cardPositions?.[deckBuilderState?.activeLeader]?.card || null
  const baseCard = deckBuilderState?.cardPositions?.[deckBuilderState?.activeBase]?.card || null
  const [archetypeNickname, setArchetypeNickname] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    setArchetypeNickname(null)
    const leaderUuid = resolveArchetypeUuid(leaderCard, 'leader')
    const baseUuid = resolveArchetypeUuid(baseCard, 'base')
    if (!leaderUuid || !baseUuid) return
    fetchArchetypeNickname(leaderUuid, baseUuid).then((n) => {
      if (!cancelled) setArchetypeNickname(n)
    })
    return () => { cancelled = true }
  }, [leaderCard?.id, baseCard?.id])
  const deckArchetypeName = useMemo(() => {
    return archetypeShortName({
      archetypeNickname,
      leaderName: leaderCard?.name || null,
      baseAspects: Array.isArray(baseCard?.aspects) ? baseCard.aspects : [],
      baseHp: typeof baseCard?.hp === 'number' ? baseCard.hp : null,
    })
  }, [archetypeNickname, leaderCard?.name, baseCard?.aspects, baseCard?.hp])
  // The play box has two tabs: Play (the existing wayfinder/manual instructions)
  // and Record (your game history, or a prompt to install the plugin).
  const [practiceHand, setPracticeHand] = useState<{
    cards: CardType[]
    probAtLeastOne: number
    avgTurnOnePlays: number
    turnOnePlays: number
    totalCards: number
  } | null>(null)
  const playPageTrackedRef = useRef<string | null>(null)

  // Competitive practice mode state
  const [reportingMatchId, setReportingMatchId] = useState<string | null>(null)
  const [overridingMatchId, setOverridingMatchId] = useState<string | null>(null)

  // Draft socket for competitive mode — enabled only for draft pools
  const draftShareId = pool?.draftShareId || null
  const {
    draft: competitiveDraft,
    isHost: isCompetitiveHost,
    players: draftPlayers,
    loading: competitiveLoading,
    refresh: refreshCompetitive,
  } = useDraftSocket(draftShareId, { enabled: !!draftShareId && pool?.poolType === 'draft' })

  // Until the draft socket resolves we don't know whether this is a competitive
  // (Swiss) pod — render a skeleton instead of guessing, which caused the normal
  // play box to flash in and then get replaced by the Swiss box.
  const competitiveUndetermined = Boolean(draftShareId) && pool?.poolType === 'draft' && competitiveLoading

  const isCompetitive = competitiveDraft?.competitive === true
  const competitiveRounds = (competitiveDraft?.rounds || []) as {
    roundNumber: number
    status: string
    matches: {
      id: string
      player1: { id: string; username: string; avatarUrl?: string } | null
      player2: { id: string; username: string; avatarUrl?: string } | null
      isBye: boolean
      game1Result: string | null
      game2Result: string | null
      game3Result: string | null
      player1Submitted: boolean
      player2Submitted: boolean
      finalConfirmed: boolean
      matchWinner: string | null
      podOwnerOverride: boolean
      wayfinderMatchId?: string | null
    }[]
  }[]
  const competitiveCurrentRound = competitiveDraft?.currentRound || 1
  const matchmakingStatus = competitiveDraft?.matchmakingStatus || 'deck_building'

  const getLimitedFormat = () => pool?.poolType === 'draft' ? 'draft' : 'sealed'
  const getLimitedMode = () => {
    if (deckBuilderState?.isInfinitePool === true) return 'solo'
    if (pool?.poolType === 'draft') return isSoloDraft ? 'solo' : 'group'
    if (pool?.poolType === 'sealed_pod') return 'group'
    return pool?.draftShareId ? 'group' : 'solo'
  }
  const getDeckCounts = () => {
    const deckData = getDeckData()
    return {
      deck_size: deckData?.deck?.reduce((sum: number, c: { count: number }) => sum + c.count, 0) || 0,
      sideboard_size: deckData?.sideboard?.reduce((sum: number, c: { count: number }) => sum + c.count, 0) || 0,
      deck_ready: !!(deckData?.leader && deckData?.base),
    }
  }
  const getLimitedAnalyticsContext = () => {
    const format = getLimitedFormat()
    const mode = getLimitedMode()
    return {
      format,
      mode,
      setCode: pool?.setCode,
      shareId,
      poolShareId: shareId,
      draftShareId: pool?.draftShareId,
      flowId: getOrCreateLimitedFlowId(`${format}:${mode}`),
      routeTemplate: '/pool/[shareId]/deck/play',
    }
  }
  const trackLimitedPlayAction = (action: string, properties: Record<string, unknown> = {}) => {
    const sanitized = { ...properties }
    for (const key of ['shareId', 'poolShareId', 'podShareId', 'draftShareId', 'matchId']) {
      delete sanitized[key]
    }
    trackEvent(LimitedAnalyticsEvents.LIMITED_PLAY_ACTION_USED, {
      ...buildLimitedContext({
        ...getLimitedAnalyticsContext(),
        ...properties,
      }),
      action,
      success: properties.success ?? true,
      target: properties.target ?? null,
      ...sanitized,
    })
  }

  // Detect the Wayfinder extension via the centralized hook (meta tag + event +
  // postMessage, with a localStorage bridge and the ?wayfinder=1/0 QA override).
  const { detected: wayfinderDetected, settled: wayfinderSettled } = useWayfinderDetection()
  // Companion pitch shown above the Swiss panel for logged-in players who don't
  // have the Companion. shouldShow (with required) === !hasPlugin, so the banner
  // and the full install CTA appear/disappear together.
  const { shouldShow: showCompanionPitch } = usePluginCTA({ required: true })
  const wayfinderCardPool = useMemo(() => getKarabastCardPool(pool?.setCode), [pool?.setCode])
  const practiceLaunch = useWayfinderPracticeLaunch({
    draftShareId,
    poolShareId: shareId,
    wayfinderDetected,
    cardPool: wayfinderCardPool,
    format: 'pool',
    onTrack: trackLimitedPlayAction,
  })

  // Launch wrapper: after kicking off a game, re-read the draft ~32s later so that
  // if the lobby is still "creating" (a silent Karabast failure with no lifecycle
  // callback) the 30s server staleness surfaces a Retry instead of a stuck button.
  const handlePracticeLaunch = useCallback((matchId: string) => {
    const result = practiceLaunch.launchPracticeMatch(matchId)
    window.setTimeout(() => { refreshCompetitive?.() }, 32000)
    return result
  }, [practiceLaunch, refreshCompetitive])

  // ?lobby=private|public deep link (from the /me Pools tab lobby buttons):
  // auto-opens the corresponding Karabast lobby once detected + owner.
  const autoLobbyIntent = useMemo<'private' | 'public' | null>(() => {
    if (typeof window === 'undefined') return null
    const v = new URLSearchParams(window.location.search).get('lobby')
    return v === 'private' || v === 'public' ? v : null
  }, [])

  useEffect(() => {
    setShareId(resolvedParams.shareId)
  }, [resolvedParams])

  // Fire-and-forget personal-stats instrumentation. Logged-in users only —
  // anonymous visits are not tracked (the endpoint returns 401 anyway, but
  // skipping the POST keeps the network panel quiet for signed-out users).
  // Errors are swallowed; the row landing is what matters, not the HTTP
  // response. Runs once per shareId per logged-in user, but the endpoint
  // is idempotent via UPSERT so a stray re-mount during HMR is harmless.
  useEffect(() => {
    if (!user || !resolvedParams?.shareId) return
    fetch('/api/me/play-visit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ shareId: resolvedParams.shareId }),
    }).catch(() => {})
  }, [user, resolvedParams?.shareId])

  useEffect(() => {
    if (!shareId) return

    async function fetchPool() {
      try {
        setLoading(true)
        setOpponentChecked(false)
        const poolData = await loadPool(shareId)
        setPool(poolData)
        setError(null)

        // Record built deck (fire-and-forget)
        fetch(`/api/pools/${shareId}/build`, { method: 'POST' }).catch(() => {})

        // For draft pools, fetch opponent info
        if (poolData.poolType === 'draft' && poolData.draftShareId) {
          fetchOpponent(poolData.draftShareId)
        } else if (poolData.poolType === 'sealed_pod' && poolData.draftShareId) {
          fetchSealedPodOpponent(poolData.draftShareId)
        } else {
          setOpponentChecked(true)
        }

        // For sealed pod pools, fetch opponent info from sealed pod API
      } catch (err) {
        console.error('Failed to load pool:', err)
        setError(err instanceof Error ? err.message : 'Failed to load pool')
      } finally {
        setLoading(false)
      }
    }

    fetchPool()

    // Refresh pool data when window regains focus (in case name was changed)
    const handleFocus = () => {
      if (shareId) {
        loadPool(shareId).then(poolData => {
          setPool(poolData)
        }).catch(console.error)
      }
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [shareId])

  // Initialize card cache and build base card map when pool loads
  useEffect(() => {
    if (!pool?.setCode) return

    async function init() {
      await initializeCardCache()
      const map = buildBaseCardMap(pool.setCode)
      setBaseCardMap(map)
    }
    init()
  }, [pool?.setCode])

  // Auto-claim anonymous pool when user logs in
  useEffect(() => {
    if (!user || !pool || !shareId) return
    const deckBuilderState = jsonParse(pool.deckBuilderState, {})
    if (deckBuilderState?.isInfinitePool) return
    // Only claim if pool is anonymous (no owner)
    if (pool.owner !== null) return

    async function tryClaimPool() {
      setClaiming(true)
      try {
        const result = await claimPool(shareId)
        if (result.claimed) {
          // Refresh pool data to get updated owner
          const updatedPool = await loadPool(shareId)
          setPool(updatedPool)
          setMessage('This deck is now saved to your account!')
          setMessageType('success')
          setTimeout(() => { setMessage(null); setMessageType(null) }, 5000)
        }
      } catch (err) {
        console.error('Failed to claim pool:', err)
        // Don't show error - claiming is a nice-to-have
      } finally {
        setClaiming(false)
      }
    }
    tryClaimPool()
  }, [user, pool?.owner, shareId])

  const fetchOpponent = async (draftShareId: string) => {
    try {
      const response = await fetch(`/api/draft/${draftShareId}`, {
        credentials: 'include'
      })
      if (!response.ok) return

      const data = await response.json()
      const draft = data.data || data

      if (draft.status !== 'complete') return
      if (draft.settings?.isSolo === true) {
        setIsSoloDraft(true)
        return
      }

      const players = draft.players || []
      const myPlayer = players.find((p: Player) => p.id === user?.id)
      if (!myPlayer || players.length === 0) return

      // Solo draft (only human player) — treat like sealed
      if (players.length <= 1) {
        setIsSoloDraft(true)
        return
      }

      const isOddNumber = players.length % 2 === 1
      const organizer = players.find((p: Player) => p.isHost)

      if (isOddNumber && organizer?.id === myPlayer.id) {
        setHasBye(true)
      } else {
        const myIndex = players.findIndex((p: Player) => p.id === myPlayer.id)
        if (myIndex !== -1) {
          let playersForPairing = [...players]
          if (isOddNumber && organizer) {
            playersForPairing = playersForPairing.filter((p: Player) => p.id !== organizer.id)
          }
          const myNewIndex = playersForPairing.findIndex((p: Player) => p.id === myPlayer.id)
          if (myNewIndex !== -1) {
            const halfLength = playersForPairing.length / 2
            const opponentIndex = (myNewIndex + Math.floor(halfLength)) % playersForPairing.length
            setFirstOpponent(playersForPairing[opponentIndex])
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch opponent:', err)
    } finally {
      setOpponentChecked(true)
    }
  }

  const fetchSealedPodOpponent = async (draftShareId: string) => {
    try {
      const response = await fetch(`/api/sealed/${draftShareId}/pod`, {
        credentials: 'include'
      })
      if (!response.ok) return

      const json = await response.json()
      const data = json.data || json

      if (!data.pairings) return

      const pairings = data.pairings
      const players = data.players || []

      // Check if user has a bye
      if (pairings.byePlayerId === user?.id) {
        setHasBye(true)
        return
      }

      // Find this user's match
      const myMatch = (pairings.matches || []).find(
        (m: { player1Id: string; player2Id: string }) =>
          m.player1Id === user?.id || m.player2Id === user?.id
      )

      if (myMatch) {
        const opponentId = myMatch.player1Id === user?.id
          ? myMatch.player2Id
          : myMatch.player1Id
        const opponent = players.find((p: Player) => p.id === opponentId)
        if (opponent) {
          setFirstOpponent(opponent)
        }
      }
    } catch (err) {
      console.error('Failed to fetch sealed pod opponent:', err)
    } finally {
      setOpponentChecked(true)
    }
  }

  useEffect(() => {
    if (!pool || !shareId || !opponentChecked) return
    const trackingKey = shareId
    if (playPageTrackedRef.current === trackingKey) return

    const deckCounts = getDeckCounts()
    trackEvent(LimitedAnalyticsEvents.LIMITED_PLAY_PAGE_VIEWED, {
      ...buildLimitedContext(getLimitedAnalyticsContext()),
      user_role: pool.owner?.id && user?.id === pool.owner.id ? 'owner' : user ? 'viewer' : 'anonymous',
      is_owner: !!(pool.owner?.id && user?.id === pool.owner.id),
      has_opponent: !!firstOpponent,
      has_bye: hasBye,
      wayfinder_detected: wayfinderDetected,
      ...deckCounts,
    })
    playPageTrackedRef.current = trackingKey
  }, [pool, shareId, opponentChecked, firstOpponent, hasBye, wayfinderDetected, user?.id, isSoloDraft])

  const getDeckData = () => {
    if (!pool?.deckBuilderState) return null

    const state = jsonParse(pool.deckBuilderState)

    const { cardPositions, activeLeader, activeBase } = state
    if (!cardPositions || !activeLeader || !activeBase) return null

    const leaderCard = cardPositions[activeLeader]?.card
    const baseCard = cardPositions[activeBase]?.card

    if (!leaderCard || !baseCard) return null

    // Build set of leader/base IDs from card cache to filter final output
    // Use getBaseCardId to ensure variant treatments map to their base ID
    const allCards = getCachedCards(getBaseSetCode(pool.setCode)) || []
    const leaderBaseIds = new Set()
    allCards.forEach(card => {
      if (card.type === 'Leader' || card.type === 'Base') {
        leaderBaseIds.add(getBaseCardId(card, baseCardMap))
      }
    })

    // Get all cards from deck and sideboard sections (excluding leaders and bases)
    const deckCards = Object.values(cardPositions)
      .filter(pos => pos.section === 'deck' && pos.enabled !== false && !pos.card.isBase && !pos.card.isLeader)
      .map(pos => pos.card)

    const sideboardCards = Object.values(cardPositions)
      .filter(pos => pos.section === 'sideboard' && !pos.card.isBase && !pos.card.isLeader)
      .map(pos => pos.card)


    // Count cards by base ID, excluding leaders and bases
    const deckCounts = new Map()
    deckCards.forEach(card => {
      const id = getBaseCardId(card, baseCardMap)
      if (!leaderBaseIds.has(id)) {
        deckCounts.set(id, (deckCounts.get(id) || 0) + 1)
      }
    })

    const sideboardCounts = new Map()
    sideboardCards.forEach(card => {
      const id = getBaseCardId(card, baseCardMap)
      if (!leaderBaseIds.has(id)) {
        sideboardCounts.set(id, (sideboardCounts.get(id) || 0) + 1)
      }
    })

    const poolName = state.poolName || pool.name || `${pool.setCode} ${pool.poolType === 'draft' ? 'Draft' : 'Sealed'}`

    return {
      metadata: {
        name: `[PTP] ${poolName}`.slice(0, 80),
        author: "Protect the Pod"
      },
      leader: { id: getBaseCardId(leaderCard, baseCardMap), count: 1 },
      base: { id: getBaseCardId(baseCard, baseCardMap), count: 1 },
      deck: Array.from(deckCounts.entries()).map(([id, count]) => ({ id, count })),
      sideboard: Array.from(sideboardCounts.entries()).map(([id, count]) => ({ id, count }))
    }
  }

  const copyDeckLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      trackLimitedPlayAction(LimitedPlayActions.COPY_DECK_LINK, { target: 'clipboard' })
      setMessage('Deck link copied!')
      setMessageType('success')
      setTimeout(() => { setMessage(null); setMessageType(null) }, 3000)
    } catch (err) {
      trackLimitedPlayAction(LimitedPlayActions.COPY_DECK_LINK, {
        target: 'clipboard',
        success: false,
      })
      setMessage('Failed to copy link')
      setMessageType('error')
      setTimeout(() => { setMessage(null); setMessageType(null) }, 3000)
    }
  }

  const copyToClipboard = async () => {
    const deckData = getDeckData()
    if (!deckData) {
      setMessage('No deck data found. Please build your deck first.')
      setMessageType('error')
      setTimeout(() => { setMessage(null); setMessageType(null) }, 3000)
      return
    }

    if (!deckData.leader || !deckData.base) {
      setMessage('Please select a leader and base before copying.')
      setMessageType('error')
      setTimeout(() => { setMessage(null); setMessageType(null) }, 3000)
      return
    }

    try {
      await navigator.clipboard.writeText(JSON.stringify(deckData, null, 2))
      trackLimitedPlayAction(LimitedPlayActions.COPY_DECK_JSON, {
        target: 'clipboard',
        ...getDeckCounts(),
      })
      setMessage('Deck JSON copied to clipboard!')
      setMessageType('success')
      setTimeout(() => { setMessage(null); setMessageType(null) }, 3000)
    } catch (err) {
      trackLimitedPlayAction(LimitedPlayActions.COPY_DECK_JSON, {
        target: 'clipboard',
        success: false,
        ...getDeckCounts(),
      })
      setMessage('Failed to copy to clipboard')
      setMessageType('error')
      setTimeout(() => { setMessage(null); setMessageType(null) }, 3000)
    }
  }

  const downloadJSON = () => {
    const deckData = getDeckData()
    if (!deckData) {
      setMessage('No deck data found. Please build your deck first.')
      setMessageType('error')
      setTimeout(() => { setMessage(null); setMessageType(null) }, 3000)
      return
    }

    if (!deckData.leader || !deckData.base) {
      setMessage('Please select a leader and base before downloading.')
      setMessageType('error')
      setTimeout(() => { setMessage(null); setMessageType(null) }, 3000)
      return
    }

    const jsonString = JSON.stringify(deckData, null, 2)
    const blob = new Blob([jsonString], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `[PTP ${pool?.poolType === 'draft' ? 'DRAFT' : 'SEALED'}] ${pool?.setCode || 'deck'} Deck.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    trackLimitedPlayAction(LimitedPlayActions.DOWNLOAD_DECK_JSON, {
      target: 'file',
      ...getDeckCounts(),
    })
  }

  const postToDiscord = async () => {
    if (!shareId || postingToDiscord || postedToDiscord) return
    setPostingToDiscord(true)
    try {
      const res = await fetch(`/api/pools/${shareId}/post-to-discord`, {
        method: 'POST',
        credentials: 'include',
      })
      if (res.ok) {
        setPostedToDiscord(true)
        if (shareId) localStorage.setItem(`postedToDiscord_${shareId}`, 'true')
        trackLimitedPlayAction(LimitedPlayActions.POST_TO_DISCORD, { target: 'discord' })
        // Transient confirmation rendered below the button row (not the shared
        // message box), and fades out on its own.
        setDiscordJustPosted(true)
        setTimeout(() => setDiscordJustPosted(false), 4000)
      } else {
        const data = await res.json().catch(() => ({}))
        trackLimitedPlayAction(LimitedPlayActions.POST_TO_DISCORD, {
          target: 'discord',
          success: false,
          failure_reason: data.error || 'http_error',
        })
        setMessage(data.error || 'Failed to post to Discord')
        setMessageType('error')
      }
    } catch {
      trackLimitedPlayAction(LimitedPlayActions.POST_TO_DISCORD, {
        target: 'discord',
        success: false,
        failure_reason: 'network_error',
      })
      setMessage('Failed to post to Discord')
      setMessageType('error')
    } finally {
      setPostingToDiscord(false)
    }
  }

  const exportDeckImage = async () => {
    if (!pool?.deckBuilderState) {
      trackLimitedPlayAction(LimitedPlayActions.GENERATE_DECK_IMAGE, {
        target: 'image',
        success: false,
        failure_reason: 'missing_deck_data',
      })
      setMessage('No deck data found. Please build your deck first.')
      setMessageType('error')
      setTimeout(() => { setMessage(null); setMessageType(null) }, 3000)
      return
    }

    setGeneratingImage(true)
    try {
      const state = jsonParse(pool.deckBuilderState)
      const { cardPositions, activeLeader, activeBase } = state
      if (!cardPositions || !activeLeader || !activeBase) {
        trackLimitedPlayAction(LimitedPlayActions.GENERATE_DECK_IMAGE, {
          target: 'image',
          success: false,
          failure_reason: 'missing_leader_or_base',
        })
        setMessage('Please select a leader and base first.')
        setMessageType('error')
        setTimeout(() => { setMessage(null); setMessageType(null) }, 3000)
        setGeneratingImage(false)
        return
      }

      const blob = await renderDeckImageBlob({
        cardPositions,
        activeLeader,
        activeBase,
        leaderCard: cardPositions[activeLeader]?.card || null,
        baseCard: cardPositions[activeBase]?.card || null,
        setCode: pool.setCode,
        poolType: pool.poolType === 'draft' ? 'draft' : 'sealed',
        poolName: state.poolName || pool.name || null,
        ownerUsername: pool?.owner?.username || pool?.owner?.name || null,
        shareId: pool?.shareId || shareId,
        rootShareId: pool?.rootShareId ?? null,
      })

      trackLimitedPlayAction(LimitedPlayActions.GENERATE_DECK_IMAGE, {
        target: 'image',
        success: !!blob,
        ...getDeckCounts(),
      })

      if (!blob) {
        setMessage('Failed to generate image')
        setMessageType('error')
        setTimeout(() => { setMessage(null); setMessageType(null) }, 3000)
        setGeneratingImage(false)
        return
      }

      setDeckImageModal(URL.createObjectURL(blob))
      setGeneratingImage(false)
    } catch (error) {
      console.error('Error generating deck image:', error)
      trackLimitedPlayAction(LimitedPlayActions.GENERATE_DECK_IMAGE, {
        target: 'image',
        success: false,
        failure_reason: 'generation_error',
      })
      setMessage('Failed to generate image')
      setMessageType('error')
      setTimeout(() => { setMessage(null); setMessageType(null) }, 3000)
      setGeneratingImage(false)
    }
  }

  const exportPoolImage = async (): Promise<string | null> => {
    if (!pool?.deckBuilderState) return null
    try {
      const state = jsonParse(pool.deckBuilderState)
      const { cardPositions, activeLeader, activeBase } = state
      if (!cardPositions) return null

      const blob = await renderPoolImageBlob({
        cardPositions,
        activeLeader: activeLeader || null,
        activeBase: activeBase || null,
        leaderCard: activeLeader ? cardPositions[activeLeader]?.card || null : null,
        baseCard: activeBase ? cardPositions[activeBase]?.card || null : null,
        setCode: pool.setCode,
        poolType: pool.poolType === 'draft' ? 'draft' : 'sealed',
        poolName: state.poolName || pool.name || null,
        ownerUsername: pool?.owner?.username || pool?.owner?.name || null,
        shareId: pool?.shareId || shareId,
        rootShareId: pool?.rootShareId ?? null,
      })
      return blob ? URL.createObjectURL(blob) : null
    } catch (error) {
      console.error('Error generating pool image:', error)
      return null
    }
  }

  // Preload shuffle sound for instant playback
  const shuffleSoundRef = useRef<HTMLAudioElement | null>(null)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      shuffleSoundRef.current = new Audio('/sounds/shuffling-hand.mp3')
      shuffleSoundRef.current.volume = 0.5
      shuffleSoundRef.current.load()
    }
  }, [])

  const drawPracticeHand = (playSound = false) => {
    if (!pool?.deckBuilderState) return

    const state = jsonParse(pool.deckBuilderState)
    const { cardPositions, activeLeader, activeBase } = state
    if (!cardPositions) return

    const leaderCard = activeLeader ? cardPositions[activeLeader]?.card : null
    const baseCard = activeBase ? cardPositions[activeBase]?.card : null

    const deckCards = Object.values(cardPositions)
      .filter((pos: CardPosition) => pos.section === 'deck' && pos.enabled !== false && !pos.card.isBase && !pos.card.isLeader)
      .map((pos: CardPosition) => pos.card)

    // Shuffle and take 6
    const shuffled = [...deckCards].sort(() => Math.random() - 0.5)
    const hand = shuffled.slice(0, 6)

    // Calculate turn-one-play stats for the full deck
    // A turn one play: cost + aspect penalty <= 2, and is a Unit or "Faith in Your Friends"
    const isTurnOnePlay = (card: CardType) => {
      const cost = (card.cost as number) ?? 0
      const penalty = calculateAspectPenalty(card, leaderCard, baseCard)
      const effectiveCost = cost + penalty
      if (effectiveCost > 2) return false
      if (card.type === 'Unit') return true
      if (card.name === 'Faith in Your Friends') return true
      return false
    }

    const totalCards = deckCards.length
    const turnOnePlays = deckCards.filter(isTurnOnePlay).length
    const handSize = Math.min(6, totalCards)

    // Probability of at least 1 turn-one play in a hand of 6
    // P(at least 1) = 1 - P(none) = 1 - C(non_t1, 6) / C(total, 6)
    let probAtLeastOne = 0
    let avgTurnOnePlays = 0
    if (totalCards > 0 && handSize > 0) {
      const nonT1 = totalCards - turnOnePlays
      if (turnOnePlays === 0) {
        probAtLeastOne = 0
        avgTurnOnePlays = 0
      } else if (nonT1 < handSize) {
        // Not enough non-T1 cards to fill a hand without any T1
        probAtLeastOne = 1
        avgTurnOnePlays = handSize * turnOnePlays / totalCards
      } else {
        // Hypergeometric: P(none) = C(nonT1, handSize) / C(total, handSize)
        let pNone = 1
        for (let i = 0; i < handSize; i++) {
          pNone *= (nonT1 - i) / (totalCards - i)
        }
        probAtLeastOne = 1 - pNone
        avgTurnOnePlays = handSize * turnOnePlays / totalCards
      }
    }

    // Play shuffle sound only on redraw
    if (playSound && shuffleSoundRef.current) {
      shuffleSoundRef.current.currentTime = 0
      shuffleSoundRef.current.play().catch(() => {})
    }

    setPracticeHand({ cards: hand, probAtLeastOne, avgTurnOnePlays, turnOnePlays, totalCards })
    trackLimitedPlayAction(LimitedPlayActions.PRACTICE_HAND_DRAW, {
      target: 'practice_hand',
      deck_size: totalCards,
      turn_one_plays: turnOnePlays,
      success: true,
    })
  }

  // Competitive practice mode handlers
  const handleReportResult = async (matchId: string, game1: string, game2: string, game3: string | null) => {
    if (!draftShareId) return
    try {
      const res = await fetch(`/api/draft/${draftShareId}/match/${matchId}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ game1, game2, game3 }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        trackLimitedPlayAction(LimitedPlayActions.MATCH_RESULT_SUBMIT, {
          target: 'match_result',
          success: false,
          matchId,
          result_source: 'player_report',
          failure_reason: data.error || 'http_error',
        })
        setMessage(data.error || 'Failed to report result')
        setMessageType('error')
        setTimeout(() => { setMessage(null); setMessageType(null) }, 3000)
      } else {
        trackLimitedPlayAction(LimitedPlayActions.MATCH_RESULT_SUBMIT, {
          target: 'match_result',
          matchId,
          result_source: 'player_report',
        })
      }
    } catch {
      trackLimitedPlayAction(LimitedPlayActions.MATCH_RESULT_SUBMIT, {
        target: 'match_result',
        success: false,
        matchId,
        result_source: 'player_report',
        failure_reason: 'network_error',
      })
      setMessage('Failed to report result')
      setMessageType('error')
      setTimeout(() => { setMessage(null); setMessageType(null) }, 3000)
    }
    setReportingMatchId(null)
  }

  const handleOverrideResult = async (matchId: string, game1: string, game2: string, game3: string | null) => {
    if (!draftShareId) return
    try {
      const res = await fetch(`/api/draft/${draftShareId}/match/${matchId}/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ game1, game2, game3 }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        trackLimitedPlayAction(LimitedPlayActions.MATCH_RESULT_SUBMIT, {
          target: 'match_result',
          success: false,
          matchId,
          result_source: 'host_override',
          failure_reason: data.error || 'http_error',
        })
        setMessage(data.error || 'Failed to override result')
        setMessageType('error')
        setTimeout(() => { setMessage(null); setMessageType(null) }, 3000)
      } else {
        trackLimitedPlayAction(LimitedPlayActions.MATCH_RESULT_SUBMIT, {
          target: 'match_result',
          matchId,
          result_source: 'host_override',
        })
      }
    } catch {
      trackLimitedPlayAction(LimitedPlayActions.MATCH_RESULT_SUBMIT, {
        target: 'match_result',
        success: false,
        matchId,
        result_source: 'host_override',
        failure_reason: 'network_error',
      })
      setMessage('Failed to override result')
      setMessageType('error')
      setTimeout(() => { setMessage(null); setMessageType(null) }, 3000)
    }
    setOverridingMatchId(null)
  }

  const handleBootPlayer = async (userId: string) => {
    if (!draftShareId) return
    if (!confirm('Are you sure you want to boot this player? Their active matches will be forfeited.')) return
    try {
      const res = await fetch(`/api/draft/${draftShareId}/boot/${userId}`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setMessage(data.error || 'Failed to boot player')
        setMessageType('error')
        setTimeout(() => { setMessage(null); setMessageType(null) }, 3000)
      }
    } catch {
      setMessage('Failed to boot player')
      setMessageType('error')
      setTimeout(() => { setMessage(null); setMessageType(null) }, 3000)
    }
  }

  const handleAssignBye = async (targetUserId: string) => {
    if (!draftShareId) return
    try {
      const res = await fetch(`/api/draft/${draftShareId}/assign-bye`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ targetUserId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setMessage(data.error || 'Failed to reassign bye')
        setMessageType('error')
        setTimeout(() => { setMessage(null); setMessageType(null) }, 3000)
      }
    } catch {
      setMessage('Failed to reassign bye')
      setMessageType('error')
      setTimeout(() => { setMessage(null); setMessageType(null) }, 3000)
    }
  }

  const handleStartMatches = async () => {
    if (!draftShareId) return
    try {
      const res = await fetch(`/api/draft/${draftShareId}/start-matches`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setMessage(data.error || 'Failed to start matches')
        setMessageType('error')
        setTimeout(() => { setMessage(null); setMessageType(null) }, 3000)
      }
    } catch {
      setMessage('Failed to start matches')
      setMessageType('error')
      setTimeout(() => { setMessage(null); setMessageType(null) }, 3000)
    }
  }

  const handleToggleView = async () => {
    if (showingPool) {
      setShowingPool(false)
    } else {
      if (poolImageUrl) {
        setShowingPool(true)
      } else {
        setLoadingPool(true)
        const url = await exportPoolImage()
        setLoadingPool(false)
        if (url) {
          trackLimitedPlayAction(LimitedPlayActions.GENERATE_POOL_IMAGE, {
            target: 'image',
            success: true,
            ...getDeckCounts(),
          })
          setPoolImageUrl(url)
          setShowingPool(true)
        } else {
          trackLimitedPlayAction(LimitedPlayActions.GENERATE_POOL_IMAGE, {
            target: 'image',
            success: false,
          })
        }
      }
    }
  }

  if (loading) {
    return (
      <div className="play-page">
        <div className="play-content">
          <div className="play-header">
            <div className="play-title-skeleton"></div>
            <div className="play-pool-type-skeleton"></div>
          </div>

          <div className="play-instructions">
            <div className="play-skeleton-heading"></div>
            <div className="play-skeleton-text"></div>

            <div className="play-steps">
              <div className="play-step">
                <div className="step-number-skeleton"></div>
                <div className="step-content">
                  <div className="play-skeleton-step-title"></div>
                  <div className="play-skeleton-step-text"></div>
                </div>
              </div>
              <div className="play-step">
                <div className="step-number-skeleton"></div>
                <div className="step-content">
                  <div className="play-skeleton-step-title"></div>
                  <div className="play-skeleton-step-text"></div>
                </div>
              </div>
              <div className="play-step">
                <div className="step-number-skeleton"></div>
                <div className="step-content">
                  <div className="play-skeleton-step-title"></div>
                  <div className="play-skeleton-step-text"></div>
                </div>
              </div>
            </div>
          </div>

          <div className="play-actions">
            <div className="play-button-skeleton"></div>
            <div className="play-button-skeleton"></div>
            <div className="play-button-skeleton"></div>
            <div className="play-button-skeleton"></div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="play-page">
        <div className="play-error">
          <h2>Error</h2>
          <p>{error}</p>
          <button className="play-button" onClick={() => router.back()}>Go Back</button>
        </div>
      </div>
    )
  }

  const packArtUrl = pool?.setCode ? getPackArtUrl(pool.setCode) : null
  const setConfig = pool?.setCode ? getSetConfig(pool.setCode) : null
  const isInfinitePool = deckBuilderState?.isInfinitePool === true
  const isOwner = user && pool?.owner?.id === user.id
  const canEditDeck = Boolean(isInfinitePool || isOwner)
  const poolTypeLabel = isInfinitePool
    ? 'Limited Deckbuilder'
    : pool?.poolType === 'draft'
      ? 'Draft Pool'
      : pool?.poolType === 'sealed_pod'
        ? 'Sealed Pod Pool'
        : 'Sealed Pool'

  // Get pool name from deckBuilderState first, then fall back to pool.name
  const getPoolName = () => {
    if (deckBuilderState?.poolName) return deckBuilderState.poolName
    if (pool?.name) return pool.name
    if (isInfinitePool) return `${setConfig?.setName || pool?.setCode} Limited Deckbuilder`
    return `${setConfig?.setName || pool?.setCode} Deck`
  }
  const poolName = getPoolName()

  const handleRenamePool = async (newName) => {
    if (!shareId) return
    if (newName && newName.length > 80) return
    try {
      const updatedState = { ...deckBuilderState, poolName: newName }

      await updatePool(shareId, { deckBuilderState: updatedState })
      setPool(prev => ({
        ...prev,
        deckBuilderState: updatedState
      }))
    } catch (err) {
      console.error('Failed to rename pool:', err)
      setMessage('Failed to rename pool')
      setMessageType('error')
      setTimeout(() => { setMessage(null); setMessageType(null) }, 3000)
    }
  }

  return (
    <div className="page-with-chat">
    <div className="page-content">
    <div className="play-page">
      {packArtUrl && (
        <div className="set-art-header" style={{
          backgroundImage: `url("${packArtUrl}")`,
        }}></div>
      )}

      <div className="play-content">
        {canEditDeck && (
          <button
            className="edit-deck-top"
            onClick={() => router.push(
              isInfinitePool
                ? `/deckbuilder/build?set=${encodeURIComponent(pool?.setCode || '')}&session=${encodeURIComponent(deckBuilderState?.sessionId || shareId || '')}&playShareId=${encodeURIComponent(shareId || '')}`
                : `/pool/${shareId}/deck`
            )}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Edit Deck
          </button>
        )}

        <div className="play-header">
          <EditableTitle
            value={poolName}
            onSave={handleRenamePool}
            isEditable={canEditDeck}
            placeholder="Untitled Deck"
            className="play-title"
          />
          {deckArchetypeName && <p className="play-deck-name">{deckArchetypeName}</p>}
          <p className="play-pool-type">{poolTypeLabel}</p>
          {/* The record badge ("No games yet" / W-L) is hidden while Swiss
              Practice is underway — your Swiss record lives in the panel above. */}
          {!(isCompetitive && matchmakingStatus !== 'complete') && (
            <div className="play-header-actions">
              <WldBadge
                wins={pool.wins ?? 0}
                losses={pool.losses ?? 0}
                draws={pool.draws ?? 0}
                matchIds={pool.wayfinderMatchIds ?? []}
              />
            </div>
          )}
        </div>

        {/* Login banner for logged-out users viewing anonymous (unowned) pools */}
        {!isInfinitePool && !user && !pool?.owner && (
          <div className="login-banner">
            <div className="login-banner-content">
              <div className="login-banner-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
              </div>
              <div className="login-banner-text">
                <h3>Save Your Deck</h3>
                <p>Login with Discord to permanently save this deck to your account. You'll be able to access it from any device and see it in your deck history.</p>
              </div>
              <a
                href={`/api/auth/signin/discord?return_to=${encodeURIComponent(`/pool/${shareId}/deck/play`)}`}
                className="login-banner-button"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                </svg>
                Login with Discord
              </a>
            </div>
          </div>
        )}

        {/* Logged-in competitive player without the Companion: strongly nudge the
            install above the Swiss panel — banner, then a lesser subhead, then the
            full install CTA. */}
        {isCompetitive && user && wayfinderSettled && showCompanionPitch && (
          <div className="swiss-companion-pitch">
            <div className="swiss-companion-pitch-alert" role="alert">
              <h2 className="swiss-companion-pitch-title">
                We strongly recommend Wayfinder Companion to make the Swiss
                experience smoother for Competitive Draft. Just takes a minute to
                set up.
              </h2>
              <p className="swiss-companion-pitch-sub">
                Then you&apos;ll get recordings and analysis of your Limited and
                Premier games as well!
              </p>
            </div>
            <PluginCTA required />
          </div>
        )}

        {/* Swiss Practice panel sits at the top — above the play/deck-complete
            CTA — taking the place of the normal pod status for competitive pods. */}
        {isCompetitive && user && (
          <MatchmakingPanel
            rounds={competitiveRounds}
            currentRound={competitiveCurrentRound}
            matchmakingStatus={matchmakingStatus}
            currentUserId={user.id}
            isHost={isCompetitiveHost}
            players={draftPlayers.map(p => ({
              id: (p as any).odId || '',
              username: p.username || 'Unknown',
              dropped: Boolean((p as any).dropped),
              poolShareId: (p as any).poolShareId || null,
              activeLeaderName: (p as any).activeLeaderName || null,
              baseName: (p as any).baseName || null,
              baseAspects: Array.isArray((p as any).baseAspects) ? (p as any).baseAspects : [],
              baseHp: typeof (p as any).baseHp === 'number' ? (p as any).baseHp : null,
              archetypeName: (p as any).archetypeName || null,
              poolCardCount: typeof (p as any).poolCardCount === 'number' ? (p as any).poolCardCount : null,
              isHost: Boolean((p as any).isHost),
            }))}
            wayfinderDetected={wayfinderDetected}
            wayfinderSettled={wayfinderSettled}
            hasCompanionBetaAccess={Boolean(user?.is_beta_tester || user?.is_admin)}
            onPracticeLaunch={handlePracticeLaunch}
            practiceLaunchPendingMatchId={practiceLaunch.pendingMatchId}
            practiceLaunchMessage={practiceLaunch.launchMessage}
            onReport={(matchId) => {
              trackLimitedPlayAction(LimitedPlayActions.MATCH_REPORT_OPEN, {
                target: 'match_result',
                matchId,
                result_source: 'player_report',
              })
              setReportingMatchId(matchId)
            }}
            onOverride={(matchId) => {
              trackLimitedPlayAction(LimitedPlayActions.MATCH_REPORT_OPEN, {
                target: 'match_result',
                matchId,
                result_source: 'host_override',
              })
              setOverridingMatchId(matchId)
            }}
            onBoot={handleBootPlayer}
            onAssignBye={handleAssignBye}
            onStartMatches={handleStartMatches}
          />
        )}

        {/* Skeleton while we don't yet know if this is a competitive (Swiss) pod —
            render the right thing ONCE rather than flashing the normal play box. */}
        {competitiveUndetermined ? (
          <div className="swiss-area-skeleton" aria-hidden="true">
            <div className="swiss-area-skeleton-bar" />
            <div className="swiss-area-skeleton-block" />
            <div className="swiss-area-skeleton-row">
              <div className="swiss-area-skeleton-pill" />
              <div className="swiss-area-skeleton-pill" />
            </div>
          </div>
        ) : /* While Swiss Practice is underway (matchmaking not yet 'complete'), the
            Swiss panel + Play button drive everything — so skip the verbose
            "Deck Complete!" guidance and just offer deck export. Once Swiss is
            over (matchmakingStatus 'complete') fall back to the normal Play
            instructions so the deck can still be played outside Swiss. */
        isCompetitive && matchmakingStatus !== 'complete' ? (
          <div className="swiss-deck-export">
            <span className="swiss-deck-export-label">Play manually</span>
            <div className="swiss-deck-export-actions">
            {!isInfinitePool && (
              <button className="swiss-deck-export-btn" onClick={copyDeckLink}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                Copy Link
              </button>
            )}
            <button className="swiss-deck-export-btn" onClick={copyToClipboard}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              Copy JSON
            </button>
            <button className="swiss-deck-export-btn" onClick={downloadJSON}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              Download
            </button>
            <button className="swiss-deck-export-btn" onClick={exportDeckImage} disabled={generatingImage}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
              {generatingImage ? 'Generating…' : 'Deck Image'}
            </button>
            </div>
            {message && (
              <span className={`swiss-deck-export-msg swiss-deck-export-msg--${messageType || 'info'}`}>{message}</span>
            )}
          </div>
        ) : (
          <PlayInstructions
            shareId={shareId}
            poolType={isSoloDraft ? 'sealed' : (pool?.poolType || 'sealed')}
            setCode={pool?.setCode}
            opponentName={firstOpponent?.username}
            hasBye={hasBye}
            isSoloDraft={isSoloDraft}
            onCopyLink={isInfinitePool ? undefined : copyDeckLink}
            onCopyJson={copyToClipboard}
            onDownload={downloadJSON}
            onDeckImage={exportDeckImage}
            generatingImage={generatingImage}
            message={message}
            messageType={messageType}
            showActions={true}
            isOwner={isInfinitePool ? true : (!pool?.owner || !!isOwner)}
            pluginRequired={!!(isCompetitive && isOwner)}
            ownerName={pool?.owner?.username || pool?.owner?.name || null}
            wayfinderDetected={wayfinderDetected}
            isLoggedIn={Boolean(user)}
            autoLobbyIntent={autoLobbyIntent}
            analyticsContext={getLimitedAnalyticsContext()}
          />
        )}

        {/* Practice Hand / Post to Discord / Draft actions — below the
            "Deck Complete" box, not above it. */}
        <div className="practice-hand-button-container">
          <Button variant="secondary" onClick={drawPracticeHand}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <g transform="rotate(-15 12 22)"><rect x="8" y="3" width="8" height="12" rx="1"></rect></g>
              <g transform="rotate(0 12 22)"><rect x="8" y="3" width="8" height="12" rx="1"></rect></g>
              <g transform="rotate(15 12 22)"><rect x="8" y="3" width="8" height="12" rx="1"></rect></g>
            </svg>
            Practice Hand
          </Button>
          {!isInfinitePool && isOwner && user && (
            <div className="post-to-discord-wrapper">
              <Button
                variant="secondary"
                onClick={postToDiscord}
                disabled={postingToDiscord || postedToDiscord}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
                {postedToDiscord ? 'Posted!' : postingToDiscord ? 'Posting...' : 'Post to Discord'}
              </Button>
              <span className="post-to-discord-help" data-tooltip="Share your deck to the Protect the Pod Discord for feedback and discussion. Makes your pool public.">i</span>
            </div>
          )}
          {shareId && (
            <Button variant="secondary" onClick={() => router.push(`/pool/${shareId}/deck/stats?tab=gamelog`)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19V5"></path>
                <path d="M4 19h16"></path>
                <rect x="7" y="11" width="3" height="5" rx="1"></rect>
                <rect x="12" y="8" width="3" height="8" rx="1"></rect>
                <rect x="17" y="6" width="3" height="10" rx="1"></rect>
              </svg>
              Stats
            </Button>
          )}
          {pool?.draftShareId && pool?.poolType === 'draft' && (
            <Button variant="secondary" onClick={() => router.push(`/draft/${pool.draftShareId}/log`)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
              Draft Log
            </Button>
          )}
          {pool?.draftShareId && pool?.poolType === 'draft' && isPatron && isOwner && (
            <DraftReportButton draftShareId={pool.draftShareId} variant="play" />
          )}
        </div>
        {discordJustPosted && (
          <div className="discord-post-toast">Posted to Discord!</div>
        )}

      </div>

      {deckImageModal && (
        <div className="deck-image-modal-overlay" onClick={() => {
          URL.revokeObjectURL(deckImageModal)
          if (poolImageUrl) URL.revokeObjectURL(poolImageUrl)
          setDeckImageModal(null)
          setPoolImageUrl(null)
          setShowingPool(false)
        }}>
          <div className="deck-image-modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              className="deck-image-modal-close"
              onClick={() => {
                URL.revokeObjectURL(deckImageModal)
                if (poolImageUrl) URL.revokeObjectURL(poolImageUrl)
                setDeckImageModal(null)
                setPoolImageUrl(null)
                setShowingPool(false)
              }}
            >
              ×
            </button>
            <img
              src={showingPool && poolImageUrl ? poolImageUrl : deckImageModal}
              alt={showingPool ? "Pool Export" : "Deck Export"}
              className="deck-image-modal-image"
            />
            <div className="deck-image-modal-actions">
              <button
                className="deck-image-modal-download"
                onClick={() => {
                  const a = document.createElement('a')
                  a.href = showingPool && poolImageUrl ? poolImageUrl : deckImageModal
                  const sanitizedName = poolName.replace(/[^a-z0-9]/gi, '_').toLowerCase()
                  const prefix = pool?.poolType === 'draft' ? 'ptp_draft' : 'ptp_sealed'
                  const suffix = showingPool ? '_pool' : '_deck'
                  a.download = `${prefix}_${sanitizedName}${suffix}.png`
                  document.body.appendChild(a)
                  a.click()
                  document.body.removeChild(a)
                }}
              >
                Download Image
              </button>
              {!isInfinitePool && (
                <button
                  className="deck-image-modal-toggle"
                  onClick={handleToggleView}
                  disabled={loadingPool}
                >
                  {loadingPool ? 'Loading...' : showingPool ? 'Show Deck' : 'Show Entire Pool'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <Modal
        isOpen={practiceHand !== null}
        onClose={() => setPracticeHand(null)}
        title="Practice Hand"
        showCloseButton
        className="modal--wide"
      >
        <Modal.Body>
          <div className="practice-hand-cards">
            {practiceHand?.cards.map((card, i) => (
              <CardWithPreview key={`${card.id}-${i}`} card={card} />
            ))}
          </div>
          {practiceHand && (
            <div className="practice-hand-stats">
              <p>Probability of drawing at least one turn 1 play: ({practiceHand.turnOnePlays}/{practiceHand.totalCards}) {(practiceHand.probAtLeastOne * 100).toFixed(2)}%</p>
              <p>Average number of turn one plays: {practiceHand.avgTurnOnePlays.toFixed(2)}</p>
            </div>
          )}
        </Modal.Body>
        <Modal.Actions className="practice-hand-actions">
          <Button variant="primary" onClick={() => drawPracticeHand(true)}>
            Draw Another
          </Button>
        </Modal.Actions>
      </Modal>

      {reportingMatchId && (() => {
        const allMatches = competitiveRounds.flatMap(r => r.matches)
        const match = allMatches.find(m => m.id === reportingMatchId)
        if (!match) return null
        return (
          <ResultReportModal
            matchId={reportingMatchId}
            player1Name={match.player1?.username || '???'}
            player2Name={match.player2?.username || '???'}
            onSubmit={handleReportResult}
            onClose={() => setReportingMatchId(null)}
          />
        )
      })()}

      {overridingMatchId && (() => {
        const allMatches = competitiveRounds.flatMap(r => r.matches)
        const match = allMatches.find(m => m.id === overridingMatchId)
        if (!match) return null
        return (
          <ResultReportModal
            matchId={overridingMatchId}
            player1Name={match.player1?.username || '???'}
            player2Name={match.player2?.username || '???'}
            isOverride
            onSubmit={handleOverrideResult}
            onClose={() => setOverridingMatchId(null)}
          />
        )
      })()}
    </div>
    </div>
    <ChatPanel shareId={pool?.draftShareId} defaultOpen={false} analyticsContext={getLimitedAnalyticsContext()} />
    </div>
  )
}

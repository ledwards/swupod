// @ts-nocheck
'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/src/contexts/AuthContext'
import Card from '@/src/components/Card'
import Button from '@/src/components/Button'
import UserAvatar from '@/src/components/UserAvatar'
import CardPreview from '@/src/components/DeckBuilder/CardPreview'
import { useCardPreview } from '@/src/hooks/useCardPreview'
import { useRotisserieSocket } from '@/src/hooks/useRotisserieSocket'
import { getSetConfig } from '@/src/utils/setConfigs/index'
import { fetchSets, isSetBeta, isSetPrerelease } from '@/src/utils/api'
import { getPackArtUrl } from '@/src/utils/packArt'
import { getSingleAspectColor } from '@/src/utils/aspectColors'
import SubscribeModal from '@/src/components/SubscribeModal'
import {
  buildTeaserModalCopy,
  getTeaserUserState,
  shouldPeekUnreleased,
} from '@/src/components/setSelectionTeaser'

interface SetData {
  code: string
  name: string
  imageUrl?: string
  beta?: boolean
  comingSoon?: boolean
  prereleaseDate?: string
  releaseDate?: string
}

// Normal (base treatment) card counts per set
const SET_CARD_COUNTS: Record<string, number> = {
  'SOR': 244,
  'SHD': 254,
  'TWI': 261,
  'JTL': 266,
  'LOF': 268,
  'SEC': 268,
  'LAW': 124,
}

const SET_ORDER: Record<string, number> = {
  'SOR': 1, 'SHD': 2, 'TWI': 3, 'JTL': 4, 'LOF': 5, 'SEC': 6, 'LAW': 7,
}

const sortSetsChronologically = (sets: SetData[]): SetData[] => {
  return [...sets].sort((a, b) =>
    (SET_ORDER[a.code] || 999) - (SET_ORDER[b.code] || 999)
  )
}

// Get set color from config
function getSetColor(setCode: string): string {
  const config = getSetConfig(setCode)
  return config?.color || '#ffffff'
}
import './page.css'
import '@/app/draft/draft.css'
import '@/src/components/SealedPod.css'
import '@/src/components/HostControls.css'
import '@/src/components/DeckBuilder/ArenaView.css'

interface CardData {
  id: string
  instanceId: string
  name: string
  type: string
  cost?: number
  aspects?: string[]
  arenas?: string[]
  frontArt?: string
  set?: string
  number?: string
  rarity?: string
  imageUrl?: string
  subtitle?: string
}

// Type filter icons (line art)
const LeaderIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="7" r="4" />
    <path d="M5.5 21a8.38 8.38 0 0 1 13 0" />
  </svg>
)

const GroundUnitIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="7" r="3" />
    <circle cx="17" cy="7" r="3" />
    <path d="M3 21a6 6 0 0 1 12 0" />
    <path d="M15 21a6 6 0 0 1 6-6" />
  </svg>
)

const SpaceUnitIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
    <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
    <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
    <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
  </svg>
)

const EventIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
)

const UpgradeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 19V5" />
    <path d="M5 12l7-7 7 7" />
  </svg>
)

const BaseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 21h18" />
    <path d="M5 21V7l7-4 7 4v14" />
    <path d="M9 21v-6h6v6" />
  </svg>
)

const EyeIcon = ({ open }: { open: boolean }) => open ? (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
) : (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
)

// Sort icons
const NumberIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 9h16" />
    <path d="M4 15h16" />
    <path d="M8 4l-2 16" />
    <path d="M18 4l-2 16" />
  </svg>
)

const CostIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 21 7 21 17 12 22 3 17 3 7 12 2" />
  </svg>
)

const AspectIconSort = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="12" r="5" />
    <circle cx="16" cy="12" r="5" />
    <circle cx="12" cy="7" r="5" />
  </svg>
)

const RarityIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
)

const TypeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" />
  </svg>
)

const ClearIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

interface Player {
  id: string
  name: string
  seat: number
  avatarUrl?: string
}

interface PickedCard {
  cardInstanceId: string
  playerId: string
  pickNumber: number
}

interface RotisserieData {
  setCodes: string[]
  maxPlayers: number
  pickTimerSeconds: number
  timerEnabled?: boolean
  draftMode?: 'fixed' | 'exhausted'
  picksPerPlayer?: number
  cardPool: CardData[]
  leaders: CardData[]
  bases: CardData[]
  pickedCards: PickedCard[]
  currentPickerIndex: number
  pickDirection: number
  pickNumber: number
  totalPicks: number
  status: 'waiting' | 'active' | 'completed'
  players: Player[]
  lastPickTimestamp?: number
}

const LinkIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
  </svg>
)

const RobotIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="10" rx="2"></rect>
    <circle cx="12" cy="5" r="2"></circle>
    <path d="M12 7v4"></path>
    <circle cx="8" cy="16" r="1" fill="currentColor"></circle>
    <circle cx="16" cy="16" r="1" fill="currentColor"></circle>
  </svg>
)

function getUpcomingPicks(
  currentPickerIndex: number,
  pickDirection: number,
  players: Player[],
  count: number
): Player[] {
  const picks: Player[] = []
  let idx = currentPickerIndex
  let dir = pickDirection
  for (let i = 0; i < count; i++) {
    picks.push(players[idx])
    const next = idx + dir
    if (next >= players.length) {
      dir = -1
    } else if (next < 0) {
      dir = 1
    } else {
      idx = next
    }
  }
  return picks
}

// Aspect icon component (matches ArenaPoolSection)
function AspectIcon({ aspect }: { aspect: string }) {
  return (
    <img
      src={`/icons/${aspect.toLowerCase()}.png`}
      alt={aspect}
    />
  )
}

// Primary aspects (have their own groups with combos)
const PRIMARY_ASPECTS = ['Vigilance', 'Command', 'Aggression', 'Cunning']
// Secondary aspects
const SECONDARY_ASPECTS = ['Villainy', 'Heroism']
// Canonical aspect order
const ASPECT_ORDER = ['Vigilance', 'Command', 'Aggression', 'Cunning', 'Villainy', 'Heroism']

function sortAspects(aspects: string[]): string[] {
  return [...aspects].sort((a, b) => {
    const ai = ASPECT_ORDER.indexOf(a)
    const bi = ASPECT_ORDER.indexOf(b)
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })
}

function getAspectComboKey(card: CardData): string {
  const aspects = card.aspects || []
  if (aspects.length === 0) return 'neutral'
  return sortAspects(aspects).join('+')
}

function isMultiPrimaryCombo(comboKey: string): boolean {
  const aspects = comboKey.split('+')
  const uniquePrimaries = new Set(aspects.filter(a => PRIMARY_ASPECTS.includes(a)))
  return uniquePrimaries.size >= 2
}

function getStandardCombosForPrimary(primary: string): string[] {
  const combos = [
    primary,
    `${primary}+${primary}`,
  ]
  SECONDARY_ASPECTS.forEach(secondary => {
    combos.push(sortAspects([primary, secondary]).join('+'))
  })
  return combos
}

export default function RotisseriePlayPage() {
  const params = useParams()
  const router = useRouter()
  const shareId = params.shareId as string
  const { user, isPatron } = useAuth()
  const {
    hoveredCardPreview,
    handleCardMouseEnter,
    handleCardMouseLeave,
    handleCardTouchStart,
    handleCardTouchEnd,
    dismissPreview,
  } = useCardPreview()

  const {
    data,
    loading,
    error,
    deleted,
    connected,
    refresh: refreshData,
  } = useRotisserieSocket(shareId)
  const [filter, setFilter] = useState('')
  const [typeFilters, setTypeFilters] = useState<Record<string, boolean>>({
    leaders: true,
    groundUnits: true,
    spaceUnits: true,
    events: true,
    upgrades: true,
    bases: false,
  })
  const [sortOption, setSortOption] = useState<'number' | 'cost' | 'aspect' | 'rarity' | 'type'>('number')
  const [activeFilters, setActiveFilters] = useState<Record<string, boolean>>({})
  const [setFilters, setSetFilters] = useState<Record<string, boolean>>({})
  const [picking, setPicking] = useState(false)
  const [optimisticPickId, setOptimisticPickId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [timerRemaining, setTimerRemaining] = useState<number | null>(null)
  const [tooltipPlayer, setTooltipPlayer] = useState<{ player: Player, x: number, y: number } | null>(null)
  const tooltipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [availableSets, setAvailableSets] = useState<SetData[]>([])
  const [updatingSets, setUpdatingSets] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const [showMyPicksModal, setShowMyPicksModal] = useState(false)
  const [picksInputValue, setPicksInputValue] = useState<string>('')
  const [pickNotification, setPickNotification] = useState<{
    playerName: string
    cardName: string
    subtitle?: string
    isLeader: boolean
    aspects?: string[]
  } | null>(null)
  const lastPickCountRef = useRef<number>(0)

  const hasBetaAccess = user?.is_beta_tester || user?.is_admin

  // Three-state user model for the "Coming Soon" teaser. Note: even when the
  // user is the host of this draft, a non-sub host cannot select an
  // unreleased set — clicking the teaser opens SubscribeModal instead of
  // toggling the set on. This is intentional: the host has set-selection
  // power but the set itself is gated.
  const teaserState = getTeaserUserState(isPatron, user?.is_beta_tester, user?.is_admin)
  const peekUnreleased = shouldPeekUnreleased(teaserState)

  // SubscribeModal state for teaser clicks in the inline picker
  const [teaserModalOpen, setTeaserModalOpen] = useState(false)
  const [teaserModalSet, setTeaserModalSet] = useState<SetData | null>(null)

  // Track scroll position for sticky button visibility
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 100)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Clear optimistic pick when server state updates
  useEffect(() => {
    if (optimisticPickId && data?.pickedCards?.some(p => p.cardInstanceId === optimisticPickId)) {
      setOptimisticPickId(null)
    }
  }, [data?.pickedCards, optimisticPickId])

  // Detect opponent picks and show notification
  useEffect(() => {
    if (!data?.pickedCards || !user) return

    const currentPickCount = data.pickedCards.length
    if (currentPickCount > lastPickCountRef.current && lastPickCountRef.current > 0) {
      // New pick detected
      const latestPick = data.pickedCards[data.pickedCards.length - 1]

      // Only show notification for opponent picks
      if (latestPick.playerId !== user.id) {
        const picker = data.players?.find(p => p.id === latestPick.playerId)
        const card = (data.cardPool || []).find(c => c.instanceId === latestPick.cardInstanceId) ||
          (data.leaders || []).find(c => c.instanceId === latestPick.cardInstanceId) ||
          (data.bases || []).find(c => c.instanceId === latestPick.cardInstanceId)

        if (picker && card) {
          const isLeader = card.type === 'Leader'
          // Clear any existing notification first, then show new one
          setPickNotification(null)
          setTimeout(() => {
            setPickNotification({
              playerName: picker.name,
              cardName: card.name,
              subtitle: card.subtitle,
              isLeader,
              aspects: card.aspects
            })
            // Auto-dismiss after 2 seconds
            setTimeout(() => setPickNotification(null), 2000)
          }, 50)
        }
      }
    }
    lastPickCountRef.current = currentPickCount
  }, [data?.pickedCards, data?.players, data?.cardPool, data?.leaders, data?.bases, user])

  // Sync picks input with server data
  useEffect(() => {
    if (data?.picksPerPlayer !== undefined) {
      setPicksInputValue(String(data.picksPerPlayer))
    }
  }, [data?.picksPerPlayer])

  // Fetch available sets
  useEffect(() => {
    if (teaserState === 'loading') return
    const loadSets = async () => {
      try {
        const setsData = await fetchSets({ includeBeta: hasBetaAccess, peekUnreleased })
        setAvailableSets(sortSetsChronologically(setsData))
      } catch (err) {
        console.error('Failed to load sets:', err)
      }
    }
    loadSets()
  }, [hasBetaAccess, peekUnreleased, teaserState])

  // Redirect if deleted (host cancelled or draft was deleted)
  useEffect(() => {
    if (deleted) {
      router.push('/formats')
    }
  }, [deleted, router])

  // Trigger bot picks when it's a bot's turn
  useEffect(() => {
    if (!data || data.status !== 'active') return

    const currentPicker = data.players[data.currentPickerIndex]
    if (!currentPicker || !currentPicker.id.startsWith('bot_')) return

    // Trigger bot pick
    const triggerBot = async () => {
      try {
        await fetch(`/api/formats/rotisserie/${shareId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ action: 'bot-pick' })
        })
      } catch (err) {
        console.error('Failed to trigger bot pick:', err)
      }
    }

    // Small delay so UI can update
    const timeout = setTimeout(triggerBot, 500)
    return () => clearTimeout(timeout)
  }, [data?.status, data?.currentPickerIndex, data?.players, shareId])

  // Timer countdown effect
  useEffect(() => {
    if (!data?.timerEnabled || data.status !== 'active') {
      setTimerRemaining(null)
      return
    }

    const updateTimer = () => {
      const lastPick = data.lastPickTimestamp || Date.now()
      const elapsed = Math.floor((Date.now() - lastPick) / 1000)
      const remaining = Math.max(0, (data.pickTimerSeconds || 60) - elapsed)
      setTimerRemaining(remaining)
    }

    updateTimer()
    const timerInterval = setInterval(updateTimer, 1000)
    return () => clearInterval(timerInterval)
  }, [data?.timerEnabled, data?.status, data?.lastPickTimestamp, data?.pickTimerSeconds])

  const handleAction = async (action: string, extraBody?: Record<string, unknown>) => {
    try {
      setPicking(true)
      setActionError(null)

      // Optimistic UI: immediately show card as picked
      if (action === 'pick' && extraBody?.cardInstanceId) {
        setOptimisticPickId(extraBody.cardInstanceId as string)
      }

      const response = await fetch(`/api/formats/rotisserie/${shareId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action, ...extraBody })
      })

      if (!response.ok) {
        const result = await response.json()
        // Clear optimistic state on error
        setOptimisticPickId(null)
        throw new Error(result.error || 'Action failed')
      }

      // Handle cancel by redirecting
      if (action === 'cancel') {
        router.push('/formats')
        return
      }

      // State update will come via socket broadcast, which will clear optimistic state
    } catch (err) {
      setActionError(err.message)
    } finally {
      setPicking(false)
    }
  }

  const handleCopyShareUrl = async () => {
    const url = `${window.location.origin}/formats/rotisserie/${shareId}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleToggleSet = async (setCode: string) => {
    if (!data || updatingSets) return

    const currentSets = data.setCodes || []
    const newSets = currentSets.includes(setCode)
      ? currentSets.filter(s => s !== setCode)
      : [...currentSets, setCode]

    try {
      setUpdatingSets(true)
      const response = await fetch(`/api/formats/rotisserie/${shareId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'update-sets', setCodes: newSets })
      })

      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.error || 'Failed to update sets')
      }

      // State update will come via socket broadcast
    } catch (err) {
      console.error('Failed to toggle set:', err)
    } finally {
      setUpdatingSets(false)
    }
  }

  const isCardPicked = (instanceId: string) => {
    // Check optimistic pick first for immediate feedback
    if (optimisticPickId === instanceId) return true
    return (data?.pickedCards || []).some(p => p.cardInstanceId === instanceId)
  }

  const getMyPicks = () => {
    if (!data || !user) return []
    return (data.pickedCards || [])
      .filter(p => p.playerId === user.id)
      .map(p => {
        return (data.cardPool || []).find(c => c.instanceId === p.cardInstanceId) ||
          (data.leaders || []).find(c => c.instanceId === p.cardInstanceId) ||
          (data.bases || []).find(c => c.instanceId === p.cardInstanceId)
      })
      .filter(Boolean)
  }

  const getPlayerPicks = (playerId: string) => {
    if (!data) return []
    return (data.pickedCards || [])
      .filter(p => p.playerId === playerId)
      .map(p => {
        return (data.cardPool || []).find(c => c.instanceId === p.cardInstanceId) ||
          (data.leaders || []).find(c => c.instanceId === p.cardInstanceId) ||
          (data.bases || []).find(c => c.instanceId === p.cardInstanceId)
      })
      .filter(Boolean)
  }

  // Get all unique aspect combos present in all cards
  const presentCombos = useMemo(() => {
    if (!data) return new Set<string>()
    const allCards = [...(data.cardPool || []), ...(data.leaders || []), ...(data.bases || [])]
    const combos = new Set<string>()
    allCards.forEach(card => {
      combos.add(getAspectComboKey(card))
    })
    return combos
  }, [data])

  // Initialize filters when data loads
  useEffect(() => {
    if (presentCombos.size > 0 && Object.keys(activeFilters).length === 0) {
      const defaults: Record<string, boolean> = {}
      presentCombos.forEach(combo => {
        defaults[combo] = true
      })
      setActiveFilters(defaults)
    }
  }, [presentCombos])

  // Initialize set filters when data loads
  useEffect(() => {
    if (data?.setCodes && data.setCodes.length > 0 && Object.keys(setFilters).length === 0) {
      const defaults: Record<string, boolean> = {}
      data.setCodes.forEach(setCode => {
        defaults[setCode] = true
      })
      setSetFilters(defaults)
    }
  }, [data?.setCodes])

  // Rarity order for sorting
  const RARITY_ORDER: Record<string, number> = {
    'Legendary': 1, 'Rare': 2, 'Uncommon': 3, 'Common': 4, 'Special': 5,
  }

  // Aspect order for sorting
  const ASPECT_SORT_ORDER: Record<string, number> = {
    'Vigilance': 1, 'Command': 2, 'Aggression': 3, 'Cunning': 4, 'Villainy': 5, 'Heroism': 6,
  }

  const getFilteredCards = () => {
    if (!data) return []

    let cards: CardData[] = []

    // Gather cards based on active type filters
    if (typeFilters.leaders) {
      cards = [...cards, ...(data.leaders || [])]
    }
    if (typeFilters.groundUnits) {
      cards = [...cards, ...(data.cardPool || []).filter(c => c.type === 'Unit' && c.arenas?.includes('Ground'))]
    }
    if (typeFilters.spaceUnits) {
      cards = [...cards, ...(data.cardPool || []).filter(c => c.type === 'Unit' && c.arenas?.includes('Space'))]
    }
    if (typeFilters.events) {
      cards = [...cards, ...(data.cardPool || []).filter(c => c.type === 'Event')]
    }
    if (typeFilters.upgrades) {
      cards = [...cards, ...(data.cardPool || []).filter(c => c.type === 'Upgrade')]
    }
    if (typeFilters.bases) {
      cards = [...cards, ...(data.bases || [])]
    }

    // Apply text filter
    if (filter) {
      const lowerFilter = filter.toLowerCase()
      cards = cards.filter(c =>
        c.name.toLowerCase().includes(lowerFilter)
      )
    }

    // Apply aspect filters
    const hasActiveFilter = Object.values(activeFilters).some(v => v)
    if (hasActiveFilter) {
      cards = cards.filter(card => {
        const comboKey = getAspectComboKey(card)
        return activeFilters[comboKey]
      })
    }

    // Apply set filters (only if there are 2+ sets)
    const setCodes = data.setCodes || []
    if (setCodes.length >= 2) {
      const hasActiveSetFilter = Object.values(setFilters).some(v => v)
      if (hasActiveSetFilter) {
        cards = cards.filter(card => setFilters[card.set || ''])
      }
    }

    // Sort based on selected option
    cards.sort((a, b) => {
      let primary = 0

      switch (sortOption) {
        case 'number':
          // Sort by set order, then by card number
          const setOrderA = SET_ORDER[a.set || ''] || 999
          const setOrderB = SET_ORDER[b.set || ''] || 999
          if (setOrderA !== setOrderB) return setOrderA - setOrderB
          break
        case 'cost':
          primary = (a.cost ?? 999) - (b.cost ?? 999)
          if (primary !== 0) return primary
          break
        case 'aspect':
          const aspectA = (a.aspects || [])[0] || 'zzz'
          const aspectB = (b.aspects || [])[0] || 'zzz'
          const aspectOrderA = ASPECT_SORT_ORDER[aspectA] || 99
          const aspectOrderB = ASPECT_SORT_ORDER[aspectB] || 99
          primary = aspectOrderA - aspectOrderB
          if (primary !== 0) return primary
          break
        case 'rarity':
          const rarityA = a.rarity || 'Common'
          const rarityB = b.rarity || 'Common'
          primary = (RARITY_ORDER[rarityA] || 99) - (RARITY_ORDER[rarityB] || 99)
          if (primary !== 0) return primary
          break
        case 'type':
          const typeOrder: Record<string, number> = { 'Leader': 1, 'Base': 2, 'Unit': 3, 'Event': 4, 'Upgrade': 5 }
          primary = (typeOrder[a.type] || 99) - (typeOrder[b.type] || 99)
          if (primary !== 0) return primary
          break
      }

      // Secondary sort by card number
      const numA = parseInt(a.number || '999', 10)
      const numB = parseInt(b.number || '999', 10)
      return numA - numB
    })

    return cards
  }

  // Get filtered and sorted myPicks for the modal
  const getFilteredMyPicks = () => {
    const picks = getMyPicks()

    // Apply type filters
    let filtered = picks.filter(card => {
      if (card.type === 'Leader') return typeFilters.leaders
      if (card.type === 'Base') return typeFilters.bases
      if (card.type === 'Unit') {
        if (card.arenas?.includes('Ground')) return typeFilters.groundUnits
        if (card.arenas?.includes('Space')) return typeFilters.spaceUnits
        return typeFilters.groundUnits || typeFilters.spaceUnits
      }
      if (card.type === 'Event') return typeFilters.events
      if (card.type === 'Upgrade') return typeFilters.upgrades
      return true
    })

    // Apply sort
    const sorted = [...filtered]
    if (sortOption === 'cost') {
      sorted.sort((a, b) => (a.cost || 0) - (b.cost || 0))
    } else if (sortOption === 'aspect') {
      sorted.sort((a, b) => {
        const aKey = (a.aspects || []).sort().join('+') || 'zzz'
        const bKey = (b.aspects || []).sort().join('+') || 'zzz'
        return aKey.localeCompare(bKey)
      })
    } else if (sortOption === 'rarity') {
      const rarityOrder: Record<string, number> = { 'Common': 1, 'Uncommon': 2, 'Rare': 3, 'Legendary': 4, 'Special': 5 }
      sorted.sort((a, b) => (rarityOrder[a.rarity || ''] || 0) - (rarityOrder[b.rarity || ''] || 0))
    } else if (sortOption === 'number') {
      sorted.sort((a, b) => {
        const aNum = parseInt(a.number || '0', 10)
        const bNum = parseInt(b.number || '0', 10)
        return aNum - bNum
      })
    }

    return sorted
  }

  const toggleTypeFilter = (type: string) => {
    setTypeFilters(prev => ({
      ...prev,
      [type]: !prev[type]
    }))
  }

  const allTypesActive = Object.values(typeFilters).every(v => v)
  const anyTypesActive = Object.values(typeFilters).some(v => v)

  const toggleAllTypes = () => {
    const newValue = !anyTypesActive
    setTypeFilters({
      leaders: newValue,
      groundUnits: newValue,
      spaceUnits: newValue,
      events: newValue,
      upgrades: newValue,
      bases: newValue,
    })
  }

  // Aspect color helper for tooltips
  const ASPECT_COLORS: Record<string, string> = {
    'Vigilance': '#3b82f6',
    'Command': '#22c55e',
    'Aggression': '#ef4444',
    'Cunning': '#eab308',
    'Villainy': '#a855f7',
    'Heroism': '#f5f5f5',
  }

  const getCardColor = (card: CardData): string => {
    const aspects = card.aspects || []
    if (aspects.length === 0) return 'rgba(255, 255, 255, 0.85)'
    return ASPECT_COLORS[aspects[0]] || 'rgba(255, 255, 255, 0.85)'
  }

  const toggleFilter = useCallback((key: string) => {
    setActiveFilters(prev => ({
      ...prev,
      [key]: !prev[key]
    }))
  }, [])

  // Check if ANY filter is active
  const anyFilterActive = useMemo(() => {
    return [...presentCombos].some(k => activeFilters[k])
  }, [activeFilters, presentCombos])

  // Toggle all filters on/off
  const toggleAllFilters = useCallback(() => {
    const showAll = !anyFilterActive
    setActiveFilters(prev => {
      const newState = { ...prev }
      presentCombos.forEach(k => {
        newState[k] = showAll
      })
      return newState
    })
  }, [anyFilterActive, presentCombos])

  // Toggle all combos for a primary aspect
  const togglePrimaryAspect = useCallback((primary: string) => {
    setActiveFilters(prev => {
      const combosForPrimary = getStandardCombosForPrimary(primary)
      const anyActive = combosForPrimary.some(k => presentCombos.has(k) && prev[k])
      const newState = { ...prev }
      combosForPrimary.forEach(k => {
        if (presentCombos.has(k)) {
          newState[k] = !anyActive
        }
      })
      return newState
    })
  }, [presentCombos])

  // Toggle secondary aspect
  const toggleSecondaryAspect = useCallback((secondary: string) => {
    setActiveFilters(prev => {
      const combosWithSecondary = [
        secondary,
        ...PRIMARY_ASPECTS.map(p => sortAspects([p, secondary]).join('+'))
      ]
      const anyActive = combosWithSecondary.some(k => presentCombos.has(k) && prev[k])
      const newState = { ...prev }
      combosWithSecondary.forEach(k => {
        if (presentCombos.has(k)) {
          newState[k] = !anyActive
        }
      })
      return newState
    })
  }, [presentCombos])

  const isPrimaryAspectActive = useCallback((primary: string) => {
    const combosForPrimary = getStandardCombosForPrimary(primary)
    return combosForPrimary.some(k => presentCombos.has(k) && activeFilters[k])
  }, [activeFilters, presentCombos])

  const isSecondaryAspectActive = useCallback((secondary: string) => {
    const combosWithSecondary = [
      secondary,
      ...PRIMARY_ASPECTS.map(p => sortAspects([p, secondary]).join('+'))
    ]
    return combosWithSecondary.some(k => presentCombos.has(k) && activeFilters[k])
  }, [activeFilters, presentCombos])

  // Get all multi-primary combo keys
  const allMultiPrimaryCombos = useMemo(() => {
    return [...presentCombos].filter(isMultiPrimaryCombo).sort()
  }, [presentCombos])

  const isAnyMultiPrimaryActive = useMemo(() => {
    return allMultiPrimaryCombos.some(k => activeFilters[k])
  }, [allMultiPrimaryCombos, activeFilters])

  const toggleAllMultiPrimary = useCallback(() => {
    setActiveFilters(prev => {
      const newState = { ...prev }
      const turnOn = !isAnyMultiPrimaryActive
      allMultiPrimaryCombos.forEach(k => {
        newState[k] = turnOn
      })
      return newState
    })
  }, [allMultiPrimaryCombos, isAnyMultiPrimaryActive])

  // Player tooltip handlers
  const handlePlayerMouseEnter = (player: Player, e: React.MouseEvent) => {
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current)
    }
    const rect = e.currentTarget.getBoundingClientRect()
    tooltipTimeoutRef.current = setTimeout(() => {
      setTooltipPlayer({ player, x: rect.right + 10, y: rect.top })
    }, 300)
  }

  const handlePlayerMouseLeave = () => {
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current)
      tooltipTimeoutRef.current = null
    }
    setTooltipPlayer(null)
  }

  // Render combo filter button
  const renderComboFilter = (comboKey: string) => {
    const aspects = comboKey === 'neutral' ? [] : comboKey.split('+')
    const isActive = activeFilters[comboKey]
    const isPresent = presentCombos.has(comboKey)

    if (!isPresent) return null

    return (
      <button
        key={comboKey}
        className={`arena-filter-btn arena-aspect-filter ${isActive ? 'active' : 'inactive'}`}
        onClick={() => toggleFilter(comboKey)}
        title={comboKey}
      >
        {aspects.map((aspect, i) => (
          <AspectIcon key={i} aspect={aspect} />
        ))}
      </button>
    )
  }

  if (loading) {
    return (
      <div className="rotisserie-play-page">
        <div className="loading">Loading draft...</div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="rotisserie-play-page">
        <div className="error">{error || 'Draft not found'}</div>
      </div>
    )
  }

  const players = data.players || []
  const currentPicker = players[data.currentPickerIndex]
  const isMyTurn = user && currentPicker?.id === user.id
  const hasJoined = user && players.some(p => p.id === user.id)
  const isHost = user && players[0]?.id === user.id

  const upcomingCount = Math.min(players.length * 2 + 1, 10)
  const upcomingPicks = data.status === 'active'
    ? getUpcomingPicks(data.currentPickerIndex, data.pickDirection, players, upcomingCount)
    : []
  const turnsAway = upcomingPicks.length > 1 && user
    ? upcomingPicks.findIndex((p, i) => i > 0 && p.id === user.id)
    : -1

  // Calculate total cards - use SET_CARD_COUNTS in lobby, actual pool data when active
  const totalCards = data.status === 'waiting'
    ? (data.setCodes || []).reduce((sum, setCode) => sum + (SET_CARD_COUNTS[setCode] || 0), 0)
    : (data.cardPool || []).length + (data.leaders || []).length + (data.bases || []).length
  const cardsPerPlayer = data.picksPerPlayer || (players.length > 0 ? Math.floor(totalCards / players.length) : 42)
  const totalPicks = cardsPerPlayer * players.length
  const percentDrafted = totalCards > 0 ? Math.round((totalPicks / totalCards) * 100) : 0

  // Lobby view when waiting
  if (data.status === 'waiting') {
    return (
      <div className="sealed-pod rotisserie-play-page">
        <div className="sealed-pod-content">
          <div className="draft-header">
            <div className="draft-header-center">
              <h1>Rotisserie Draft</h1>
            </div>
          </div>

          <div className="rotisserie-lobby">
          {/* Rules at top */}
          <div className="rules-section">
            <h3>How Rotisserie Works</h3>
            <p>
              All cards from the selected sets are laid out face-up.
              Players take turns picking one card at a time in
              snake draft order (1&rarr;2&rarr;3&rarr;3&rarr;2&rarr;1&rarr;...).
              Each player picks {cardsPerPlayer} cards, then builds a 30-card
              deck from their picks.
            </p>
            <p className="rules-link">
              <a href="https://starwarsunlimited.com/articles/behind-unlimited-a-rotisserie-draft" target="_blank" rel="noopener noreferrer">
                Read more on the official blog &rarr;
              </a>
            </p>
          </div>

          {!hasJoined && user && (
            <div className="join-section">
              <Button variant="primary" onClick={() => handleAction('join')}>
                Join Draft
              </Button>
            </div>
          )}

          {/* Set Selection */}
          <div className="sets-selection-section">
            <h3>Select Sets {!isHost && <span className="host-only-note">(host only)</span>}</h3>
            <div className="sets-grid">
              {availableSets.map((set) => {
                // "Coming Soon" teaser variant — opens SubscribeModal on
                // click regardless of host status. A non-sub host can't pick
                // an unreleased set without subscribing first.
                if (set.comingSoon) {
                  const packArtUrl = set.imageUrl || getPackArtUrl(set.code)
                  const setColor = getSetColor(set.code)
                  return (
                    <div
                      key={set.code}
                      className="set-card set-card--coming-soon"
                      onClick={() => {
                        setTeaserModalSet(set)
                        setTeaserModalOpen(true)
                      }}
                      style={{ '--set-color': setColor } as React.CSSProperties}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          setTeaserModalSet(set)
                          setTeaserModalOpen(true)
                        }
                      }}
                      aria-label={`${set.name} — Coming Soon. Subscribe for early access.`}
                    >
                      <div className="coming-soon-badge">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                        <span>Soon</span>
                      </div>
                      <div className="set-image-container">
                        <img
                          src={packArtUrl}
                          alt={`${set.name} booster pack`}
                          className="set-image"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement
                            target.style.display = 'none'
                          }}
                        />
                      </div>
                      <div className="set-info">
                        <h4>{set.code}</h4>
                        <span className="set-card-count">Soon</span>
                      </div>
                    </div>
                  )
                }

                const isSelected = (data.setCodes || []).includes(set.code)
                const packArtUrl = set.imageUrl || getPackArtUrl(set.code)
                const setColor = getSetColor(set.code)
                return (
                  <div
                    key={set.code}
                    className={`set-card ${isSelected ? 'selected' : 'unselected'} ${!isHost ? 'disabled' : ''}`}
                    onClick={() => isHost && handleToggleSet(set.code)}
                    style={{ '--set-color': setColor } as React.CSSProperties}
                  >
                    {isSetBeta(set) && <div className="beta-badge">Beta</div>}
                    {isSetPrerelease(set) && <div className="beta-badge">Pre-Release</div>}
                    <div className="set-image-container">
                      <img
                        src={packArtUrl}
                        alt={`${set.name} booster pack`}
                        className="set-image"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement
                          target.style.display = 'none'
                        }}
                      />
                    </div>
                    <div className="set-info">
                      <h4>{set.code}</h4>
                      <span className="set-card-count">{SET_CARD_COUNTS[set.code] || '?'}</span>
                    </div>
                  </div>
                )
              })}
            </div>
            {(data.setCodes || []).length === 0 && (
              <p className="no-sets-warning">Select at least one set to start the draft</p>
            )}
          </div>
          <SubscribeModal
            isOpen={teaserModalOpen}
            onClose={() => setTeaserModalOpen(false)}
            {...buildTeaserModalCopy(teaserState, teaserModalSet?.name ?? '')}
            setCode={teaserModalSet?.code}
            surface="setPreview"
          />

          <div className="lobby-columns">
            <div className="lobby-left">
              <div className="players-section">
                <h3>
                  Players ({players.length}/{data.maxPlayers})
                  <span className="randomize-note">*order will be randomized</span>
                </h3>
                <div className="players-list">
                  {players.map((player) => {
                    const isBot = player.id.startsWith('bot_')
                    return (
                      <div key={player.id} className="player-item">
                        <UserAvatar
                          src={player.avatarUrl}
                          alt={player.name}
                          fallback={isBot ? '🤖' : player.name.charAt(0).toUpperCase()}
                          className="player-avatar"
                          size={28}
                        />
                        <span className="player-name">
                          {player.name}
                          {player.id === user?.id && ' (You)'}
                        </span>
                      </div>
                    )
                  })}
                </div>

                <div className="buttons-row">
                  <button className="copy-link-btn" onClick={handleCopyShareUrl}>
                    <LinkIcon /> {copied ? 'Copied!' : 'Copy Shareable Link'}
                  </button>
                  {isHost && players.length < data.maxPlayers && (
                    <button className="add-bot-btn" onClick={() => handleAction('add-bot')} disabled={picking}>
                      <RobotIcon /> Add Bot
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="lobby-right">
              <div className="draft-info-section">
                <h3>Draft Settings {!isHost && <span className="host-only-note">(host only)</span>}</h3>
                <div className="draft-info-grid">
                  {isHost ? (
                    <div className="draft-info-item">
                      <span className="draft-info-label">Max Players</span>
                      <input
                        type="text"
                        value={data.maxPlayers || ''}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9]/g, '')
                          const value = val === '' ? 0 : parseInt(val, 10)
                          if (value === 0 || (value >= 2 && value <= 16 && value >= players.length)) {
                            handleAction('update-settings', { maxPlayers: value || 2 })
                          }
                        }}
                        className="draft-info-input"
                      />
                    </div>
                  ) : (
                    <div className="draft-info-item">
                      <span className="draft-info-label">Max Players</span>
                      <span className="draft-info-value">{data.maxPlayers}</span>
                    </div>
                  )}
                  {isHost ? (
                    <div className="draft-info-item draft-mode-selector">
                      <span className="draft-info-label">Draft Mode</span>
                      <div className="draft-mode-options">
                        <label className={`draft-mode-option ${data.draftMode === 'exhausted' ? 'active' : ''}`}>
                          <input
                            type="radio"
                            name="draftMode"
                            value="exhausted"
                            checked={data.draftMode === 'exhausted'}
                            onChange={() => handleAction('update-settings', { draftMode: 'exhausted' })}
                          />
                          Entire Pool
                        </label>
                        <label className={`draft-mode-option ${(data.draftMode || 'fixed') === 'fixed' ? 'active' : ''}`}>
                          <input
                            type="radio"
                            name="draftMode"
                            value="fixed"
                            checked={(data.draftMode || 'fixed') === 'fixed'}
                            onChange={() => handleAction('update-settings', { draftMode: 'fixed' })}
                          />
                          Fixed Picks
                          <input
                            type="text"
                            value={picksInputValue}
                            placeholder="42"
                            onChange={(e) => setPicksInputValue(e.target.value.replace(/[^0-9]/g, ''))}
                            onBlur={() => {
                              const value = picksInputValue === '' ? 42 : parseInt(picksInputValue, 10)
                              if (value >= 1 && value <= 500) {
                                handleAction('update-settings', { picksPerPlayer: value })
                              } else {
                                setPicksInputValue(String(data.picksPerPlayer || 42))
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.currentTarget.blur()
                              }
                            }}
                            className="draft-info-input inline-input"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </label>
                      </div>
                    </div>
                  ) : (
                    <div className="draft-info-item">
                      <span className="draft-info-label">Draft Mode</span>
                      <span className="draft-info-value">
                        {data.draftMode === 'exhausted' ? 'Entire Pool' : `Fixed: ${data.picksPerPlayer || 42} picks`}
                      </span>
                    </div>
                  )}
                  <div className="draft-info-item pool-drafted-info">
                    <span className="draft-info-label">Pool Drafted</span>
                    <span className={`draft-info-value ${percentDrafted > 100 || cardsPerPlayer < 30 ? 'warning' : ''}`}>
                      {data.draftMode === 'exhausted' ? '100%' : `${percentDrafted}%`}
                    </span>
                    <p className={`pool-drafted-hint ${cardsPerPlayer < 30 ? 'warning' : ''}`}>
                      {cardsPerPlayer < 30
                        ? `⚠️ ${cardsPerPlayer} picks is not enough for a legal 30-card deck!`
                        : data.draftMode === 'exhausted'
                          ? 'All cards get drafted. Each player gets equal picks.'
                          : percentDrafted > 100
                            ? `⚠️ Not enough cards! Reduce picks or add more sets.`
                            : percentDrafted < 50
                              ? 'Lower % = more variety. Higher % = more competitive.'
                              : 'Higher % means cards are more contested.'}
                    </p>
                  </div>
                  {isHost ? (
                    <div className="draft-info-item timer-config">
                      <span className="draft-info-label">Pick Timer</span>
                      <div className="timer-config-row">
                        <label className="timer-toggle">
                          <input
                            type="checkbox"
                            checked={data.timerEnabled || false}
                            onChange={(e) => handleAction('update-settings', { timerEnabled: e.target.checked })}
                          />
                          <span>{data.timerEnabled ? 'On' : 'Off'}</span>
                        </label>
                        {data.timerEnabled && (
                          <>
                            <input
                              type="text"
                              value={data.pickTimerSeconds || 120}
                              onChange={(e) => {
                                const val = e.target.value.replace(/[^0-9]/g, '')
                                const value = val === '' ? 120 : parseInt(val, 10)
                                handleAction('update-settings', { pickTimerSeconds: value })
                              }}
                              className="timer-input"
                            />
                            <span>sec</span>
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="draft-info-item">
                      <span className="draft-info-label">Pick Timer</span>
                      <span className="draft-info-value">
                        {data.timerEnabled ? `${data.pickTimerSeconds}s` : 'Off'}
                      </span>
                    </div>
                  )}
                </div>

                {isHost && (
                  <div className="host-actions">
                    <Button variant="danger" onClick={() => handleAction('cancel')}>
                      Cancel Draft
                    </Button>
                    {players.length >= 2 && (data.setCodes || []).length > 0 ? (
                      <Button variant="primary" onClick={() => handleAction('start')}>
                        Get Cooking!
                      </Button>
                    ) : (
                      <p className="waiting-text">
                        {players.length < 2 ? 'Need 2+ players' : ''}
                        {players.length < 2 && (data.setCodes || []).length === 0 ? ', ' : ''}
                        {(data.setCodes || []).length === 0 ? 'select sets' : ''}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>
    )
  }

  // Active / Completed draft view
  const myPicks = getMyPicks()
  const filteredCards = getFilteredCards()

  return (
    <div className="sealed-pod rotisserie-play-page">
      <div className="sealed-pod-content">
        <div className="draft-header">
          <div className="draft-header-center">
            <h1>Rotisserie Draft</h1>
            {data.status === 'completed' ? (
              <span className="draft-round-info completed">Draft Complete!</span>
            ) : (
              <span className="draft-round-info">Drafting Phase &middot; Pick {data.pickNumber} / {data.totalPicks}</span>
            )}
          </div>
          {data.status === 'active' && isHost && (
            <Button variant="danger" size="sm" onClick={() => handleAction('cancel')}>
              Cancel Draft
            </Button>
          )}
        </div>

        <div className="rotisserie-layout">
        <div className="sidebar">
          <div className="players-section">
            <h3>Players ({players.length})</h3>
            <div className="players-list">
              {players.map((player, index) => {
                const isBot = player.id.startsWith('bot_')
                const isCurrent = index === data.currentPickerIndex && data.status === 'active'
                const playerPicks = getPlayerPicks(player.id)
                return (
                  <div
                    key={player.id}
                    className={`player-item ${isCurrent ? 'current' : ''}`}
                    onMouseEnter={(e) => handlePlayerMouseEnter(player, e)}
                    onMouseLeave={handlePlayerMouseLeave}
                  >
                    <UserAvatar
                      src={player.avatarUrl}
                      alt={player.name}
                      fallback={isBot ? '🤖' : player.name.charAt(0).toUpperCase()}
                      className="player-avatar"
                      size={28}
                    />
                    <span className="player-name">
                      {player.name}
                      {player.id === user?.id && ' (You)'}
                    </span>
                    <span className="player-picks">
                      {playerPicks.length}/{cardsPerPlayer}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {myPicks.length > 0 && (
            <div className="my-picks-section">
              <div className="my-picks-header">
                <h3>My Picks ({myPicks.length})</h3>
                <button
                  className="expand-picks-btn"
                  onClick={() => setShowMyPicksModal(true)}
                  title="View all picks"
                >
                  <span style={{ fontSize: '22px', lineHeight: 1 }}>⤢</span>
                </button>
              </div>
              <div className="my-picks-grid">
                {myPicks.map((card) => (
                  <div
                    key={card.instanceId}
                    className="my-pick-card"
                    onMouseEnter={(e) => handleCardMouseEnter(card, e)}
                    onMouseLeave={handleCardMouseLeave}
                    onTouchStart={() => handleCardTouchStart(card)}
                    onTouchEnd={handleCardTouchEnd}
                  >
                    <Card card={card} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="main-content">
          {data.status === 'active' && (
            <div className="draft-status-bar">
              {/* Turn indicator - full width */}
              <div className={`turn-indicator ${isMyTurn ? 'my-turn' : ''} ${timerRemaining !== null && timerRemaining <= 10 ? 'timer-warning' : ''}`}>
                <div className="turn-indicator-main">
                  <span>{isMyTurn ? "It's your turn to pick!" : `Waiting for ${currentPicker?.name}...`}</span>
                  {timerRemaining !== null && (
                    <span className={`timer-countdown ${timerRemaining <= 10 ? 'urgent' : ''}`}>
                      {Math.floor(timerRemaining / 60)}:{String(timerRemaining % 60).padStart(2, '0')}
                    </span>
                  )}
                </div>
                {!isMyTurn && turnsAway > 0 && (
                  <div className="turns-away">You pick in {turnsAway} {turnsAway === 1 ? 'turn' : 'turns'}</div>
                )}
              </div>

              {/* Scroll to top button - positioned absolute, only shows when scrolled */}
              {isScrolled && (
                <button
                  className="scroll-top-btn"
                  onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                  title="Back to top"
                >
                  <span style={{ fontSize: '18px', lineHeight: 1 }}>↑</span>
                </button>
              )}

              {/* Upcoming picks row */}
              <div className="status-bar-upcoming-row">
                <div className="pick-order-strip">
                  <span className="pick-order-label">UPCOMING</span>
                  {upcomingPicks.map((player, i) => {
                    const isCurrentPick = i === 0
                    const isYou = user && player.id === user.id
                    let chipClass = 'pick-chip'
                    if (isCurrentPick) chipClass += ' current'
                    else if (isYou) chipClass += ' you'
                    return (
                      <span key={i}>
                        {i > 0 && <span className="pick-separator">&rsaquo;</span>}
                        <span className={chipClass}>
                          {isYou ? 'You' : player.name}
                        </span>
                      </span>
                    )
                  })}
                </div>
              </div>

              {/* Show row (type filters + set filters) */}
              <div className="status-bar-controls-row">
                <div className="type-filter-group">
                  <span className="type-filter-label">Show:</span>
                  <button
                    className={`type-filter-btn ${typeFilters.leaders ? 'active' : 'inactive'}`}
                    onClick={() => toggleTypeFilter('leaders')}
                    title="Leaders"
                  >
                    <LeaderIcon /> Leaders
                  </button>
                  <button
                    className={`type-filter-btn ${typeFilters.bases ? 'active' : 'inactive'}`}
                    onClick={() => toggleTypeFilter('bases')}
                    title="Bases"
                  >
                    <BaseIcon /> Bases
                  </button>
                  <button
                    className={`type-filter-btn ${typeFilters.groundUnits ? 'active' : 'inactive'}`}
                    onClick={() => toggleTypeFilter('groundUnits')}
                    title="Ground Units"
                  >
                    <GroundUnitIcon /> Ground
                  </button>
                  <button
                    className={`type-filter-btn ${typeFilters.spaceUnits ? 'active' : 'inactive'}`}
                    onClick={() => toggleTypeFilter('spaceUnits')}
                    title="Space Units"
                  >
                    <SpaceUnitIcon /> Space
                  </button>
                  <button
                    className={`type-filter-btn ${typeFilters.upgrades ? 'active' : 'inactive'}`}
                    onClick={() => toggleTypeFilter('upgrades')}
                    title="Upgrades"
                  >
                    <UpgradeIcon /> Upgrades
                  </button>
                  <button
                    className={`type-filter-btn ${typeFilters.events ? 'active' : 'inactive'}`}
                    onClick={() => toggleTypeFilter('events')}
                    title="Events"
                  >
                    <EventIcon /> Events
                  </button>
                </div>

                {/* Set filters - only show if 2+ sets */}
                {(data.setCodes || []).length >= 2 && (
                  <div className="set-filter-group">
                    {(data.setCodes || []).map(setCode => {
                      const setColor = getSetColor(setCode)
                      const isActive = setFilters[setCode] !== false
                      return (
                        <button
                          key={setCode}
                          className={`set-filter-btn ${isActive ? 'active' : 'inactive'}`}
                          onClick={() => setSetFilters(prev => ({ ...prev, [setCode]: !prev[setCode] }))}
                          style={{ '--set-color': setColor } as React.CSSProperties}
                          title={`Toggle ${setCode}`}
                        >
                          {setCode}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Sort row */}
              <div className="status-bar-sort-row">
                <div className="sort-group">
                  <span className="sort-label">Sort:</span>
                  <button
                    className={`sort-btn ${sortOption === 'number' ? 'active' : ''}`}
                    onClick={() => setSortOption('number')}
                    title="Sort by number"
                  >
                    <NumberIcon /> Number
                  </button>
                  <button
                    className={`sort-btn ${sortOption === 'cost' ? 'active' : ''}`}
                    onClick={() => setSortOption('cost')}
                    title="Sort by cost"
                  >
                    <CostIcon /> Cost
                  </button>
                  <button
                    className={`sort-btn ${sortOption === 'aspect' ? 'active' : ''}`}
                    onClick={() => setSortOption('aspect')}
                    title="Sort by aspect"
                  >
                    <AspectIconSort /> Aspect
                  </button>
                  <button
                    className={`sort-btn ${sortOption === 'rarity' ? 'active' : ''}`}
                    onClick={() => setSortOption('rarity')}
                    title="Sort by rarity"
                  >
                    <RarityIcon /> Rarity
                  </button>
                </div>
              </div>

              {/* Aspect filters row */}
              <div className="status-bar-filters-row">
                <div className="arena-aspect-filters">
                  {/* Primary aspect groups */}
                  {PRIMARY_ASPECTS.map(primary => {
                    const standardCombos = getStandardCombosForPrimary(primary)
                    const hasAnyCombos = standardCombos.some(k => presentCombos.has(k))
                    if (!hasAnyCombos) return null

                    const isGroupActive = isPrimaryAspectActive(primary)

                    return (
                      <div key={primary} className={`arena-filter-btn arena-aspect-group ${primary.toLowerCase()}`}>
                        <div className="arena-aspect-group-top-row">
                          <div
                            className={`arena-aspect-group-header ${isGroupActive ? 'active' : 'inactive'}`}
                            onClick={() => togglePrimaryAspect(primary)}
                            title={`Toggle all ${primary} combos`}
                          >
                            <AspectIcon aspect={primary} />
                          </div>
                          <div className="arena-aspect-group-separator" />
                          <div className="arena-aspect-group-standard-combos">
                            {standardCombos.map(comboKey => renderComboFilter(comboKey))}
                          </div>
                        </div>
                      </div>
                    )
                  })}

                  {/* Secondary aspects and Neutral */}
                  <div className="arena-secondary-aspects">
                    {SECONDARY_ASPECTS.map(secondary => {
                      const isActive = isSecondaryAspectActive(secondary)
                      const hasCards = presentCombos.has(secondary) ||
                        PRIMARY_ASPECTS.some(p => presentCombos.has(sortAspects([p, secondary]).join('+')))
                      if (!hasCards) return null

                      return (
                        <button
                          key={secondary}
                          className={`arena-filter-btn arena-secondary-aspect ${secondary.toLowerCase()} ${isActive ? 'active' : 'inactive'}`}
                          onClick={() => toggleSecondaryAspect(secondary)}
                          title={`Toggle all ${secondary} cards`}
                        >
                          <AspectIcon aspect={secondary} />
                        </button>
                      )
                    })}

                    {presentCombos.has('neutral') && (
                      <button
                        className={`arena-filter-btn arena-neutral-filter ${activeFilters.neutral ? 'active' : 'inactive'}`}
                        onClick={() => toggleFilter('neutral')}
                        title="Toggle neutral cards"
                      >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="rgba(128, 128, 128, 0.7)">
                          <polygon points="12,2 22,7 22,17 12,22 2,17 2,7" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Multi-aspect combos (inline) */}
                  {allMultiPrimaryCombos.length > 0 && (
                    <div className="arena-multi-aspect-group">
                      <button
                        className={`arena-multi-aspect-diamond ${isAnyMultiPrimaryActive ? 'active' : 'inactive'}`}
                        onClick={toggleAllMultiPrimary}
                        title="Toggle all multi-aspect cards"
                      >
                        <div className="arena-diamond-icon">
                          <img src="/icons/vigilance.png" alt="Vigilance" />
                          <img src="/icons/command.png" alt="Command" />
                          <img src="/icons/aggression.png" alt="Aggression" />
                          <img src="/icons/cunning.png" alt="Cunning" />
                        </div>
                      </button>
                      <div className="arena-aspect-group-separator" />
                      <div className="arena-aspect-group-standard-combos">
                        {allMultiPrimaryCombos.map(comboKey => renderComboFilter(comboKey))}
                      </div>
                    </div>
                  )}

                  {/* Eye toggle */}
                  <button
                    className={`arena-filter-btn arena-toggle-all-filter ${anyFilterActive ? 'active' : 'inactive'}`}
                    onClick={toggleAllFilters}
                    title={anyFilterActive ? 'Hide All' : 'Show All'}
                  >
                    {anyFilterActive ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Search row */}
              <div className="status-bar-search-row">
                <span className="search-label">Search:</span>
                <div className="search-input-container">
                  <input
                    type="text"
                    placeholder="Search by card title"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className="search-input"
                  />
                  {filter && (
                    <button
                      className="search-clear-btn"
                      onClick={() => setFilter('')}
                    >
                      &times;
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {actionError && (
            <div className="action-error" onClick={() => setActionError(null)}>
              {actionError}
            </div>
          )}

          {/* Search bar - only shown when not active (lobby) */}
          {data.status !== 'active' && (
            <div className="filter-bar">
              <div className="search-input-container">
                <input
                  type="text"
                  placeholder="Search cards..."
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="search-input"
                />
                {filter && (
                  <button
                    className="search-clear-btn"
                    onClick={() => setFilter('')}
                    title="Clear search"
                  >
                    <ClearIcon />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Card Pool or Completion Screen */}
          {data.status === 'completed' ? (
            <div className="draft-complete-screen">
              <div className="draft-complete-content">
                <h2>Draft Complete!</h2>
                <p>You drafted {myPicks.length} cards. Head to the deck builder to construct your deck.</p>
                <Button
                  variant="primary"
                  onClick={() => router.push(`/pool/${shareId}/deck`)}
                >
                  Continue to Deck Builder
                </Button>
              </div>
            </div>
          ) : (
            <div className="card-pool">
              {filteredCards.map((card) => {
                const picked = isCardPicked(card.instanceId)
                return (
                  <div
                    key={card.instanceId}
                    className={`pool-card ${picked ? 'picked' : ''}`}
                    onClick={() => {
                      if (isMyTurn && !picked && !picking) {
                        handleAction('pick', { cardInstanceId: card.instanceId })
                      }
                    }}
                    onMouseEnter={(e) => handleCardMouseEnter(card, e)}
                    onMouseLeave={handleCardMouseLeave}
                    onTouchStart={() => handleCardTouchStart(card)}
                    onTouchEnd={handleCardTouchEnd}
                  >
                    <Card card={card} disabled={picked} />
                    {picked && <div className="picked-overlay">Picked</div>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Pick Notification */}
      {pickNotification && (
        <div className="pick-notification" onClick={() => setPickNotification(null)}>
          <span className="pick-notification-player">{pickNotification.playerName}</span>
          {' picked '}
          <span
            className="pick-notification-card"
            style={pickNotification.isLeader && pickNotification.aspects?.length ? {
              color: getSingleAspectColor(pickNotification.aspects[0])
            } : undefined}
          >
            {pickNotification.cardName}
          </span>
          {pickNotification.subtitle && (
            <span className="pick-notification-subtitle">, {pickNotification.subtitle}</span>
          )}
        </div>
      )}

      {/* Card Preview */}
      {hoveredCardPreview && (
        <CardPreview
          card={hoveredCardPreview.card}
          x={hoveredCardPreview.x}
          y={hoveredCardPreview.y}
          isMobile={hoveredCardPreview.isMobile}
          onDismiss={dismissPreview}
        />
      )}

      {/* Player picks tooltip */}
      {tooltipPlayer && (
        <div
          className="player-picks-tooltip"
          style={{
            position: 'fixed',
            left: Math.min(tooltipPlayer.x, window.innerWidth - 220),
            top: tooltipPlayer.y,
          }}
        >
          <div className="tooltip-header">{tooltipPlayer.player.name}'s Picks</div>
          <div className="tooltip-picks">
            {getPlayerPicks(tooltipPlayer.player.id).length === 0 ? (
              <div className="tooltip-empty">No picks yet</div>
            ) : (
              getPlayerPicks(tooltipPlayer.player.id).map((card, i) => {
                const isLeader = card.type === 'Leader'
                const cardColor = getCardColor(card)
                return (
                  <div key={card.instanceId} className={`tooltip-pick ${isLeader ? 'leader' : ''}`}>
                    <span className="tooltip-pick-num">{i + 1}.</span>
                    <span
                      className="tooltip-pick-name"
                      style={isLeader ? { color: cardColor, fontWeight: 700 } : undefined}
                    >
                      {card.name}
                    </span>
                    {card.subtitle && (
                      <span className="tooltip-pick-subtitle">{card.subtitle}</span>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* My Picks Modal */}
      {showMyPicksModal && (
        <div className="my-picks-modal-overlay" onClick={() => setShowMyPicksModal(false)}>
          <div className="my-picks-modal" onClick={(e) => e.stopPropagation()}>
            <div className="my-picks-modal-header">
              <h2>My Picks ({myPicks.length}/{cardsPerPlayer})</h2>
              <button
                className="my-picks-modal-close"
                onClick={() => setShowMyPicksModal(false)}
              >
                &times;
              </button>
            </div>
            <div className="my-picks-modal-controls">
              <div className="type-filter-group">
                <span className="type-filter-label">Show:</span>
                <button
                  className={`type-filter-btn ${typeFilters.leaders ? 'active' : 'inactive'}`}
                  onClick={() => toggleTypeFilter('leaders')}
                  title="Leaders"
                >
                  <LeaderIcon /> Leaders
                </button>
                <button
                  className={`type-filter-btn ${typeFilters.bases ? 'active' : 'inactive'}`}
                  onClick={() => toggleTypeFilter('bases')}
                  title="Bases"
                >
                  <BaseIcon /> Bases
                </button>
                <button
                  className={`type-filter-btn ${typeFilters.groundUnits ? 'active' : 'inactive'}`}
                  onClick={() => toggleTypeFilter('groundUnits')}
                  title="Ground Units"
                >
                  <GroundUnitIcon /> Ground
                </button>
                <button
                  className={`type-filter-btn ${typeFilters.spaceUnits ? 'active' : 'inactive'}`}
                  onClick={() => toggleTypeFilter('spaceUnits')}
                  title="Space Units"
                >
                  <SpaceUnitIcon /> Space
                </button>
                <button
                  className={`type-filter-btn ${typeFilters.upgrades ? 'active' : 'inactive'}`}
                  onClick={() => toggleTypeFilter('upgrades')}
                  title="Upgrades"
                >
                  <UpgradeIcon /> Upgrades
                </button>
                <button
                  className={`type-filter-btn ${typeFilters.events ? 'active' : 'inactive'}`}
                  onClick={() => toggleTypeFilter('events')}
                  title="Events"
                >
                  <EventIcon /> Events
                </button>
              </div>
              <div className="sort-group">
                <span className="sort-label">Sort:</span>
                <button
                  className={`sort-btn ${sortOption === 'number' ? 'active' : ''}`}
                  onClick={() => setSortOption('number')}
                  title="Sort by number"
                >
                  <NumberIcon /> Number
                </button>
                <button
                  className={`sort-btn ${sortOption === 'cost' ? 'active' : ''}`}
                  onClick={() => setSortOption('cost')}
                  title="Sort by cost"
                >
                  <CostIcon /> Cost
                </button>
                <button
                  className={`sort-btn ${sortOption === 'aspect' ? 'active' : ''}`}
                  onClick={() => setSortOption('aspect')}
                  title="Sort by aspect"
                >
                  <AspectIconSort /> Aspect
                </button>
                <button
                  className={`sort-btn ${sortOption === 'rarity' ? 'active' : ''}`}
                  onClick={() => setSortOption('rarity')}
                  title="Sort by rarity"
                >
                  <RarityIcon /> Rarity
                </button>
              </div>
            </div>
            <div className="my-picks-modal-content">
              <div className="card-pool">
                {getFilteredMyPicks().map((card) => (
                  <div
                    key={card.instanceId}
                    className="pool-card"
                    onMouseEnter={(e) => handleCardMouseEnter(card, e)}
                    onMouseLeave={handleCardMouseLeave}
                    onTouchStart={() => handleCardTouchStart(card)}
                    onTouchEnd={handleCardTouchEnd}
                  >
                    <Card card={card} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}

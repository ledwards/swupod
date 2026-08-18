// @ts-nocheck
import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import './DeckBuilder.css'
import DeckBuilderContext from '../contexts/DeckBuilderContext'
import { getCachedCards, isCacheInitialized, initializeCardCache } from '../utils/cardCache'
import { deduplicateCommonBases } from '../utils/baseDedup'
import { buildBaseCardMap as buildBaseCardMapUtil, getBaseCardId as getBaseCardIdUtil } from '../utils/variantDowngrade'
import { trackEvent, AnalyticsEvents } from '../hooks/useAnalytics'
import { buildLimitedContext, LimitedAnalyticsEvents } from '../analytics/limitedEvents'
import { fetchSetCards } from '../utils/api'
import { getBaseSetCode } from '../utils/carboniteConstants'
import { parseDeckBuilderState } from '../utils/deckBuilderState'
import { buildDeckBuilderUiStorageState, safeLocalStorageSetItem } from '../utils/deckBuilderLocalState'
import { useAuth } from '../contexts/AuthContext'
import { jsonParse } from '../utils/json'
import { calculateAspectPenalty } from '../services/cards/aspectPenalties'
import {
  getAspectSortKey,
  compareByAspectTypeCostName,
  compareByCostName,
} from '../services/cards/cardSorting'
import { deletePool, savePool, updatePool } from '../utils/poolApi'
import { getPackArtUrl } from '../utils/packArt'
import {
  getBuildDeckBuilderState,
  getNewBuildDeckBuilderState,
  getBuildName,
  shouldBuildFromSharedPool,
  resolvePlayDestination,
  getDefaultPoolName,
  getDefaultBuildName,
  ensureArchetypeIndexes,
  resolveArchetypeUuid,
  fetchArchetypeNickname,
  getCanonicalPoolSubtitle,
  fetchUserBuild,
} from '../utils/deckBuilderSharing'
import { loadAllCards } from '../utils/cardDataClient'
import Card from './Card'
import { CardPreview } from './DeckBuilder/CardPreview'
import { LeaderBaseSelector } from './DeckBuilder/LeaderBaseSelector'
import { SectionHeader } from './DeckBuilder/SectionHeader'
import { DeckBuilderHeader } from './DeckBuilder/DeckBuilderHeader'
import { StickyInfoBar } from './DeckBuilder/StickyInfoBar'
import { PoolSection } from './DeckBuilder/PoolSection'
import { DeckSection } from './DeckBuilder/DeckSection'
import { SelectionListSection } from './DeckBuilder/SelectionListSection'
import { PoolListSection } from './DeckBuilder/PoolListSection'
import { Tooltip } from './DeckBuilder/Tooltip'
import { DeckImageModal } from './DeckBuilder/DeckImageModal'
import Modal from './Modal'
import Button from './Button'
import { DeleteDeckSection } from './DeckBuilder/DeleteDeckSection'
import { ViewModeToggle, type ViewMode } from './DeckBuilder/ViewModeToggle'
import { ArenaView } from './DeckBuilder/ArenaView'
import { CollapsibleSectionHeader } from './DeckBuilder/CollapsibleSectionHeader'
import { getTypeStringOrder } from '../utils/cardSort'
import { useDeckExport } from '../hooks/useDeckExport'
import { useDragAndDrop } from '../hooks/useDragAndDrop'
import { useCardPreview } from '../hooks/useCardPreview'
import { useTooltip } from '../hooks/useTooltip'
import {
  getAspectCombinationKey as getAspectCombinationKeyUtil,
  getAspectCombinationDisplayName as getAspectCombinationDisplayNameUtil,
  getAspectKey as getAspectKeyUtil,
} from '../utils/aspectCombinations'

// Get aspect symbol for list view using individual icon files
import AspectIcon from './AspectIcon'

// Legacy wrapper for existing code - maps old size names to new component sizes
const getAspectSymbol = (aspect: string, size = 'medium') => {
  const sizeMap: Record<string, string> = {
    'small': 'sm',
    'medium': 'md',
    'large': 'xl'
  }
  return <AspectIcon aspect={aspect} size={sizeMap[size] || 'md'} />
}

// Build aspect icons for table cells
const getAspectIcons = (card: CardType) => {
  if (!card.aspects || card.aspects.length === 0) return null
  const icons = card.aspects.map((aspect, i) => {
    const symbol = getAspectSymbol(aspect, 'large')
    return symbol ? <span key={i} className="aspect-symbol-wrapper">{symbol}</span> : null
  }).filter(Boolean)
  if (icons.length === 0) return null
  return [<span key="aspects-group" className="aspects-group">{icons}</span>]
}

const ASPECTS = ['Vigilance', 'Command', 'Aggression', 'Cunning', 'Villainy', 'Heroism']
const NO_ASPECT_LABEL = 'Neutral'

interface CardType {
  id?: string
  name?: string
  type?: string
  aspects?: string[]
  arenas?: string[]
  cost?: number
  rarity?: string
  isBase?: boolean
  isLeader?: boolean
  set?: string
  [key: string]: unknown
}

interface CardPosition {
  x: number
  y: number
  card: CardType
  section: string
  visible: boolean
  enabled?: boolean
  zIndex?: number
}

interface SectionBound {
  minY: number
  maxY: number
  minX: number
  maxX: number
}

interface SectionLabel {
  text: string
  y: number
}

interface TableSortState {
  field: string | null
  direction: 'asc' | 'desc'
}

interface DeckBuilderProps {
  cards: CardType[]
  setCode: string
  onBack?: () => void
  savedState?: string | null
  onStateChange?: (state: unknown) => void
  mode?: 'standard' | 'infinite'
  localStorageKey?: string | null
  sessionId?: string | null
  onRequestPlay?: (deckBuilderState: Record<string, unknown>) => Promise<string> | string
  shareId?: string | null
  poolCreatedAt?: string | null
  poolType?: 'sealed' | 'draft' | string
  poolName?: string | null
  poolOwnerUsername?: string | null
  poolOwnerId?: string | null
  /** Anonymous (ownerless) pool — editable by anyone, as the API allows. The
   *  deck page sets this only once the pool has loaded and has no owner. */
  anonymousEditable?: boolean
  draftShareId?: string | null
  deckBuildDeadline?: string | null
  rootShareId?: string | null
  currentUserId?: string | null
  limitedMode?: 'solo' | 'group' | null
  /** True when the parent draft is competitive — Play goes to the single play
      URL (which renders the Swiss Practice panel) instead of the /pod hub. */
  competitive?: boolean
  /** Swiss Practice lock: when true the primary deck is read-only (no mutations).
   *  View/sort/filter/preview stay fully interactive. */
  swissLocked?: boolean
  /** The pod owner can flip the pod-level lock for everyone. */
  swissCanUnlock?: boolean
  onToggleSwissLock?: () => void
  /** Swiss Practice is underway but the owner has unlocked the decks: show the
   *  lock area in its "tap to lock again" state instead of the expired build timer. */
  swissUnlocked?: boolean
  /** Competitive event in progress — hides Stats / Draft Log / Draft Report in the
   *  header until the Swiss event is complete. */
  swissInProgress?: boolean
  poolParentShareId?: string | null
}

function DeckBuilder({
  cards,
  setCode,
  onBack,
  savedState,
  onStateChange,
  mode = 'standard',
  localStorageKey = null,
  sessionId = null,
  onRequestPlay,
  shareId = null,
  poolCreatedAt = null,
  poolType = 'sealed',
  poolName: initialPoolName = null,
  poolOwnerUsername = null,
  poolOwnerId = null,
  anonymousEditable = false,
  draftShareId = null,
  deckBuildDeadline = null,
  rootShareId = null,
  currentUserId = null,
  limitedMode = null,
  competitive = false,
  swissLocked = false,
  swissCanUnlock = false,
  onToggleSwissLock,
  swissUnlocked = false,
  swissInProgress = false,
  poolParentShareId = null
}: DeckBuilderProps) {
  const { user, isAuthenticated, signIn, isPatron } = useAuth()
  const isInfiniteMode = mode === 'infinite'
  const storageLookupKey = shareId || localStorageKey || null
  const uiStorageKey = storageLookupKey ? `deckBuilderUI_${storageLookupKey}` : null
  const parsedSavedState = useMemo(() => parseDeckBuilderState(savedState), [savedState])
  const currentSessionId = sessionId || parsedSavedState.sessionId || null
  // Anonymous pools (no owner) are editable by anyone — the API permits it and
  // the deck page only sets anonymousEditable once the pool has loaded, so this
  // never grants edit rights mid-load on someone else's pool.
  const isOwner = (isInfiniteMode || anonymousEditable)
    ? true
    : Boolean(user && poolOwnerId && user.id === poolOwnerId)
  const isDraftMode = poolType === 'draft'
  const isDraftStyleMode = poolType === 'draft' || poolType === 'chaos_draft' || poolType === 'rotisserie'

  // Get pool name from saved state if available, otherwise use initial prop
  const getInitialPoolName = () => {
    if (parsedSavedState?.poolName) return parsedSavedState.poolName
    return initialPoolName
  }
  const [currentPoolName, setCurrentPoolName] = useState(getInitialPoolName)
  // isDefaultName === true means the name is still the auto-generated default — auto-rename is allowed.
  // Legacy pools without the field default to false (treat as custom to avoid clobbering).
  const [isDefaultName, setIsDefaultName] = useState<boolean>(() => {
    return parsedSavedState?.isDefaultName === true
  })
  const canonicalSubtitle = getCanonicalPoolSubtitle({
    ownerName: poolOwnerUsername,
    setCode,
    poolType,
    createdAt: poolCreatedAt,
  })
  const [playShareId, setPlayShareId] = useState<string | null>(() => {
    return parsedSavedState?.playShareId || null
  })
  // Store the original base name (without leader/base suffix) for auto-naming
  const [originalBaseName, setOriginalBaseName] = useState<string | null>(null)

  // Sync pool name from savedState when it changes (e.g., after pool data reloads)
  // This ensures we pick up changes made elsewhere (like the play page)
  useEffect(() => {
    if (parsedSavedState?.poolName) {
      setCurrentPoolName(parsedSavedState.poolName)
    }
    if (parsedSavedState?.playShareId) {
      setPlayShareId(parsedSavedState.playShareId)
    } else if (!currentPoolName && initialPoolName) {
      setCurrentPoolName(initialPoolName)
    }
  }, [parsedSavedState, initialPoolName])

  // Extract and store the original base name (format part only) on initial load
  // Strips any existing leader/base suffix like "(Jabba the Hutt Green)" and trailing dates
  useEffect(() => {
    if (initialPoolName && !originalBaseName) {
      const cleaned = initialPoolName
        .replace(/\s*\(.*$/, '')           // Remove everything from first ( onward
        .replace(/\s*\d{2}\/\d{2}\/\d{4}$/, '') // Remove trailing date
        .trim()
      setOriginalBaseName(cleaned || initialPoolName)
    }
  }, [initialPoolName, originalBaseName])

  const handleRenamePool = (newName: string) => {
    if (swissLocked) return // Primary deck (incl. its name) is frozen during Swiss Practice
    if (newName && newName.length > 80) return // Enforced by EditableTitle, but guard here too
    setCurrentPoolName(newName || null)
    setIsDefaultName(false) // User manually edited the name → no longer default
    // Save is triggered automatically via useEffect when currentPoolName changes
  }

  const sortBaseCardsCommonFirst = useCallback((a: CardType, b: CardType) => {
    const aIsCommon = a.rarity === 'Common'
    const bIsCommon = b.rarity === 'Common'
    if (aIsCommon && !bIsCommon) return -1
    if (!aIsCommon && bIsCommon) return 1

    const keyA = getAspectKeyUtil(a)
    const keyB = getAspectKeyUtil(b)
    if (keyA !== keyB) return keyA.localeCompare(keyB)
    return compareByAspectTypeCostName(a, b)
  }, [])

  // Helper function to format card type for display
  const getFormattedType = useCallback((card: CardType) => {
    if (card.type === 'Unit') {
      if (card.arenas && card.arenas.includes('Ground')) {
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0' }}>
            <div>Unit</div>
            <div style={{ fontSize: '0.7em', color: 'rgba(255, 255, 255, 0.6)', marginTop: '-2px' }}>Ground</div>
          </div>
        )
      } else if (card.arenas && card.arenas.includes('Space')) {
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0' }}>
            <div>Unit</div>
            <div style={{ fontSize: '0.7em', color: 'rgba(255, 255, 255, 0.6)', marginTop: '-2px' }}>Space</div>
          </div>
        )
      }
      return 'Unit'
    }
    return card.type || 'Unknown'
  }, [])

  const [cardPositions, setCardPositions] = useState<Record<string, CardPosition>>({})
  const [canvasHeight, setCanvasHeight] = useState<number | null>(null)
  const [allSetCards, setAllSetCards] = useState<CardType[]>([])
  const [sectionLabels, setSectionLabels] = useState<SectionLabel[]>([])
  const [sectionBounds, setSectionBounds] = useState<Record<string, SectionBound>>({})
  const [hoveredCard, setHoveredCard] = useState<string | null>(null)
  // Start with 'grid' for SSR consistency, then update to 'arena' on desktop after hydration
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [viewModeInitialized, setViewModeInitialized] = useState(false)
  const [aspectFilters, setAspectFilters] = useState<Record<string, boolean>>({
    Vigilance: poolType !== 'draft',
    Command: poolType !== 'draft',
    Aggression: poolType !== 'draft',
    Cunning: poolType !== 'draft',
    Villainy: poolType !== 'draft',
    Heroism: poolType !== 'draft',
    [NO_ASPECT_LABEL]: poolType !== 'draft'
  })
  const [inAspectFilter, setInAspectFilter] = useState(poolType !== 'draft')
  const [outAspectFilter, setOutAspectFilter] = useState(poolType !== 'draft')
  const [poolSortOption, setPoolSortOption] = useState('cost')
  const [deckSortOption, setDeckSortOption] = useState('cost')
  const [deckGroupsExpanded, setDeckGroupsExpanded] = useState<Record<string, boolean>>({}) // Track expanded state of deck group blocks
  const [deckFilterOpen, setDeckFilterOpen] = useState(false) // Filter modal for Deck section
  const [poolFilterOpen, setPoolFilterOpen] = useState(false) // Filter modal for Pool section
  const [filterAspectsExpanded, setFilterAspectsExpanded] = useState<Record<string, boolean>>({}) // Track which aspect groups are expanded in filter modal
  const [tableSort, setTableSort] = useState<Record<string, TableSortState>>({}) // Per-section sorting: { sectionId: { field, direction } }
  const [leadersBasesExpanded, setLeadersBasesExpanded] = useState(true) // Parent toggle for entire Leaders & Bases section
  const [leadersExpanded, setLeadersExpanded] = useState(true)
  const [basesExpanded, setBasesExpanded] = useState(true)
  const [deckExpanded, setDeckExpanded] = useState(true)
  const [sideboardExpanded, setSideboardExpanded] = useState(true)
  const [poolGroupsExpanded, setPoolGroupsExpanded] = useState<Record<string, boolean>>({}) // Track expanded state for each pool group block
  const [poolFirstOrder, setPoolFirstOrder] = useState<boolean | null>(null) // null = not determined yet, true = pool first, false = deck first
  const [deckAspectSectionsExpanded, setDeckAspectSectionsExpanded] = useState<Record<string, boolean>>({}) // Track expanded aspect combination sections
  const [sideboardAspectSectionsExpanded, setSideboardAspectSectionsExpanded] = useState<Record<string, boolean>>({}) // Track expanded aspect combination sections for sideboard
  const [deckCostSectionsExpanded, setDeckCostSectionsExpanded] = useState<Record<string, boolean>>({}) // Track expanded cost sections (default all expanded)
  const [sideboardCostSectionsExpanded, setSideboardCostSectionsExpanded] = useState<Record<string, boolean>>({}) // Track expanded cost sections for sideboard
  const [arenaFilters, setArenaFilters] = useState<Record<string, boolean>>({}) // Arena view aspect filters (empty = all active)
  const [arenaSearchQuery, setArenaSearchQuery] = useState('') // Arena view search query
  const [arenaPoolSortOption, setArenaPoolSortOption] = useState<'default' | 'aspect' | 'cost' | 'type'>('cost') // Arena view pool grouping (independent of grid view's poolSortOption)
  const [arenaDeckSortOption, setArenaDeckSortOption] = useState<'default' | 'aspect' | 'cost' | 'type'>('cost') // Arena view deck grouping
  const [poolCardDensity, setPoolCardDensity] = useState<'small' | 'medium' | 'large'>('small') // Pool card density (arena+playmat) — default SMALL
  const [deckCardDensity, setDeckCardDensity] = useState<'small' | 'medium' | 'large'>('small') // Deck card density (arena+playmat)
  const deckBlocksRowRef = useRef<HTMLDivElement>(null)
  const [activeLeader, setActiveLeader] = useState<string | null>(null)
  const [activeBase, setActiveBase] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [messageType, setMessageType] = useState<'error' | 'success' | null>(null) // 'error' or 'success'
  const [isInfoBarSticky, setIsInfoBarSticky] = useState(false)
  const [showAspectPenalties, setShowAspectPenalties] = useState(false)
  const [lockModalOpen, setLockModalOpen] = useState(false)
  const [forkInProgress, setForkInProgress] = useState(false)
  // Lock-fire gating: hydration of saved state can flush multiple setCardPositions /
  // setActiveLeader / setActiveBase calls back-to-back, each re-running the
  // save/lock effect. Only treat changes as user edits after a short settle window.
  const lockReadyRef = useRef(false)
  useEffect(() => {
    const t = setTimeout(() => { lockReadyRef.current = true }, 1500)
    return () => clearTimeout(t)
  }, [])

  const enableAspectPenaltiesForBothSections = useCallback(() => {
    setShowAspectPenalties(true)
  }, [])

  const createInfiniteCloneId = useCallback((sourceCardId: string) => (
    `${sourceCardId}__clone__${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  ), [])

  const addInfiniteCardCopies = useCallback((prev: Record<string, CardPosition>, sourceCardIds: string[]) => {
    const updated = { ...prev }
    let changed = false

    sourceCardIds.forEach((sourceCardId) => {
      const sourcePosition = prev[sourceCardId]
      if (!sourcePosition || sourcePosition.card.isBase || sourcePosition.card.isLeader) return

      if (sourcePosition.isInfiniteDeckCopy) {
        updated[sourceCardId] = { ...sourcePosition, section: 'deck', enabled: true, x: 0, y: 0 }
        changed = true
        return
      }

      const cloneId = createInfiniteCloneId(sourceCardId)
      updated[cloneId] = {
        ...sourcePosition,
        section: 'deck',
        enabled: true,
        visible: true,
        x: 0,
        y: 0,
        zIndex: 1,
        isInfiniteSource: false,
        isInfiniteDeckCopy: true,
        sourceCardId: sourcePosition.sourceCardId || sourceCardId,
      }
      changed = true
    })

    return changed ? updated : prev
  }, [createInfiniteCloneId])

  const removeInfiniteDeckCards = useCallback((prev: Record<string, CardPosition>, cardIds: string[]) => {
    const updated = { ...prev }
    let changed = false

    cardIds.forEach((cardId) => {
      if (!updated[cardId]) return

      if (updated[cardId].isInfiniteDeckCopy) {
        delete updated[cardId]
        changed = true
        return
      }

      if (!updated[cardId].isInfiniteSource) {
        updated[cardId] = { ...updated[cardId], section: 'sideboard', enabled: false, x: 0, y: 0 }
        changed = true
      }
    })

    return changed ? updated : prev
  }, [])

  // Set default view mode to 'arena' on desktop after hydration (before localStorage restore)
  useEffect(() => {
    if (viewModeInitialized) return
    // Check if there's a saved viewMode in localStorage
    if (uiStorageKey) {
      try {
        const uiState = localStorage.getItem(uiStorageKey)
        if (uiState) {
          const state = JSON.parse(uiState)
          if (state.viewMode) {
            // localStorage has a saved viewMode, let the restore effect handle it
            setViewModeInitialized(true)
            return
          }
        }
      } catch (e) {
        // Ignore localStorage errors
      }
    }
    // No saved viewMode - default to 'arena' on desktop
    if (window.innerWidth >= 1024) {
      setViewMode('arena')
    }
    setViewModeInitialized(true)
  }, [uiStorageKey, viewModeInitialized])

  const deckBuilderOpenedTrackedRef = useRef(false)
  const limitedDeckBuilderOpenedTrackedRef = useRef(false)

  // Track deck builder opened and view mode changes
  useEffect(() => {
    if (!viewModeInitialized) return

    if (!deckBuilderOpenedTrackedRef.current) {
      deckBuilderOpenedTrackedRef.current = true
      trackEvent(AnalyticsEvents.DECK_BUILDER_OPENED, {
        set_code: setCode,
        pool_type: poolType,
        view_mode: viewMode,
      })
    }

    const limitedFormat = poolType === 'draft' ? 'draft' : (poolType === 'sealed' || poolType === 'sealed_pod') ? 'sealed' : null
    if (!limitedDeckBuilderOpenedTrackedRef.current && limitedFormat && !(poolType === 'draft' && draftShareId && !limitedMode)) {
      limitedDeckBuilderOpenedTrackedRef.current = true
      trackEvent(LimitedAnalyticsEvents.LIMITED_DECK_BUILDER_OPENED, {
        ...buildLimitedContext({
          format: limitedFormat,
          mode: limitedMode,
          setCode,
          poolShareId: shareId,
          podShareId: draftShareId,
          routeTemplate: '/pool/[shareId]/deck',
        }),
        view_mode: viewMode,
        is_owner: isOwner,
        is_child_build: Boolean(rootShareId && shareId && rootShareId !== shareId),
      })
    }
  }, [viewModeInitialized, setCode, poolType, viewMode, draftShareId, limitedMode, shareId, isOwner, rootShareId])

  // Track view mode changes (after initial load)
  const prevViewMode = useRef(viewMode)
  useEffect(() => {
    if (viewModeInitialized && prevViewMode.current !== viewMode) {
      trackEvent(AnalyticsEvents.DECK_BUILDER_VIEW_CHANGED, {
        from_view: prevViewMode.current,
        to_view: viewMode,
        set_code: setCode,
        pool_type: poolType,
      })
      prevViewMode.current = viewMode
    }
  }, [viewMode, viewModeInitialized, setCode, poolType])

  // Memoized active leader and base cards (derived from cardPositions)
  const leaderCard = useMemo(() => {
    return activeLeader && cardPositions[activeLeader] ? cardPositions[activeLeader].card : null
  }, [activeLeader, cardPositions])

  const baseCard = useMemo(() => {
    return activeBase && cardPositions[activeBase] ? cardPositions[activeBase].card : null
  }, [activeBase, cardPositions])

  const getAspectColorName = (aspect: string): string => {
    const aspectColorMap: Record<string, string> = {
      'Vigilance': 'Blue',
      'Command': 'Green',
      'Aggression': 'Red',
      'Cunning': 'Yellow',
      'Villainy': 'Purple',
      'Heroism': 'Orange',
    }
    return aspectColorMap[aspect] || ''
  }

  // Function to update pool/build name when leader or base changes.
  // Format: "{archetype} ({SET}) {Sealed|Draft} {MM.DD.YY}" — only fires while
  // the name is still the auto-generated default (isDefaultName === true).
  const updatePoolName = useCallback(async (leaderCard: CardType | null, baseCard: CardType | null) => {
    if (swissLocked) return // no writes to the primary deck while frozen
    if (!shareId || !isOwner) return
    if (!isDefaultName) return // user has customized; don't clobber
    if (!leaderCard) return

    try {
      // Client loader, not src/utils/cardData: the static import embedded the
      // ~9.5 MB cards.json in every bundle that touched DeckBuilder (the old
      // /deckbuilder/build exemption). loadAllCards() is memoized and, in the
      // deck-builder flows, already warmed by initializeCardCache().
      ensureArchetypeIndexes((await loadAllCards()) as any)
      const leaderUuid = resolveArchetypeUuid(leaderCard as any, 'leader')
      const baseUuid = baseCard ? resolveArchetypeUuid(baseCard as any, 'base') : null
      const nickname = await fetchArchetypeNickname(leaderUuid, baseUuid)

      const newName = getDefaultBuildName({
        archetypeNickname: nickname,
        setCode,
        poolType,
        createdAt: poolCreatedAt || new Date(),
      })
      if (!newName) return
      let name = newName
      if (name.length > 80) name = name.slice(0, 80)

      setCurrentPoolName(name)
      // Persist name + isDefaultName: true so future leader/base changes keep auto-renaming.
      await updatePool(shareId, { name })
    } catch (err) {
      console.error('Failed to update pool name:', err)
    }
  }, [shareId, isDefaultName, isOwner, setCode, poolType, poolCreatedAt, swissLocked])

  // Update pool name when leader or base changes
  useEffect(() => {
    if (!shareId || !poolCreatedAt) return

    // Only update if at least one is selected
    if (leaderCard || baseCard) {
      updatePoolName(leaderCard, baseCard)
    }
  }, [leaderCard, baseCard, shareId, poolCreatedAt, updatePoolName])
  const [deckImageModal, setDeckImageModal] = useState<string | null>(null) // URL for deck image modal
  const modalHoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const infoBarRef = useRef<HTMLDivElement>(null)

  // Drag and drop handling
  const {
    draggedCard,
    selectedCards,
    setSelectedCards,
    selectionBox,
    isSelecting,
    handleMouseDown: rawHandleMouseDown,
    handleCanvasMouseDown: rawHandleCanvasMouseDown,
  } = useDragAndDrop({
    cardPositions,
    setCardPositions,
    sectionBounds,
    activeLeader,
    setActiveLeader,
    activeBase,
    setActiveBase,
    poolSortOption,
    deckSortOption,
    setShowAspectPenalties: enableAspectPenaltiesForBothSections,
    setHoveredCard,
    canvasRef,
  })

  // Freeze drag/drop while the Swiss Practice lock is on.
  const handleMouseDown = useCallback((e: React.MouseEvent, cardId: string) => {
    if (swissLocked) return
    rawHandleMouseDown(e, cardId)
  }, [swissLocked, rawHandleMouseDown])
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (swissLocked) return
    rawHandleCanvasMouseDown(e)
  }, [swissLocked, rawHandleCanvasMouseDown])

  // Card preview handling
  const {
    hoveredCardPreview,
    handleCardMouseEnter,
    handleCardMouseLeave,
    handlePreviewMouseEnter,
    handlePreviewMouseLeave,
    handleCardTouchStart,
    handleCardTouchEnd,
    dismissPreview,
  } = useCardPreview()

  // Tooltip handling
  const {
    tooltip,
    showTooltip,
    showNavTooltip,
    hideTooltip,
    handleLongPress,
    cancelLongPress,
  } = useTooltip()

  // Toggle a card between deck and sideboard sections
  const toggleCardSection = useCallback((cardId: string) => {
    if (swissLocked) return // Swiss Practice: primary deck is frozen
    setHoveredCard(null)
    setCardPositions(prev => {
      if (isInfiniteMode) {
        const position = prev[cardId]
        if (!position) return prev

        if (position.section === 'deck' || position.isInfiniteDeckCopy) {
          return removeInfiniteDeckCards(prev, [cardId])
        }

        return addInfiniteCardCopies(prev, [cardId])
      }

      const newSection = prev[cardId].section === 'deck' ? 'sideboard' : 'deck'
      const newEnabled = newSection === 'deck'
      return {
        ...prev,
        [cardId]: {
          ...prev[cardId],
          section: newSection,
          enabled: newEnabled,
          x: 0,
          y: 0,
        }
      }
    })
  }, [addInfiniteCardCopies, isInfiniteMode, removeInfiniteDeckCards, swissLocked])

  const moveCardToDeck = useCallback((cardId: string) => {
    if (swissLocked) return
    setCardPositions(prev => {
      if (isInfiniteMode) {
        return addInfiniteCardCopies(prev, [cardId])
      }

      if (!prev[cardId]) return prev
      return {
        ...prev,
        [cardId]: { ...prev[cardId], section: 'deck', enabled: true, x: 0, y: 0 }
      }
    })
  }, [addInfiniteCardCopies, isInfiniteMode, swissLocked])

  const moveCardToPool = useCallback((cardId: string) => {
    if (swissLocked) return
    setCardPositions(prev => {
      if (isInfiniteMode) {
        return removeInfiniteDeckCards(prev, [cardId])
      }

      if (!prev[cardId]) return prev
      return {
        ...prev,
        [cardId]: { ...prev[cardId], section: 'sideboard', enabled: false, x: 0, y: 0 }
      }
    })
  }, [isInfiniteMode, removeInfiniteDeckCards, swissLocked])

  // Bulk move helpers for +All/-All buttons
  const moveCardsToDeck = useCallback((cardIds: string[]) => {
    if (swissLocked) return
    setCardPositions(prev => {
      if (isInfiniteMode) {
        return addInfiniteCardCopies(prev, cardIds)
      }

      const updated = { ...prev }
      cardIds.forEach(cardId => {
        updated[cardId] = { ...updated[cardId], section: 'deck', enabled: true }
      })
      return updated
    })
  }, [addInfiniteCardCopies, isInfiniteMode, swissLocked])

  const moveCardsToPool = useCallback((cardIds: string[]) => {
    if (swissLocked) return
    setCardPositions(prev => {
      if (isInfiniteMode) {
        return removeInfiniteDeckCards(prev, cardIds)
      }

      const updated = { ...prev }
      cardIds.forEach(cardId => {
        updated[cardId] = { ...updated[cardId], section: 'sideboard', enabled: false }
      })
      return updated
    })
  }, [isInfiniteMode, removeInfiniteDeckCards])

  // Cleanup modal hover timeout
  useEffect(() => {
    return () => {
      if (modalHoverTimeoutRef.current) {
        clearTimeout(modalHoverTimeoutRef.current)
      }
    }
  }, [])

  // Load all cards from the set(s) - optimize for speed
  // For chaos drafts, setCode may be comma-separated (e.g. "SOR,JTL,LOF")
  useEffect(() => {
    const loadSetCards = async () => {
      try {
        // Initialize cache first if not already initialized (should be instant from JSON)
        if (!isCacheInitialized()) {
          await initializeCardCache()
        }

        const setCodes = setCode.includes(',') ? setCode.split(',').map(s => s.trim()) : [setCode]
        let allCards: CardType[] = []

        for (const code of setCodes) {
          // Strip -CB suffix for carbonite codes (e.g. 'JTL-CB' -> 'JTL')
          const baseCode = getBaseSetCode(code)
          let cardsData = getCachedCards(baseCode)
          if (cardsData.length === 0) {
            cardsData = await fetchSetCards(baseCode)
          }
          allCards = allCards.concat(cardsData as CardType[])
        }

        if (allCards.length > 0) {
          setAllSetCards(allCards)
        }
      } catch (error) {
        console.error('Failed to load set cards:', error)
      }
    }

    if (setCode) {
      loadSetCards()
    }
  }, [setCode])

  // Check if card passes the visibility filter.
  // aspectFilters[comboKey] === false hides the card; default is visible.
  const cardMatchesFilters = useCallback((card: CardType) => {
    const cardAspects = card.aspects || []
    const comboKey = cardAspects.length === 0 ? 'Neutral' : [...cardAspects].sort().join('|')
    if (aspectFilters[comboKey] === false) return false

    if (leaderCard && baseCard) {
      const penalty = calculateAspectPenalty(card, leaderCard, baseCard)
      const isInAspect = penalty === 0
      if (!inAspectFilter && !outAspectFilter) return false
      if (inAspectFilter && !outAspectFilter && !isInAspect) return false
      if (!inAspectFilter && outAspectFilter && isInAspect) return false
    }

    return true
  }, [aspectFilters, leaderCard, baseCard, inAspectFilter, outAspectFilter])

  // Use imported getAspectSortKey from cardSorting service
  const getDefaultAspectSortKey = useCallback(getAspectSortKey, [])

  // Get aspect combination grouping key (uses utility function)
  const getAspectCombinationKey = useCallback(getAspectCombinationKeyUtil, [])

  // Get display name for aspect combination (uses utility function)
  const getAspectCombinationDisplayName = useCallback(getAspectCombinationDisplayNameUtil, [])

  // Get aspect icons for deck area headers (replaces text with icons)
  const getAspectCombinationIcons = useCallback((key: string) => {
    const parts = key.split('_')
    const aspectMap: Record<string, string> = {
      'vigilance': 'vigilance',
      'command': 'command',
      'aggression': 'aggression',
      'cunning': 'cunning',
      'villainy': 'villainy',
      'heroism': 'heroism'
    }

    if (parts.length === 1) {
      // Single aspect or neutral
      if (parts[0] === 'neutral') {
        return <span style={{ color: '#999' }}>Neutral</span>
      }
      const aspectName = aspectMap[parts[0]]
      if (!aspectName) return null
      return (
        <img
          src={`/icons/${aspectName}.png`}
          alt={parts[0]}
          style={{ width: '1em', height: '1em', verticalAlign: 'middle' }}
        />
      )
    } else {
      // Multiple aspects - show all icons
      return (
        <span style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          {parts.map((part, i) => {
            const aspectName = aspectMap[part]
            if (!aspectName) return null
            return (
              <img
                key={i}
                src={`/icons/${aspectName}.png`}
                alt={part}
                style={{ width: '1em', height: '1em', display: 'block', verticalAlign: 'middle' }}
              />
            )
          }).filter(Boolean)}
        </span>
      )
    }
  }, [])

  // Get aspect combination key for sorting (uses utility function)
  const getAspectKey = useCallback(getAspectKeyUtil, [])

  // Sort cards (only from deck section, excluding bases and leaders)
  // Note: No longer filtering - cards are moved between deck/sideboard via filter checkboxes
  const getFilteredAndSortedCards = useCallback(() => {
    const allCards = Object.values(cardPositions)
      .filter(pos => pos.section === 'deck' && pos.visible && !pos.card.isBase && !pos.card.isLeader && pos.enabled !== false)
      .map(pos => pos.card)

    // Get effective cost including aspect penalty
    const getEffectiveCost = (card: CardType) => {
      const baseCost = card.cost || 0
      const penalty = (showAspectPenalties && leaderCard && baseCard) ? calculateAspectPenalty(card, leaderCard, baseCard) : 0
      return baseCost + penalty
    }

    if (deckSortOption === 'aspect') {
      // Sort by aspect key directly
      return allCards.sort((a, b) => {
        const keyA = getAspectKey(a)
        const keyB = getAspectKey(b)
        return keyA.localeCompare(keyB)
      })
    } else if (deckSortOption === 'cost') {
      // Sort by cost (will be grouped by cost segments in rendering)
      return allCards.sort((a, b) => getEffectiveCost(a) - getEffectiveCost(b))
    }
    return allCards
  }, [cardPositions, deckSortOption, getAspectKey, getDefaultAspectSortKey, showAspectPenalties, leaderCard, baseCard])

  // Helper to filter and map deck cards
  const getDeckCards = useCallback(() => {
    return Object.entries(cardPositions)
      .filter(([_, pos]) => pos.section === 'deck' && pos.visible && !pos.card.isBase && !pos.card.isLeader && pos.enabled !== false)
      .map(([cardId, position]) => ({ cardId, position }))
  }, [cardPositions])

  // Helper to filter and map pool/sideboard cards
  const getPoolCards = useCallback(() => {
    return Object.entries(cardPositions)
      .filter(([_, pos]) => (pos.section === 'sideboard' || pos.enabled === false) && pos.visible && !pos.card.isBase && !pos.card.isLeader)
      .map(([cardId, position]) => ({ cardId, position }))
  }, [cardPositions])

  // Group cards by base name (ignoring treatments like foil, hyperspace, showcase)
  // Returns an array of groups, where each group contains cards with the same base name
  const groupCardsByName = useCallback((cardEntries: Array<{ cardId: string; position: CardPosition; aspectPenalty?: number }>) => {
    const groups = new Map<string, Array<{ cardId: string; position: CardPosition; aspectPenalty?: number }>>()

    cardEntries.forEach((cardEntry) => {
      const { cardId, position, aspectPenalty } = cardEntry
      const card = position.card
      const baseName = card.name || 'Unknown'

      if (!groups.has(baseName)) {
        groups.set(baseName, [])
      }
      groups.get(baseName)!.push({ cardId, position, aspectPenalty })
    })

    // Convert to array and sort groups by first card's order
    return Array.from(groups.entries()).map(([name, cards]) => ({
      name,
      cards
    }))
  }, [])

  // Render a card stack (for identical cards)
  const renderCardStack = useCallback((group: { name: string; cards: Array<{ cardId: string; position: CardPosition; aspectPenalty?: number }> }, renderCard: (cardEntry: { cardId: string; position: CardPosition; aspectPenalty?: number }, stackIndex: number | null, isStacked: boolean) => React.ReactNode) => {
    // Render all cards individually, no stacking
    return group.cards.map((cardEntry, index) => renderCard(cardEntry, null, false))
  }, [])

  // Get common Card props for a card entry
  const getCardEventHandlers = useCallback((cardId: string, card: CardType) => ({
    onClick: (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (!e.shiftKey) {
        toggleCardSection(cardId)
      }
    },
    onMouseEnter: (e: React.MouseEvent) => {
      setHoveredCard(cardId)
      handleCardMouseEnter(card, e)
    },
    onMouseLeave: () => {
      setHoveredCard(null)
      handleCardMouseLeave()
    },
    onTouchStart: () => {
      handleCardTouchStart(card)
    },
    onTouchEnd: () => {
      handleCardTouchEnd()
    },
  }), [toggleCardSection, handleCardMouseEnter, handleCardMouseLeave, handleCardTouchStart, handleCardTouchEnd])

  // Factory for card render callbacks used in renderCardStack
  const createCardRenderer = useCallback((leaderCardRef: CardType | null, baseCardRef: CardType | null, {
    showDisabled = false,
    showAspectPenalties = false,
  } = {}) => {
    return (cardEntry: { cardId: string; position: CardPosition }, stackIndex: number | null, isStacked: boolean) => {
      const { cardId, position } = cardEntry
      const card = position.card
      const isSelected = selectedCards.has(cardId)
      const isHovered = hoveredCard === cardId
      const isDisabled = showDisabled && !position.enabled
      const filteredOut = !cardMatchesFilters(card)
      const penalty = showAspectPenalties && leaderCardRef && baseCardRef
        ? calculateAspectPenalty(card, leaderCardRef, baseCardRef)
        : 0

      return (
        <Card
          key={cardId}
          card={card}
          selected={isSelected}
          hovered={isHovered}
          disabled={isDisabled}
          filteredOut={filteredOut}
          stacked={isStacked}
          stackIndex={stackIndex}
          showPenalty={showAspectPenalties && leaderCardRef && baseCardRef}
          penaltyAmount={penalty}
          {...getCardEventHandlers(cardId, position.card)}
        />
      )
    }
  }, [selectedCards, hoveredCard, getCardEventHandlers, cardMatchesFilters])

  // Restore saved state on mount
  useEffect(() => {
    if (Object.keys(cardPositions).length === 0 && savedState) {
      try {
        // Load deck state from database (savedState prop)
        const state = jsonParse(savedState)

        // Check localStorage for more recent deck/sideboard state (backup for debounced database save)
        let localDeckCardIds: Set<string> | null = null
        let localSideboardCardIds: Set<string> | null = null
        if (uiStorageKey) {
          try {
            const uiState = localStorage.getItem(uiStorageKey)
            if (uiState) {
              const localState = JSON.parse(uiState)
              // Use localStorage deck/sideboard state if it exists (it's saved immediately, unlike database)
              if (localState.deckCardIds && localState.sideboardCardIds) {
                localDeckCardIds = new Set(localState.deckCardIds)
                localSideboardCardIds = new Set(localState.sideboardCardIds)
              }
            }
          } catch (e) {
            // Ignore localStorage errors
          }
        }

        if (state.cardPositions && Object.keys(state.cardPositions).length > 0) {
          // Ensure all cards have enabled property (default to true)
          // Also remove any bases/leaders that might have been in 'main' section
          const positionsWithEnabled: Record<string, CardPosition> = {}
          Object.entries(state.cardPositions).forEach(([id, pos]: [string, any]) => {
            // Remove bases and leaders from 'main' section
            if ((pos.section === 'deck' || pos.section === 'sideboard') && (pos.card?.isBase || pos.card?.isLeader)) {
              return // Skip this card - it shouldn't be in main section
            }

            // Use localStorage deck/sideboard state if available (more recent than database)
            let section = pos.section
            let enabled = pos.enabled !== undefined ? pos.enabled : true
            if (localDeckCardIds && localSideboardCardIds && (pos.section === 'deck' || pos.section === 'sideboard')) {
              if (localDeckCardIds.has(id)) {
                section = 'deck'
                enabled = true
              } else if (localSideboardCardIds.has(id)) {
                section = 'sideboard'
                enabled = false
              }
            }

            if (isInfiniteMode && pos.isInfiniteDeckCopy) {
              section = 'deck'
              enabled = true
            }

            positionsWithEnabled[id] = {
              ...pos,
              isInfiniteSource: pos.isInfiniteDeckCopy ? false : pos.isInfiniteSource,
              section,
              enabled
            }
          })

          // Check for leaders from cards prop that aren't in the restored state
          // This handles draft pools where savedState was created before leaders were properly included
          const poolLeaders = cards.filter(card => card.isLeader || card.type === 'Leader')
          const existingLeaderIds = new Set(
            Object.entries(positionsWithEnabled)
              .filter(([, pos]) => pos.card?.isLeader || pos.card?.type === 'Leader')
              .map(([, pos]) => pos.card?.id || pos.card?.name)
          )

          // Add any missing leaders to the leaders-bases section
          const leaderBaseWidth = 168
          const leaderBaseHeight = 120
          const spacing = 20
          const padding = 50

          // Count existing leaders/bases to determine starting position
          const existingLeadersBasesCount = Object.values(positionsWithEnabled)
            .filter(pos => pos.section === 'leaders-bases').length

          let addedCount = 0
          poolLeaders.forEach((leader, index) => {
            const leaderId = leader.id || leader.name
            if (!existingLeaderIds.has(leaderId)) {
              const itemsPerRow = Math.max(1, Math.floor((window.innerWidth - 100) / (leaderBaseWidth + spacing)))
              const totalIndex = existingLeadersBasesCount + addedCount
              const row = Math.floor(totalIndex / itemsPerRow)
              const col = totalIndex % itemsPerRow
              const cardId = `leader-${totalIndex}-${leader.id || `${leader.name}-${leader.set}`}`

              // Get Y position from bounds or use default
              const leaderBaseBounds = state.sectionBounds?.['leaders-bases']
              const baseY = leaderBaseBounds?.minY || 90

              positionsWithEnabled[cardId] = {
                x: padding + col * (leaderBaseWidth + spacing),
                y: baseY + row * (leaderBaseHeight + spacing),
                card: leader,
                section: 'leaders-bases',
                visible: true,
                zIndex: 1
              }
              addedCount++
            }
          })

          setCardPositions(positionsWithEnabled)
          setSectionLabels(state.sectionLabels || [])
          setSectionBounds(state.sectionBounds || {})
          setCanvasHeight(state.canvasHeight)
          // Merge with defaults to ensure all keys exist (prevents uncontrolled->controlled warning)
          const defaultAspectFilters: Record<string, boolean> = {
            Vigilance: true,
            Villainy: true,
            Heroism: true,
            Command: true,
            Cunning: true,
            Aggression: true,
            [NO_ASPECT_LABEL]: true
          }
          setAspectFilters({ ...defaultAspectFilters, ...(state.aspectFilters || {}) })
          // Restore sort options separately
          if (state.poolSortOption) setPoolSortOption(state.poolSortOption)
          else if (state.sortOption) setPoolSortOption(state.sortOption)
          if (state.deckSortOption) setDeckSortOption(state.deckSortOption)
          else if (state.sortOption) setDeckSortOption(state.sortOption)

        }

        // Restore active leader and base (outside cardPositions check so it works even with empty positions)
        if (state.activeLeader) {
          setActiveLeader(state.activeLeader)
        }
        if (state.activeBase) {
          setActiveBase(state.activeBase)
        }
        if (state.playShareId) {
          setPlayShareId(state.playShareId)
        }

        // Restore UI state (outside cardPositions check)
        if (state.viewMode) {
          setViewMode(state.viewMode)
        }
        if (state.poolCardDensity) {
          setPoolCardDensity(state.poolCardDensity)
        }
        if (state.deckCardDensity) {
          setDeckCardDensity(state.deckCardDensity)
        }
        if (state.leadersBasesExpanded !== undefined) {
          setLeadersBasesExpanded(state.leadersBasesExpanded)
        }
        if (state.leadersExpanded !== undefined) {
          setLeadersExpanded(state.leadersExpanded)
        }
        if (state.basesExpanded !== undefined) {
          setBasesExpanded(state.basesExpanded)
        }
        if (state.deckExpanded !== undefined) {
          setDeckExpanded(state.deckExpanded)
        }
        if (state.sideboardExpanded !== undefined) {
          setSideboardExpanded(state.sideboardExpanded)
        }
        if (state.deckAspectSectionsExpanded) {
          setDeckAspectSectionsExpanded(state.deckAspectSectionsExpanded)
        }
        if (state.deckCostSectionsExpanded) {
          setDeckCostSectionsExpanded(state.deckCostSectionsExpanded)
        }
        if (state.deckGroupsExpanded) {
          setDeckGroupsExpanded(state.deckGroupsExpanded)
        }
        if (state.poolGroupsExpanded) {
          setPoolGroupsExpanded(state.poolGroupsExpanded)
        }
        if (state.showAspectPenalties !== undefined) {
          setShowAspectPenalties(state.showAspectPenalties)
        } else if (state.showDeckAspectPenalties !== undefined) {
          setShowAspectPenalties(state.showDeckAspectPenalties)
        } else if (state.showPoolAspectPenalties !== undefined) {
          setShowAspectPenalties(state.showPoolAspectPenalties)
        }
      } catch (e) {
        console.error('Failed to restore deck builder state:', e)
      }
    }
  }, [savedState, cards, uiStorageKey])

  // Restore UI state from localStorage
  useEffect(() => {
    if (!uiStorageKey) return

    try {
      const uiState = localStorage.getItem(uiStorageKey)
      if (uiState) {
        const state = JSON.parse(uiState)

        if (state.viewMode) {
          setViewMode(state.viewMode)
        }
        if (state.poolCardDensity) {
          setPoolCardDensity(state.poolCardDensity)
        }
        if (state.deckCardDensity) {
          setDeckCardDensity(state.deckCardDensity)
        }
        if (state.aspectFilters) {
          // Merge with defaults to ensure all keys exist (prevents uncontrolled->controlled warning)
          setAspectFilters(prev => ({ ...prev, ...state.aspectFilters }))
        }
        if (state.inAspectFilter !== undefined) {
          setInAspectFilter(state.inAspectFilter)
        }
        if (state.outAspectFilter !== undefined) {
          setOutAspectFilter(state.outAspectFilter)
        }
        if (state.poolSortOption) setPoolSortOption(state.poolSortOption)
        else if (state.sortOption) setPoolSortOption(state.sortOption)
        if (state.deckSortOption) setDeckSortOption(state.deckSortOption)
        else if (state.sortOption) setDeckSortOption(state.sortOption)
        if (state.leadersBasesExpanded !== undefined) {
          setLeadersBasesExpanded(state.leadersBasesExpanded)
        }
        if (state.leadersExpanded !== undefined) {
          setLeadersExpanded(state.leadersExpanded)
        }
        if (state.basesExpanded !== undefined) {
          setBasesExpanded(state.basesExpanded)
        }
        if (state.deckExpanded !== undefined) {
          setDeckExpanded(state.deckExpanded)
        }
        if (state.sideboardExpanded !== undefined) {
          setSideboardExpanded(state.sideboardExpanded)
        }
        if (state.deckAspectSectionsExpanded) {
          setDeckAspectSectionsExpanded(state.deckAspectSectionsExpanded)
        }
        if (state.sideboardAspectSectionsExpanded) {
          setSideboardAspectSectionsExpanded(state.sideboardAspectSectionsExpanded)
        }
        if (state.deckCostSectionsExpanded) {
          setDeckCostSectionsExpanded(state.deckCostSectionsExpanded)
        }
        if (state.sideboardCostSectionsExpanded) {
          setSideboardCostSectionsExpanded(state.sideboardCostSectionsExpanded)
        }
        if (state.deckGroupsExpanded) {
          setDeckGroupsExpanded(state.deckGroupsExpanded)
        }
        if (state.poolGroupsExpanded) {
          setPoolGroupsExpanded(state.poolGroupsExpanded)
        }
        if (state.showAspectPenalties !== undefined) {
          setShowAspectPenalties(state.showAspectPenalties)
        } else if (state.showDeckAspectPenalties !== undefined) {
          setShowAspectPenalties(state.showDeckAspectPenalties)
        } else if (state.showPoolAspectPenalties !== undefined) {
          setShowAspectPenalties(state.showPoolAspectPenalties)
        }
        if (state.tableSort) {
          setTableSort(state.tableSort)
        }
        // Restore arena view filters
        if (state.arenaFilters) {
          setArenaFilters(state.arenaFilters)
        }
        if (state.arenaSearchQuery) {
          setArenaSearchQuery(state.arenaSearchQuery)
        }
        if (state.arenaPoolSortOption) {
          setArenaPoolSortOption(state.arenaPoolSortOption)
        }
        if (state.arenaDeckSortOption) {
          setArenaDeckSortOption(state.arenaDeckSortOption)
        }
        // Restore active leader/base from localStorage (backup for debounced database save)
        if (state.activeLeader) {
          setActiveLeader(state.activeLeader)
        }
        if (state.activeBase) {
          setActiveBase(state.activeBase)
        }
        if (state.playShareId) {
          setPlayShareId(state.playShareId)
        }
      }
    } catch (e) {
      console.error('Failed to restore UI state:', e)
    }
  }, [uiStorageKey])

  // Detect when deck-info-bar becomes sticky
  useEffect(() => {
    const infoBar = infoBarRef.current
    if (!infoBar) return

    const checkSticky = () => {
      if (!infoBar) return
      const rect = infoBar.getBoundingClientRect()
      // Trigger sticky mode 120px before it actually sticks (at top: 20px)
      const isSticky = rect.top <= 140
      setIsInfoBarSticky(isSticky)
    }

    // Check on scroll and resize
    const handleScroll = () => requestAnimationFrame(checkSticky)
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll, { passive: true })
    checkSticky() // Initial check

    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
    }
  }, [])

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (modalHoverTimeoutRef.current) {
          clearTimeout(modalHoverTimeoutRef.current)
          modalHoverTimeoutRef.current = null
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])


  // Initialize card positions in sections
  // Can initialize with just pool cards, then enhance when all set cards load
  useEffect(() => {
    // Don't initialize if we have saved state with card positions to restore
    if (savedState) {
      const state = parsedSavedState
      if (state.cardPositions && Object.keys(state.cardPositions).length > 0) {
        return
      }
    }

    // Initialize immediately with pool cards if we have them
    // We only need allSetCards for the common bases, which can be added later
    if (cards.length > 0 && Object.keys(cardPositions).length === 0) {
      const poolCards = cards.filter(card => !card.isBase && !card.isLeader && card.type !== 'Base' && card.type !== 'Leader')
      const poolLeaders = cards.filter(card => card.isLeader || card.type === 'Leader')

      // Get common bases from all set cards
      // For chaos draft/sealed (comma-separated setCode), deduplicate across sets by aspect+HP
      // For single-set sealed, show all Normal variant common bases
      const isMultiSet = setCode.includes(',')
      const commonBases = allSetCards.filter(c =>
        (c.isBase || c.type === 'Base') && c.rarity === 'Common' && c.variantType === 'Normal'
      )
      const uniqueCommonBases = allSetCards.length > 0
        ? (isMultiSet ? deduplicateCommonBases(allSetCards) : commonBases)
        : []

      const initialPositions: Record<string, CardPosition> = {}
      const labels: SectionLabel[] = []
      const bounds: Record<string, SectionBound> = {}
      const cardWidth = 120
      const cardHeight = 168
      const leaderBaseWidth = 168
      const leaderBaseHeight = 120
      const spacing = 20
      const padding = 50
      const sectionSpacing = 20
      const labelHeight = 30
      let currentY = padding

      // Aspect sort helper for bases
      const aspectOrder = ['Vigilance', 'Command', 'Aggression', 'Cunning']
      const getAspectSortValue = (card: CardType) => {
        const aspects = card.aspects || []
        if (aspects.length === 0) return 999
        for (let i = 0; i < aspectOrder.length; i++) {
          if (aspects.includes(aspectOrder[i])) return i
        }
        return 998
      }

      // Get rare bases from pack cards
      const rareBasesFromPacks = cards.filter(card => (card.isBase || card.type === 'Base') && card.rarity === 'Rare')
      const rareBasesMap = new Map<string, CardType>()
      rareBasesFromPacks.forEach(card => {
        const key = card.name || ''
        if (!rareBasesMap.has(key)) {
          rareBasesMap.set(key, card)
        }
      })
      const uniqueRareBases = Array.from(rareBasesMap.values()).sort((a, b) => {
        const aValue = getAspectSortValue(a)
        const bValue = getAspectSortValue(b)
        if (aValue !== bValue) {
          return aValue - bValue
        }
        return (a.name || '').localeCompare(b.name || '')
      })

      // Combine common bases first, then rare bases
      const allBases = [...uniqueCommonBases, ...uniqueRareBases]

      // Combine leaders and bases into one section
      const leadersAndBases = [...poolLeaders, ...allBases]

      if (leadersAndBases.length > 0) {
        const sectionStartY = currentY + labelHeight + 10
        currentY = sectionStartY
        labels.push({ text: 'Leaders & Bases', y: currentY - labelHeight - 5 })
        const itemsPerRow = Math.floor((window.innerWidth - 100) / (leaderBaseWidth + spacing))
        leadersAndBases.forEach((card, index) => {
          const row = Math.floor(index / itemsPerRow)
          const col = index % itemsPerRow
          // Use unique ID that always includes index to handle duplicates
          const cardId = card.isLeader
            ? `leader-${index}-${card.id || `${card.name}-${card.set}`}`
            : `base-${index}-${card.id || `${card.name}-${card.set}`}`
          initialPositions[cardId] = {
            x: padding + col * (leaderBaseWidth + spacing),
            y: currentY + row * (leaderBaseHeight + spacing),
            card: card,
            section: 'leaders-bases',
            visible: true,
            zIndex: 1
          }
        })
        const totalRows = Math.ceil(leadersAndBases.length / itemsPerRow)
        // Calculate end Y as the bottom of the last row of cards (no extra spacing)
        // For last row: (totalRows - 1) rows of spacing + last row's cards
        const sectionEndY = currentY + (totalRows - 1) * (leaderBaseHeight + spacing) + leaderBaseHeight
        bounds['leaders-bases'] = { minY: sectionStartY, maxY: sectionEndY, minX: padding, maxX: window.innerWidth - padding }
        // Start pool section right after leaders/bases with minimal gap (just for label)
        currentY = sectionEndY + 20 // Small gap for visual separation
      }

      if (poolCards.length > 0) {
        // Deck section
        const deckStartY = currentY + labelHeight
        labels.push({ text: 'Deck', y: deckStartY - labelHeight })
        currentY = deckStartY
        const cardsPerRow = Math.floor((window.innerWidth - 100) / (cardWidth + spacing))
        poolCards.forEach((card, index) => {
          const row = Math.floor(index / cardsPerRow)
          const col = index % cardsPerRow
          // Always include index to ensure uniqueness for duplicate cards
          const cardId = `pool-${index}-${card.id || `${card.name}-${card.set}`}`
          initialPositions[cardId] = {
            x: padding + col * (cardWidth + spacing),
            y: currentY + row * (cardHeight + spacing),
            card: card,
            section: 'sideboard', // All cards start in Pool section
            visible: true,
            enabled: false, // Start disabled (in Pool, not Deck)
            zIndex: 1,
            isInfiniteSource: isInfiniteMode,
          }
        })
        const mainRows = Math.ceil(poolCards.length / cardsPerRow)
        const deckEndY = currentY + mainRows * (cardHeight + spacing)
        bounds.deck = { minY: deckStartY, maxY: deckEndY, minX: padding, maxX: window.innerWidth - padding }
        currentY = deckEndY

        // Sideboard section (empty initially, but with space reserved)
        const sideboardStartY = currentY + labelHeight + 10
        labels.push({ text: 'Sideboard', y: sideboardStartY - labelHeight })
        bounds.sideboard = { minY: sideboardStartY, maxY: sideboardStartY + 200, minX: padding, maxX: window.innerWidth - padding }
        currentY = sideboardStartY + 200
      }

      const calculatedHeight = currentY + padding
      setCanvasHeight(calculatedHeight)
      setCardPositions(initialPositions)
      setSectionLabels(labels)
      setSectionBounds(bounds)
    }
  }, [cards, allSetCards, savedState, isInfiniteMode, parsedSavedState])

  // Add common bases when allSetCards loads (even if cardPositions already exist)
  useEffect(() => {
    // Only run if we have allSetCards, cardPositions exist, and we haven't added common bases yet
    if (allSetCards.length > 0 && Object.keys(cardPositions).length > 0 && setCode) {
      // Check if common bases are already in cardPositions
      const hasCommonBases = Object.values(cardPositions).some(
        pos => pos.card.isBase && pos.card.rarity === 'Common'
      )

      // If no common bases found, add them
      if (!hasCommonBases) {
        // Get common bases from all set cards
        // For chaos draft/sealed (comma-separated setCode), deduplicate across sets by aspect+HP
        // For single-set sealed, show all Normal variant common bases
        const isMultiSet = setCode.includes(',')
        const commonBases = allSetCards.filter(c =>
          (c.isBase || c.type === 'Base') && c.rarity === 'Common' && c.variantType === 'Normal'
        )
        const uniqueCommonBases = isMultiSet
          ? deduplicateCommonBases(allSetCards)
          : commonBases

        // Find the leaders-bases section bounds
        const leadersBasesBounds = sectionBounds['leaders-bases']
        if (leadersBasesBounds && uniqueCommonBases.length > 0) {
          const updatedPositions = { ...cardPositions }
          const leaderBaseWidth = 168
          const leaderBaseHeight = 120
          const spacing = 20
          const padding = 50

          // Find existing bases to determine starting position
          const existingBases = Object.values(cardPositions)
            .filter(pos => pos.section === 'leaders-bases' && pos.card.isBase)

          // Calculate starting position: after existing bases or at section start
          let startY = leadersBasesBounds.minY
          let startX = padding
          const itemsPerRow = Math.floor((window.innerWidth - 100) / (leaderBaseWidth + spacing))

          if (existingBases.length > 0) {
            // Find the bottom-right position of existing bases
            const maxY = Math.max(...existingBases.map(pos => pos.y + leaderBaseHeight))
            const maxX = Math.max(...existingBases.map(pos => pos.x + leaderBaseWidth))
            startY = maxY + spacing
            // If we need a new row, reset X
            if (maxX + leaderBaseWidth + spacing > window.innerWidth - padding) {
              startX = padding
            } else {
              startX = maxX + spacing
            }
          }

          // Add common bases
          uniqueCommonBases.forEach((card, index) => {
            const row = Math.floor(index / itemsPerRow)
            const col = index % itemsPerRow
            const cardId = `base-common-${index}-${card.id || `${card.name}-${card.set}`}`

            // Check if this base already exists (avoid duplicates)
            const baseExists = Object.values(cardPositions).some(
              pos => pos.card.isBase && pos.card.name === card.name && pos.card.rarity === 'Common'
            )

            if (!baseExists) {
              updatedPositions[cardId] = {
                x: startX + col * (leaderBaseWidth + spacing),
                y: startY + row * (leaderBaseHeight + spacing),
                card: card,
                section: 'leaders-bases',
                visible: true,
                zIndex: 1
              }
            }
          })

          // Update bounds if needed
          const updatedBounds = { ...sectionBounds }
          if (uniqueCommonBases.length > 0) {
            const totalRows = Math.ceil(uniqueCommonBases.length / itemsPerRow)
            const newMaxY = startY + (totalRows - 1) * (leaderBaseHeight + spacing) + leaderBaseHeight
            if (updatedBounds['leaders-bases']) {
              updatedBounds['leaders-bases'].maxY = Math.max(updatedBounds['leaders-bases'].maxY, newMaxY)
            }
          }

          setCardPositions(updatedPositions)
          setSectionBounds(updatedBounds)
        }
      }
    }
  }, [allSetCards, cardPositions, sectionBounds, setCode])

  // Check if starter leaders are available and not already in pool
  const starterLeadersAvailable = useMemo(() => {
    if (!allSetCards.length || !setCode) return []
    // Starter-deck leaders are the (usually 2) Special-rarity leaders per set.
    // They aren't in booster packs, so the "+ Starter Leaders" button injects
    // them on demand. Each is printed in several variants; pick ONE canonical
    // copy per leader, preferring Hyperspace, then Normal, then Showcase.
    // Sets without a Hyperspace printing (e.g. ASH, SOR, SHD, TWI) resolve to a
    // Normal/Showcase copy, so the button works for every set rather than only
    // the ones that happen to have Hyperspace starter-leader data.
    const variantRank = { Hyperspace: 0, Normal: 1, Showcase: 2 }
    const bestByName = new Map()
    for (const c of allSetCards) {
      if (c.rarity !== 'Special' || c.type !== 'Leader' || c.set !== setCode) continue
      const existing = bestByName.get(c.name)
      const rank = variantRank[c.variantType] ?? 99
      if (!existing || rank < (variantRank[existing.variantType] ?? 99)) {
        bestByName.set(c.name, c)
      }
    }
    return Array.from(bestByName.values())
  }, [allSetCards, setCode])

  const hasStarterLeaders = useMemo(() => {
    // Starter leaders are injected under deterministic `leader-starter-*` keys
    // (see addStarterLeaders / removeStarterLeaders). Detect by that key prefix
    // so the toggle works regardless of which variant was injected.
    return Object.keys(cardPositions).some(key => key.startsWith('leader-starter-'))
  }, [cardPositions])

  // Function to add starter leaders to the pool
  const addStarterLeaders = useCallback(() => {
    if (!starterLeadersAvailable.length || hasStarterLeaders) return

    const leadersBasesBounds = sectionBounds['leaders-bases']
    if (!leadersBasesBounds) return

    const updatedPositions = { ...cardPositions }
    const leaderBaseWidth = 168
    const leaderBaseHeight = 120
    const spacing = 20
    const padding = 50

    // Find existing leaders to determine starting position
    const existingLeaders = Object.values(cardPositions)
      .filter(pos => pos.section === 'leaders-bases' && pos.card.isLeader)

    const itemsPerRow = Math.floor((window.innerWidth - 100) / (leaderBaseWidth + spacing))

    // Calculate where to insert new leaders (after existing leaders)
    const leaderCount = existingLeaders.length
    const startIndex = leaderCount

    starterLeadersAvailable.forEach((card, i) => {
      const index = startIndex + i
      const row = Math.floor(index / itemsPerRow)
      const col = index % itemsPerRow
      const cardId = `leader-starter-${i}-${card.id || `${card.name}-${card.set}`}`

      updatedPositions[cardId] = {
        x: padding + col * (leaderBaseWidth + spacing),
        y: leadersBasesBounds.minY + row * (leaderBaseHeight + spacing),
        card: { ...card, isLeader: true },
        section: 'leaders-bases',
        visible: true,
        zIndex: 1
      }
    })

    setCardPositions(updatedPositions)
  }, [starterLeadersAvailable, hasStarterLeaders, cardPositions, sectionBounds])

  // Function to remove starter leaders from the pool
  const removeStarterLeaders = useCallback(() => {
    const updatedPositions = { ...cardPositions }
    // Remove any leader-starter-* entries
    Object.keys(updatedPositions).forEach(key => {
      if (key.startsWith('leader-starter-')) {
        // If this was the active leader, deselect it
        if (activeLeader === key) {
          setActiveLeader(null)
        }
        delete updatedPositions[key]
      }
    })
    setCardPositions(updatedPositions)
  }, [cardPositions, activeLeader])

  // Combined toggle for starter leaders
  const toggleStarterLeaders = useCallback(() => {
    if (hasStarterLeaders) {
      removeStarterLeaders()
    } else {
      addStarterLeaders()
    }
  }, [hasStarterLeaders, removeStarterLeaders, addStarterLeaders])

  const starterLeadersToggleHandler = !isInfiniteMode && !isDraftStyleMode && starterLeadersAvailable.length > 0
    ? toggleStarterLeaders
    : undefined

  const buildDeckStateSnapshot = useCallback((includeUiState = false) => {
    const deckCardIds = Object.entries(cardPositions)
      .filter(([_, pos]) => pos.section === 'deck')
      .map(([cardId]) => cardId)

    const sideboardCardIds = Object.entries(cardPositions)
      .filter(([_, pos]) => pos.section === 'sideboard')
      .map(([cardId]) => cardId)

    const baseState: Record<string, unknown> = {
      cardPositions: Object.keys(cardPositions).length > 0 ? cardPositions : {},
      sectionLabels,
      sectionBounds,
      canvasHeight,
      activeLeader,
      activeBase,
      deckCardIds,
      sideboardCardIds,
      poolName: currentPoolName,
      isDefaultName,
      sessionId: currentSessionId,
    }

    if (isInfiniteMode) {
      baseState.isInfinitePool = true
      baseState.playShareId = playShareId
    }

    if (!includeUiState) {
      return baseState
    }

    return {
      ...baseState,
      viewMode,
      aspectFilters,
      inAspectFilter,
      outAspectFilter,
      poolSortOption,
      deckSortOption,
      poolCardDensity,
      deckCardDensity,
      leadersBasesExpanded,
      leadersExpanded,
      basesExpanded,
      deckExpanded,
      sideboardExpanded,
      deckAspectSectionsExpanded,
      sideboardAspectSectionsExpanded,
      deckCostSectionsExpanded,
      sideboardCostSectionsExpanded,
      deckGroupsExpanded,
      poolGroupsExpanded,
      showAspectPenalties,
      showDeckAspectPenalties: showAspectPenalties,
      showPoolAspectPenalties: showAspectPenalties,
      tableSort,
      arenaFilters,
      arenaSearchQuery,
      arenaPoolSortOption,
    arenaDeckSortOption,
    }
  }, [
    cardPositions,
    sectionLabels,
    sectionBounds,
    canvasHeight,
    activeLeader,
    activeBase,
    currentPoolName,
    currentSessionId,
    isInfiniteMode,
    playShareId,
    viewMode,
    aspectFilters,
    inAspectFilter,
    outAspectFilter,
    poolSortOption,
    deckSortOption,
    poolCardDensity,
    deckCardDensity,
    leadersBasesExpanded,
    leadersExpanded,
    basesExpanded,
    deckExpanded,
    sideboardExpanded,
    deckAspectSectionsExpanded,
    sideboardAspectSectionsExpanded,
    deckCostSectionsExpanded,
    sideboardCostSectionsExpanded,
    deckGroupsExpanded,
    poolGroupsExpanded,
    showAspectPenalties,
    tableSort,
    arenaFilters,
    arenaSearchQuery,
    arenaPoolSortOption,
    arenaDeckSortOption,
  ])

  const buildDeckBuilderState = useMemo(
    () => getBuildDeckBuilderState(buildDeckStateSnapshot(false), savedState),
    [buildDeckStateSnapshot, savedState]
  )

  // Save deck builder state to localStorage whenever it changes
  useEffect(() => {
    if (!shareId && !localStorageKey) return

    // Save state if we have card positions OR if leader/base selection changes
    if (Object.keys(cardPositions).length > 0 || activeLeader || activeBase) {
      const deckStateToSave = buildDeckStateSnapshot(false)
      const uiStateToSave = {
        ...buildDeckBuilderUiStorageState(buildDeckStateSnapshot(true)),
        lastSavedAt: Date.now()
      }

      if (uiStorageKey) {
        safeLocalStorageSetItem(uiStorageKey, JSON.stringify(uiStateToSave))
      }

      if (localStorageKey) {
        safeLocalStorageSetItem(localStorageKey, JSON.stringify(deckStateToSave))
      }

      // Save deck state to database via callback.
      // During the initial settle window we treat every fire as hydration —
      // owners save their loaded state through, non-owners are silently ignored.
      // After the window, any change for a non-owner pops the lock modal.
      if (!lockReadyRef.current) {
        if (onStateChange && isOwner) onStateChange(deckStateToSave)
        return
      }
      // Non-owner attempting to edit a locked deck → show the fork modal.
      // Only show for pools that actually have an owner (so we have someone to lock to)
      // and for pool-mode (not sealed-pod live drafts which use other auth).
      if (!isOwner && poolOwnerId) {
        setLockModalOpen(true)
        return
      }
      if (onStateChange) {
        onStateChange(deckStateToSave)
      }
    }
  }, [shareId, localStorageKey, uiStorageKey, cardPositions, activeLeader, activeBase, onStateChange, buildDeckStateSnapshot, isOwner, poolOwnerId])

  // Cleanup: Remove any bases/leaders from deck/sideboard sections and move cards based on enabled state
  useEffect(() => {
    setCardPositions(prev => {
      let hasChanges = false
      const updated = { ...prev }
      const toRemove: string[] = []

      Object.keys(updated).forEach(cardId => {
        const pos = updated[cardId]
        // Remove bases and leaders from deck/sideboard sections
        if ((pos.section === 'deck' || pos.section === 'sideboard') && (pos.card.isBase || pos.card.isLeader)) {
          toRemove.push(cardId)
          hasChanges = true
          return
        }

        if (isInfiniteMode && pos.isInfiniteDeckCopy) {
          if (pos.section !== 'deck' || pos.enabled !== true) {
            updated[cardId] = {
              ...pos,
              isInfiniteSource: false,
              section: 'deck',
              enabled: true
            }
            hasChanges = true
          }
          return
        }

        if (isInfiniteMode && pos.isInfiniteSource) {
          if (pos.section !== 'sideboard' || pos.enabled !== false) {
            updated[cardId] = {
              ...pos,
              section: 'sideboard',
              enabled: false
            }
            hasChanges = true
          }
          return
        }

        // Move cards between deck and sideboard based on enabled state
        if (pos.section === 'deck' || pos.section === 'sideboard') {
          const isEnabled = pos.enabled !== false
          const shouldBeInDeck = isEnabled

          if (shouldBeInDeck && pos.section === 'sideboard') {
            // Move from sideboard to deck (card is enabled)
            updated[cardId] = {
              ...pos,
              section: 'deck',
              enabled: true
            }
            hasChanges = true
          } else if (!shouldBeInDeck && pos.section === 'deck') {
            // Move from deck to sideboard (card is disabled)
            updated[cardId] = {
              ...pos,
              section: 'sideboard',
              enabled: false
            }
            hasChanges = true
          }
        }
      })

      // Remove invalid cards
      toRemove.forEach(cardId => {
        delete updated[cardId]
      })

      // Only return new object if something changed, otherwise keep same reference
      return hasChanges ? updated : prev
    })
  }, [isInfiniteMode])

  // Filter state is now pure visibility (no side effects on card positions).
  // The previous sync effect that moved cards between deck/sideboard based on filter state
  // has been removed; cards stay where the user puts them, filtering only changes rendering.

  // Determine pool/deck order once on initial load (draft mode only)
  // If pool has more cards, show it first; otherwise show deck first
  useEffect(() => {
    if (poolFirstOrder !== null) return // Already determined

    // Wait until cards prop has loaded (indicates pool data is available)
    if (!cards || cards.length === 0) return

    if (!isDraftMode) {
      setPoolFirstOrder(false) // Sealed mode: deck always first
      return
    }

    // Get all non-leader/base cards from cardPositions
    const allPoolDeckCards = Object.values(cardPositions).filter(
      pos => !pos.card.isLeader && !pos.card.isBase &&
             pos.card.type !== 'Leader' && pos.card.type !== 'Base' &&
             (pos.section === 'deck' || pos.section === 'sideboard')
    )

    // Wait until we have cards in cardPositions (after initialization/restoration)
    if (allPoolDeckCards.length < 10) return

    const poolCards = allPoolDeckCards.filter(
      pos => pos.section === 'sideboard' || pos.enabled === false
    )
    const deckCards = allPoolDeckCards.filter(
      pos => pos.section === 'deck' && pos.enabled !== false
    )

    setPoolFirstOrder(poolCards.length > deckCards.length)
  }, [cards, cardPositions, isDraftMode, poolFirstOrder, poolType])

  // Apply sorting - separate deck and sideboard
  // Note: This effect handles card positioning for canvas view
  // In grid/block view, sorting is handled directly in rendering
  useEffect(() => {
    if (deckSortOption === 'aspect' && poolSortOption === 'aspect') return // Aspect sorting is handled in rendering, not here

    setCardPositions(prev => {
      // Separate deck and sideboard cards
      const deckCards = Object.entries(prev)
        .filter(([_, pos]) => pos.section === 'deck' && pos.visible && !pos.card.isBase && !pos.card.isLeader && pos.enabled !== false)
        .map(([id, pos]) => ({ id, ...pos }))

      const sideboardCards = Object.entries(prev)
        .filter(([_, pos]) => (pos.section === 'sideboard' || pos.enabled === false) && pos.visible && !pos.card.isBase && !pos.card.isLeader)
        .map(([id, pos]) => ({ id, ...pos }))

      // Get sorted deck cards (only deck section)
      // Note: No longer filtering - cards are moved between deck/sideboard via filter checkboxes
      const deckSorted = deckCards
        .map(({ card }) => card)
      const sortedDeckIds = deckSorted.map(card => {
        const entry = deckCards.find(({ card: c }) => c.id === card.id || c.name === card.name)
        return entry?.id
      }).filter(Boolean) as string[]

      // Get sorted sideboard cards
      // Note: No longer filtering - cards are moved between deck/sideboard via filter checkboxes
      const sideboardSorted = sideboardCards
        .map(({ card }) => card)
      const sortedSideboardIds = sideboardSorted.map(card => {
        const entry = sideboardCards.find(({ card: c }) => c.id === card.id || c.name === card.name)
        return entry?.id
      }).filter(Boolean) as string[]

      const updated = { ...prev }
      const cardWidth = 120
      const cardHeight = 168
      const spacing = 20
      const padding = 50
      const sectionSpacing = 80
      const cardsPerRow = Math.floor((window.innerWidth - 100) / (cardWidth + spacing))

      // Get deck section bounds
      const deckBounds = sectionBounds.deck || { minY: padding, maxY: padding + 500, minX: padding, maxX: window.innerWidth - padding }
      let deckY = deckBounds.minY

      // Get sideboard section bounds (after deck)
      const sideboardStartY = deckBounds.maxY + sectionSpacing + 30
      let sideboardY = sideboardStartY

      // Helper function to sort cards based on a sort option
      // Get leader and base for penalty calculation
      const leaderCardSort = activeLeader && updated[activeLeader] ? updated[activeLeader].card : null
      const baseCardSort = activeBase && updated[activeBase] ? updated[activeBase].card : null
      const getEffectiveCost = (card: CardType, includeAspectPenalties: boolean) => {
        const baseCost = card.cost || 0
        const penalty = (includeAspectPenalties && leaderCardSort && baseCardSort) ? calculateAspectPenalty(card, leaderCardSort, baseCardSort) : 0
        return baseCost + penalty
      }
      const sortCards = (cards: CardType[], sortOpt: string, includeAspectPenalties: boolean) => {
        if (sortOpt === 'cost') {
          return [...cards].sort((a, b) => getEffectiveCost(a, includeAspectPenalties) - getEffectiveCost(b, includeAspectPenalties))
        } else if (sortOpt === 'aspect') {
          // Sort by aspect key directly
          return [...cards].sort((a, b) => {
            const keyA = getAspectKey(a)
            const keyB = getAspectKey(b)
            return keyA.localeCompare(keyB)
          })
        } else if (sortOpt === 'type') {
          return [...cards].sort((a, b) => {
            const aOrder = getTypeStringOrder(a.type || '')
            const bOrder = getTypeStringOrder(b.type || '')
            if (aOrder !== bOrder) return aOrder - bOrder
            return getEffectiveCost(a, includeAspectPenalties) - getEffectiveCost(b, includeAspectPenalties)
          })
        }
        return cards
      }

      // Helper function to position cards in a section
      const positionCards = (cardIds: string[], startY: number, sectionName: string, sortOpt: string, includeAspectPenalties: boolean) => {
        if (cardIds.length === 0) return startY

        const cards = cardIds.map(id => updated[id]?.card).filter(Boolean) as CardType[]
        const sortedCards = sortCards(cards, sortOpt, includeAspectPenalties)
        const sortedCardIds = sortedCards.map(card => {
          return cardIds.find(id => {
            const c = updated[id]?.card
            return c && (c.id === card.id || c.name === card.name)
          })
        }).filter(Boolean) as string[]

      if (sortOpt === 'cost') {
        // Vertical columns by cost
        const costGroups: Record<number, string[]> = {}
        // Get leader and base for penalty calculation
        const leaderCard = activeLeader && updated[activeLeader] ? updated[activeLeader].card : null
        const baseCard = activeBase && updated[activeBase] ? updated[activeBase].card : null
          sortedCardIds.forEach(cardId => {
            const card = updated[cardId]?.card
            if (!card) return
          const baseCost = card.cost || 0
          const penalty = (includeAspectPenalties && leaderCard && baseCard) ? calculateAspectPenalty(card, leaderCard, baseCard) : 0
          const cost = baseCost + penalty
          if (!costGroups[cost]) costGroups[cost] = []
            costGroups[cost].push(cardId)
        })

        let col = 0
          let maxRow = 0
        Object.keys(costGroups).sort((a, b) => Number(a) - Number(b)).forEach(cost => {
            costGroups[Number(cost)].forEach((cardId, idx) => {
              if (updated[cardId]) {
              const row = idx
                maxRow = Math.max(maxRow, row)
              updated[cardId] = {
                ...updated[cardId],
                x: padding + col * (cardWidth + spacing),
                  y: startY + row * (cardHeight + spacing),
                  section: sectionName
              }
            }
          })
          col++
        })
          return startY + (maxRow + 1) * (cardHeight + spacing)
      } else if (sortOpt === 'aspect') {
        // Group by aspect combination
        const aspectGroups: Record<string, string[]> = {}
          sortedCardIds.forEach(cardId => {
            const card = updated[cardId]?.card
            if (!card) return
          const key = getAspectKey(card)
          if (!aspectGroups[key]) aspectGroups[key] = []
            aspectGroups[key].push(cardId)
        })

          let currentY = startY
        const sortedKeys = Object.keys(aspectGroups).sort()
        sortedKeys.forEach(key => {
          const group = aspectGroups[key]
            group.forEach((cardId, idx) => {
              if (updated[cardId]) {
              updated[cardId] = {
                ...updated[cardId],
                  x: padding,
                  y: currentY + idx * (cardHeight + spacing),
                  section: sectionName
              }
            }
          })
          const groupHeight = group.length * (cardHeight + spacing)
          currentY += groupHeight + sectionSpacing
        })
          return currentY
      } else {
          // Grid layout - compact layout (fill gaps)
          sortedCardIds.forEach((cardId, index) => {
          if (cardId && updated[cardId]) {
            const row = Math.floor(index / cardsPerRow)
            const col = index % cardsPerRow
            updated[cardId] = {
              ...updated[cardId],
              x: padding + col * (cardWidth + spacing),
                y: startY + row * (cardHeight + spacing),
                section: sectionName
              }
            }
          })
          const rows = Math.ceil(sortedCardIds.length / cardsPerRow)
          return startY + rows * (cardHeight + spacing)
        }
      }

      // Position deck cards using deckSortOption
      const deckEndY = positionCards(sortedDeckIds, deckY, 'deck', deckSortOption, showAspectPenalties)

      // Position sideboard cards using poolSortOption
      const sideboardEndY = positionCards(sortedSideboardIds, sideboardY, 'sideboard', poolSortOption, showAspectPenalties)

      // Update section bounds and canvas height
      const newDeckBounds = { ...deckBounds, maxY: deckEndY }
      const newSideboardBounds = { minY: sideboardY, maxY: sideboardEndY, minX: padding, maxX: window.innerWidth - padding }

      setSectionBounds(prev => ({
        ...prev,
        deck: newDeckBounds,
        sideboard: newSideboardBounds
      }))

      // Update canvas height to include both sections
      const maxY = Math.max(deckEndY, sideboardEndY)
      setCanvasHeight(maxY + padding)

      return updated
    })
    // Note: sectionBounds intentionally excluded - this effect writes to it, including it would cause infinite loop
    // Note: cardMatchesFilters excluded - it depends on cardPositions which this effect writes to
  }, [deckSortOption, poolSortOption, getAspectKey, showAspectPenalties, activeLeader, activeBase])


  // Mark the last block in each row to expand
  useEffect(() => {
    if (!deckExpanded || !deckBlocksRowRef.current) return

    const markLastInRow = () => {
      const blocks = deckBlocksRowRef.current?.querySelectorAll('.card-block')
      if (!blocks || blocks.length === 0) return

      // Remove previous markers
      blocks.forEach(block => block.classList.remove('last-in-row'))

      // Group blocks by row (same top position)
      const rows = new Map<number, Element[]>()
      blocks.forEach((block) => {
        const rect = block.getBoundingClientRect()
        const top = Math.round(rect.top)
        if (!rows.has(top)) {
          rows.set(top, [])
        }
        rows.get(top)!.push(block)
      })

      // Mark the last block in each row
      rows.forEach((rowBlocks) => {
        if (rowBlocks.length > 0) {
          rowBlocks[rowBlocks.length - 1].classList.add('last-in-row')
        }
      })
    }

    // Run after a short delay to ensure layout is complete
    const timeoutId = setTimeout(markLastInRow, 100)

    // Also run on resize
    window.addEventListener('resize', markLastInRow)

    return () => {
      clearTimeout(timeoutId)
      window.removeEventListener('resize', markLastInRow)
    }
  }, [deckExpanded, cardPositions, deckSortOption])

  // Table sorting functions - per section
  const handleTableSort = (sectionId: string, field: string) => {
    setTableSort(prev => {
      const sectionSort = prev[sectionId] || { field: null, direction: 'asc' as const }
      if (sectionSort.field === field) {
        return {
          ...prev,
          [sectionId]: { field, direction: sectionSort.direction === 'asc' ? 'desc' as const : 'asc' as const }
        }
      }
      return {
        ...prev,
        [sectionId]: { field, direction: 'asc' as const }
      }
    })
  }

  // Default sort for table view: group by aspect, then cost, then name (no type step).
  const defaultSort = (a: CardType, b: CardType) => {
    const aspectCmp = getAspectSortKey(a).localeCompare(getAspectSortKey(b))
    if (aspectCmp !== 0) return aspectCmp
    return compareByCostName(a, b)
  }

  const sortTableData = (a: CardType, b: CardType, field: string, direction: 'asc' | 'desc') => {
    let aVal: string | number, bVal: string | number

    switch (field) {
      case 'name':
        aVal = (a.name || '').toLowerCase()
        bVal = (b.name || '').toLowerCase()
        break
      case 'cost':
        aVal = a.cost !== null && a.cost !== undefined ? a.cost : -1
        bVal = b.cost !== null && b.cost !== undefined ? b.cost : -1
        break
      case 'aspects':
        aVal = (a.aspects || []).join(', ').toLowerCase()
        bVal = (b.aspects || []).join(', ').toLowerCase()
        break
      case 'rarity':
        const rarityOrder: Record<string, number> = { 'Common': 1, 'Uncommon': 2, 'Rare': 3, 'Legendary': 4 }
        aVal = rarityOrder[a.rarity || ''] || 0
        bVal = rarityOrder[b.rarity || ''] || 0
        break
      default:
        return 0
    }

    if (aVal < bVal) return direction === 'asc' ? -1 : 1
    if (aVal > bVal) return direction === 'asc' ? 1 : -1
    return 0
  }

  // Extract the card number from an ID like "SEC-246" or "SEC_1002"
  // Build base card map for the current set (memoized)
  // Uses the robust utility that filters by variantType === 'Normal'
  const baseCardMap = useMemo(() => {
    return buildBaseCardMapUtil(setCode)
  }, [setCode])

  // Get base card ID for export (converts variants to Normal equivalent)
  const getBaseCardId = useCallback((card: CardType) => {
    return getBaseCardIdUtil(card, baseCardMap)
  }, [baseCardMap])

  // Export functions (JSON, clipboard, image)
  const { exportJSON, copyJSON, exportDeckImage, exportPoolImage } = useDeckExport({
    cardPositions,
    activeLeader,
    activeBase,
    leaderCard,
    baseCard,
    allSetCards,
    setCode,
    poolType,
    currentPoolName,
    poolOwnerUsername,
    setErrorMessage,
    setMessageType,
    setDeckImageModal,
    shareId,
    rootShareId,
  })

  const packArtUrl = setCode ? getPackArtUrl(setCode) : null
  const setArtStyle = packArtUrl ? {
    backgroundImage: `url("${packArtUrl}")`,
    backgroundSize: 'cover',
    backgroundPosition: 'center center',
  } : {}

  // Loading state - show skeletons while view mode initializes or cards load
  const isLoading = !viewModeInitialized || cards.length === 0

  const handleDeleteLimitedDeck = useCallback(async () => {
    if (playShareId) {
      await deletePool(playShareId)
    }

    if (localStorageKey) {
      localStorage.removeItem(localStorageKey)
    }
    if (uiStorageKey) {
      localStorage.removeItem(uiStorageKey)
    }
    window.location.href = '/'
  }, [playShareId, localStorageKey, uiStorageKey])

  const handlePlay = useCallback(async () => {
    if (isInfiniteMode && onRequestPlay) {
      try {
        setErrorMessage('Preparing play...')
        setMessageType('success')

        const deckBuilderState = buildDeckStateSnapshot(false)
        const nextShareId = await onRequestPlay(deckBuilderState)

        if (!nextShareId) {
          throw new Error('Failed to create play pool')
        }

        const updatedState = {
          ...buildDeckStateSnapshot(true),
          playShareId: nextShareId,
          isInfinitePool: true,
        }
        const updatedDeckState = {
          ...buildDeckStateSnapshot(false),
          playShareId: nextShareId,
          isInfinitePool: true,
        }

        setPlayShareId(nextShareId)
        if (localStorageKey) {
          safeLocalStorageSetItem(localStorageKey, JSON.stringify(updatedDeckState))
        }
        if (uiStorageKey) {
          safeLocalStorageSetItem(uiStorageKey, JSON.stringify({
            ...buildDeckBuilderUiStorageState(updatedState),
            lastSavedAt: Date.now()
          }))
        }

        window.location.href = `/pool/${nextShareId}/deck/play`
      } catch (err) {
        console.error('Failed to open play mode:', err)
        setErrorMessage(err instanceof Error ? err.message : 'Failed to open play mode')
        setMessageType('error')
        setTimeout(() => {
          setErrorMessage(null)
          setMessageType(null)
        }, 3000)
      }
      return
    }

    if (shouldBuildFromSharedPool({ isInfiniteMode, isOwner, shareId, draftShareId })) {
      try {
        setErrorMessage('Setting up your build...')
        setMessageType('success')

        // Idempotent reuse: the server doesn't dedup, but the auto-build-on-Play
        // path should not mint a new build on every Play tap. Look up any
        // existing non-original build owned by this user under the same parent.
        // If found, navigate to its play URL; otherwise create a fresh one.
        const existing = await fetchUserBuild(shareId, currentUserId || null)
        if (existing?.shareId) {
          window.location.href = `/pool/${existing.shareId}/deck/play`
          return
        }

        const builtPool = await savePool({
          setCode,
          cards,
          packs: null,
          deckBuilderState: buildDeckBuilderState,
          poolType,
          name: getBuildName(currentPoolName, null),
          isPublic: false,
          parentPoolId: shareId,
        })

        window.location.href = `/pool/${builtPool.shareId}/deck/play`
      } catch (err) {
        console.error('Failed to create build for play:', err)
        setErrorMessage(err instanceof Error ? err.message : 'Failed to create build')
        setMessageType('error')
        setTimeout(() => {
          setErrorMessage(null)
          setMessageType(null)
        }, 3000)
      }
      return
    }

    // Competitive/Swiss uses the single play URL (which renders the Swiss
    // Practice panel) for BOTH draft and sealed pods; the /pod hubs are only
    // for casual pods.
    const destination = resolvePlayDestination({
      poolType,
      podShareId: draftShareId,
      competitive,
      shareId,
    })
    if (destination) {
      window.location.href = destination
    }
  }, [
    isInfiniteMode,
    onRequestPlay,
    buildDeckStateSnapshot,
    isOwner,
    localStorageKey,
    uiStorageKey,
    draftShareId,
    competitive,
    shareId,
    setCode,
    cards,
    buildDeckBuilderState,
    poolType,
    currentPoolName,
    currentUserId,
  ])

  // Fork the current pool into a new child build owned by the current user.
  // Triggered from the lock modal when a non-owner attempts to edit. It's a
  // "Start New Deck", so the fork keeps the pool but not the locked deck: no
  // cards in the deck, no leader/base selected.
  const handleStartNewBuildFromLock = useCallback(async () => {
    if (forkInProgress) return
    if (!isAuthenticated) {
      setLockModalOpen(false)
      signIn()
      return
    }
    setForkInProgress(true)
    try {
      const parentId = rootShareId || shareId
      const builtPool = await savePool({
        setCode,
        cards,
        packs: null,
        deckBuilderState: getNewBuildDeckBuilderState(buildDeckBuilderState),
        poolType,
        name: null,
        isPublic: false,
        parentPoolId: parentId,
      })
      window.location.href = `/pool/${parentId}/deck/${builtPool.shareId}`
    } catch (err) {
      console.error('Failed to start new build from locked deck:', err)
      setErrorMessage(err instanceof Error ? err.message : 'Failed to create build')
      setMessageType('error')
      setForkInProgress(false)
      setLockModalOpen(false)
      setTimeout(() => {
        setErrorMessage(null)
        setMessageType(null)
      }, 3000)
    }
  }, [forkInProgress, isAuthenticated, signIn, rootShareId, shareId, setCode, cards, buildDeckBuilderState, poolType])

  // Swiss Practice lock: hand children NO-OP mutators so card moves, leader/base
  // changes and reordering are all frozen. View/sort/filter setters are untouched.
  const lockedSetCardPositions = useCallback((value) => {
    if (swissLocked) return
    setCardPositions(value)
  }, [swissLocked])
  const lockedSetActiveLeader = useCallback((value) => {
    if (swissLocked) return
    setActiveLeader(value)
  }, [swissLocked])
  const lockedSetActiveBase = useCallback((value) => {
    if (swissLocked) return
    setActiveBase(value)
  }, [swissLocked])

  // Context value for child components
  const contextValue = useMemo(() => ({
    // Core state
    cardPositions,
    setCardPositions: lockedSetCardPositions,
    isInfiniteMode,
    activeLeader,
    setActiveLeader: lockedSetActiveLeader,
    activeBase,
    setActiveBase: lockedSetActiveBase,
    // Derived cards
    leaderCard,
    baseCard,
    // Selection
    selectedCards,
    setSelectedCards,
    hoveredCard,
    setHoveredCard,
    // Filter state
    filterAspectsExpanded,
    setFilterAspectsExpanded,
    deckFilterOpen,
    setDeckFilterOpen,
    poolFilterOpen,
    setPoolFilterOpen,
    // Filter visibility state (for grey-out, not card movement)
    aspectFilters,
    setAspectFilters,
    inAspectFilter,
    setInAspectFilter,
    outAspectFilter,
    setOutAspectFilter,
    cardMatchesFilters,
    // UI preferences
    showAspectPenalties,
    setShowAspectPenalties,
    showDeckAspectPenalties: showAspectPenalties,
    setShowDeckAspectPenalties: setShowAspectPenalties,
    showPoolAspectPenalties: showAspectPenalties,
    setShowPoolAspectPenalties: setShowAspectPenalties,
    viewMode,
    setViewMode,
    poolSortOption,
    setPoolSortOption,
    deckSortOption,
    setDeckSortOption,
    // Arena view state
    arenaFilters,
    setArenaFilters,
    arenaSearchQuery,
    setArenaSearchQuery,
    arenaPoolSortOption,
    setArenaPoolSortOption,
    arenaDeckSortOption,
    setArenaDeckSortOption,
    // Card density (applies to arena + playmat)
    poolCardDensity,
    setPoolCardDensity,
    deckCardDensity,
    setDeckCardDensity,
    // Actions
    moveCardToDeck,
    moveCardToPool,
    toggleCardSection,
    moveCardsToDeck,
    moveCardsToPool,
  }), [
    cardPositions, isInfiniteMode, activeLeader, activeBase, leaderCard, baseCard,
    selectedCards, hoveredCard, filterAspectsExpanded, deckFilterOpen,
    poolFilterOpen, showAspectPenalties, viewMode, poolSortOption,
    deckSortOption, arenaFilters, arenaSearchQuery, arenaPoolSortOption,
    arenaDeckSortOption,
    aspectFilters, inAspectFilter, outAspectFilter, cardMatchesFilters,
    poolCardDensity, deckCardDensity,
    moveCardToDeck, moveCardToPool, toggleCardSection, moveCardsToDeck, moveCardsToPool,
    lockedSetCardPositions, lockedSetActiveLeader, lockedSetActiveBase,
  ])

  return (
    <DeckBuilderContext.Provider value={contextValue}>
    <div className="deck-builder" ref={containerRef}>
      <div className={`set-art-header${packArtUrl ? '' : ' skeleton'}`} style={setArtStyle}></div>
      <div className="deck-builder-content">
        <DeckBuilderHeader
          currentPoolName={currentPoolName}
          onRenamePool={handleRenamePool}
          isOwner={isOwner}
          isDraftMode={isDraftMode}
          isInfiniteMode={isInfiniteMode}
          isInfoBarSticky={isInfoBarSticky}
          isAuthenticated={isAuthenticated}
          signIn={signIn}
          shareId={shareId}
          cardPositions={cardPositions}
          activeLeader={activeLeader}
          activeBase={activeBase}
          setCode={setCode}
          cards={cards}
          savedState={buildDeckBuilderState}
          poolType={poolType}
          errorMessage={errorMessage}
          setErrorMessage={setErrorMessage}
          messageType={messageType}
          setMessageType={setMessageType}
          draftShareId={draftShareId}
          isLoading={isLoading}
          isPatron={isPatron}
          deckBuildDeadline={deckBuildDeadline}
          onPlay={handlePlay}
          rootShareId={rootShareId}
          currentUserId={currentUserId}
          subtitleOverride={isDefaultName ? (poolOwnerUsername ? `by ${poolOwnerUsername}` : null) : canonicalSubtitle}
          competitive={competitive}
          swissLocked={swissLocked}
          swissCanUnlock={swissCanUnlock}
          onToggleSwissLock={onToggleSwissLock}
          swissUnlocked={swissUnlocked}
          swissInProgress={swissInProgress}
        />

      {/* Selected Leader/Base and Deck/Sideboard Info - Sticky Bar */}
      <StickyInfoBar
        infoBarRef={infoBarRef}
        isInfoBarSticky={isInfoBarSticky}
        activeLeader={activeLeader}
        activeBase={activeBase}
        cardPositions={cardPositions}
        leadersExpanded={leadersExpanded}
        setLeadersExpanded={setLeadersExpanded}
        basesExpanded={basesExpanded}
        setBasesExpanded={setBasesExpanded}
        deckExpanded={deckExpanded}
        setDeckExpanded={setDeckExpanded}
        sideboardExpanded={sideboardExpanded}
        setSideboardExpanded={setSideboardExpanded}
        onCardMouseEnter={handleCardMouseEnter}
        onCardMouseLeave={handleCardMouseLeave}
        onCardTouchStart={handleCardTouchStart}
        onCardTouchEnd={handleCardTouchEnd}
        isDraftMode={isDraftMode}
        isInfiniteMode={isInfiniteMode}
        isOwner={isOwner}
        isAuthenticated={isAuthenticated}
        signIn={signIn}
        shareId={shareId}
        draftShareId={draftShareId}
        setErrorMessage={setErrorMessage}
        setMessageType={setMessageType}
        setCode={setCode}
        cards={cards}
        savedState={buildDeckBuilderState}
        poolType={poolType}
        currentPoolName={currentPoolName}
        builderLabel={(rootShareId && shareId && shareId !== rootShareId) ? (poolOwnerUsername || 'Anonymous') : 'Original'}
        viewMode={viewMode}
        setViewMode={setViewMode}
        showNavTooltip={showNavTooltip}
        hideTooltip={hideTooltip}
        onPlay={handlePlay}
        deckBuildDeadline={deckBuildDeadline}
        swissLocked={swissLocked}
        swissUnlocked={swissUnlocked}
      />

      {/* View mode toggle - hidden when sticky (shown in nav bar instead) */}
      {!isInfoBarSticky && (
        <ViewModeToggle
          viewMode={viewMode}
          setViewMode={setViewMode}
          showNavTooltip={showNavTooltip}
          hideTooltip={hideTooltip}
        />
      )}

      {/* Grid View */}
      {viewMode === 'grid' && (
        <div className="blocks-container">
          <CollapsibleSectionHeader
            title="Leaders & Bases"
            expanded={leadersBasesExpanded}
            onToggle={() => setLeadersBasesExpanded(!leadersBasesExpanded)}
          />

          {/* Leaders and Bases - only show when parent is expanded */}
          {leadersBasesExpanded && (
            <LeaderBaseSelector
              leadersExpanded={leadersExpanded}
              setLeadersExpanded={setLeadersExpanded}
              basesExpanded={basesExpanded}
              setBasesExpanded={setBasesExpanded}
              onCardMouseEnter={handleCardMouseEnter}
              onCardMouseLeave={handleCardMouseLeave}
              onCardTouchStart={handleCardTouchStart}
              onCardTouchEnd={handleCardTouchEnd}
              isLoading={isLoading}
              onAddStarterLeaders={starterLeadersToggleHandler}
              hasStarterLeaders={hasStarterLeaders}
            />
          )}

          {/* Deck and Pool sections wrapper - allows reordering via CSS */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {isLoading ? (
              <>
                {/* Deck Skeleton */}
                <div className="blocks-section deck-section">
                  <SectionHeader
                    title="Deck"
                    count={0}
                    expanded={deckExpanded}
                    onToggle={() => setDeckExpanded(!deckExpanded)}
                  />
                  {deckExpanded && (
                    <div className="card-block">
                      <div className="card-block-content">
                        <div className="skeleton-cards-row">
                          {[1, 2, 3, 4, 5, 6].map((i) => (
                            <div key={i} className="skeleton-card skeleton-card-portrait" />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Pool Skeleton */}
                <div className="blocks-section pool-section">
                  <SectionHeader
                    title="Pool"
                    count={0}
                    expanded={sideboardExpanded}
                    onToggle={() => setSideboardExpanded(!sideboardExpanded)}
                  />
                  {sideboardExpanded && (
                    <div className="card-block">
                      <div className="card-block-content">
                        <div className="skeleton-cards-row">
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => (
                            <div key={i} className="skeleton-card skeleton-card-portrait" />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <DeckSection
                  getDeckCards={getDeckCards}
                  getPoolCards={getPoolCards}
                  groupCardsByName={groupCardsByName}
                  renderCardStack={renderCardStack}
                  createCardRenderer={createCardRenderer}
                  getAspectSymbol={getAspectSymbol}
                  getDefaultAspectSortKey={getDefaultAspectSortKey}
                  getAspectKey={getAspectKey}
                  deckExpanded={deckExpanded}
                  setDeckExpanded={setDeckExpanded}
                  deckGroupsExpanded={deckGroupsExpanded}
                  setDeckGroupsExpanded={setDeckGroupsExpanded}
                  deckFilterOpen={deckFilterOpen}
                  setDeckFilterOpen={setDeckFilterOpen}
                  setPoolFilterOpen={setPoolFilterOpen}
                  setFilterAspectsExpanded={setFilterAspectsExpanded}
                  deckBlocksRowRef={deckBlocksRowRef}
                />
                <PoolSection
                  getPoolCards={getPoolCards}
                  getDeckCards={getDeckCards}
                  groupCardsByName={groupCardsByName}
                  renderCardStack={renderCardStack}
                  createCardRenderer={createCardRenderer}
                  getAspectSymbol={getAspectSymbol}
                  getDefaultAspectSortKey={getDefaultAspectSortKey}
                  getAspectKey={getAspectKey}
                  sideboardExpanded={sideboardExpanded}
                  setSideboardExpanded={setSideboardExpanded}
                  poolGroupsExpanded={poolGroupsExpanded}
                  setPoolGroupsExpanded={setPoolGroupsExpanded}
                  poolFilterOpen={poolFilterOpen}
                  setPoolFilterOpen={setPoolFilterOpen}
                  setDeckFilterOpen={setDeckFilterOpen}
                  setFilterAspectsExpanded={setFilterAspectsExpanded}
                />
              </>
            )}
          </div>
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <div className="list-view" style={{ minHeight: '200px' }}>
          {isLoading ? (
            <>
              {/* Leaders Skeleton */}
              <div className="list-section">
                <h3 className="list-section-header" style={{ cursor: 'pointer' }}>
                  <span style={{ marginRight: '0.5rem' }}>{leadersExpanded ? '▼' : '▶'}</span>
                  Leaders
                </h3>
                {leadersExpanded && (
                  <div className="skeleton-section">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="skeleton-card" style={{ height: '40px', marginBottom: '8px', borderRadius: '4px' }} />
                    ))}
                  </div>
                )}
              </div>
              {/* Bases Skeleton */}
              <div className="list-section">
                <h3 className="list-section-header" style={{ cursor: 'pointer' }}>
                  <span style={{ marginRight: '0.5rem' }}>{basesExpanded ? '▼' : '▶'}</span>
                  Bases
                </h3>
                {basesExpanded && (
                  <div className="skeleton-section">
                    {[1, 2, 3, 4, 5, 6].map(i => (
                      <div key={i} className="skeleton-card" style={{ height: '40px', marginBottom: '8px', borderRadius: '4px' }} />
                    ))}
                  </div>
                )}
              </div>
              {/* Pool/Deck Skeleton */}
              <div className="list-section">
                <h3 className="list-section-header" style={{ cursor: 'pointer' }}>
                  <span style={{ marginRight: '0.5rem' }}>▼</span>
                  Pool
                </h3>
                <div className="skeleton-section">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => (
                    <div key={i} className="skeleton-card" style={{ height: '40px', marginBottom: '8px', borderRadius: '4px' }} />
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Leaders Section */}
              <SelectionListSection
                title="Leaders"
                headerId="leaders-list-header"
                sectionId="leaders"
                radioName="leader-selection"
                positions={Object.entries(cardPositions)
                  .filter(([_, pos]) => pos.section === 'leaders-bases' && pos.visible && pos.card.isLeader)
                  .map(([cardId, pos]) => ({ cardId, card: pos.card }))}
                selectedId={activeLeader}
                onSelect={(cardId) => {
                  if (swissLocked) return
                  setActiveLeader(cardId)
                  if (cardId && (poolSortOption === 'cost' || deckSortOption === 'cost')) {
                    enableAspectPenaltiesForBothSections()
                  }
                }}
                tableSort={tableSort}
                onSort={handleTableSort}
                defaultSort={defaultSort}
                sortTableData={sortTableData}
                expanded={leadersExpanded}
                onToggleExpanded={() => setLeadersExpanded(!leadersExpanded)}
                getAspectIcons={getAspectIcons}
                onCardHover={(cardId, card, e) => {
                  setHoveredCard(cardId)
                  handleCardMouseEnter(card, e)
                }}
                onCardLeave={() => {
                  setHoveredCard(null)
                  handleCardMouseLeave()
                }}
                onAddStarterLeaders={starterLeadersToggleHandler}
                hasStarterLeaders={hasStarterLeaders}
              />

          {/* Bases Section */}
          <SelectionListSection
            title="Bases"
            headerId="bases-list-header"
            sectionId="bases"
            radioName="base-selection"
            positions={Object.entries(cardPositions)
              .filter(([_, pos]) => pos.section === 'leaders-bases' && pos.visible && pos.card.isBase)
              .sort(([, a], [, b]) => sortBaseCardsCommonFirst(a.card, b.card))
              .map(([cardId, pos]) => ({ cardId, card: pos.card }))}
            selectedId={activeBase}
            onSelect={lockedSetActiveBase}
            tableSort={tableSort}
            onSort={handleTableSort}
            defaultSort={sortBaseCardsCommonFirst}
            sortTableData={sortTableData}
            expanded={basesExpanded}
            onToggleExpanded={() => setBasesExpanded(!basesExpanded)}
            getAspectIcons={getAspectIcons}
            onCardHover={(cardId, card, e) => {
              setHoveredCard(cardId)
              handleCardMouseEnter(card, e)
            }}
            onCardLeave={() => {
              setHoveredCard(null)
              handleCardMouseLeave()
            }}
          />

          {/* Pool Section - Deck and Sideboard */}
          <PoolListSection
            cardPositions={cardPositions}
            setCardPositions={lockedSetCardPositions}
            deckSortOption={deckSortOption}
            isDraftMode={isDraftMode}
            isInfiniteMode={isInfiniteMode}
            tableSort={tableSort}
            handleTableSort={handleTableSort}
            defaultSort={defaultSort}
            sortTableData={sortTableData}
            getAspectIcons={getAspectIcons}
            getDefaultAspectSortKey={getDefaultAspectSortKey}
            getFormattedType={getFormattedType}
            getAspectCombinationKey={getAspectCombinationKey}
            getAspectCombinationDisplayName={getAspectCombinationDisplayName}
            getAspectCombinationIcons={getAspectCombinationIcons}
            deckCostSectionsExpanded={deckCostSectionsExpanded}
            setDeckCostSectionsExpanded={setDeckCostSectionsExpanded}
            deckAspectSectionsExpanded={deckAspectSectionsExpanded}
            setDeckAspectSectionsExpanded={setDeckAspectSectionsExpanded}
            sideboardAspectSectionsExpanded={sideboardAspectSectionsExpanded}
            setSideboardAspectSectionsExpanded={setSideboardAspectSectionsExpanded}
            onCardHover={(cardId, card, e) => {
              setHoveredCard(cardId)
              handleCardMouseEnter(card, e)
            }}
            onCardLeave={() => {
              setHoveredCard(null)
              handleCardMouseLeave()
            }}
          />
            </>
          )}
        </div>
      )}

      {/* Arena View */}
      {viewMode === 'arena' && (
        <ArenaView
          onCardMouseEnter={handleCardMouseEnter}
          onCardMouseLeave={handleCardMouseLeave}
          onCardTouchStart={handleCardTouchStart}
          onCardTouchEnd={handleCardTouchEnd}
          isLoading={isLoading}
          onAddStarterLeaders={starterLeadersToggleHandler}
          hasStarterLeaders={hasStarterLeaders}
        />
      )}

      {/* Enlarged card preview (3x size) */}
      {hoveredCardPreview && (
        <CardPreview
          card={hoveredCardPreview.card}
          x={hoveredCardPreview.x}
          y={hoveredCardPreview.y}
          isMobile={hoveredCardPreview.isMobile}
          onMouseEnter={handlePreviewMouseEnter}
          onMouseLeave={handlePreviewMouseLeave}
          onDismiss={dismissPreview}
        />
      )}

      <Tooltip tooltip={tooltip} />

      <DeckImageModal
        imageUrl={deckImageModal}
        onClose={() => setDeckImageModal(null)}
        poolName={currentPoolName}
        setCode={setCode}
        poolType={poolType}
        exportPoolImage={exportPoolImage}
      />

      <DeleteDeckSection
        shareId={shareId}
        // Only render the bottom delete button when we're viewing the root pool
        // (not a child build) AND the current user owns it. Server-side DELETE
        // also enforces ownership, so direct API hits from non-owners get 403.
        isOwner={isOwner && (!rootShareId || rootShareId === shareId)}
        setErrorMessage={setErrorMessage}
        setMessageType={setMessageType}
        onDelete={isInfiniteMode ? handleDeleteLimitedDeck : undefined}
        deleteLabel={isInfiniteMode ? 'Delete Limited Deck' : 'Delete Pool'}
        confirmTitle={isInfiniteMode ? 'Delete Limited Deck?' : 'Delete Pool?'}
        confirmBody={isInfiniteMode
          ? 'Are you sure you want to delete this Limited Deckbuilder deck? This will remove this session and return you to the homepage.'
          : 'This will permanently delete the pool and every build inside it. This action cannot be undone.'}
      />

      <Modal
        isOpen={lockModalOpen}
        onClose={() => setLockModalOpen(false)}
        title="Locked deck"
        showCloseButton
      >
        <Modal.Body>
          <p>
            This deck is editable only by{' '}
            <strong>{poolOwnerUsername || 'the owner'}</strong>.
          </p>
          <p>Start a new deck with this Pool?</p>
        </Modal.Body>
        <Modal.Actions>
          <Button variant="secondary" onClick={() => setLockModalOpen(false)} disabled={forkInProgress}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleStartNewBuildFromLock} disabled={forkInProgress}>
            {forkInProgress ? 'Creating…' : 'Start New Deck'}
          </Button>
        </Modal.Actions>
      </Modal>
      </div>
    </div>
    </DeckBuilderContext.Provider>
  )
}

export default DeckBuilder

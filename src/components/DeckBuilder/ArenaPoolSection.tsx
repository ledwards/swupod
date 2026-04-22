// @ts-nocheck
/**
 * ArenaPoolSection Component
 *
 * Top half of the arena view.
 * Shows pool cards in a grid with aspect combo filters and search.
 */

import { useMemo, useCallback, type MouseEvent, type ChangeEvent } from 'react'
import { useDeckBuilder } from '../../contexts/DeckBuilderContext'
import { ResizableCard } from './ResizableCard'
import { calculateAspectPenalty } from '../../services/cards/aspectPenalties'
import { getAspectSortKey, getTypeOrder } from '../../services/cards/cardSorting'
import type { CardData } from '../Card'

interface CardPosition {
  card: CardData
  section: string
  visible: boolean
  enabled?: boolean
  [key: string]: unknown
}

interface CardEntry {
  cardId: string
  position: CardPosition
}

export interface ArenaPoolSectionProps {
  onCardClick?: (cardId: string, e: MouseEvent) => void
  onCardMouseEnter?: (cardId: string, card: CardData, e: MouseEvent) => void
  onCardMouseLeave?: () => void
  onCardTouchStart?: (cardId: string, card: CardData) => void
  onCardTouchEnd?: () => void
}

// Primary aspects (have their own groups with combos)
const PRIMARY_ASPECTS = ['Vigilance', 'Command', 'Aggression', 'Cunning']

// Secondary aspects
const SECONDARY_ASPECTS = ['Villainy', 'Heroism']

// Canonical aspect order for consistent key generation
const ASPECT_ORDER = ['Vigilance', 'Command', 'Aggression', 'Cunning', 'Villainy', 'Heroism']
function sortAspects(aspects: string[]): string[] {
  return [...aspects].sort((a, b) => {
    const ai = ASPECT_ORDER.indexOf(a)
    const bi = ASPECT_ORDER.indexOf(b)
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })
}

// Get aspect combo key for a card (sorted by game priority order)
function getAspectComboKey(card: CardData): string {
  const aspects = card.aspects || []
  if (aspects.length === 0) return 'neutral'
  return sortAspects(aspects).join('+')
}

// Check if a combo key has 2+ distinct primary aspects (e.g., "Aggression+Command")
function isMultiPrimaryCombo(comboKey: string): boolean {
  const aspects = comboKey.split('+')
  const uniquePrimaries = new Set(aspects.filter(a => PRIMARY_ASPECTS.includes(a)))
  return uniquePrimaries.size >= 2
}

// Get all multi-primary combo keys from presentCombos that contain the given primary
function getMultiPrimaryCombosForPrimary(primary: string, presentCombos: Set<string>): string[] {
  return [...presentCombos].filter(comboKey => {
    if (!isMultiPrimaryCombo(comboKey)) return false
    return comboKey.split('+').includes(primary)
  }).sort()
}

// Get all multi-primary combo keys from presentCombos that contain the given secondary
function getMultiPrimaryCombosForSecondary(secondary: string, presentCombos: Set<string>): string[] {
  return [...presentCombos].filter(comboKey => {
    if (!isMultiPrimaryCombo(comboKey)) return false
    return comboKey.split('+').includes(secondary)
  }).sort()
}

// Get standard 4 combos for a primary aspect (mono, double, +Villainy, +Heroism)
function getStandardCombosForPrimary(primary: string): string[] {
  const combos = [
    primary, // mono
    `${primary}+${primary}`, // double
  ]
  SECONDARY_ASPECTS.forEach(secondary => {
    combos.push(sortAspects([primary, secondary]).join('+'))
  })
  return combos
}

// Aspect icon component
function AspectIcon({ aspect }: { aspect: string }) {
  return (
    <img
      src={`/icons/${aspect.toLowerCase()}.png`}
      alt={aspect}
    />
  )
}

export function ArenaPoolSection({
  onCardClick,
  onCardMouseEnter,
  onCardMouseLeave,
  onCardTouchStart,
  onCardTouchEnd,
}: ArenaPoolSectionProps) {
  const {
    cardPositions,
    leaderCard,
    baseCard,
    showPoolAspectPenalties,
    setShowPoolAspectPenalties,
    hoveredCard,
    selectedCards,
    toggleCardSection,
    arenaFilters,
    setArenaFilters,
    arenaSearchQuery,
    setArenaSearchQuery,
  } = useDeckBuilder()

  const setActiveFilters = setArenaFilters
  const searchQuery = arenaSearchQuery
  const setSearchQuery = setArenaSearchQuery

  // Get ALL cards (pool + deck) for determining filter visibility
  const allCards = useMemo((): CardEntry[] => {
    return Object.entries(cardPositions)
      .filter(([_, pos]) =>
        pos.visible &&
        !pos.card.isBase &&
        !pos.card.isLeader
      )
      .map(([cardId, position]) => ({ cardId, position }))
  }, [cardPositions])

  // Get pool cards (not leaders/bases, in sideboard/disabled)
  const poolCards = useMemo((): CardEntry[] => {
    return Object.entries(cardPositions)
      .filter(([_, pos]) =>
        (pos.section === 'sideboard' || pos.enabled === false) &&
        pos.visible &&
        !pos.card.isBase &&
        !pos.card.isLeader
      )
      .map(([cardId, position]) => ({ cardId, position }))
  }, [cardPositions])

  // Get all unique aspect combos present in ALL cards (pool + deck)
  // This ensures filters never disappear as cards move between sections
  const presentCombos = useMemo(() => {
    const combos = new Set<string>()
    allCards.forEach(({ position }) => {
      combos.add(getAspectComboKey(position.card))
    })
    return combos
  }, [allCards])

  // Build default filters, including multi-primary combos from presentCombos
  const activeFilters = useMemo(() => {
    // Build full default set (standard 19 keys)
    const defaults: Record<string, boolean> = { neutral: true }
    PRIMARY_ASPECTS.forEach(primary => {
      defaults[primary] = true
      defaults[`${primary}+${primary}`] = true
      SECONDARY_ASPECTS.forEach(secondary => {
        defaults[sortAspects([primary, secondary]).join('+')] = true
      })
    })
    SECONDARY_ASPECTS.forEach(secondary => {
      defaults[secondary] = true
    })
    // Include any multi-primary combos from presentCombos
    presentCombos.forEach(comboKey => {
      if (!(comboKey in defaults)) {
        defaults[comboKey] = true
      }
    })

    if (Object.keys(arenaFilters).length > 0) {
      // Merge saved filters with defaults; new combos default to visible
      const merged = { ...defaults, ...arenaFilters }
      presentCombos.forEach(comboKey => {
        if (!(comboKey in arenaFilters)) {
          merged[comboKey] = true
        }
      })
      return merged
    }

    return defaults
  }, [arenaFilters, presentCombos])

  // Filter cards by aspect combo and search
  const filteredCards = useMemo(() => {
    return poolCards.filter(({ position }) => {
      const card = position.card
      const comboKey = getAspectComboKey(card)

      // Check if this combo is active
      if (!activeFilters[comboKey]) {
        return false
      }

      // Apply search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim()
        const name = (card.name || '').toLowerCase()
        const type = (card.type || '').toLowerCase()
        if (!name.includes(query) && !type.includes(query)) {
          return false
        }
      }

      return true
    })
  }, [poolCards, activeFilters, searchQuery])

  // Sort cards by default sort: aspect combo -> type -> cost -> name
  const sortedCards = useMemo(() => {
    return [...filteredCards].sort((a, b) => {
      const cardA = a.position.card
      const cardB = b.position.card

      // Sort by aspect sort key (multi-primary first, then standard order)
      const aspectKeyA = getAspectSortKey(cardA)
      const aspectKeyB = getAspectSortKey(cardB)
      const aspectCompare = aspectKeyA.localeCompare(aspectKeyB)
      if (aspectCompare !== 0) return aspectCompare

      // Then by type (Unit < Space Unit < Upgrade < Event)
      const typeOrderA = getTypeOrder(cardA.type || '')
      const typeOrderB = getTypeOrder(cardB.type || '')
      if (typeOrderA !== typeOrderB) return typeOrderA - typeOrderB

      // Then by cost
      const costA = cardA.cost ?? 0
      const costB = cardB.cost ?? 0
      if (costA !== costB) return costA - costB

      // Then by name
      return (cardA.name || '').localeCompare(cardB.name || '')
    })
  }, [filteredCards])

  // Toggle a specific combo filter
  const toggleFilter = useCallback((key: string) => {
    setActiveFilters(prev => ({
      ...prev,
      [key]: !prev[key]
    }))
  }, [])

  // Check if ANY filter is active (eye shows "visible" unless everything is hidden)
  const anyFilterActive = useMemo(() => {
    return [...presentCombos].some(k => activeFilters[k])
  }, [activeFilters, presentCombos])

  // Toggle all filters on/off
  const toggleAllFilters = useCallback(() => {
    const showAll = !anyFilterActive
    if (showAll) setSearchQuery('')
    setActiveFilters(prev => {
      const newState = { ...prev }
      presentCombos.forEach(k => {
        newState[k] = showAll
      })
      return newState
    })
  }, [anyFilterActive, presentCombos])

  // Get all combos for a primary (standard + multi-primary from presentCombos)
  const getAllCombosForPrimary = useCallback((primary: string) => {
    return [
      ...getStandardCombosForPrimary(primary),
      ...getMultiPrimaryCombosForPrimary(primary, presentCombos)
    ]
  }, [presentCombos])

  // Toggle all combos for a primary aspect group
  // If any present combos are active, turn all off. If none are active, turn all on.
  const togglePrimaryAspect = useCallback((primary: string) => {
    setActiveFilters(prev => {
      const combosForPrimary = getAllCombosForPrimary(primary)
      // Only consider present combos for determining toggle direction
      const anyPresentActive = combosForPrimary.some(k => presentCombos.has(k) && prev[k])
      const newState = { ...prev }
      combosForPrimary.forEach(k => {
        newState[k] = !anyPresentActive
      })
      return newState
    })
  }, [presentCombos, getAllCombosForPrimary])

  // Toggle secondary aspect (and all combos containing it)
  // If any present combos are active, turn all off. If none are active, turn all on.
  const toggleSecondaryAspect = useCallback((secondary: string) => {
    setActiveFilters(prev => {
      const combosWithSecondary = [
        secondary,
        ...PRIMARY_ASPECTS.map(p => {
          return sortAspects([p, secondary]).join('+')
        }),
        ...getMultiPrimaryCombosForSecondary(secondary, presentCombos)
      ]
      // Only consider present combos for determining toggle direction
      const anyPresentActive = combosWithSecondary.some(k => presentCombos.has(k) && prev[k])
      const newState = { ...prev }
      combosWithSecondary.forEach(k => {
        newState[k] = !anyPresentActive
      })
      return newState
    })
  }, [presentCombos])

  // Check if ANY present combo for a primary aspect is active
  // Parent shows as "active" only if at least one present child is active
  const isPrimaryAspectActive = useCallback((primary: string) => {
    const combosForPrimary = getAllCombosForPrimary(primary)
    return combosForPrimary.some(k => presentCombos.has(k) && activeFilters[k])
  }, [activeFilters, presentCombos, getAllCombosForPrimary])

  // Check if ANY present combo for a secondary aspect is active
  const isSecondaryAspectActive = useCallback((secondary: string) => {
    const combosWithSecondary = [
      secondary,
      ...PRIMARY_ASPECTS.map(p => sortAspects([p, secondary]).join('+')),
      ...getMultiPrimaryCombosForSecondary(secondary, presentCombos)
    ]
    return combosWithSecondary.some(k => presentCombos.has(k) && activeFilters[k])
  }, [activeFilters, presentCombos])

  // Get all multi-primary combo keys present in the pool, sorted by aspect priority
  const allMultiPrimaryCombos = useMemo(() => {
    const aspectRank = (a: string) => { const i = ASPECT_ORDER.indexOf(a); return i === -1 ? 99 : i }
    return [...presentCombos].filter(isMultiPrimaryCombo).sort((a, b) => {
      const aAspects = a.split('+')
      const bAspects = b.split('+')
      const maxLen = Math.max(aAspects.length, bAspects.length)
      for (let i = 0; i < maxLen; i++) {
        const ar = aspectRank(aAspects[i] ?? '')
        const br = aspectRank(bAspects[i] ?? '')
        if (ar !== br) return ar - br
      }
      return 0
    })
  }, [presentCombos])

  // Check if any multi-primary combo is active
  const isAnyMultiPrimaryActive = useMemo(() => {
    return allMultiPrimaryCombos.some(k => activeFilters[k])
  }, [allMultiPrimaryCombos, activeFilters])

  // Toggle all multi-primary combos on/off
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

  const handleSearchChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value)
  }, [])

  const calculatePenalty = useCallback((card: CardData): number => {
    if (!leaderCard || !baseCard) return 0
    return calculateAspectPenalty(card, leaderCard, baseCard)
  }, [leaderCard, baseCard])

  const handleCardClick = useCallback((cardId: string, e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!e.shiftKey) {
      toggleCardSection(cardId)
    }
    onCardClick?.(cardId, e)
  }, [toggleCardSection, onCardClick])

  // Render a combo filter button
  const renderComboFilter = (comboKey: string, showInactive = false) => {
    const aspects = comboKey === 'neutral' ? [] : comboKey.split('+')
    const isActive = activeFilters[comboKey]
    const isPresent = presentCombos.has(comboKey)

    if (!isPresent && !showInactive) return null

    return (
      <button
        key={comboKey}
        className={`arena-filter-btn arena-aspect-filter ${isActive ? 'active' : 'inactive'}`}
        onClick={() => toggleFilter(comboKey)}
        title={comboKey}
        disabled={!isPresent}
        style={!isPresent ? { display: 'none' } : undefined}
      >
        {aspects.map((aspect, i) => (
          <AspectIcon key={i} aspect={aspect} />
        ))}
      </button>
    )
  }

  // Render a multi-primary combo filter button (smaller icons)
  const renderMultiPrimaryComboFilter = (comboKey: string) => {
    const aspects = comboKey.split('+')
    const isActive = activeFilters[comboKey]
    const isPresent = presentCombos.has(comboKey)

    if (!isPresent) return null

    return (
      <button
        key={comboKey}
        className={`arena-filter-btn arena-aspect-filter arena-multi-primary-filter ${isActive ? 'active' : 'inactive'}`}
        onClick={() => toggleFilter(comboKey)}
        title={comboKey}
      >
        {aspects.map((aspect, i) => (
          <AspectIcon key={i} aspect={aspect} />
        ))}
      </button>
    )
  }

  return (
    <div className="arena-pool-section">
      <div className="arena-pool-header">
        {/* Pool title on its own row */}
        <h3 className="arena-section-title">Pool ({sortedCards.length} cards)</h3>

        {/* Row 1: Filter label + search box + eye toggle */}
        <div className="arena-controls-row arena-search-row">
          <span className="arena-filter-label">Filter:</span>
          <div className="arena-search-container">
            <svg className="arena-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              className="arena-search-input"
              placeholder="Search cards..."
              value={searchQuery}
              onChange={handleSearchChange}
            />
            {searchQuery && (
              <button
                className="arena-search-clear"
                onClick={() => setSearchQuery('')}
                title="Clear search"
              >
                &times;
              </button>
            )}
          </div>

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
          <button
            className={`arena-filter-btn arena-toggle-all-filter ${showPoolAspectPenalties ? 'active' : 'inactive'}`}
            onClick={() => (leaderCard && baseCard) && setShowPoolAspectPenalties(!showPoolAspectPenalties)}
            title={leaderCard && baseCard ? 'Toggle pool aspect penalties' : 'Select leader and base to enable penalties'}
            disabled={!leaderCard || !baseCard}
          >
            {showPoolAspectPenalties ? (
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

        {/* Row 2: All aspect filter groups */}
        <div className="arena-controls-row arena-filters-row">
          <div className="arena-aspect-filters">
            {/* Primary aspect groups (vertical layout) */}
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

            {/* Secondary aspects (Villainy, Heroism) and Neutral */}
            <div className="arena-secondary-aspects">
              {SECONDARY_ASPECTS.map(secondary => {
                const isActive = isSecondaryAspectActive(secondary)
                const hasCards = presentCombos.has(secondary) ||
                  PRIMARY_ASPECTS.some(p => presentCombos.has(sortAspects([p, secondary]).join('+'))) ||
                  getMultiPrimaryCombosForSecondary(secondary, presentCombos).length > 0
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
          </div>
        </div>

        {/* Row 3: Multi-aspect diamond group (only if multi-primary combos exist) */}
        {allMultiPrimaryCombos.length > 0 && (
          <div className="arena-controls-row arena-filters-row">
            <div className="arena-aspect-filters">
              <div className="arena-multi-aspect-group">
                <button
                  className={`arena-multi-aspect-diamond ${isAnyMultiPrimaryActive ? 'active' : 'inactive'}`}
                  onClick={toggleAllMultiPrimary}
                  title="Toggle all multi-aspect cards"
                >
                  {/* Diamond icon: 4 primary aspects arranged in diamond shape */}
                  <div className="arena-diamond-icon">
                    <img src="/icons/vigilance.png" alt="Vigilance" />
                    <img src="/icons/command.png" alt="Command" />
                    <img src="/icons/aggression.png" alt="Aggression" />
                    <img src="/icons/cunning.png" alt="Cunning" />
                  </div>
                </button>
                <div className="arena-aspect-group-separator" />
                <div className="arena-aspect-group-standard-combos">
                  {allMultiPrimaryCombos.map(comboKey => renderMultiPrimaryComboFilter(comboKey))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="arena-content-area">
        {sortedCards.length === 0 && (
          <div className="arena-empty-pool">No cards.</div>
        )}
        <div className="arena-pool-grid">
          {sortedCards.map(({ cardId, position }) => {
            const card = position.card
            const isSelected = selectedCards.has(cardId)
            const isHovered = hoveredCard === cardId
            const penalty = showPoolAspectPenalties ? calculatePenalty(card) : 0

            return (
              <ResizableCard
                key={cardId}
                card={card}
                selected={isSelected}
                hovered={isHovered}
                showPenalty={showPoolAspectPenalties && penalty > 0}
                penaltyAmount={penalty}
                onClick={(e) => handleCardClick(cardId, e)}
                onMouseEnter={(e) => onCardMouseEnter?.(cardId, card, e)}
                onMouseLeave={onCardMouseLeave}
                onTouchStart={() => onCardTouchStart?.(cardId, card)}
                onTouchEnd={() => onCardTouchEnd?.()}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default ArenaPoolSection

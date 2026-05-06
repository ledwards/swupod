// @ts-nocheck
/**
 * ArenaPoolSection Component
 *
 * Top half of the arena view. Renders pool cards by delegating to the shared
 * ArenaCardArea (same component the deck section uses), so Pool and Deck render
 * identically for the same sort option.
 *
 * The aspect-combo filter row (the colored buttons above the card area) is the
 * one piece of UI specific to the Pool section.
 */

import { useMemo, useCallback, type MouseEvent, type ChangeEvent } from 'react'
import { useDeckBuilder } from '../../contexts/DeckBuilderContext'
import { ArenaCardArea } from './ArenaCardArea'
import type { CardData } from '../Card'
import type { SortOption } from './SortControls'

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

const PRIMARY_ASPECTS = ['Vigilance', 'Command', 'Aggression', 'Cunning']
const SECONDARY_ASPECTS = ['Villainy', 'Heroism']
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

function getMultiPrimaryCombosForPrimary(primary: string, presentCombos: Set<string>): string[] {
  return [...presentCombos].filter(comboKey => {
    if (!isMultiPrimaryCombo(comboKey)) return false
    return comboKey.split('+').includes(primary)
  }).sort()
}

function getMultiPrimaryCombosForSecondary(secondary: string, presentCombos: Set<string>): string[] {
  return [...presentCombos].filter(comboKey => {
    if (!isMultiPrimaryCombo(comboKey)) return false
    return comboKey.split('+').includes(secondary)
  }).sort()
}

function getStandardCombosForPrimary(primary: string): string[] {
  const combos = [primary, `${primary}+${primary}`]
  SECONDARY_ASPECTS.forEach(s => combos.push(sortAspects([primary, s]).join('+')))
  return combos
}

function AspectIcon({ aspect }: { aspect: string }) {
  return <img src={`/icons/${aspect.toLowerCase()}.png`} alt={aspect} />
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
    showPoolAspectPenalties,
    arenaFilters,
    setArenaFilters,
    arenaSearchQuery,
    setArenaSearchQuery,
    arenaPoolSortOption,
    poolCardDensity,
  } = useDeckBuilder()

  // All cards (pool + deck) for filter visibility
  const allCards = useMemo((): CardEntry[] => {
    return Object.entries(cardPositions)
      .filter(([_, pos]) => pos.visible && !pos.card.isBase && !pos.card.isLeader)
      .map(([cardId, position]) => ({ cardId, position }))
  }, [cardPositions])

  // Pool cards
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

  // Aspect combos present anywhere
  const presentCombos = useMemo(() => {
    const combos = new Set<string>()
    allCards.forEach(({ position }) => combos.add(getAspectComboKey(position.card)))
    return combos
  }, [allCards])

  // Active aspect-combo filters (with sensible defaults)
  const activeFilters = useMemo(() => {
    const defaults: Record<string, boolean> = { neutral: true }
    PRIMARY_ASPECTS.forEach(p => {
      defaults[p] = true
      defaults[`${p}+${p}`] = true
      SECONDARY_ASPECTS.forEach(s => { defaults[sortAspects([p, s]).join('+')] = true })
    })
    SECONDARY_ASPECTS.forEach(s => { defaults[s] = true })
    presentCombos.forEach(k => { if (!(k in defaults)) defaults[k] = true })

    if (Object.keys(arenaFilters).length > 0) {
      const merged = { ...defaults, ...arenaFilters }
      presentCombos.forEach(k => { if (!(k in arenaFilters)) merged[k] = true })
      return merged
    }
    return defaults
  }, [arenaFilters, presentCombos])

  // Cards passing aspect-combo filter + search
  const filteredCards = useMemo(() => {
    return poolCards.filter(({ position }) => {
      const card = position.card
      const comboKey = getAspectComboKey(card)
      if (!activeFilters[comboKey]) return false
      if (arenaSearchQuery.trim()) {
        const q = arenaSearchQuery.toLowerCase().trim()
        const name = (card.name || '').toLowerCase()
        const type = (card.type || '').toLowerCase()
        if (!name.includes(q) && !type.includes(q)) return false
      }
      return true
    })
  }, [poolCards, activeFilters, arenaSearchQuery])

  // Filter button helpers
  const toggleFilter = useCallback((key: string) => {
    setArenaFilters(prev => ({ ...prev, [key]: !prev[key] }))
  }, [setArenaFilters])

  const anyFilterActive = useMemo(() => {
    return [...presentCombos].some(k => activeFilters[k])
  }, [activeFilters, presentCombos])

  const toggleAllFilters = useCallback(() => {
    const showAll = !anyFilterActive
    if (showAll) setArenaSearchQuery('')
    setArenaFilters(prev => {
      const next = { ...prev }
      presentCombos.forEach(k => { next[k] = showAll })
      return next
    })
  }, [anyFilterActive, presentCombos, setArenaFilters, setArenaSearchQuery])

  const getAllCombosForPrimary = useCallback((primary: string) => {
    return [...getStandardCombosForPrimary(primary), ...getMultiPrimaryCombosForPrimary(primary, presentCombos)]
  }, [presentCombos])

  const togglePrimaryAspect = useCallback((primary: string) => {
    setArenaFilters(prev => {
      const combos = getAllCombosForPrimary(primary)
      const anyOn = combos.some(k => presentCombos.has(k) && prev[k])
      const next = { ...prev }
      combos.forEach(k => { next[k] = !anyOn })
      return next
    })
  }, [presentCombos, getAllCombosForPrimary, setArenaFilters])

  const toggleSecondaryAspect = useCallback((secondary: string) => {
    setArenaFilters(prev => {
      const combos = [
        secondary,
        ...PRIMARY_ASPECTS.map(p => sortAspects([p, secondary]).join('+')),
        ...getMultiPrimaryCombosForSecondary(secondary, presentCombos),
      ]
      const anyOn = combos.some(k => presentCombos.has(k) && prev[k])
      const next = { ...prev }
      combos.forEach(k => { next[k] = !anyOn })
      return next
    })
  }, [presentCombos, setArenaFilters])

  const isPrimaryAspectActive = useCallback((primary: string) => {
    return getAllCombosForPrimary(primary).some(k => presentCombos.has(k) && activeFilters[k])
  }, [activeFilters, presentCombos, getAllCombosForPrimary])

  const isSecondaryAspectActive = useCallback((secondary: string) => {
    const combos = [
      secondary,
      ...PRIMARY_ASPECTS.map(p => sortAspects([p, secondary]).join('+')),
      ...getMultiPrimaryCombosForSecondary(secondary, presentCombos),
    ]
    return combos.some(k => presentCombos.has(k) && activeFilters[k])
  }, [activeFilters, presentCombos])

  const allMultiPrimaryCombos = useMemo(() => {
    const rank = (a: string) => { const i = ASPECT_ORDER.indexOf(a); return i === -1 ? 99 : i }
    return [...presentCombos].filter(isMultiPrimaryCombo).sort((a, b) => {
      const A = a.split('+'), B = b.split('+')
      const max = Math.max(A.length, B.length)
      for (let i = 0; i < max; i++) {
        const ar = rank(A[i] ?? ''), br = rank(B[i] ?? '')
        if (ar !== br) return ar - br
      }
      return 0
    })
  }, [presentCombos])

  const isAnyMultiPrimaryActive = useMemo(() => {
    return allMultiPrimaryCombos.some(k => activeFilters[k])
  }, [allMultiPrimaryCombos, activeFilters])

  const toggleAllMultiPrimary = useCallback(() => {
    setArenaFilters(prev => {
      const next = { ...prev }
      const turnOn = !isAnyMultiPrimaryActive
      allMultiPrimaryCombos.forEach(k => { next[k] = turnOn })
      return next
    })
  }, [allMultiPrimaryCombos, isAnyMultiPrimaryActive, setArenaFilters])

  const handleSearchChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setArenaSearchQuery(e.target.value)
  }, [setArenaSearchQuery])

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
        {aspects.map((a, i) => <AspectIcon key={i} aspect={a} />)}
      </button>
    )
  }

  const renderMultiPrimaryComboFilter = (comboKey: string) => {
    const aspects = comboKey.split('+')
    const isActive = activeFilters[comboKey]
    if (!presentCombos.has(comboKey)) return null
    return (
      <button
        key={comboKey}
        className={`arena-filter-btn arena-aspect-filter arena-multi-primary-filter ${isActive ? 'active' : 'inactive'}`}
        onClick={() => toggleFilter(comboKey)}
        title={comboKey}
      >
        {aspects.map((a, i) => <AspectIcon key={i} aspect={a} />)}
      </button>
    )
  }

  return (
    <div className="arena-pool-section">
      <div className="arena-pool-header">
        <h3 className="arena-section-title">Pool ({filteredCards.length} cards)</h3>

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
              value={arenaSearchQuery}
              onChange={handleSearchChange}
            />
            {arenaSearchQuery && (
              <button
                className="arena-search-clear"
                onClick={() => setArenaSearchQuery('')}
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
        </div>

        <div className="arena-controls-row arena-filters-row">
          <div className="arena-aspect-filters">
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
                      {standardCombos.map(k => renderComboFilter(k))}
                    </div>
                  </div>
                </div>
              )
            })}

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

        {allMultiPrimaryCombos.length > 0 && (
          <div className="arena-controls-row arena-filters-row">
            <div className="arena-aspect-filters">
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
                  {allMultiPrimaryCombos.map(k => renderMultiPrimaryComboFilter(k))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="arena-content-area">
        <ArenaCardArea
          cards={filteredCards}
          sortOption={arenaPoolSortOption as SortOption}
          density={poolCardDensity}
          showAspectPenalties={showPoolAspectPenalties}
          emptyMessage="No cards."
          onCardClick={onCardClick}
          onCardMouseEnter={onCardMouseEnter}
          onCardMouseLeave={onCardMouseLeave}
          onCardTouchStart={onCardTouchStart}
          onCardTouchEnd={onCardTouchEnd}
        />
      </div>
    </div>
  )
}

export default ArenaPoolSection

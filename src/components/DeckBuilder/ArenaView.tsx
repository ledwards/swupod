// @ts-nocheck
/**
 * ArenaView Component
 *
 * Main arena view mode for the deckbuilder.
 * Pool and Deck headers expose a controls row (sort + filter + density) and
 * a unified ArenaActionsBar (bulk-move + aspect-penalty toggle).
 */

import { useState, useCallback, useMemo, type MouseEvent } from 'react'
import './ArenaView.css'
import { useDeckBuilder } from '../../contexts/DeckBuilderContext'
import { ArenaPoolSection } from './ArenaPoolSection'
import { ArenaDeckSection } from './ArenaDeckSection'
import { CollapsibleSectionHeader } from './CollapsibleSectionHeader'
import { CardDensityToggle } from './CardDensityToggle'
import { LeaderBaseSelector } from './LeaderBaseSelector'
import { SortControls, type SortOption } from './SortControls'
import { FilterWithModal } from './FilterWithModal'
import { ArenaActionsBar } from './ArenaActionsBar'
import type { CardData } from '../Card'

export interface ArenaViewProps {
  onCardMouseEnter?: (card: CardData, e: MouseEvent) => void
  onCardMouseLeave?: () => void
  onCardTouchStart?: (card: CardData) => void
  onCardTouchEnd?: () => void
  isLoading?: boolean
  onAddStarterLeaders?: () => void
  hasStarterLeaders?: boolean
}

export function ArenaView({
  onCardMouseEnter,
  onCardMouseLeave,
  onCardTouchStart,
  onCardTouchEnd,
  isLoading = false,
  onAddStarterLeaders,
  hasStarterLeaders = false,
}: ArenaViewProps) {
  const {
    cardPositions,
    setHoveredCard,
    poolSortOption,
    deckSortOption,
    setShowDeckAspectPenalties,
    setShowPoolAspectPenalties,
    showAspectPenalties,
    setShowAspectPenalties,
    poolCardDensity,
    setPoolCardDensity,
    deckCardDensity,
    setDeckCardDensity,
    arenaPoolSortOption,
    setArenaPoolSortOption,
    arenaDeckSortOption,
    setArenaDeckSortOption,
    poolFilterOpen,
    setPoolFilterOpen,
    deckFilterOpen,
    setDeckFilterOpen,
    setFilterAspectsExpanded,
  } = useDeckBuilder()

  const enableAspectPenalties = useCallback(() => {
    setShowDeckAspectPenalties(true)
    setShowPoolAspectPenalties(true)
  }, [setShowDeckAspectPenalties, setShowPoolAspectPenalties])

  // Calculate pool and deck card counts for section headers
  const poolCardCount = useMemo(() => {
    return Object.values(cardPositions).filter(pos =>
      (pos.section === 'sideboard' || pos.enabled === false) &&
      pos.visible &&
      !pos.card.isBase &&
      !pos.card.isLeader
    ).length
  }, [cardPositions])

  const deckCardCount = useMemo(() => {
    return Object.values(cardPositions).filter(pos =>
      pos.section === 'deck' &&
      pos.visible &&
      !pos.card.isBase &&
      !pos.card.isLeader &&
      pos.enabled !== false
    ).length
  }, [cardPositions])

  // Collapse state for all sections
  const [leadersBasesExpanded, setLeadersBasesExpanded] = useState(true)
  const [leadersExpanded, setLeadersExpanded] = useState(true)
  const [basesExpanded, setBasesExpanded] = useState(true)
  const [poolExpanded, setPoolExpanded] = useState(true)
  const [deckExpanded, setDeckExpanded] = useState(true)

  // Handle card click in pool/deck sections
  const handleCardClick = useCallback((cardId: string, e: MouseEvent) => {
    // Card toggling is handled in ArenaPoolSection and ArenaDeckSection
  }, [])

  // Handle card hover in pool/deck sections
  const handleCardMouseEnter = useCallback((cardId: string, card: CardData, e: MouseEvent) => {
    setHoveredCard(cardId)
    onCardMouseEnter?.(card, e)
  }, [setHoveredCard, onCardMouseEnter])

  // Handle hover leave
  const handleMouseLeave = useCallback(() => {
    setHoveredCard(null)
    onCardMouseLeave?.()
  }, [setHoveredCard, onCardMouseLeave])

  // Handle card touch (long press) in pool/deck sections
  const handleCardTouchStart = useCallback((cardId: string, card: CardData) => {
    onCardTouchStart?.(card)
  }, [onCardTouchStart])

  const handleCardTouchEnd = useCallback(() => {
    onCardTouchEnd?.()
  }, [onCardTouchEnd])

  // Toolbar row shared by pool and deck
  const renderControlsRow = (
    mode: 'pool' | 'deck',
    sortValue: SortOption,
    onSortChange: (value: SortOption) => void,
    cardCount: number,
    filterOpen: boolean,
    setFilterOpen: (v: boolean) => void,
    densityValue: 'small' | 'medium' | 'large',
    onDensityChange: (density: 'small' | 'medium' | 'large') => void,
  ) => (
    <div className="arena-controls-row arena-section-controls">
      <span className="arena-actions-label">VIEW:</span>
      <button
        className={`arena-action-btn arena-action-btn--white${showAspectPenalties ? ' active' : ''}`}
        onClick={e => { e.stopPropagation(); setShowAspectPenalties?.(!showAspectPenalties) }}
        title={showAspectPenalties ? 'Hide aspect penalties' : 'Show aspect penalties'}
      >
        {showAspectPenalties ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
          </svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        )}
        Aspect Penalties
      </button>
      <SortControls value={sortValue} onChange={onSortChange} />
      <FilterWithModal
        isOpen={filterOpen}
        onToggle={() => setFilterOpen(!filterOpen)}
        onClose={() => setFilterOpen(false)}
        mode={mode}
        onFilterAspectsExpandedChange={setFilterAspectsExpanded}
        cardCount={cardCount}
      />
      <CardDensityToggle value={densityValue} onChange={onDensityChange} />
      <span className="arena-actions-separator" />
      <ArenaActionsBar mode={mode} />
    </div>
  )

  return (
    <div className="arena-view">
      {/* Small screen message */}
      <div className="arena-small-screen-message">
        <h3>Arena mode works best in landscape</h3>
        <p>Turn your phone sideways.<br />Or try Playmat or Table mode.</p>
      </div>

      {/* Leaders & Bases Section - collapsible */}
      <div className="blocks-container arena-blocks-container">
        <CollapsibleSectionHeader
          title="Leaders & Bases"
          expanded={leadersBasesExpanded}
          onToggle={() => setLeadersBasesExpanded(!leadersBasesExpanded)}
        />

        {leadersBasesExpanded && (
          <LeaderBaseSelector
            leadersExpanded={leadersExpanded}
            setLeadersExpanded={setLeadersExpanded}
            basesExpanded={basesExpanded}
            setBasesExpanded={setBasesExpanded}
            onCardMouseEnter={onCardMouseEnter}
            onCardMouseLeave={onCardMouseLeave}
            onCardTouchStart={onCardTouchStart}
            onCardTouchEnd={onCardTouchEnd}
            poolSortOption={poolSortOption}
            deckSortOption={deckSortOption}
            setShowAspectPenalties={enableAspectPenalties}
            isLoading={isLoading}
            onAddStarterLeaders={onAddStarterLeaders}
            hasStarterLeaders={hasStarterLeaders}
          />
        )}
      </div>

      {/* Pool Section */}
      <CollapsibleSectionHeader
        id="arena-pool-header"
        title={isLoading ? 'Pool' : `Pool (${poolCardCount})`}
        expanded={poolExpanded}
        onToggle={() => setPoolExpanded(!poolExpanded)}
      />
      {!isLoading && renderControlsRow(
        'pool',
        arenaPoolSortOption as SortOption,
        setArenaPoolSortOption,
        poolCardCount,
        poolFilterOpen,
        setPoolFilterOpen,
        poolCardDensity,
        setPoolCardDensity,
      )}
      {poolExpanded && (
        <div className="card-block arena-pool-block">
          <div className="card-block-content">
            {isLoading ? (
              <div className="skeleton-cards-row">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => (
                  <div key={i} className="skeleton-card skeleton-card-portrait" />
                ))}
              </div>
            ) : (
              <ArenaPoolSection
                onCardClick={handleCardClick}
                onCardMouseEnter={handleCardMouseEnter}
                onCardMouseLeave={handleMouseLeave}
                onCardTouchStart={handleCardTouchStart}
                onCardTouchEnd={handleCardTouchEnd}
              />
            )}
          </div>
        </div>
      )}

      {/* Deck Section */}
      <CollapsibleSectionHeader
        id="arena-deck-header"
        title={isLoading ? 'Deck' : `Deck (${deckCardCount})`}
        expanded={deckExpanded}
        onToggle={() => setDeckExpanded(!deckExpanded)}
      />
      {!isLoading && renderControlsRow(
        'deck',
        arenaDeckSortOption as SortOption,
        setArenaDeckSortOption,
        deckCardCount,
        deckFilterOpen,
        setDeckFilterOpen,
        deckCardDensity,
        setDeckCardDensity,
      )}
      {deckExpanded && (
        <div className="card-block arena-deck-block">
          <div className="card-block-content">
            {isLoading ? (
              <div className="skeleton-cards-row">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="skeleton-card skeleton-card-portrait" />
                ))}
              </div>
            ) : (
              <ArenaDeckSection
                onCardClick={handleCardClick}
                onCardMouseEnter={handleCardMouseEnter}
                onCardMouseLeave={handleMouseLeave}
                onCardTouchStart={handleCardTouchStart}
                onCardTouchEnd={handleCardTouchEnd}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default ArenaView

// @ts-nocheck
/**
 * AspectPenaltyToggle Component
 *
 * Displays the aspect penalty toggle button when sorted by cost.
 * Shows a toggle to include/hide aspect penalties when leader and base are selected,
 * or a warning button prompting selection when they're not.
 *
 * Used in both Deck and Pool headers.
 * Can use DeckBuilderContext or receive props directly.
 */

import type { MouseEvent } from 'react'
import Button from '../Button'
import { getLeaderAbilityDescription } from '../../services/cards/aspectPenalties'
import { useDeckBuilder } from '../../contexts/DeckBuilderContext'
import type { SortOption } from './SortControls'

export interface CardPosition {
  card: {
    name: string
    isBase?: boolean
    isLeader?: boolean
    [key: string]: unknown
  }
  section: string
  visible?: boolean
  enabled?: boolean
}

export interface AspectPenaltyToggleProps {
  sortOption: SortOption
  activeLeader?: string | null
  activeBase?: string | null
  cardPositions?: Record<string, CardPosition>
  showAspectPenalties?: boolean
  setShowAspectPenalties?: (show: boolean) => void
}

export function AspectPenaltyToggle({
  sortOption,
  activeLeader: activeLeaderProp,
  activeBase: activeBaseProp,
  cardPositions: cardPositionsProp,
  showAspectPenalties: showAspectPenaltiesProp,
  setShowAspectPenalties: setShowAspectPenaltiesProp,
}: AspectPenaltyToggleProps) {
  // Try to get values from context
  let contextValue: ReturnType<typeof useDeckBuilder> | null = null
  try {
    contextValue = useDeckBuilder()
  } catch {
    // Not inside a provider
  }

  const activeLeader = activeLeaderProp ?? contextValue?.activeLeader
  const activeBase = activeBaseProp ?? contextValue?.activeBase
  const cardPositions = cardPositionsProp ?? contextValue?.cardPositions ?? {}
  const showAspectPenalties = showAspectPenaltiesProp ?? contextValue?.showAspectPenalties ?? false
  const setShowAspectPenalties = setShowAspectPenaltiesProp ?? contextValue?.setShowAspectPenalties

  // Aspect penalties only meaningful when sorting by cost.
  // Render an invisible placeholder otherwise so the row layout stays the same in Pool & Deck.
  if (sortOption !== 'cost') {
    return <div aria-hidden="true" style={{ visibility: 'hidden', flex: '1 1 auto' }} />
  }

  // When leader and base are selected, show the toggle
  if (activeLeader && activeBase) {
    const leaderCard = cardPositions[activeLeader]?.card
    const abilityDesc = getLeaderAbilityDescription(leaderCard)

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <Button
          variant="toggle"
          glowColor="yellow"
          size="xs"
          active={showAspectPenalties}
          className={showAspectPenalties ? "aspect-penalty-button-active" : "aspect-penalty-button"}
          onClick={(e: MouseEvent) => {
            e.stopPropagation()
            setShowAspectPenalties?.(!showAspectPenalties)
          }}
        >
          <span className="desktop-text">
            {showAspectPenalties ? 'Hide Aspect Penalties' : 'Include Aspect Penalties'}
          </span>
          <span className="mobile-text">Aspect Penalties</span>
        </Button>
        {showAspectPenalties && abilityDesc && (
          <span style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.7)', fontStyle: 'italic' }}>
            {leaderCard.name}: {abilityDesc}
          </span>
        )}
      </div>
    )
  }

  // When leader/base not selected, show disabled button with red styling
  return (
    <Button
      variant="primary"
      size="xs"
      className="aspect-penalty-disabled"
      disabled
    >
      Select a leader and base to include aspect penalties
    </Button>
  )
}

export default AspectPenaltyToggle

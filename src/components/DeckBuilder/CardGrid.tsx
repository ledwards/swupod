// @ts-nocheck
/**
 * CardGrid Component
 *
 * Renders a grid of card groups using the provided render function.
 * Standardizes the card grid layout used in DeckSection and PoolSection.
 */

import type { ReactNode } from 'react'

export interface CardGroup {
  key: string
  cards: unknown[]
  [key: string]: unknown
}

export interface CardGridProps {
  groups: CardGroup[] | null
  renderCardStack: (group: CardGroup, renderCard: (card: unknown, index: number) => ReactNode) => ReactNode
  renderCard: (card: unknown, index: number) => ReactNode
  className?: string
}

export function CardGrid({ groups, renderCardStack, renderCard, className = '' }: CardGridProps) {
  if (!groups || groups.length === 0) {
    return null
  }

  return (
    <div className={`cards-grid ${className}`.trim()}>
      {groups.map(group => renderCardStack(group, renderCard))}
    </div>
  )
}

export default CardGrid

// @ts-nocheck
/**
 * CardDensityToggle Component
 *
 * Three-button toggle for controlling card display density in Pool/Deck sections.
 * Applies in both arena and playmat views.
 *
 *  - small: overlapping fan (current arena deck behavior, tops only)
 *  - medium: top ~25% of each card, no overlap, one after another vertically
 *  - large: full-size cards, no overlap
 */

import type { MouseEvent } from 'react'

export type CardDensity = 'small' | 'medium' | 'large'

export interface CardDensityToggleProps {
  value: CardDensity
  onChange: (density: CardDensity) => void
  /** Which density options to show, in order. Defaults to all three. */
  densities?: CardDensity[]
}

const ALL_DENSITIES: CardDensity[] = ['small', 'medium', 'large']

export function CardDensityToggle({ value, onChange, densities = ALL_DENSITIES }: CardDensityToggleProps) {
  const handleClick = (density: CardDensity) => (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onChange(density)
  }

  return (
    <div
      className="card-density-toggle"
      onClick={(e) => e.stopPropagation()}
      role="group"
      aria-label="Card density"
    >
      {densities.map(density => (
        <button
          key={density}
          type="button"
          className={`card-density-toggle-button card-density-toggle-button--${density} ${value === density ? 'active' : ''}`}
          onClick={handleClick(density)}
          title={density.charAt(0).toUpperCase() + density.slice(1)}
          aria-label={`${density} cards`}
          aria-pressed={value === density}
          data-density={density}
        >
          <span className="card-density-toggle-preview" />
        </button>
      ))}
    </div>
  )
}

export default CardDensityToggle

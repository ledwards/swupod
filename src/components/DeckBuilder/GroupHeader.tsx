// @ts-nocheck
/**
 * GroupHeader Component
 *
 * Renders the header for card groups when sorting by cost, type, or aspect.
 * Used in both Deck and Pool sections of the Grid View.
 */

import type { ReactNode } from 'react'
import { TypeIcon } from './TypeIcon'
import type { SortOption } from './SortControls'

export interface GroupHeaderProps {
  groupKey: string
  count: number
  sortOption: SortOption
  getAspectSymbol: (aspect: string, size: string) => ReactNode
}

export function GroupHeader({ groupKey, count, sortOption, getAspectSymbol }: GroupHeaderProps) {
  if (sortOption === 'cost') {
    const costValue = groupKey === '8+' ? '8+' : groupKey
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <div style={{ position: 'relative', width: '28px', height: '28px' }}>
          <img src="/icons/cost.png" alt="Cost" style={{ width: '28px', height: '28px' }} />
          <span style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: `translate(-50%, -50%)${costValue === '8+' ? ' translateX(1px)' : ''}`,
            color: 'white',
            fontWeight: 'bold',
            fontSize: '14px',
            textShadow: '1px 1px 2px rgba(0, 0, 0, 0.8)'
          }}>
            {costValue}
          </span>
        </div>
        <span>({count})</span>
      </div>
    )
  }

  if (sortOption === 'type') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <TypeIcon type={groupKey} />
        <span>{groupKey} ({count})</span>
      </div>
    )
  }

  // Aspect grouping (default)
  let aspectName = groupKey
  if (groupKey === 'ZZZ_Neutral') {
    aspectName = 'Neutral'
  } else {
    const match = groupKey.match(/^[A-Z]_(.+)$/)
    if (match) aspectName = match[1]
  }

  // Parse aspects from the key (could be single like "Vigilance" or dual like "Aggression Villainy")
  const aspects = aspectName.includes(' ') ? aspectName.split(' ') : [aspectName]
  const aspectIcons = aspects.map((aspect, i) => {
    const symbol = getAspectSymbol(aspect.trim(), 'medium')
    return symbol ? <span key={i}>{symbol}</span> : null
  }).filter(Boolean)

  // Format display name (convert space to " / " for readability)
  const displayName = aspects.join(' / ')

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      {aspectIcons.length > 0 && <div style={{ display: 'flex', gap: '2px' }}>{aspectIcons}</div>}
      <span>({count})</span>
    </div>
  )
}

export default GroupHeader

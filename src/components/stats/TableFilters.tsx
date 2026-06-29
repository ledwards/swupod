'use client'

import { useState } from 'react'
import { AspectIcon, ASPECTS } from '@/src/components/AspectIcon'

const COLOR_ASPECTS = ['Vigilance', 'Command', 'Aggression', 'Cunning']
const FILTER_OPTIONS = [...ASPECTS, 'Neutral', 'Multicolor']

export function useTableFilter(startAllOn = true) {
  const [search, setSearch] = useState('')
  const [activeAspects, setActiveAspects] = useState<Set<string>>(startAllOn ? new Set(FILTER_OPTIONS) : new Set())

  const toggleAspect = (aspect: string) => {
    setActiveAspects(prev => {
      const next = new Set(prev)
      if (next.has(aspect)) {
        next.delete(aspect)
      } else {
        next.add(aspect)
      }
      return next
    })
  }

  const clearAll = () => setActiveAspects(new Set())

  const filterFn = (card: { cardName: string; subtitle?: string | null; aspects: string[] }) => {
    if (search && !`${card.cardName} ${card.subtitle || ''}`.toLowerCase().includes(search.toLowerCase())) return false
    if (activeAspects.size === 0) return false
    if (activeAspects.size >= FILTER_OPTIONS.length) return true

    const cardColorAspects = card.aspects.filter(a => COLOR_ASPECTS.includes(a))
    const isNeutral = cardColorAspects.length === 0
    const isMulticolor = cardColorAspects.length >= 2

    let hasMatch = false
    if (card.aspects.some(a => activeAspects.has(a))) hasMatch = true
    if (activeAspects.has('Neutral') && isNeutral) hasMatch = true
    if (activeAspects.has('Multicolor') && isMulticolor) hasMatch = true

    return hasMatch
  }

  return { search, setSearch, activeAspects, toggleAspect, clearAll, filterFn }
}

export function AspectFilterButtons({ activeAspects, toggleAspect, clearAll }: { activeAspects: Set<string>; toggleAspect: (a: string) => void; clearAll?: () => void }) {
  return (
    <div className="stats-aspect-filter">
      {ASPECTS.map(aspect => (
        <button
          key={aspect}
          className={`stats-aspect-btn ${activeAspects.has(aspect) ? 'active' : ''}`}
          onClick={() => toggleAspect(aspect)}
          title={aspect}
        >
          <AspectIcon aspect={aspect} size="sm" />
        </button>
      ))}
      <button
        className={`stats-aspect-btn stats-aspect-btn-text ${activeAspects.has('Neutral') ? 'active' : ''}`}
        onClick={() => toggleAspect('Neutral')}
        title="Neutral (no color aspects)"
      >
        <span className="stats-aspect-label">N</span>
      </button>
      <button
        className={`stats-aspect-btn stats-aspect-btn-text stats-aspect-btn-multi ${activeAspects.has('Multicolor') ? 'active' : ''}`}
        onClick={() => toggleAspect('Multicolor')}
        title="Multicolor (2+ color aspects)"
      >
        <span className="stats-aspect-label">M</span>
      </button>
      {clearAll && (
        <button
          className="stats-aspect-btn stats-aspect-btn-text"
          onClick={clearAll}
          title="Clear all filters"
          style={{ fontSize: '0.7rem', opacity: 0.7 }}
        >
          Clear
        </button>
      )}
    </div>
  )
}

export function TableFilter({ search, setSearch, activeAspects, toggleAspect, clearAll, placeholder = 'Search cards...' }: {
  search: string
  setSearch: (s: string) => void
  activeAspects: Set<string>
  toggleAspect: (a: string) => void
  clearAll?: () => void
  placeholder?: string
}) {
  return (
    <div className="stats-table-filter">
      <input
        type="text"
        placeholder={placeholder}
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="stats-search-input"
      />
      <AspectFilterButtons
        activeAspects={activeAspects}
        toggleAspect={toggleAspect}
        {...(clearAll ? { clearAll } : {})}
      />
    </div>
  )
}

export function AspectsCell({ aspects }: { aspects: string[] }) {
  return (
    <td>
      <div className="aspects-cell">
        {aspects.map((aspect, i) => (
          <img key={i} src={`/icons/${aspect.toLowerCase()}.png`} alt={aspect} className="aspect-icon" />
        ))}
      </div>
    </td>
  )
}

'use client'

import Button from '@/src/components/Button'
import { AspectIcon, ASPECTS } from '@/src/components/AspectIcon'
import { SearchIcon } from '@/src/components/YourStats/GameplayDashboard'
import type { useTableFilter } from '@/src/components/stats/TableFilters'

/** Slim card search plus aspect toggles; filtering logic comes from useTableFilter. */
export function CardFilterBar({ filter }: { filter: ReturnType<typeof useTableFilter> }) {
  return (
    <div className="mstats-filter-bar">
      <label className="your-stats-search">
        <SearchIcon />
        <input value={filter.search} onChange={(e) => filter.setSearch(e.target.value)} placeholder="Search cards" aria-label="Search cards" />
      </label>
      <div className="mstats-toggle-group" role="group" aria-label="Aspects">
        {ASPECTS.map((aspect) => {
          const on = filter.activeAspects.has(aspect)
          return (
            <Button key={aspect} variant="toggle" size="xs" active={on} aria-pressed={on} aria-label={aspect} title={aspect} onClick={() => filter.toggleAspect(aspect)}>
              <AspectIcon aspect={aspect} size="sm" />
            </Button>
          )
        })}
      </div>
    </div>
  )
}

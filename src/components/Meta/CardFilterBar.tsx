'use client'

import Button from '@/src/components/Button'
import { AspectIcon, ASPECTS } from '@/src/components/AspectIcon'
import { SearchInput } from '@/src/components/SearchInput'
import type { useTableFilter } from '@/src/components/stats/TableFilters'

/** Slim card search plus aspect toggles; filtering logic comes from useTableFilter. */
export function CardFilterBar({ filter }: { filter: ReturnType<typeof useTableFilter> }) {
  return (
    <div className="mstats-filter-bar">
      <SearchInput value={filter.search} onChange={filter.setSearch} placeholder="Search cards" aria-label="Search cards" />
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

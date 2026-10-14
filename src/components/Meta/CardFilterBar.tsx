'use client'

import Button from '@/src/components/Button'
import { SearchInput } from '@/src/components/SearchInput'
import { AspectIcon, ASPECTS } from '@/src/components/AspectIcon'
import type { useTableFilter } from '@/src/components/stats/TableFilters'

/** Card search plus aspect toggles; filtering logic comes from useTableFilter. */
export function CardFilterBar({ filter }: { filter: ReturnType<typeof useTableFilter> }) {
  return (
    <div className="meta-filter-bar">
      <SearchInput value={filter.search} onChange={filter.setSearch} placeholder="Search cards" size="sm" />
      <div className="meta-toggle-group" role="group" aria-label="Aspects">
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

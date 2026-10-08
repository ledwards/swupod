// @ts-nocheck
/**
 * ListTableHeader Component
 *
 * Reusable sortable table headers for the List View.
 * Displays column headers with sort arrows based on current sort state.
 */

import type { ChangeEvent } from 'react'

export interface TableSortState {
  field: string | null
  direction: 'asc' | 'desc'
}

export interface TableSortMap {
  [sectionId: string]: TableSortState
}

export interface ColumnDefinition {
  field: string
  label: string
  className?: string
}

export interface ListTableHeaderProps {
  sectionId: string
  tableSort: TableSortMap
  onSort: (sectionId: string, field: string) => void
  columns: ColumnDefinition[]
  showCheckbox?: boolean
  checkboxVisible?: boolean
  checkboxChecked?: boolean
  onCheckboxChange?: ((e: ChangeEvent<HTMLInputElement>) => void) | null
}

export function ListTableHeader({
  sectionId,
  tableSort,
  onSort,
  columns,
  showCheckbox = true,
  checkboxVisible = true,
  checkboxChecked = false,
  onCheckboxChange = null,
}: ListTableHeaderProps) {
  const sectionSort = tableSort[sectionId] || { field: null, direction: 'asc' }

  const getSortArrow = (field: string) => {
    if (sectionSort.field !== field) {
      return <span className="sort-arrow">↕</span>
    }
    return sectionSort.direction === 'asc'
      ? <span className="sort-arrow">↑</span>
      : <span className="sort-arrow">↓</span>
  }

  return (
    <thead>
      <tr>
        {showCheckbox && (
          <th
            className="checkbox-col"
            style={checkboxVisible ? {} : { visibility: 'hidden' }}
          >
            <input
              type="checkbox"
              checked={checkboxChecked}
              disabled={!onCheckboxChange}
              onChange={onCheckboxChange || (() => {})}
            />
          </th>
        )}
        {columns.map(({ field, label, className }) => (
          <th
            key={field}
            className={`sortable ${className || ''}`}
            onClick={() => onSort(sectionId, field)}
          >
            {label}{getSortArrow(field)}
          </th>
        ))}
      </tr>
    </thead>
  )
}

export default ListTableHeader

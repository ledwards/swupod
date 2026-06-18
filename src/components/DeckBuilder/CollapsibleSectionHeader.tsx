// @ts-nocheck
/**
 * CollapsibleSectionHeader Component
 *
 * A header that toggles section expansion with arrow indicator.
 */

import type { ReactNode } from 'react'

export interface CollapsibleSectionHeaderProps {
  id?: string
  title: string
  expanded: boolean
  onToggle: () => void
  className?: string
  rightContent?: ReactNode
}

export function CollapsibleSectionHeader({ id, title, expanded, onToggle, className = '', rightContent }: CollapsibleSectionHeaderProps) {
  return (
    <div
      id={id}
      className={`collapsible-section-header ${className}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.5rem',
        marginTop: '0.75rem',
        marginBottom: '0.35rem',
        paddingBottom: '0.25rem',
        borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
        cursor: 'pointer',
        userSelect: 'none'
      }}
      onClick={onToggle}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '1.2rem',
          fontWeight: 600,
          color: 'rgba(255, 255, 255, 0.9)',
        }}
      >
        <span>{expanded ? '▼' : '▶'}</span>
        <span>{title}</span>
      </div>
      {rightContent && (
        <div onClick={(e) => e.stopPropagation()}>
          {rightContent}
        </div>
      )}
    </div>
  )
}

export default CollapsibleSectionHeader

// @ts-nocheck
/**
 * CollapsibleSectionHeader Component
 *
 * A header that toggles section expansion with arrow indicator.
 */

export interface CollapsibleSectionHeaderProps {
  id?: string
  title: string
  expanded: boolean
  onToggle: () => void
  className?: string
}

export function CollapsibleSectionHeader({ id, title, expanded, onToggle, className = '' }: CollapsibleSectionHeaderProps) {
  return (
    <div
      id={id}
      className={`collapsible-section-header ${className}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        marginTop: '1.5rem',
        marginBottom: '0.75rem',
        fontSize: '1.2rem',
        fontWeight: 600,
        color: 'rgba(255, 255, 255, 0.9)',
        textTransform: 'uppercase',
        letterSpacing: '1px',
        paddingBottom: '0.25rem',
        borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
        cursor: 'pointer',
        userSelect: 'none'
      }}
      onClick={onToggle}
    >
      <span>{expanded ? '▼' : '▶'}</span>
      <span>{title}</span>
    </div>
  )
}

export default CollapsibleSectionHeader

/**
 * TypeIcon Component
 *
 * Card-type icon for deck builder group headers (Ground Units, Space Units,
 * Upgrades, Events). The glyphs live in the shared KindIcon so every surface
 * draws card kinds the same way.
 */
import { KindIcon, normalizeKind } from '../CardIcons'

export interface TypeIconProps {
  type: string
}

export function TypeIcon({ type }: TypeIconProps) {
  if (normalizeKind(type)) return <KindIcon kind={type} size={20} label={type} />
  // Default/unknown type
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

export default TypeIcon

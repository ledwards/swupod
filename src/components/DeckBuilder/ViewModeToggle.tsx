// @ts-nocheck
/**
 * ViewModeToggle Component
 *
 * Three-part toggle button between arena, grid (playmat), and list (table) views.
 * Positioned to the left of the user avatar.
 */

import type { MouseEvent } from 'react'

export type ViewMode = 'grid' | 'list' | 'arena'

export interface ViewModeToggleProps {
  viewMode: ViewMode
  setViewMode: (mode: ViewMode) => void
  showNavTooltip: (text: string, e: MouseEvent, position?: 'left' | 'below') => void
  hideTooltip: () => void
}

// Grid icon (4 squares) - Playmat
const GridIcon = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2 2H8V8H2V2Z" stroke="currentColor" strokeWidth="2" fill="none"/>
    <path d="M12 2H18V8H12V2Z" stroke="currentColor" strokeWidth="2" fill="none"/>
    <path d="M2 12H8V18H2V12Z" stroke="currentColor" strokeWidth="2" fill="none"/>
    <path d="M12 12H18V18H12V12Z" stroke="currentColor" strokeWidth="2" fill="none"/>
  </svg>
)

// List icon (4 horizontal lines) - Table
const ListIcon = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="3" width="16" height="2" fill="currentColor"/>
    <rect x="2" y="7" width="16" height="2" fill="currentColor"/>
    <rect x="2" y="11" width="16" height="2" fill="currentColor"/>
    <rect x="2" y="15" width="16" height="2" fill="currentColor"/>
  </svg>
)

// Arena icon (hexagon)
const ArenaIcon = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <polygon points="10,1 18,5 18,15 10,19 2,15 2,5" stroke="currentColor" strokeWidth="2" fill="none"/>
  </svg>
)

const VIEW_MODE_CONFIG: { mode: ViewMode; label: string; Icon: () => JSX.Element }[] = [
  { mode: 'arena', label: 'Arena', Icon: ArenaIcon },
  { mode: 'grid', label: 'Playmat', Icon: GridIcon },
  { mode: 'list', label: 'Table', Icon: ListIcon },
]

export function ViewModeToggle({ viewMode, setViewMode, showNavTooltip, hideTooltip }: ViewModeToggleProps) {
  return (
    <div className="view-mode-toggle-container">
      <div className="view-mode-toggle-group">
        {VIEW_MODE_CONFIG.map(({ mode, label, Icon }) => (
          <button
            key={mode}
            className={`view-mode-toggle-button ${viewMode === mode ? 'active' : ''} ${mode === 'arena' ? 'arena-only' : ''}`}
            onClick={() => setViewMode(mode)}
            onMouseEnter={(e) => showNavTooltip(label, e, 'below')}
            onMouseLeave={hideTooltip}
          >
            <Icon />
          </button>
        ))}
      </div>
    </div>
  )
}

export default ViewModeToggle

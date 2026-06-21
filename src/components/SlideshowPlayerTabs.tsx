'use client'

/**
 * SlideshowPlayerTabs — multi-select player tabs + "All" (Unit U5).
 *
 * One tab per seat: a circular avatar on the LEFT of a text column showing the
 * seat's name, its drafted leader, and its drafted base (name tinted by the
 * base's first aspect, with small aspect icons). Plus an "All" button that
 * selects every UNLOCKED seat.
 *
 * Selectable tabs use the shared Button component (`variant="toggle"
 * glowColor="blue" active`) — the rich avatar/name/leader/base content fits as
 * the button's children (no nested interactive elements, so no nested-<button>
 * violation), which keeps the blue-glow active token automatic per the style
 * guide and the project's "use Button for toggles" rule.
 *
 * Locked seats (R12) render their identity (avatar + name + reduced-opacity
 * leader/base) with `Button variant="warning"` + a lock icon, are
 * `aria-disabled`, carry `aria-label="Private seat — {username}"`, are NOT
 * clickable, and are excluded from "All".
 *
 * Plain-click toggles a seat in/out (no modifier keys). The shell
 * (DraftSlideshow) prevents emptying the selection and owns "All"'s active
 * state (true iff every unlocked seat is selected — never on a partial set).
 */

import './SlideshowPlayerTabs.css'
import Button from './Button'
import { ASPECT_COLORS } from '../utils/aspectColors'
import type { SlideshowPlayerTabsProps, SlideshowSeat } from './DraftSlideshow'

const AVATAR_FALLBACK = '/icons/discord-logo.png'

/** Small lock glyph for locked (private) seats. Local so the file stays self-contained. */
function LockIcon() {
  return (
    <svg
      className="slideshow-player-tab__lock-icon"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

/** Compact row of aspect icons (e.g. for a base's aspects). */
function AspectIcons({ aspects }: { aspects?: string[] | null }) {
  if (!aspects || aspects.length === 0) return null
  return (
    <span className="slideshow-player-tab__aspects">
      {aspects.map((aspect, idx) => (
        <img
          key={`${aspect}-${idx}`}
          src={`/icons/${aspect.toLowerCase()}.png`}
          alt={aspect}
          className="slideshow-player-tab__aspect-icon"
        />
      ))}
    </span>
  )
}

/** Circular avatar with a Discord-logo fallback (bots already carry their own avatar). */
function TabAvatar({ seat }: { seat: SlideshowSeat }) {
  return (
    <img
      className="slideshow-player-tab__avatar"
      src={seat.avatarUrl || AVATAR_FALLBACK}
      alt=""
      aria-hidden="true"
    />
  )
}

/** Name + leader + base text column (shared by selectable and locked tabs). */
function TabIdentity({ seat }: { seat: SlideshowSeat }) {
  const baseColor =
    seat.chosenBase?.aspects?.[0] != null
      ? ASPECT_COLORS[seat.chosenBase.aspects[0] as keyof typeof ASPECT_COLORS] || 'white'
      : 'white'

  return (
    <span className="slideshow-player-tab__identity">
      <span className="slideshow-player-tab__name" title={seat.username}>
        {seat.username}
      </span>
      {seat.activeLeaderName && (
        <span className="slideshow-player-tab__leader" title={seat.activeLeaderName}>
          {seat.activeLeaderName}
        </span>
      )}
      {seat.chosenBase && (
        <span className="slideshow-player-tab__base">
          <span
            className="slideshow-player-tab__base-name"
            style={{ color: baseColor }}
            title={seat.chosenBase.name}
          >
            {seat.chosenBase.name}
          </span>
          <AspectIcons aspects={seat.chosenBase.aspects} />
        </span>
      )}
    </span>
  )
}

export function SlideshowPlayerTabs({
  seats,
  selectedSeats,
  onToggleSeat,
  onSelectAll,
  allSelected,
}: SlideshowPlayerTabsProps) {
  return (
    <div className="slideshow-player-tabs" role="group" aria-label="Players">
      <Button
        variant="toggle"
        glowColor="blue"
        active={allSelected}
        onClick={onSelectAll}
        className="slideshow-player-tab slideshow-player-tab--all"
      >
        All
      </Button>

      {(seats || []).map(seat => {
        // Locked seat (R12): identity visible, never selectable, excluded from "All".
        if (seat.locked) {
          return (
            <Button
              key={seat.seatNumber}
              variant="warning"
              className="slideshow-player-tab slideshow-player-tab--locked"
              aria-label={`Private seat — ${seat.username}`}
              aria-disabled="true"
            >
              <TabAvatar seat={seat} />
              <TabIdentity seat={seat} />
              <LockIcon />
            </Button>
          )
        }

        const selected = selectedSeats.has(seat.seatNumber)
        return (
          <Button
            key={seat.seatNumber}
            variant="toggle"
            glowColor="blue"
            active={selected}
            aria-pressed={selected}
            onClick={() => onToggleSeat(seat.seatNumber)}
            className="slideshow-player-tab"
          >
            <TabAvatar seat={seat} />
            <TabIdentity seat={seat} />
          </Button>
        )
      })}
    </div>
  )
}

export default SlideshowPlayerTabs

'use client'

import type { CSSProperties } from 'react'
import Button from './Button'
import type { SeatSelection, SlideshowSeat } from './draftSlideshowTypes'

const AVATAR_FALLBACK = '/ptp_logo400.png'
const RULE_WITH_RESPECT_HYPERSPACE_IMAGE = 'https://cdn.starwarsunlimited.com//card_0202375_EN_Rule_with_Respect_2ee7f9b662.png'

type PlayerTabStyle = CSSProperties & {
  '--slideshow-tab-avatar': string
}

type AllTabStyle = CSSProperties & {
  '--slideshow-all-tab-art': string
}

function LockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

function cssUrl(url: string): string {
  return `url("${url.replace(/["\\]/g, '\\$&')}")`
}

function playerTabBackground(url: string): PlayerTabStyle {
  return {
    '--slideshow-tab-avatar': cssUrl(url),
  }
}

function allTabBackground(): AllTabStyle {
  return {
    '--slideshow-all-tab-art': cssUrl(RULE_WITH_RESPECT_HYPERSPACE_IMAGE),
  }
}

export default function SlideshowPlayerTabs({
  seats = [],
  selectedSeats,
  onSelectionChange,
}: {
  seats: SlideshowSeat[]
  selectedSeats: SeatSelection
  onSelectionChange: (next: SeatSelection) => void
}) {
  const unlockedSeats = seats.filter(seat => !seat.locked && seat.picks)
  const allUnlockedSelected = unlockedSeats.length > 0 &&
    unlockedSeats.every(seat => selectedSeats.has(seat.seatNumber))

  const toggleAll = () => {
    onSelectionChange(allUnlockedSelected
      ? new Set()
      : new Set(unlockedSeats.map(seat => seat.seatNumber))
    )
  }

  const toggleSeat = (seatNumber: number) => {
    if (allUnlockedSelected && selectedSeats.has(seatNumber)) {
      onSelectionChange(new Set([seatNumber]))
      return
    }

    const next = new Set(selectedSeats)
    if (next.has(seatNumber)) {
      if (next.size === 1) return
      next.delete(seatNumber)
    } else {
      next.add(seatNumber)
    }
    onSelectionChange(next)
  }

  return (
    <div className="draft-slideshow-tabs" aria-label="Players">
      <Button
        variant="toggle"
        glowColor="blue"
        active={allUnlockedSelected}
        disabled={unlockedSeats.length === 0}
        className="draft-slideshow-all-tab"
        onClick={toggleAll}
        style={allTabBackground()}
        aria-label={allUnlockedSelected ? 'Deselect all players' : 'Select all players'}
      >
        <span className="draft-slideshow-all-tab-label">{allUnlockedSelected ? 'None' : 'All'}</span>
      </Button>

      <div className="draft-slideshow-tab-list" role="list">
        {seats.map(seat => {
          const selected = selectedSeats.has(seat.seatNumber)
          const locked = seat.locked || !seat.picks
          const baseName = seat.chosenBase?.name || 'No base'
          const leaderName = seat.activeLeaderName || 'No leader'
          const tabStyle = playerTabBackground(seat.avatarUrl || AVATAR_FALLBACK)

          return (
            <button
              key={seat.seatNumber}
              type="button"
              className={`draft-slideshow-player-tab ${selected ? 'active' : ''} ${locked ? 'locked' : ''}`}
              onClick={() => !locked && toggleSeat(seat.seatNumber)}
              disabled={locked}
              aria-pressed={!locked ? selected : undefined}
              aria-disabled={locked || undefined}
              aria-label={locked ? `Private seat - ${seat.username}` : `${selected ? 'Deselect' : 'Select'} ${seat.username}`}
              data-testid="slideshow-player-tab"
              data-seat-number={seat.seatNumber}
              style={tabStyle}
            >
              <span className="draft-slideshow-tab-copy">
                <span className="draft-slideshow-tab-name">
                  {seat.username}
                  {locked && <LockIcon />}
                </span>
                <span className="draft-slideshow-tab-detail">{leaderName}</span>
                <span className="draft-slideshow-tab-detail base">{baseName}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

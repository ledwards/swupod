'use client'
import Button from '../Button'
import { AspectIcon } from '../AspectIcon'
import { LockIcon } from '../DraftLog/icons'
import type { SlideshowSeat } from '@/app/api/draft/[shareId]/report/slideshow/route'

/**
 * The slideshow's player toggles: All Players, then one per seat (seat number,
 * name, the deck's aspects and leader). Private seats show but can't be picked.
 */
export default function ReviewSeatTabs({ seats, selected, allSelected, viewerSeat, onToggleSeat, onToggleAll }: {
  seats: SlideshowSeat[]
  selected: ReadonlySet<number>
  allSelected: boolean
  viewerSeat: number | null
  onToggleSeat: (seat: number) => void
  onToggleAll: () => void
}) {
  return (
    <div className="drv-tabs" role="group" aria-label="Players">
      <Button variant="toggle" className="drv-tab" active={allSelected} aria-pressed={allSelected} onClick={onToggleAll}
        aria-label={allSelected ? 'Deselect all players' : 'Select all players'}>
        All Players
      </Button>
      {seats.map(seat => {
        const no = <span className="dlog-seat-no">{seat.seatNumber}</span>
        if (seat.locked) {
          return (
            <Button key={seat.seatNumber} variant="toggle" className="drv-tab is-locked" aria-disabled="true"
              aria-label={`Private seat — ${seat.username}`} title={`${seat.username}’s picks are private`}>
              {no}
              <span className="drv-tab-text">{seat.username}<small>Picks are private</small></span>
              <span className="dlog-switch-lock"><LockIcon open={false}/></span>
            </Button>
          )
        }
        const on = selected.has(seat.seatNumber)
        return (
          <Button key={seat.seatNumber} variant="toggle" className="drv-tab" active={on} aria-pressed={on}
            onClick={() => onToggleSeat(seat.seatNumber)}
            title={[seat.username, seat.activeLeaderName, seat.chosenBase?.name].filter(Boolean).join(' · ')}>
            {no}
            <span className="drv-tab-text">
              <span className="drv-tab-name">{seat.username}{seat.seatNumber === viewerSeat && <span className="dlog-you">You</span>}</span>
              {(seat.activeLeaderName || seat.chosenBase) && (
                <small>
                  {(seat.chosenBase?.aspects ?? []).map(a => <AspectIcon key={a} aspect={a} size="xs"/>)}
                  {seat.activeLeaderName ?? seat.chosenBase?.name}
                </small>
              )}
            </span>
          </Button>
        )
      })}
    </div>
  )
}

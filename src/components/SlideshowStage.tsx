'use client'

/**
 * SlideshowStage — the fitted card STAGE (Unit U6): the load-bearing visual unit.
 *
 * Fills the measured content box with the SELECTED seats' packs-on-offer at the
 * current slide, sized to the largest card that fits WITHOUT scrolling, with the
 * picked card flagged via the existing `.selected` rainbow border.
 *
 * "Components Don't Calculate": the fit math is the pure util `slideshowFit`; this
 * component measures (via `useElementSize`), calls the util, and writes the result
 * as a SINGLE `--slide-card-w` CSS variable on the stage container — never a
 * per-card inline style. The stage is deliberately NOT a descendant of
 * `.cards-grid`, and `SlideshowStage.css` overrides `Card.css`'s base
 * `.canvas-card { width:120px }` so the fitted size isn't silently clamped.
 *
 * Two layouts (per the plan's Layout decision matrix):
 *   - Single-player (1 seat): flow that seat's `visibleCards` into the R×C grid
 *     from `computeSinglePlayerFit`, centered. A preview-size native cap keeps a
 *     lone last-pick card comfortable rather than full-screen (R6).
 *   - Multi-player (>=2 seats): one labeled row per seat — avatar (left) + name in
 *     a fixed gutter, then that seat's cards in a row at the uniform `cardH` from
 *     `computeMultiPlayerFit`. An empty `visibleCards` keeps its row via a neutral
 *     "No cards" tile sized to `cardH` (never drop a seat's row).
 *
 * Stage cards are `tabIndex=-1` so up to ~112 cards never become a keyboard trap;
 * the hover / long-press preview (CardWithPreview) is the detail-on-demand path.
 */

import { useMemo, useState } from 'react'
import './SlideshowStage.css'
import CardWithPreview from './CardWithPreview'
import DraftReviewModal from './DraftReviewModal'
import type { CardData } from './Card'
import type { SlideshowStageProps, SlideshowSeat } from './DraftSlideshow'
import { useElementSize } from '../hooks/useElementSize'
import {
  computeSinglePlayerFit,
  computeMultiPlayerFit,
  type NativeCap,
} from '../utils/slideshowFit'

// Card aspect ratios (width / height). Portrait = drafted cards; landscape =
// leader slides (packNumber === 0). Mirrors Card.css's `aspect-ratio`.
const PORTRAIT_ASPECT = 2.5 / 3.5
const LANDSCAPE_ASPECT = 3.5 / 2.5

// Single-player native cap = the CardPreview size, so a lone last-pick card
// renders comfortably centered (preview-scale), NOT stretched full-height (R6).
const SINGLE_CAP_PORTRAIT: NativeCap = { w: 360, h: 504 }
const SINGLE_CAP_LANDSCAPE: NativeCap = { w: 504, h: 360 }

// Multi-player native cap = the asset's full source resolution, so dense rows
// stay sharp while the fit shrinks them to contain all rows without scrolling.
const MULTI_CAP_PORTRAIT: NativeCap = { w: 734, h: 1024 }
const MULTI_CAP_LANDSCAPE: NativeCap = { w: 1024, h: 734 }

// Tunable layout constants (the fit util takes them as params; tuning here does
// not change logic). Label gutter holds the avatar + name in multi-player rows.
const GAP = 8
const LABEL_GUTTER_W = 150
const MIN_CARD_H = 70

const AVATAR_FALLBACK = '/icons/discord-logo.png'

type VisibleCard = { instanceId: string; [key: string]: unknown }

/** Read a seat's pack-on-offer at the current slide (empty if locked/absent). */
function seatVisibleCards(seat: SlideshowSeat, slideIndex: number): VisibleCard[] {
  return seat.picks?.[slideIndex]?.visibleCards ?? []
}

/** Read a seat's picked instanceId at the current slide (null when none). */
function seatPickedId(seat: SlideshowSeat, slideIndex: number): string | null {
  return seat.picks?.[slideIndex]?.pickedInstanceId ?? null
}

/** True when a seat's (public) picks include at least one real choice. */
function seatHasPickHistory(seat: SlideshowSeat): boolean {
  return (seat.picks ?? []).some(pick => pick.pickedInstanceId)
}

/**
 * Reconstruct a seat's chosen cards + leaders from its pick history, tagged with
 * pick/pack info, in the exact shape DraftReviewModal consumes. Locked seats
 * (no `picks`) yield empty lists.
 */
function seatChosenCards(seat: SlideshowSeat): { cards: any[]; leaders: any[] } {
  const cards: any[] = []
  const leaders: any[] = []
  for (const pick of seat.picks ?? []) {
    if (!pick.pickedInstanceId) continue
    const chosen = pick.visibleCards.find(card => card.instanceId === pick.pickedInstanceId)
    if (!chosen) continue
    const withPickInfo = {
      ...chosen,
      pickNumber: pick.overallPickNumber,
      packNumber: pick.packNumber,
      pickInPack: pick.pickInPack,
    }
    if (pick.type === 'leader') leaders.push(withPickInfo)
    else cards.push(withPickInfo)
  }
  return { cards, leaders }
}

export function SlideshowStage({ seats, slideIndex }: SlideshowStageProps) {
  const { ref, width, height } = useElementSize<HTMLDivElement>()

  // Seat whose "Picked Cards" history modal is open (null = closed).
  const [picksSeat, setPicksSeat] = useState<SlideshowSeat | null>(null)
  const picksHistory = useMemo(() => (picksSeat ? seatChosenCards(picksSeat) : null), [picksSeat])

  const isMulti = seats.length >= 2

  // The slide's card aspect: leaders (packNumber 0) are landscape; cards portrait.
  // All selected seats share the same (packNumber, pickInPack) at slideIndex, so
  // reading the first available pick's packNumber is sufficient.
  const isLeaderSlide = useMemo(() => {
    for (const seat of seats) {
      const pick = seat.picks?.[slideIndex]
      if (pick) return pick.packNumber === 0
    }
    return false
  }, [seats, slideIndex])

  const aspect = isLeaderSlide ? LANDSCAPE_ASPECT : PORTRAIT_ASPECT

  // ---- Single-player fit -------------------------------------------------
  const singleFit = useMemo(() => {
    if (isMulti || !seats[0] || width <= 0 || height <= 0) return null
    const n = seatVisibleCards(seats[0], slideIndex).length
    return computeSinglePlayerFit({
      boxW: width,
      boxH: height,
      n,
      aspect,
      nativeCap: isLeaderSlide ? SINGLE_CAP_LANDSCAPE : SINGLE_CAP_PORTRAIT,
      gap: GAP,
    })
  }, [isMulti, seats, slideIndex, width, height, aspect, isLeaderSlide])

  // ---- Multi-player fit --------------------------------------------------
  const multiFit = useMemo(() => {
    if (!isMulti || width <= 0 || height <= 0) return null
    const perRowCounts = seats.map(s => seatVisibleCards(s, slideIndex).length)
    return computeMultiPlayerFit({
      boxW: width,
      boxH: height,
      perRowCounts,
      aspect,
      nativeCap: isLeaderSlide ? MULTI_CAP_LANDSCAPE : MULTI_CAP_PORTRAIT,
      labelGutterW: LABEL_GUTTER_W,
      gap: GAP,
      minCardH: MIN_CARD_H,
    })
  }, [isMulti, seats, slideIndex, width, height, aspect, isLeaderSlide])

  // Single CSS-variable write for the whole stage (not 112 inline styles). The
  // scoped `.slideshow-stage .canvas-card` rule consumes it, overriding the base
  // 120px so the fitted size actually applies.
  const cardW = isMulti ? multiFit?.cardW ?? 0 : singleFit?.cardW ?? 0
  const cardH = isMulti ? multiFit?.cardH ?? 0 : singleFit?.cardH ?? 0
  const stageStyle = {
    '--slide-card-w': `${cardW}px`,
    '--slide-card-h': `${cardH}px`,
    '--slide-gap': `${GAP}px`,
    '--slide-label-gutter': `${LABEL_GUTTER_W}px`,
  } as React.CSSProperties

  // ---- Single-player rows (memoized) ------------------------------------
  const singleContent = useMemo(() => {
    if (isMulti) return null
    const seat = seats[0]
    if (!seat) return null
    const cards = seatVisibleCards(seat, slideIndex)
    const pickedId = seatPickedId(seat, slideIndex)
    const cols = singleFit?.cols ?? 0
    return (
      <div
        className="slideshow-stage-single"
        style={cols > 0 ? ({ '--slide-cols': cols } as React.CSSProperties) : undefined}
      >
        {cards.map(card => (
          <div key={card.instanceId} className="slideshow-stage-card" tabIndex={-1}>
            <CardWithPreview
              card={card as unknown as CardData}
              selected={card.instanceId === pickedId}
            />
          </div>
        ))}
      </div>
    )
  }, [isMulti, seats, slideIndex, singleFit])

  // ---- Multi-player rows (memoized) -------------------------------------
  const multiContent = useMemo(() => {
    if (!isMulti) return null
    return (
      <div className="slideshow-stage-multi">
        {seats.map(seat => {
          const cards = seatVisibleCards(seat, slideIndex)
          const pickedId = seatPickedId(seat, slideIndex)
          return (
            <div key={seat.seatNumber} className="slideshow-stage-row">
              <div className="slideshow-stage-row-label">
                <img
                  className="slideshow-stage-avatar"
                  src={seat.avatarUrl || AVATAR_FALLBACK}
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                />
                <div className="slideshow-stage-label-text">
                  <span className="slideshow-stage-name">{seat.username}</span>
                  {seatHasPickHistory(seat) && (
                    <button
                      type="button"
                      className="slideshow-stage-picks-link"
                      onClick={() => setPicksSeat(seat)}
                    >
                      Picked Cards
                    </button>
                  )}
                </div>
              </div>
              <div className="slideshow-stage-row-cards">
                {cards.length === 0 ? (
                  // Keep the row's height so the other rows don't shift.
                  <div
                    className="slideshow-stage-empty"
                    aria-label={`${seat.username} — no cards`}
                  >
                    No cards
                  </div>
                ) : (
                  cards.map(card => (
                    // Namespace the key by seat: an instanceId can recur across seats.
                    <div
                      key={`${seat.seatNumber}:${card.instanceId}`}
                      className="slideshow-stage-card"
                      tabIndex={-1}
                    >
                      <CardWithPreview
                        card={card as unknown as CardData}
                        selected={card.instanceId === pickedId}
                      />
                    </div>
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
    )
  }, [isMulti, seats, slideIndex])

  return (
    <>
      <div
        ref={ref}
        className={`slideshow-stage ${isMulti ? 'slideshow-stage--multi' : 'slideshow-stage--single'}`}
        style={stageStyle}
      >
        {isMulti ? multiContent : singleContent}
      </div>

      {/* Reuse the exact draft pick-review modal a player sees for their own
          picks (e.g. between rounds in competitive) to show any seat's history. */}
      {picksSeat && picksHistory && (
        <DraftReviewModal
          title={`${picksSeat.username}'s Picks`}
          draftedCards={picksHistory.cards}
          draftedLeaders={picksHistory.leaders}
          onClose={() => setPicksSeat(null)}
        />
      )}
    </>
  )
}

export default SlideshowStage

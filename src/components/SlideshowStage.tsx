'use client'

import { useMemo, type CSSProperties } from 'react'
import CardWithPreview from './CardWithPreview'
import { useElementSize } from '../hooks/useElementSize'
import {
  computeLeaderGridFit,
  computeMultiPlayerFit,
  computeSinglePlayerFit,
  type LeaderGridFit,
  type MultiPlayerFit,
  type SinglePlayerFit,
} from '../utils/slideshowFit'
import type { SeatSelection, SlideshowCard, SlideshowPick, SlideshowSeat } from './draftSlideshowTypes'

const PORTRAIT = 2.5 / 3.5
const LANDSCAPE = 3.5 / 2.5
const GAP = 8
const LABEL_GUTTER_W = 96
const LABEL_CARD_GAP = 10
const LEADER_COLUMNS = 2
const LEADER_COLUMN_GAP = 20
const LEADER_LABEL_GUTTER_W = 90
const MIN_CARD_H = 72
const PORTRAIT_NATIVE = { w: 734, h: 1024 }
const LANDSCAPE_NATIVE = { w: 1024, h: 734 }
const AVATAR_FALLBACK = '/ptp_logo400.png'

type SlideshowCssVars = CSSProperties & {
  '--slide-card-w': string
  '--slide-card-gap': string
  '--slide-label-gutter-w': string
}

function getPick(seat: SlideshowSeat, slideIndex: number): SlideshowPick | null {
  return seat?.picks?.[slideIndex] || null
}

function getAspect(pick: SlideshowPick | null): number {
  return pick?.type === 'leader' || pick?.packNumber === 0 ? LANDSCAPE : PORTRAIT
}

function getNativeCap(pick: SlideshowPick | null) {
  return getAspect(pick) === LANDSCAPE ? LANDSCAPE_NATIVE : PORTRAIT_NATIVE
}

function stageCard(card: SlideshowCard, pick: SlideshowPick | null): SlideshowCard {
  if (!card) return card
  if (pick?.type === 'leader' || pick?.packNumber === 0) {
    return { ...card, isLeader: true }
  }
  return card
}

function EmptyCardTile({ landscape }: { landscape: boolean }) {
  return (
    <div className={`draft-slideshow-empty-card ${landscape ? 'landscape' : ''}`}>
      <span>No cards</span>
    </div>
  )
}

function SeatLabel({ seat }: { seat: SlideshowSeat }) {
  return (
    <div className="draft-slideshow-row-label">
      <span className="draft-slideshow-row-seat-number" aria-label={`Seat ${seat.seatNumber}`}>
        {seat.seatNumber}
      </span>
      <span className="draft-slideshow-row-identity">
        <img src={seat.avatarUrl || AVATAR_FALLBACK} alt="" aria-hidden="true" />
        <span className="draft-slideshow-row-name">{seat.username}</span>
      </span>
    </div>
  )
}

export default function SlideshowStage({
  seats = [],
  selectedSeats,
  slideIndex,
}: {
  seats: SlideshowSeat[]
  selectedSeats: SeatSelection
  slideIndex: number
}) {
  const [stageRef, size] = useElementSize(100)

  const selected = useMemo(() => {
    return seats
      .filter(seat => selectedSeats.has(seat.seatNumber) && !seat.locked && seat.picks)
      .sort((a, b) => a.seatNumber - b.seatNumber)
  }, [seats, selectedSeats])

  const firstSelectedSeat = selected[0]
  const currentPick = firstSelectedSeat ? getPick(firstSelectedSeat, slideIndex) : null
  const aspect = getAspect(currentPick)
  const nativeCap = getNativeCap(currentPick)
  const isLandscape = aspect === LANDSCAPE
  const isLeaderSlide = currentPick?.type === 'leader' || currentPick?.packNumber === 0

  const rows = selected.map(seat => {
    const pick = getPick(seat, slideIndex)
    const visibleCards = pick?.visibleCards || []
    return { seat, pick, visibleCards }
  })
  const useLeaderGrid = selected.length === 8 && isLeaderSlide

  const fit = useMemo(() => {
    if (selected.length === 1) {
      const cardCount = Math.max(0, rows[0]?.visibleCards?.length || 0)
      return computeSinglePlayerFit({
        boxW: size.width,
        boxH: size.height,
        cardCount,
        aspect,
        nativeCap,
        gap: GAP,
      })
    }

    if (useLeaderGrid) {
      return computeLeaderGridFit({
        boxW: size.width,
        boxH: size.height,
        seatCount: rows.length,
        cardsPerSeat: Math.max(1, ...rows.map(row => row.visibleCards.length)),
        aspect,
        nativeCap,
        columns: LEADER_COLUMNS,
        gap: GAP,
        columnGap: LEADER_COLUMN_GAP,
        labelGutterW: LEADER_LABEL_GUTTER_W,
        labelGap: LABEL_CARD_GAP,
        minCardH: MIN_CARD_H,
      })
    }

    return computeMultiPlayerFit({
      boxW: size.width,
      boxH: size.height,
      perRowCounts: rows.map(row => Math.max(1, row.visibleCards.length)),
      aspect,
      nativeCap,
      gap: GAP,
      labelGutterW: LABEL_GUTTER_W,
      minCardH: MIN_CARD_H,
    })
  }, [selected.length, useLeaderGrid, rows, size.width, size.height, aspect, nativeCap])

  if (selected.length === 0) {
    const hasSelectableSeats = seats.some(seat => !seat.locked && seat.picks)
    return (
      <div ref={stageRef} className="draft-slideshow-stage draft-slideshow-stage--empty" data-testid="slideshow-stage">
        <div className="draft-slideshow-empty-state">
          {hasSelectableSeats ? 'No players selected.' : 'No public seats are available for this draft.'}
        </div>
      </div>
    )
  }

  const cardWidth = Math.max(0, fit.cardW || 0)
  const cssVars: SlideshowCssVars = {
    '--slide-card-w': `${cardWidth}px`,
    '--slide-card-gap': `${GAP}px`,
    '--slide-label-gutter-w': `${useLeaderGrid ? LEADER_LABEL_GUTTER_W : LABEL_GUTTER_W}px`,
  }

  if (selected.length === 1) {
    const row = rows[0]
    if (!row) {
      return (
        <div ref={stageRef} className="draft-slideshow-stage draft-slideshow-stage--empty" data-testid="slideshow-stage">
          <div className="draft-slideshow-empty-state">No public seats are available for this draft.</div>
        </div>
      )
    }
    const singleFit = fit as SinglePlayerFit
    const cards = row.visibleCards
    const gridStyle = {
      width: `${singleFit.blockW || 0}px`,
      gridTemplateColumns: singleFit.cols > 0 ? `repeat(${singleFit.cols}, var(--slide-card-w))` : 'none',
    }

    return (
      <div
        ref={stageRef}
        className={`draft-slideshow-stage draft-slideshow-stage--single ${singleFit.centered ? 'is-capped' : ''} ${isLandscape ? 'is-landscape' : ''}`}
        style={cssVars}
        data-overflow={fit.overflow ? 'true' : 'false'}
        data-testid="slideshow-stage"
      >
        {cards.length > 0 ? (
          <div className="draft-slideshow-single-grid" style={gridStyle}>
            {cards.map((card, index) => (
              <CardWithPreview
                key={`${row.seat.seatNumber}-${card.instanceId || index}`}
                card={stageCard(card, row.pick)}
                selected={card.instanceId === row.pick?.pickedInstanceId}
                tabIndex={-1}
                data-instance-id={card.instanceId}
              />
            ))}
          </div>
        ) : (
          <EmptyCardTile landscape={isLandscape} />
        )}
      </div>
    )
  }

  if (useLeaderGrid) {
    const leaderFit = fit as LeaderGridFit
    const gridStyle = {
      gridTemplateColumns: `repeat(${leaderFit.columns}, minmax(0, 1fr))`,
      gridTemplateRows: `repeat(${leaderFit.rows}, auto)`,
    }

    return (
      <div
        ref={stageRef}
        className="draft-slideshow-stage draft-slideshow-stage--multi draft-slideshow-stage--leader-grid is-landscape"
        style={cssVars}
        data-overflow={leaderFit.overflow ? 'true' : 'false'}
        data-testid="slideshow-stage"
      >
        <div className="draft-slideshow-leader-grid" style={gridStyle}>
          {rows.map((row, index) => {
            const isRightColumn = leaderFit.columns > 1 && index >= leaderFit.rows
            return (
              <div
                key={row.seat.seatNumber}
                className={`draft-slideshow-seat-row draft-slideshow-leader-seat ${isRightColumn ? 'draft-slideshow-leader-seat--right' : ''}`}
                data-testid="slideshow-seat-row"
                data-seat-number={row.seat.seatNumber}
              >
                <SeatLabel seat={row.seat} />
                <div className="draft-slideshow-row-cards">
                  {row.visibleCards.length > 0 ? (
                    row.visibleCards.map((card, index) => (
                      <CardWithPreview
                        key={`${row.seat.seatNumber}-${card.instanceId || index}`}
                        card={stageCard(card, row.pick)}
                        selected={card.instanceId === row.pick?.pickedInstanceId}
                        tabIndex={-1}
                        data-instance-id={card.instanceId}
                      />
                    ))
                  ) : (
                    <EmptyCardTile landscape={isLandscape} />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div
      ref={stageRef}
      className={`draft-slideshow-stage draft-slideshow-stage--multi ${isLandscape ? 'is-landscape' : ''}`}
      style={cssVars}
      data-overflow={(fit as MultiPlayerFit).overflow ? 'true' : 'false'}
      data-testid="slideshow-stage"
    >
      <div className="draft-slideshow-row-stack">
        {rows.map(row => (
          <div
            key={row.seat.seatNumber}
            className="draft-slideshow-seat-row"
            data-testid="slideshow-seat-row"
            data-seat-number={row.seat.seatNumber}
          >
            <SeatLabel seat={row.seat} />
            <div className="draft-slideshow-row-cards">
              {row.visibleCards.length > 0 ? (
                row.visibleCards.map((card, index) => (
                  <CardWithPreview
                    key={`${row.seat.seatNumber}-${card.instanceId || index}`}
                    card={stageCard(card, row.pick)}
                    selected={card.instanceId === row.pick?.pickedInstanceId}
                    tabIndex={-1}
                    data-instance-id={card.instanceId}
                  />
                ))
              ) : (
                <EmptyCardTile landscape={isLandscape} />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

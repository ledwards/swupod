'use client'
import CardWithPreview from '../CardWithPreview'
import { AspectIcon } from '../AspectIcon'
import { RarityLabel } from '../CardIcons'
import type { CardData } from '../Card'
import type { SlideshowSeat } from '@/app/api/draft/[shareId]/report/slideshow/route'

type ShownCard = CardData & { instanceId: string }

const Aspects = ({ aspects }: { aspects?: string[] | null }) => <>{(aspects ?? []).map(a => <AspectIcon key={a} aspect={a} size="sm"/>)}</>

/**
 * One slide: for every selected seat, the pack it saw at this pick with the
 * card it took ringed. `compact` is the observer's dense rows (name beside small
 * cards); otherwise each seat gets its player line and full-size cards.
 */
export default function ReviewStage({ seats, slideIndex, viewerSeat, compact = false }: {
  seats: SlideshowSeat[]; slideIndex: number; viewerSeat: number | null; compact?: boolean
}) {
  if (!seats.length) return <p className="pod-hint drv-none">Choose a player to see their pack.</p>
  return (
    <div className={compact ? 'drv-rows' : 'drv-seats'}>
      {seats.map(seat => {
        const pick = seat.picks?.[slideIndex]
        const cards = (pick?.visibleCards ?? []) as unknown as ShownCard[]
        const picked = cards.find(c => c.instanceId === pick?.pickedInstanceId) ?? null
        const grid = cards.length
          ? <div className="dlog-cards drv-cards">{cards.map(card => <CardWithPreview key={card.instanceId} card={card} selected={card.instanceId === pick?.pickedInstanceId}/>)}</div>
          : <p className="pod-hint drv-none">No pack at this pick</p>

        if (compact) {
          return (
            <div key={seat.seatNumber} className="drv-row">
              <div className="drv-row-who"><span className="dlog-seat-no">{seat.seatNumber}</span><b>{seat.username}</b></div>
              {grid}
            </div>
          )
        }
        return (
          <div key={seat.seatNumber} className="drv-seat">
            <div className="drv-player">
              <div className="drv-player-text">
                <div className="drv-player-name">
                  <b>{seat.username}</b>{seat.isBot && <span className="pod-bot">AI</span>}
                  {seat.seatNumber === viewerSeat && <span className="dlog-you">You</span>}
                  <span className="pod-hint">Seat {seat.seatNumber}</span>
                </div>
                {(seat.activeLeaderName || seat.chosenBase) && (
                  <div className="dlog-player-deck">
                    {seat.activeLeaderName && <span className="dlog-aspect-name">{seat.activeLeaderName}</span>}
                    {seat.activeLeaderName && seat.chosenBase && <span className="pod-hint">·</span>}
                    {seat.chosenBase && <span className="dlog-aspect-name"><Aspects aspects={seat.chosenBase.aspects}/>{seat.chosenBase.name}</span>}
                  </div>
                )}
              </div>
              {picked && <span className="pod-hint drv-picked">Picked: {picked.name} <RarityLabel rarity={picked.rarity}/></span>}
            </div>
            {grid}
          </div>
        )
      })}
    </div>
  )
}

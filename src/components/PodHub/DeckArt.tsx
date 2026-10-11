import type { HubDeck } from '../../services/pods/hubTypes'

/**
 * A deck as Hyperspace art split on a diagonal: leader on the left, base on the
 * right, art only. A port of the Play page's DeckArt (purrgil src/home/bits.tsx),
 * same geometry and crops, for PTP pages rendered outside the play-home shell.
 */
export default function DeckArt({ deck, className = '', portrait = false }: { deck: HubDeck | null; className?: string; portrait?: boolean }) {
  // Tall boxes take the leader's unit side, whose art window sits 16–59% down the card.
  const unit = portrait ? deck?.leaderUnitArt : null
  const l = unit ?? deck?.leaderArt, b = deck?.baseArt
  return <span className={`pod-deck-art${b ? '' : ' is-solo'}${className ? ` ${className}` : ''}`} aria-hidden="true">
    {b && <span className="pod-deck-art-base"><img src={b} alt="" loading="lazy"/></span>}
    {l && <span className={`pod-deck-art-leader${unit ? ' is-unit' : ''}`}><img src={l} alt="" loading="lazy"/></span>}
    {b && l && <i className="pod-deck-art-seam"/>}
  </span>
}

/** A leader's face, cropped round, for standings rows and the decks list. */
export function LeaderFace({ deck }: { deck: HubDeck | null }) {
  return <span className="pod-face" aria-hidden="true">{deck?.leaderArt && <img src={deck.leaderArt} alt="" loading="lazy"/>}</span>
}

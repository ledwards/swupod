import type { HubDeck } from '../../services/pods/hubTypes'
import ArtImage from './ArtImage'

/**
 * A deck as Hyperspace art split on a diagonal: leader on the left, base on the
 * right, art only. The seam between them takes the base's aspect colour. A port
 * of the Play page's DeckArt (purrgil src/home/bits.tsx), same geometry and crops,
 * for PTP pages rendered outside the play-home shell.
 */
export default function DeckArt({ deck, className = '', portrait = false, eager = false }: { deck: HubDeck | null; className?: string; portrait?: boolean; eager?: boolean }) {
  // Tall boxes take the leader's unit side, whose art window sits 16–59% down the card.
  const unit = portrait ? deck?.leaderUnitArt : null
  const l = unit ?? deck?.leaderArt, b = deck?.baseArt
  return <span className={`pod-deck-art${b ? '' : ' is-solo'}${className ? ` ${className}` : ''}`} aria-hidden="true">
    {b && <span className="pod-deck-art-base"><ArtImage key={b} src={b} backup={deck?.baseArtBackup} eager={eager}/></span>}
    {l && <span className={`pod-deck-art-leader${unit ? ' is-unit' : ''}`}><ArtImage key={l} src={l} backup={deck?.leaderArtBackup} eager={eager}/></span>}
    {b && l && <i className={`pod-deck-art-seam${deck?.baseAspect ? ` is-${deck.baseAspect}` : ''}`}/>}
  </span>
}

/**
 * A leader's face, cropped round: art only. Takes the unit side's Hyperspace art
 * (its art window sits 16–59% down the card) and crops to the character's head
 * and shoulders, clear of the name bar and rules text.
 */
export function LeaderFace({ deck }: { deck: HubDeck | null }) {
  const unit = deck?.leaderUnitArt ?? null
  const src = unit ?? deck?.leaderArt ?? null
  return <span className={`pod-face${unit ? '' : ' is-front'}`} aria-hidden="true">{src && <ArtImage key={src} src={src} backup={deck?.leaderArtBackup}/>}</span>
}

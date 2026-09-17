'use client'

import Modal from './Modal'
import './CardZoom.css'

export interface ZoomableCard {
  name?: string
  imageUrl?: string
  /** Leaders only: the deployed unit side, which is half of what the card does. */
  backImageUrl?: string
}

export interface CardZoomProps {
  /** The card to enlarge, or null/undefined when nothing is zoomed. */
  card?: ZoomableCard | null
  onClose: () => void
}

/**
 * Full-screen card inspector — the ONE zoom used everywhere a player needs to
 * re-read a card mid-draft (long-pressing a card in a pack, tapping a leader
 * they've already drafted, tapping a leader thumbnail in the draft header).
 *
 * Hover previews only exist on desktop, so on a phone this is the only way to
 * read a card you can no longer pick — see .claude/rules/mobile.md.
 *
 * A leader is shown as BOTH faces: the leader side and its unit side. The unit
 * side is the half players forget, so a zoom that showed only the front would
 * miss the point of opening it.
 */
export default function CardZoom({ card, onClose }: CardZoomProps) {
  if (!card?.imageUrl) return null

  const name = card.name || 'Card'
  const hasBack = !!card.backImageUrl

  return (
    <Modal
      isOpen
      onClose={onClose}
      variant="image"
      showCloseButton
      className={`card-zoom${hasBack ? ' card-zoom--two-sided' : ''}`}
    >
      <div className="card-zoom-faces">
        <img className="card-zoom-face" src={card.imageUrl} alt={name} />
        {hasBack && (
          <img
            className="card-zoom-face"
            src={card.backImageUrl}
            alt={`${name} — unit side`}
          />
        )}
      </div>
    </Modal>
  )
}

import { EyeIcon } from './PodHub/icons'
import { prefetchPlayerDeck } from './PlayerDeckImage'
import './DeckEyeButton.css'

/**
 * Opens a player's deck: beside their name in Pod decks, beside the ready check on pod seat tiles.
 * With `poolShareId`, hovering, focusing or touching the eye starts the deck's fetch before the click.
 */
export default function DeckEyeButton({ name, poolShareId, onClick }: { name: string; poolShareId?: string; onClick: () => void }) {
  const label = `View ${name}’s deck`
  const warm = poolShareId ? () => prefetchPlayerDeck(poolShareId) : undefined
  return <button type="button" className="deck-eye" aria-label={label} title={label} aria-haspopup="dialog" onClick={onClick}
    onPointerEnter={warm} onFocus={warm} onTouchStart={warm}><EyeIcon/></button>
}

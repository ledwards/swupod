import { EyeIcon } from './PodHub/icons'
import './DeckEyeButton.css'

/** Opens a player's deck image: beside their name in Pod decks, beside the ready check on pod seat tiles. */
export default function DeckEyeButton({ name, onClick }: { name: string; onClick: () => void }) {
  const label = `View ${name}’s deck`
  return <button type="button" className="deck-eye" aria-label={label} title={label} aria-haspopup="dialog" onClick={onClick}><EyeIcon/></button>
}

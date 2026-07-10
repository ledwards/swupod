'use client'

import Button from '@/src/components/Button'

interface LobbyVerbsProps {
  onPlayNow: () => void
  onNewGame: () => void
  openGamesCount: number
  podsFormingCount: number
  onlineCount: number
  busy?: boolean
}

/** Primary lobby verbs (R28): "Play Now" + "New Game" — never Post/Accept. */
export default function LobbyVerbs({
  onPlayNow,
  onNewGame,
  openGamesCount,
  podsFormingCount,
  onlineCount,
  busy = false,
}: LobbyVerbsProps): React.JSX.Element {
  return (
    <div className="lobby-verbs">
      <Button variant="primary" size="lg" disabled={busy} onClick={onPlayNow}>
        Play Now
      </Button>
      <Button variant="secondary" size="lg" disabled={busy} onClick={onNewGame}>
        New Game
      </Button>
      <div className="lobby-verbs-spacer" />
      <div className="lobby-live-strip">
        <strong>{openGamesCount}</strong> open {openGamesCount === 1 ? 'game' : 'games'} ·{' '}
        <strong>{podsFormingCount}</strong> {podsFormingCount === 1 ? 'pod' : 'pods'} forming
        <br />
        <span>{onlineCount} online — playing, drafting &amp; deckbuilding</span>
      </div>
    </div>
  )
}

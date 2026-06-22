// @ts-nocheck
import { useState, useEffect } from 'react'
import Modal from './Modal'
import Button from './Button'
import './ResultReportModal.css'
import { isDecided, needsGame3 } from '@/src/services/matchmaking/results'

interface ResultReportModalProps {
  matchId: string
  player1Name: string
  player2Name: string
  isOverride?: boolean
  /** Existing results so the modal opens pre-populated. */
  currentGame1?: string | null
  currentGame2?: string | null
  currentGame3?: string | null
  onSubmit: (matchId: string, game1: string, game2: string, game3: string | null) => void
  onClose: () => void
}

export function ResultReportModal({
  matchId,
  player1Name,
  player2Name,
  isOverride,
  currentGame1 = null,
  currentGame2 = null,
  currentGame3 = null,
  onSubmit,
  onClose,
}: ResultReportModalProps) {
  const [game1, setGame1] = useState<string | null>(currentGame1)
  const [game2, setGame2] = useState<string | null>(currentGame2)
  const [game3, setGame3] = useState<string | null>(currentGame3)

  // Game 3 only matters once the first two split; otherwise it's disabled.
  const showGame3 = needsGame3(game1, game2)

  useEffect(() => {
    if (!showGame3) setGame3(null)
  }, [showGame3])

  const canSubmit = (() => {
    if (!game1 || !game2) return false
    if (!showGame3) return isDecided(game1, game2, null)
    if (!game3) return false
    return isDecided(game1, game2, game3)
  })()

  const handleSubmit = () => {
    if (!canSubmit) return
    onSubmit(matchId, game1, game2, showGame3 ? game3 : null)
  }

  const title = isOverride ? 'Override Match Result' : 'Report Match Result'

  return (
    <Modal isOpen onClose={onClose} title={title} showCloseButton>
      <Modal.Body>
        <div className="result-report-games" data-testid="result-report-modal">
          <GameRow label="Game 1" gameKey="game1" player1Name={player1Name} player2Name={player2Name} value={game1} onChange={setGame1} />
          <GameRow label="Game 2" gameKey="game2" player1Name={player1Name} player2Name={player2Name} value={game2} onChange={setGame2} />
          <GameRow label="Game 3" gameKey="game3" player1Name={player1Name} player2Name={player2Name} value={game3} onChange={setGame3} disabled={!showGame3} hint={!showGame3 ? 'only if 1–1' : null} />
        </div>
        {isOverride && (
          <p className="result-report-override-note">
            This will override any player-submitted results.
          </p>
        )}
      </Modal.Body>
      <Modal.Actions>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <span data-testid="result-report-submit">
          <Button variant="primary" onClick={handleSubmit} disabled={!canSubmit}>Submit</Button>
        </span>
      </Modal.Actions>
    </Modal>
  )
}

function GameRow({ label, gameKey, player1Name, player2Name, value, onChange, disabled = false, hint = null }: {
  label: string
  gameKey: 'game1' | 'game2' | 'game3'
  player1Name: string
  player2Name: string
  value: string | null
  onChange: (v: string | null) => void
  disabled?: boolean
  hint?: string | null
}) {
  // Click an option to select it; click it again to unset (back to no result).
  const pick = (option: string) => onChange(value === option ? null : option)
  return (
    <div className="result-report-row" data-testid={`game-row-${gameKey}`} data-game-key={gameKey}>
      <span className="result-report-label">{label}{hint && <span className="result-report-hint">{hint}</span>}</span>
      <div className="result-report-buttons">
        <Button variant="toggle" glowColor="blue" active={value === 'player1'} disabled={disabled} onClick={() => pick('player1')} data-testid={`game-${gameKey}-player1`}>
          {player1Name}
        </Button>
        <Button variant="toggle" glowColor="blue" active={value === 'draw'} disabled={disabled} onClick={() => pick('draw')} data-testid={`game-${gameKey}-draw`}>
          Draw
        </Button>
        <Button variant="toggle" glowColor="blue" active={value === 'player2'} disabled={disabled} onClick={() => pick('player2')} data-testid={`game-${gameKey}-player2`}>
          {player2Name}
        </Button>
      </div>
    </div>
  )
}

export default ResultReportModal

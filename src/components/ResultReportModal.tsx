// @ts-nocheck
import { useState, useEffect } from 'react'
import Modal from './Modal'
import Button from './Button'
import './ResultReportModal.css'

interface ResultReportModalProps {
  matchId: string
  player1Name: string
  player2Name: string
  isOverride?: boolean
  onSubmit: (matchId: string, game1: string, game2: string, game3: string | null) => void
  onClose: () => void
}

function countWins(games: (string | null)[], player: string): number {
  return games.filter(g => g === player).length
}

function isDecided(game1: string | null, game2: string | null, game3: string | null): boolean {
  const games = [game1, game2, game3]
  const p1Wins = countWins(games, 'player1')
  const p2Wins = countWins(games, 'player2')
  return p1Wins >= 2 || p2Wins >= 2
}

function needsGame3(game1: string | null, game2: string | null): boolean {
  if (!game1 || !game2) return false
  // If someone already has 2 wins after 2 games, no game 3 needed
  const p1Wins = countWins([game1, game2], 'player1')
  const p2Wins = countWins([game1, game2], 'player2')
  if (p1Wins >= 2 || p2Wins >= 2) return false
  // Otherwise game 3 is needed (split, draws, etc.)
  return true
}

export function ResultReportModal({ matchId, player1Name, player2Name, isOverride, onSubmit, onClose }: ResultReportModalProps) {
  const [game1, setGame1] = useState<string | null>(null)
  const [game2, setGame2] = useState<string | null>(null)
  const [game3, setGame3] = useState<string | null>(null)

  const showGame3 = needsGame3(game1, game2)

  // Clear game3 if it's no longer needed
  useEffect(() => {
    if (!showGame3) {
      setGame3(null)
    }
  }, [showGame3])

  const canSubmit = (() => {
    if (!game1 || !game2) return false
    if (!showGame3) {
      // Result must be decided after 2 games
      return isDecided(game1, game2, null)
    }
    // Game 3 is shown — need it filled and result decided
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
          <GameRow
            label="Game 1"
            gameKey="game1"
            player1Name={player1Name}
            player2Name={player2Name}
            value={game1}
            onChange={setGame1}
          />
          <GameRow
            label="Game 2"
            gameKey="game2"
            player1Name={player1Name}
            player2Name={player2Name}
            value={game2}
            onChange={setGame2}
          />
          {showGame3 && (
            <GameRow
              label="Game 3"
              gameKey="game3"
              player1Name={player1Name}
              player2Name={player2Name}
              value={game3}
              onChange={setGame3}
            />
          )}
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

function GameRow({ label, gameKey, player1Name, player2Name, value, onChange }: {
  label: string
  gameKey: 'game1' | 'game2' | 'game3'
  player1Name: string
  player2Name: string
  value: string | null
  onChange: (v: string) => void
}) {
  return (
    <div className="result-report-row" data-testid={`game-row-${gameKey}`} data-game-key={gameKey}>
      <span className="result-report-label">{label}</span>
      <div className="result-report-buttons">
        <button
          className={`result-report-btn${value === 'player1' ? ' result-report-btn--selected' : ''}`}
          onClick={() => onChange('player1')}
          type="button"
          data-testid={`game-${gameKey}-player1`}
        >
          {player1Name}
        </button>
        <button
          className={`result-report-btn result-report-btn--draw${value === 'draw' ? ' result-report-btn--selected' : ''}`}
          onClick={() => onChange('draw')}
          type="button"
          data-testid={`game-${gameKey}-draw`}
        >
          Draw
        </button>
        <button
          className={`result-report-btn${value === 'player2' ? ' result-report-btn--selected' : ''}`}
          onClick={() => onChange('player2')}
          type="button"
          data-testid={`game-${gameKey}-player2`}
        >
          {player2Name}
        </button>
      </div>
    </div>
  )
}

export default ResultReportModal

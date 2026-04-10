// @ts-nocheck
import Button from './Button'
import './MatchCard.css'

interface MatchPlayer {
  id: string
  username: string
  avatarUrl?: string
}

interface MatchData {
  id: string
  player1: MatchPlayer | null
  player2: MatchPlayer | null
  isBye: boolean
  game1Result: string | null
  game2Result: string | null
  game3Result: string | null
  player1Submitted: boolean
  player2Submitted: boolean
  finalConfirmed: boolean
  matchWinner: string | null
  podOwnerOverride: boolean
}

interface MatchCardProps {
  match: MatchData
  currentUserId: string
  isHost: boolean
  onReport: (matchId: string) => void
  onOverride: (matchId: string) => void
  onBoot: (userId: string) => void
}

function getMatchStatus(match: MatchData): string {
  if (match.finalConfirmed) return 'Complete'
  if (match.isBye) return 'Bye'
  if (match.player1Submitted || match.player2Submitted) return 'Awaiting Confirmation'
  return 'In Progress'
}

function GameDot({ result, forPlayer }: { result: string | null; forPlayer: 'player1' | 'player2' }) {
  if (!result) return <span className="game-dot game-dot--pending" />
  if (result === 'draw') return <span className="game-dot game-dot--draw" />
  if (result === forPlayer) return <span className="game-dot game-dot--win" />
  return <span className="game-dot game-dot--loss" />
}

export function MatchCard({ match, currentUserId, isHost, onReport, onOverride, onBoot }: MatchCardProps) {
  const isMyMatch = match.player1?.id === currentUserId || match.player2?.id === currentUserId
  const status = getMatchStatus(match)
  const iAmPlayer1 = match.player1?.id === currentUserId
  const iAmPlayer2 = match.player2?.id === currentUserId
  const iHaveSubmitted = (iAmPlayer1 && match.player1Submitted) || (iAmPlayer2 && match.player2Submitted)

  const canReport = isMyMatch && !match.finalConfirmed && !match.isBye && !iHaveSubmitted
  const canOverride = isHost && !match.isBye

  return (
    <div className={`match-card${isMyMatch ? ' match-card--mine' : ''}${match.finalConfirmed ? ' match-card--confirmed' : ''}`}>
      <div className="match-card-players">
        <div className={`match-card-player${match.matchWinner === 'player1' ? ' match-card-player--winner' : ''}`}>
          <span className="match-card-player-name">{match.player1?.username || '???'}</span>
          {!match.isBye && (
            <div className="match-card-dots">
              <GameDot result={match.game1Result} forPlayer="player1" />
              <GameDot result={match.game2Result} forPlayer="player1" />
              {match.game3Result !== null && <GameDot result={match.game3Result} forPlayer="player1" />}
            </div>
          )}
          {isHost && match.player1 && match.player1.id !== currentUserId && (
            <button
              className="match-card-boot"
              onClick={(e) => { e.stopPropagation(); onBoot(match.player1.id) }}
              title="Boot player"
            >
              &times;
            </button>
          )}
        </div>

        <span className="match-card-vs">{match.isBye ? 'BYE' : 'vs'}</span>

        <div className={`match-card-player${match.matchWinner === 'player2' ? ' match-card-player--winner' : ''}`}>
          {!match.isBye ? (
            <>
              <span className="match-card-player-name">{match.player2?.username || '???'}</span>
              <div className="match-card-dots">
                <GameDot result={match.game1Result} forPlayer="player2" />
                <GameDot result={match.game2Result} forPlayer="player2" />
                {match.game3Result !== null && <GameDot result={match.game3Result} forPlayer="player2" />}
              </div>
              {isHost && match.player2 && match.player2.id !== currentUserId && (
                <button
                  className="match-card-boot"
                  onClick={(e) => { e.stopPropagation(); onBoot(match.player2.id) }}
                  title="Boot player"
                >
                  &times;
                </button>
              )}
            </>
          ) : (
            <span className="match-card-player-name match-card-player-name--bye">---</span>
          )}
        </div>
      </div>

      <div className="match-card-footer">
        <span className={`match-card-status match-card-status--${status.toLowerCase().replace(/\s+/g, '-')}`}>
          {status}
          {match.podOwnerOverride && ' (Override)'}
        </span>
        <div className="match-card-actions">
          {canReport && (
            <Button variant="primary" size="sm" onClick={() => onReport(match.id)}>
              Report Result
            </Button>
          )}
          {canOverride && (
            <Button variant="secondary" size="sm" onClick={() => onOverride(match.id)}>
              Edit
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export default MatchCard

// @ts-nocheck
import Button from './Button'
import ReplayWatchLink from './ReplayWatchLink'
import {
  liveGameAction,
  liveGameStatusLabel,
  type PracticeLaunchMessage,
  type WayfinderMatchState,
} from './MatchmakingPanel.helpers'
import { formatRecord, type PlayerRecord } from '../services/matchmaking/standings'
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
  wayfinderMatchId?: string | null
  games?: unknown[]
  currentGame?: {
    status?: string | null
    gameNumber?: number | null
    lobbyUrl?: string | null
    spectateUrl?: string | null
    replayUrl?: string | null
    elapsedSeconds?: number | null
    stale?: boolean | null
    retryable?: boolean | null
    game?: {
      createdByUserId?: string | null
      lobbyUrl?: string | null
      spectateUrl?: string | null
      replayUrl?: string | null
    } | null
  } | null
}

interface MatchCardProps {
  match: MatchData
  currentUserId: string
  isHost: boolean
  onReport: (matchId: string) => void
  onOverride: (matchId: string) => void
  onBoot: (userId: string) => void
  playerRecords?: Map<string, PlayerRecord>
  wayfinderState?: WayfinderMatchState
  liveLaunchEnabled?: boolean
  onPracticeLaunch?: (matchId: string) => void | Promise<void>
  practiceLaunchPending?: boolean
  practiceLaunchMessage?: PracticeLaunchMessage | null
  readOnly?: boolean
  /** Swiss table number (1 = top tables, ordered by record). */
  tableNumber?: number
  /** Whether the viewer's Companion is detected (drives the current user's dot). */
  wayfinderDetected?: boolean
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

export function MatchCard({
  match,
  currentUserId,
  isHost,
  onReport,
  onOverride,
  onBoot,
  playerRecords,
  wayfinderState = 'manual',
  liveLaunchEnabled = false,
  onPracticeLaunch,
  practiceLaunchPending = false,
  practiceLaunchMessage = null,
  readOnly = false,
  tableNumber,
  wayfinderDetected = false,
}: MatchCardProps) {
  const isMyMatch = match.player1?.id === currentUserId || match.player2?.id === currentUserId
  const status = getMatchStatus(match)
  const iAmPlayer1 = match.player1?.id === currentUserId
  const iAmPlayer2 = match.player2?.id === currentUserId
  const iHaveSubmitted = (iAmPlayer1 && match.player1Submitted) || (iAmPlayer2 && match.player2Submitted)

  const hasResult = match.finalConfirmed || match.player1Submitted || match.player2Submitted
  // One action: participants report (and re-edit) their own match; the host can
  // edit any match. Once a result exists the button reads "Edit" — Report
  // Manually covers both reporting and editing (no separate Edit button).
  const canReportOrEdit = !readOnly && !match.isBye && (isMyMatch || isHost)
  const recordFor = (player: MatchPlayer | null) => player?.id ? formatRecord(playerRecords?.get(player.id)) : '0-0'
  const liveStatus = liveGameStatusLabel(match.currentGame)
  const liveAction = liveGameAction({
    match,
    currentUserId,
    liveLaunchEnabled: Boolean(liveLaunchEnabled && onPracticeLaunch),
    pending: practiceLaunchPending,
  })
  const showLiveRow = Boolean(liveStatus || liveAction.kind !== 'none' || practiceLaunchMessage)

  // Per-player Companion indicator, left of the name: green = Companion
  // connected (lobby creator, or the current viewer when detected); blinking
  // red = actively recording on Karabast (creator + game in progress).
  const creatorId = match.currentGame?.game?.createdByUserId || null
  const liveInProgress = match.currentGame?.status === 'in_progress'
  const companionDot = (player: MatchPlayer | null) => {
    if (!player?.id || match.isBye) return null
    const isRecorder = creatorId != null && creatorId === player.id
    if (isRecorder && liveInProgress) {
      return <span className="companion-dot companion-dot--recording" title="Recording on Karabast" />
    }
    if (isRecorder || (player.id === currentUserId && wayfinderDetected)) {
      return <span className="companion-dot companion-dot--connected" title="Companion connected" />
    }
    return null
  }

  const playIcon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  )

  const renderLiveAction = () => {
    if (liveAction.kind === 'none') return null

    if (liveAction.kind === 'watch' || liveAction.kind === 'replay') {
      return (
        <ReplayWatchLink
          href={liveAction.href || undefined}
          className="match-card-live-watch"
          ariaLabel={`${liveAction.label} ${match.player1?.username || 'player 1'} vs ${match.player2?.username || 'opponent'}`}
        >
          {liveAction.label}
        </ReplayWatchLink>
      )
    }

    // Lobby exists → a green play LINK to the lobby URL. Works for both players,
    // with or without the Companion (you don't need it just to join a lobby).
    if (liveAction.kind === 'open') {
      return (
        <a
          className="btn btn--primary btn--sm match-card-live-button match-card-live-open"
          href={liveAction.href || '#'}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open game lobby"
        >
          {playIcon}
        </a>
      )
    }

    // No Companion + no lobby yet → a disabled green play button. Wrap it in a
    // titled span so the install tooltip still shows (disabled buttons swallow it).
    if (liveAction.kind === 'play' && liveAction.disabled) {
      return (
        <span className="match-card-live-disabled-wrap" title={liveAction.tooltip || undefined}>
          <Button variant="primary" size="sm" className="match-card-live-button" disabled aria-label="Play">
            {playIcon}
          </Button>
        </span>
      )
    }

    if (liveAction.kind === 'play' || liveAction.kind === 'join' || liveAction.kind === 'retry') {
      return (
        <Button
          variant="primary"
          size="sm"
          className="match-card-live-button"
          disabled={practiceLaunchPending || !onPracticeLaunch}
          aria-label={liveAction.kind === 'play' ? 'Play' : undefined}
          onClick={() => onPracticeLaunch?.(match.id)}
        >
          {liveAction.kind === 'play' && playIcon}
          {liveAction.label}
        </Button>
      )
    }

    return (
      <Button
        variant="secondary"
        size="sm"
        className="match-card-live-button"
        disabled
      >
        {liveAction.label}
      </Button>
    )
  }

  return (
    <div
      className={`match-card${isMyMatch ? ' match-card--mine' : ''}${match.finalConfirmed ? ' match-card--confirmed' : ''}`}
      data-testid={`match-card-${match.id}`}
      data-match-id={match.id}
      data-match-status={status}
      data-final-confirmed={match.finalConfirmed ? 'true' : 'false'}
      data-match-winner={match.matchWinner || ''}
      data-is-bye={match.isBye ? 'true' : 'false'}
      data-live-game-status={match.currentGame?.status || ''}
      data-live-game-action={liveAction.kind}
      data-player1-id={match.player1?.id || ''}
      data-player2-id={match.player2?.id || ''}
    >
      {tableNumber != null && <div className="match-card-table">Table {tableNumber}</div>}
      <div className="match-card-players">
        <div className={`match-card-player${match.matchWinner === 'player1' ? ' match-card-player--winner' : ''}`}>
          <span className="match-card-player-heading">
            {companionDot(match.player1)}
            {match.player1?.avatarUrl && <img className="match-card-avatar" src={match.player1.avatarUrl} alt="" />}
            <span className="match-card-player-name">{match.player1?.username || '???'}</span>
            <span className="match-card-player-record">{recordFor(match.player1)}</span>
          </span>
          {!match.isBye && (
            <div className="match-card-dots">
              <GameDot result={match.game1Result} forPlayer="player1" />
              <GameDot result={match.game2Result} forPlayer="player1" />
              {match.game3Result !== null && <GameDot result={match.game3Result} forPlayer="player1" />}
            </div>
          )}
          {!readOnly && isHost && match.player1 && match.player1.id !== currentUserId && (
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
              <span className="match-card-player-heading">
                {companionDot(match.player2)}
                {match.player2?.avatarUrl && <img className="match-card-avatar" src={match.player2.avatarUrl} alt="" />}
                <span className="match-card-player-name">{match.player2?.username || '???'}</span>
                <span className="match-card-player-record">{recordFor(match.player2)}</span>
              </span>
              <div className="match-card-dots">
                <GameDot result={match.game1Result} forPlayer="player2" />
                <GameDot result={match.game2Result} forPlayer="player2" />
                {match.game3Result !== null && <GameDot result={match.game3Result} forPlayer="player2" />}
              </div>
              {!readOnly && isHost && match.player2 && match.player2.id !== currentUserId && (
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

      {showLiveRow && (
        <div className={`match-card-live match-card-live--${match.currentGame?.status || 'pending'}`}>
          <div className="match-card-live-copy">
            {liveAction.readyText ? (
              <span className="match-card-live-status match-card-live-ready">{liveAction.readyText}</span>
            ) : liveStatus ? (
              <span className="match-card-live-status">{liveStatus}</span>
            ) : null}
            {practiceLaunchMessage && (
              <span className={`match-card-live-message match-card-live-message--${practiceLaunchMessage.type}`}>
                {practiceLaunchMessage.text}
              </span>
            )}
          </div>
          <div className="match-card-live-actions">
            {renderLiveAction()}
          </div>
        </div>
      )}

      <div className="match-card-footer">
        <span className={`match-card-status match-card-status--${status.toLowerCase().replace(/\s+/g, '-')}`}>
          {status}
          {match.podOwnerOverride && ' (Override)'}
        </span>
        {wayfinderState === 'recorded' && (
          <span className="match-card-wayfinder-state match-card-wayfinder-state--recorded">Recorded</span>
        )}
        {match.wayfinderMatchId && (
          <a
            href={`${process.env.NEXT_PUBLIC_WAYFINDER_URL || 'https://plugin.wayfinder.news'}/matches/${match.wayfinderMatchId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="match-card-wayfinder-link"
          >
            View Match ↗
          </a>
        )}
        <div className="match-card-actions">
          {canReportOrEdit && (
            <span data-testid={`match-report-button-${match.id}`}>
              <Button
                variant={!hasResult && wayfinderState !== 'auto-recording' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => (isMyMatch ? onReport : onOverride)(match.id)}
              >
                {hasResult ? 'Edit' : (wayfinderState === 'auto-recording' ? 'Report Manually' : 'Report Result')}
              </Button>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export default MatchCard

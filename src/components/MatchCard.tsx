// @ts-nocheck
import { useState, useEffect } from 'react'
import Button from './Button'
import ConfirmModal from './ConfirmModal'
import ReplayWatchLink from './ReplayWatchLink'
import {
  liveGameAction,
  liveGameStatusLabel,
  type PracticeLaunchMessage,
  type WayfinderMatchState,
} from './MatchmakingPanel.helpers'
import { formatRecord, type PlayerRecord } from '../services/matchmaking/standings'
import { avatarSrc } from '../utils/avatar'
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
  // Green W (win), red L (loss), grey circle (game not played yet), muted D (draw).
  if (!result) return <span className="game-result game-result--pending" aria-label="not played" />
  if (result === 'draw') return <span className="game-result game-result--draw">D</span>
  if (result === forPlayer) return <span className="game-result game-result--win">W</span>
  return <span className="game-result game-result--loss">L</span>
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

  // Live spectate link (provided by the recorder's Companion) + recorded-match
  // link. Both live next to the table number.
  const spectateUrl = match.currentGame?.spectateUrl || match.currentGame?.game?.spectateUrl || null
  const wayfinderBase = process.env.NEXT_PUBLIC_WAYFINDER_URL || 'https://plugin.wayfinder.news'

  // A failed/voided lobby setup shows its status briefly, then reverts to the
  // normal ready state (a plain Play icon) — no lingering "Setup Failed" banner.
  const isFailedSetup = match.currentGame?.status === 'failed' || match.currentGame?.status === 'voided'
  const [failureSettled, setFailureSettled] = useState(false)
  useEffect(() => {
    if (!isFailedSetup) { setFailureSettled(false); return }
    setFailureSettled(false)
    const t = setTimeout(() => setFailureSettled(true), 4000)
    return () => clearTimeout(t)
  }, [isFailedSetup, match.currentGame?.gameNumber, match.currentGame?.attemptNumber])
  // The live copy (left of the play button) always shows a sensible default —
  // never blank. When there's no live status yet, or once a failed setup has
  // settled, it falls back to the pre-error "Game N Ready" copy. Only the error
  // state itself ("Setup Failed") is transient.
  const nextGameNumber = match.currentGame?.gameNumber
    || (!match.game1Result ? 1 : !match.game2Result ? 2 : 3)
  // Only a still-live match falls back to the ready copy — a finished/bye match
  // (e.g. one showing only a replay link) must not read "Game N Ready".
  const defaultLiveCopy = (!match.isBye && !match.finalConfirmed) ? `Game ${nextGameNumber} Ready` : null
  const displayStatus = isFailedSetup && failureSettled ? defaultLiveCopy : (liveStatus || defaultLiveCopy)
  // Once a failed setup has settled, drop the red failed styling too so the box
  // reverts to a normal "ready to play" state instead of a lingering red banner.
  const liveRowStatus = isFailedSetup && failureSettled ? 'pending' : (match.currentGame?.status || 'pending')

  // Host-only "kick" affordance: a bare red X that appears upper-right of a
  // player's name on hover, opening a confirmation dialog before removing them.
  const [kickTarget, setKickTarget] = useState<MatchPlayer | null>(null)
  const renderKickButton = (player: MatchPlayer | null) => {
    if (readOnly || !isHost || !player?.id || player.id === currentUserId) return null
    return (
      <button
        className="match-card-kick"
        onClick={(e) => { e.stopPropagation(); setKickTarget(player) }}
        title="Kick player"
        aria-label={`Kick ${player.username || 'player'}`}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    )
  }

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

    // Live spectate ('watch') is surfaced as "Spectate Match" next to the table
    // number; only completed-match replays stay in the live action row.
    if (liveAction.kind === 'watch') return null

    if (liveAction.kind === 'replay') {
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
      {(tableNumber != null || match.wayfinderMatchId || (!isMyMatch && spectateUrl) || !match.isBye) && (
        <div className="match-card-table">
          {tableNumber != null && <span className="match-card-table-num">Table {tableNumber}</span>}
          {match.wayfinderMatchId && (
            <a className="match-card-table-link" href={`${wayfinderBase}/matches/${match.wayfinderMatchId}`} target="_blank" rel="noopener noreferrer">View Match ↗</a>
          )}
          {!isMyMatch && spectateUrl && (
            <a className="match-card-table-link" href={spectateUrl} target="_blank" rel="noopener noreferrer">Spectate Match ↗</a>
          )}
          {!match.isBye && (
            <span className={`match-card-status match-card-status--${status.toLowerCase().replace(/\s+/g, '-')}`}>
              {status}{match.podOwnerOverride && ' (Override)'}
            </span>
          )}
        </div>
      )}
      <div className="match-card-players">
        <div className={`match-card-player${match.matchWinner === 'player1' ? ' match-card-player--winner' : ''}`}>
          <span className="match-card-player-heading">
            {companionDot(match.player1)}
            {match.player1 && <img className="match-card-avatar" src={avatarSrc(match.player1.avatarUrl, match.player1.id || match.player1.username)} alt="" />}
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
          {renderKickButton(match.player1)}
        </div>

        <span className="match-card-vs">{match.isBye ? 'BYE' : 'vs'}</span>

        <div className={`match-card-player${match.matchWinner === 'player2' ? ' match-card-player--winner' : ''}`}>
          {!match.isBye ? (
            <>
              <span className="match-card-player-heading">
                {companionDot(match.player2)}
                {match.player2 && <img className="match-card-avatar" src={avatarSrc(match.player2.avatarUrl, match.player2.id || match.player2.username)} alt="" />}
                <span className="match-card-player-name">{match.player2?.username || '???'}</span>
                <span className="match-card-player-record">{recordFor(match.player2)}</span>
              </span>
              <div className="match-card-dots">
                <GameDot result={match.game1Result} forPlayer="player2" />
                <GameDot result={match.game2Result} forPlayer="player2" />
                {match.game3Result !== null && <GameDot result={match.game3Result} forPlayer="player2" />}
              </div>
              {renderKickButton(match.player2)}
            </>
          ) : (
            <span className="match-card-player-name match-card-player-name--bye">---</span>
          )}
        </div>
      </div>

      {showLiveRow && (
        <div className={`match-card-live match-card-live--${liveRowStatus}`}>
          <div className="match-card-live-copy">
            {liveAction.readyText ? (
              <span className="match-card-live-status match-card-live-ready">{liveAction.readyText}</span>
            ) : displayStatus ? (
              <span className="match-card-live-status">{displayStatus}</span>
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

      <ConfirmModal
        isOpen={!!kickTarget}
        title={kickTarget ? `Kick ${kickTarget.username || 'player'}?` : 'Kick player?'}
        confirmLabel="Kick"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => { if (kickTarget) onBoot(kickTarget.id); setKickTarget(null) }}
        onCancel={() => setKickTarget(null)}
      >
        They&rsquo;ll be removed from this match and the pod.
      </ConfirmModal>
    </div>
  )
}

export default MatchCard

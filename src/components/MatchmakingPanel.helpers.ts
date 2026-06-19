export interface MatchmakingHelperPlayer {
  id: string
  username?: string | null
}

export interface MatchmakingHelperMatch {
  id?: string
  player1: MatchmakingHelperPlayer | null
  player2: MatchmakingHelperPlayer | null
  isBye: boolean
  player1Submitted: boolean
  player2Submitted: boolean
  finalConfirmed: boolean
  wayfinderMatchId?: string | null
  currentGame?: MatchmakingHelperCurrentGame | null
  games?: MatchmakingHelperLiveGame[] | null
}

export type MatchmakingHelperLiveGameStatus =
  | 'pending'
  | 'creating'
  | 'lobby_ready'
  | 'in_progress'
  | 'complete'
  | 'failed'
  | 'voided'

export interface MatchmakingHelperLiveGame {
  id?: string | null
  gameNumber?: number | null
  attemptNumber?: number | null
  status?: MatchmakingHelperLiveGameStatus | null
  createdByUserId?: string | null
  lobbyUrl?: string | null
  spectateUrl?: string | null
  replayUrl?: string | null
}

export interface MatchmakingHelperCurrentGame {
  status?: MatchmakingHelperLiveGameStatus | null
  gameNumber?: number | null
  game?: MatchmakingHelperLiveGame | null
  lobbyUrl?: string | null
  spectateUrl?: string | null
  replayUrl?: string | null
  elapsedSeconds?: number | null
  stale?: boolean | null
  retryable?: boolean | null
}

export type LiveGameActionKind =
  | 'none'
  | 'play'
  | 'join'
  | 'watch'
  | 'replay'
  | 'retry'
  | 'creating'
  | 'waiting'

export interface LiveGameAction {
  kind: LiveGameActionKind
  label: string
  href?: string | null
  disabled?: boolean
}

export interface MatchmakingHelperRound {
  roundNumber: number
  matches?: MatchmakingHelperMatch[] | null
}

export type RoundTabState = 'completed' | 'current' | 'upcoming'
export type WayfinderMatchState = 'recorded' | 'auto-recording' | 'manual'
export type PracticeLaunchMessageType = 'success' | 'error' | 'info'

export interface PracticeLaunchMessage {
  matchId: string | null
  type: PracticeLaunchMessageType
  text: string
}

export function confirmedCount(round?: MatchmakingHelperRound | null): { confirmed: number; total: number } {
  const realMatches = (round?.matches || []).filter(match => !match.isBye)
  return {
    confirmed: realMatches.filter(match => match.finalConfirmed).length,
    total: realMatches.length,
  }
}

export function roundProgressLabel(
  currentRound: number,
  totalRounds: number,
  round?: MatchmakingHelperRound | null
): string {
  const progress = confirmedCount(round)
  return `Round ${currentRound} of ${totalRounds} · ${progress.confirmed} of ${progress.total} matches confirmed`
}

function opponentName(match: MatchmakingHelperMatch, currentUserId: string): string {
  const opponent = match.player1?.id === currentUserId ? match.player2 : match.player1
  return opponent?.username || 'your opponent'
}

function iSubmitted(match: MatchmakingHelperMatch, currentUserId: string): boolean {
  return (
    (match.player1?.id === currentUserId && match.player1Submitted) ||
    (match.player2?.id === currentUserId && match.player2Submitted)
  )
}

function opponentSubmitted(match: MatchmakingHelperMatch, currentUserId: string): boolean {
  return (
    (match.player1?.id === currentUserId && match.player2Submitted) ||
    (match.player2?.id === currentUserId && match.player1Submitted)
  )
}

export function statusLine({
  matchmakingStatus,
  currentRound,
  currentUserId,
  myMatch,
}: {
  matchmakingStatus: string
  currentRound: number
  currentUserId: string
  myMatch?: MatchmakingHelperMatch | null
}): string {
  if (matchmakingStatus === 'deck_building') {
    return 'Build and lock your deck. Round 1 starts when deck building ends.'
  }

  if (matchmakingStatus === 'complete') {
    return 'Swiss Practice complete. Review the final standings.'
  }

  if (!myMatch) {
    return `Round ${currentRound} pairings are being prepared.`
  }

  const opponent = opponentName(myMatch, currentUserId)

  if (myMatch.isBye) {
    return 'You have a bye this round. You are credited with a win while the rest of the round plays out.'
  }

  if (myMatch.finalConfirmed) {
    return matchmakingStatus === 'complete'
      ? 'Swiss Practice complete. Review the final standings.'
      : 'Your match is complete. Waiting for the next round.'
  }

  if (iSubmitted(myMatch, currentUserId)) {
    return `Result reported. Waiting for ${opponent} to confirm.`
  }

  if (opponentSubmitted(myMatch, currentUserId)) {
    return `${opponent} reported a result. Confirm it to finish your match.`
  }

  return `Round ${currentRound} is ready. Play your best-of-three match against ${opponent}, then report the result.`
}

export function roundTabState(
  roundNumber: number,
  currentRound: number,
  matchmakingStatus: string
): RoundTabState {
  if (matchmakingStatus === 'complete') return 'completed'
  if (roundNumber < currentRound) return 'completed'
  if (roundNumber === currentRound) return 'current'
  return 'upcoming'
}

export function nextActiveTabAfterRoundChange(
  activeTab: string,
  previousCurrentRound: number,
  currentRound: number,
  matchmakingStatus: string
): string {
  if (matchmakingStatus === 'complete') return 'results'
  if (currentRound === previousCurrentRound) return activeTab
  return activeTab === `round-${previousCurrentRound}` ? `round-${currentRound}` : activeTab
}

export function wayfinderMatchState(
  detected: boolean,
  wayfinderMatchId: string | null | undefined,
  isMyUnfinishedMatch: boolean
): WayfinderMatchState {
  if (wayfinderMatchId) return 'recorded'
  if (detected && isMyUnfinishedMatch) return 'auto-recording'
  return 'manual'
}

export function shouldShowInstallNudge(
  detected: boolean,
  hasBetaAccess: boolean,
  settled: boolean
): boolean {
  return !detected && hasBetaAccess && settled
}

export function isMatchParticipant(
  match: MatchmakingHelperMatch,
  currentUserId: string
): boolean {
  return match.player1?.id === currentUserId || match.player2?.id === currentUserId
}

export function formatLiveGameElapsed(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined) return null

  const safeSeconds = Math.max(0, Math.floor(seconds))
  const totalMinutes = Math.floor(safeSeconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours === 0) return `${totalMinutes}m`
  return `${hours}h ${String(minutes).padStart(2, '0')}m`
}

export function liveGameStatusLabel(currentGame?: MatchmakingHelperCurrentGame | null): string | null {
  if (!currentGame) return null

  const gameLabel = currentGame.gameNumber ? `Game ${currentGame.gameNumber}` : 'Match'
  switch (currentGame.status) {
    case 'pending':
      return `${gameLabel} Ready`
    case 'creating':
      return `${gameLabel} Starting`
    case 'lobby_ready':
      return `${gameLabel} Lobby Ready`
    case 'in_progress': {
      const elapsed = formatLiveGameElapsed(currentGame.elapsedSeconds)
      return elapsed ? `${gameLabel} In Progress · ${elapsed}` : `${gameLabel} In Progress`
    }
    case 'complete':
      return `${gameLabel} Complete`
    case 'failed':
      return `${gameLabel} Setup Failed`
    case 'voided':
      return `${gameLabel} Voided`
    default:
      return null
  }
}

export function liveGameAction({
  match,
  currentUserId,
  liveLaunchEnabled,
  pending = false,
}: {
  match: MatchmakingHelperMatch
  currentUserId: string
  liveLaunchEnabled: boolean
  pending?: boolean
}): LiveGameAction {
  if (match.isBye || match.finalConfirmed) {
    return replayAction(match)
  }

  const participant = isMatchParticipant(match, currentUserId)
  const currentGame = match.currentGame
  const status = currentGame?.status || 'pending'
  const gameNumber = currentGame?.gameNumber || 1
  const lobbyUrl = currentGame?.lobbyUrl || currentGame?.game?.lobbyUrl || null
  const spectateUrl = currentGame?.spectateUrl || currentGame?.game?.spectateUrl || null
  const replayUrl = currentGame?.replayUrl || currentGame?.game?.replayUrl || null
  const gameLabel = `Game ${gameNumber}`

  if (!participant) {
    if ((status === 'lobby_ready' || status === 'in_progress') && spectateUrl) {
      return { kind: 'watch', label: 'Watch', href: spectateUrl }
    }
    if (status === 'complete') {
      const action = replayAction(match)
      if (action.kind !== 'none') return action
    }
    return { kind: 'none', label: '' }
  }

  if (pending) {
    return { kind: 'waiting', label: 'Launching...', disabled: true }
  }

  if (!liveLaunchEnabled) {
    if (status === 'complete') return replayAction(match)
    return { kind: 'none', label: '' }
  }

  if (status === 'pending') {
    return { kind: 'play', label: `Play ${gameLabel}` }
  }

  if (status === 'creating') {
    if (currentGame?.retryable || currentGame?.stale) {
      return { kind: 'retry', label: `Retry ${gameLabel}` }
    }
    if (currentGame?.game?.createdByUserId === currentUserId) {
      return { kind: 'creating', label: 'Creating...', disabled: true }
    }
    return { kind: 'waiting', label: 'Waiting for lobby', disabled: true }
  }

  if (status === 'lobby_ready' || status === 'in_progress') {
    if (lobbyUrl) {
      return {
        kind: 'join',
        label: status === 'in_progress' ? 'Rejoin Game' : 'Join Game',
      }
    }
    return { kind: 'waiting', label: 'Waiting for lobby', disabled: true }
  }

  if (status === 'failed' || status === 'voided') {
    return { kind: 'retry', label: `Retry ${gameLabel}` }
  }

  if (status === 'complete' && replayUrl) {
    return { kind: 'replay', label: 'Replay', href: replayUrl }
  }

  return { kind: 'none', label: '' }
}

function replayAction(match: MatchmakingHelperMatch): LiveGameAction {
  const currentGame = match.currentGame
  const replayUrl = currentGame?.replayUrl || currentGame?.game?.replayUrl || null
  if (replayUrl) return { kind: 'replay', label: 'Replay', href: replayUrl }

  const replayGame = (match.games || [])
    .filter(game => game.replayUrl)
    .sort((a, b) => {
      const gameDiff = (b.gameNumber ?? 0) - (a.gameNumber ?? 0)
      if (gameDiff !== 0) return gameDiff
      return (b.attemptNumber ?? 0) - (a.attemptNumber ?? 0)
    })[0]
  if (replayGame?.replayUrl) return { kind: 'replay', label: 'Replay', href: replayGame.replayUrl }

  return { kind: 'none', label: '' }
}

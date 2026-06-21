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
  | 'open'
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
  /** Hover hint for a disabled play button (e.g. "Install Wayfinder…"). */
  tooltip?: string | null
  /** "(opponent) is ready!" shown beside the play button once a lobby exists. */
  readyText?: string | null
  /** True on an `open` action when the current viewer created the lobby — their
   *  button copies the link (to share) rather than opening it. */
  iCreated?: boolean
}

export interface LiveConsoleRoundOrder {
  primaryRoundNumber: number | null
  historyRoundNumbers: number[]
}

export interface LiveRoundMatchGroups {
  live: MatchmakingHelperMatch[]
  completed: MatchmakingHelperMatch[]
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

export function liveRoundMatchGroups(round?: MatchmakingHelperRound | null): LiveRoundMatchGroups {
  const groups: LiveRoundMatchGroups = { live: [], completed: [] }

  for (const match of round?.matches || []) {
    if (match.finalConfirmed || match.isBye) {
      groups.completed.push(match)
    } else {
      groups.live.push(match)
    }
  }

  return groups
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

export type SelfDropState = 'can-drop' | 'dropped' | 'hidden'

export interface SelfDropPlayer {
  id: string
  dropped?: boolean | null
}

/**
 * Decide what self-drop control (if any) the current player should see.
 * - 'dropped'  — they've already dropped; show a passive "you dropped" note.
 * - 'can-drop' — an active, non-host player still in the event; show the Drop button.
 * - 'hidden'   — host (they cancel the pod instead), not a player, or the event
 *                is not in an actively-running round.
 * Self-drop is a player-only action; the host removes others via boot.
 */
export function selfDropState({
  isHost,
  matchmakingStatus,
  currentUserId,
  players,
}: {
  isHost: boolean
  matchmakingStatus: string
  currentUserId: string
  players: SelfDropPlayer[]
}): SelfDropState {
  const me = (players || []).find(player => player.id === currentUserId)
  if (me?.dropped) return 'dropped'
  if (isHost) return 'hidden'
  if (!me) return 'hidden'
  if (matchmakingStatus !== 'active') return 'hidden'
  return 'can-drop'
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

export function liveConsoleRoundOrder(
  rounds: MatchmakingHelperRound[],
  currentRound: number,
  matchmakingStatus: string
): LiveConsoleRoundOrder {
  if (rounds.length === 0) {
    return { primaryRoundNumber: null, historyRoundNumbers: [] }
  }

  const sortedRounds = [...rounds].sort((a, b) => a.roundNumber - b.roundNumber)
  const primaryRound = sortedRounds.find(round => round.roundNumber === currentRound)
    ?? sortedRounds[sortedRounds.length - 1]

  if (!primaryRound) {
    return { primaryRoundNumber: null, historyRoundNumbers: [] }
  }

  const historyRoundNumbers = sortedRounds
    .filter(round => round.roundNumber < primaryRound.roundNumber)
    .map(round => round.roundNumber)
    .sort((a, b) => b - a)

  return {
    primaryRoundNumber: primaryRound.roundNumber,
    historyRoundNumbers: matchmakingStatus === 'deck_building' ? [] : historyRoundNumbers,
  }
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
  creatingTimedOut = false,
}: {
  match: MatchmakingHelperMatch
  currentUserId: string
  liveLaunchEnabled: boolean
  pending?: boolean
  /** Client-side 30s timer fired: treat a stuck "creating" game as failed. */
  creatingTimedOut?: boolean
}): LiveGameAction {
  if (match.isBye || match.finalConfirmed) {
    return replayAction(match)
  }

  const participant = isMatchParticipant(match, currentUserId)
  const currentGame = match.currentGame
  const status = currentGame?.status || 'pending'
  const lobbyUrl = currentGame?.lobbyUrl || currentGame?.game?.lobbyUrl || null
  const spectateUrl = currentGame?.spectateUrl || currentGame?.game?.spectateUrl || null
  const replayUrl = currentGame?.replayUrl || currentGame?.game?.replayUrl || null

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

  // Game is underway → you're already in the table/room, so disable Play (no
  // point re-opening the lobby). The live row still shows "Game N In Progress".
  if (status === 'in_progress') {
    return { kind: 'play', label: '', disabled: true, tooltip: 'Game in progress' }
  }

  // A private lobby exists → ANY participant can open it via its URL (you don't
  // need the Companion to JOIN). The play button becomes a green link to the
  // lobby. Beside it: "<opponent> is in the lobby" when the opponent created it,
  // or "Lobby created" when you did (and your button copies the link to share).
  if (status === 'lobby_ready' && lobbyUrl) {
    const creatorId = currentGame?.game?.createdByUserId || null
    const openedByOpponent = Boolean(creatorId && creatorId !== currentUserId)
    return {
      kind: 'open',
      label: '',
      href: lobbyUrl,
      iCreated: creatorId === currentUserId,
      readyText: openedByOpponent
        ? `${opponentName(match, currentUserId)} is in the lobby`
        : (creatorId === currentUserId ? 'Lobby created' : null),
    }
  }

  if (pending) {
    return { kind: 'waiting', label: 'Creating Lobby', disabled: true }
  }

  if (!liveLaunchEnabled) {
    if (status === 'complete') return replayAction(match)
    // The opponent is spinning up the lobby — just wait for its URL to arrive,
    // but don't wait forever: after the 30s timeout fall through to the nudge.
    if (status === 'creating' && !creatingTimedOut) return { kind: 'waiting', label: 'Waiting for lobby', disabled: true }
    // No Companion and no lobby yet → a disabled play button that nudges install.
    return { kind: 'play', label: '', disabled: true, tooltip: 'Install Wayfinder to start a lobby' }
  }

  if (status === 'pending') {
    return { kind: 'play', label: '' }
  }

  if (status === 'creating') {
    // A lobby should be created in seconds. If it's been "creating" for >30s the
    // launch almost certainly failed (often a silent Karabast error with no
    // lifecycle callback) — surface a Retry so the player isn't stuck on a dead
    // button. (The launching client re-reads ~32s after launch so elapsedSeconds
    // catches up.)
    const stuckTooLong = (currentGame?.elapsedSeconds ?? 0) > 30
    if (currentGame?.retryable || currentGame?.stale || stuckTooLong || creatingTimedOut) {
      return { kind: 'play', label: '' }
    }
    if (currentGame?.game?.createdByUserId === currentUserId) {
      return { kind: 'creating', label: 'Creating...', disabled: true }
    }
    return { kind: 'waiting', label: 'Waiting for lobby', disabled: true }
  }

  if (status === 'lobby_ready' || status === 'in_progress') {
    // The lobby-URL-present case is handled above; without a URL we still wait.
    return { kind: 'waiting', label: 'Waiting for lobby', disabled: true }
  }

  if (status === 'failed' || status === 'voided') {
    return { kind: 'play', label: '' }
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

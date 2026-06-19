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
}

export interface MatchmakingHelperRound {
  roundNumber: number
  matches?: MatchmakingHelperMatch[] | null
}

export type RoundTabState = 'completed' | 'current' | 'upcoming'
export type WayfinderMatchState = 'recorded' | 'auto-recording' | 'manual'

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

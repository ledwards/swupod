export type DraftReportMatchSource = 'competitive' | 'casual'
export type DraftReportMatchResult = 'win' | 'loss' | 'draw' | 'pending'
export type DraftReportGameResult = 'W' | 'L' | 'D'

export interface DraftReportDeckIdentity {
  leaderName: string | null
  leaderImageUrl: string | null
  baseName: string | null
  baseImageUrl: string | null
  archetype: string | null
}

export interface DraftReportOpponent extends DraftReportDeckIdentity {
  username: string | null
  avatarUrl: string | null
}

export interface DraftReportGameReplay {
  gameNumber: number | null
  result: DraftReportGameResult | null
  replayUrl: string | null
  wayfinderMatchId: string | null
  wayfinderGameId: string | null
  playedAt: string | null
}

export interface DraftReportMatch {
  id: string
  source: DraftReportMatchSource
  label: string
  roundNumber: number | null
  wayfinderMatchId: string | null
  replayUrl: string | null
  playedAt: string | null
  result: DraftReportMatchResult
  gameResults: DraftReportGameResult[]
  games: DraftReportGameReplay[]
  player: DraftReportDeckIdentity
  opponent: DraftReportOpponent
}

export interface RawCompetitiveReportGame {
  id?: string | null
  game_number?: string | number | null
  gameNumber?: string | number | null
  result?: string | null
  replay_url?: string | null
  replayUrl?: string | null
  wayfinder_match_id?: string | null
  wayfinderMatchId?: string | null
  wayfinder_game_id?: string | null
  wayfinderGameId?: string | null
  completed_at?: string | Date | null
  completedAt?: string | Date | null
  started_at?: string | Date | null
  startedAt?: string | Date | null
  created_at?: string | Date | null
  createdAt?: string | Date | null
}

export interface RawCompetitiveReportMatch {
  id?: string | null
  match_id?: string | null
  round_number?: string | number | null
  wayfinder_match_id?: string | null
  wayfinder_replay_url?: string | null
  created_at?: string | Date | null
  match_winner?: string | null
  game1_result?: string | null
  game2_result?: string | null
  game3_result?: string | null
  player1_id?: string | null
  player2_id?: string | null
  player1_username?: string | null
  player2_username?: string | null
  player1_avatar_url?: string | null
  player2_avatar_url?: string | null
  player1_leader?: string | null
  player1_leader_image?: string | null
  player1_base?: string | null
  player1_base_image?: string | null
  player1_archetype?: string | null
  player2_leader?: string | null
  player2_leader_image?: string | null
  player2_base?: string | null
  player2_base_image?: string | null
  player2_archetype?: string | null
  live_games?: RawCompetitiveReportGame[] | string | null
  games?: RawCompetitiveReportGame[] | string | null
}

export interface RawCasualReportMatch {
  id?: string | null
  wayfinder_match_id?: string | null
  wayfinder_replay_url?: string | null
  result?: string | null
  game1_result?: string | null
  game2_result?: string | null
  game3_result?: string | null
  opponent_name?: string | null
  player_leader?: string | null
  player_leader_image?: string | null
  player_base?: string | null
  player_base_image?: string | null
  player_archetype?: string | null
  opponent_leader?: string | null
  opponent_leader_image?: string | null
  opponent_base?: string | null
  opponent_base_image?: string | null
  opponent_archetype?: string | null
  played_at?: string | Date | null
  created_at?: string | Date | null
}

function formatTimestamp(value: string | Date | null | undefined): string | null {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : String(value)
}

function normalizeRoundNumber(value: string | number | null | undefined): number | null {
  if (value == null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function sideForUser(row: RawCompetitiveReportMatch, userId: string): 'player1' | 'player2' | null {
  if (row.player1_id === userId) return 'player1'
  if (row.player2_id === userId) return 'player2'
  return null
}

function otherSide(side: 'player1' | 'player2' | null): 'player1' | 'player2' | null {
  if (side === 'player1') return 'player2'
  if (side === 'player2') return 'player1'
  return null
}

function competitiveResultFromPerspective(
  row: RawCompetitiveReportMatch,
  userSide: 'player1' | 'player2' | null
): DraftReportMatchResult {
  const winner = row.match_winner
  if (winner === 'draw') return 'draw'
  if (!userSide || (winner !== 'player1' && winner !== 'player2')) return 'pending'
  return winner === userSide ? 'win' : 'loss'
}

function competitiveGameFromPerspective(
  gameResult: string | null | undefined,
  userSide: 'player1' | 'player2' | null
): DraftReportGameResult | null {
  if (!gameResult || !userSide) return null
  if (gameResult === 'draw') return 'D'
  if (gameResult === userSide) return 'W'
  if (gameResult === otherSide(userSide)) return 'L'
  return null
}

function casualResult(value: string | null | undefined): DraftReportMatchResult {
  if (value === 'win' || value === 'loss' || value === 'draw') return value
  return 'pending'
}

function casualGame(value: string | null | undefined): DraftReportGameResult | null {
  const normalized = (value || '').toUpperCase()
  if (normalized === 'W' || normalized === 'L' || normalized === 'D') return normalized

  const lower = (value || '').toLowerCase()
  if (lower === 'win') return 'W'
  if (lower === 'loss') return 'L'
  if (lower === 'draw') return 'D'
  return null
}

function parseLiveGames(value: RawCompetitiveReportMatch['live_games']): RawCompetitiveReportGame[] {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return []

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function normalizeCompetitiveGameReplays(
  row: RawCompetitiveReportMatch,
  userSide: 'player1' | 'player2' | null
): DraftReportGameReplay[] {
  return parseLiveGames(row.live_games || row.games)
    .map((game) => ({
      gameNumber: normalizeRoundNumber(game.gameNumber ?? game.game_number),
      result: competitiveGameFromPerspective(game.result, userSide),
      replayUrl: game.replayUrl || game.replay_url || null,
      wayfinderMatchId: game.wayfinderMatchId || game.wayfinder_match_id || null,
      wayfinderGameId: game.wayfinderGameId || game.wayfinder_game_id || null,
      playedAt: formatTimestamp(
        game.completedAt || game.completed_at ||
        game.startedAt || game.started_at ||
        game.createdAt || game.created_at
      ),
    }))
    .filter(game => Boolean(game.result || game.replayUrl || game.wayfinderMatchId || game.wayfinderGameId))
    .sort((a, b) => (a.gameNumber || 0) - (b.gameNumber || 0))
}

function deckIdentity(row: RawCompetitiveReportMatch | RawCasualReportMatch, prefix: string): DraftReportDeckIdentity {
  return {
    leaderName: row[`${prefix}_leader` as keyof typeof row] as string | null || null,
    leaderImageUrl: row[`${prefix}_leader_image` as keyof typeof row] as string | null || null,
    baseName: row[`${prefix}_base` as keyof typeof row] as string | null || null,
    baseImageUrl: row[`${prefix}_base_image` as keyof typeof row] as string | null || null,
    archetype: row[`${prefix}_archetype` as keyof typeof row] as string | null || null,
  }
}

export function normalizeCompetitiveReportMatch(
  row: RawCompetitiveReportMatch,
  currentUserId: string
): DraftReportMatch {
  const userSide = sideForUser(row, currentUserId)
  const opponentSide = otherSide(userSide) || 'player2'
  const roundNumber = normalizeRoundNumber(row.round_number)
  const id = row.id || row.match_id || row.wayfinder_match_id || row.wayfinder_replay_url || ''
  const games = normalizeCompetitiveGameReplays(row, userSide)
  const gameResults = games.length > 0
    ? games.map(game => game.result).filter((game): game is DraftReportGameResult => Boolean(game))
    : [row.game1_result, row.game2_result, row.game3_result]
      .map((game) => competitiveGameFromPerspective(game, userSide))
      .filter((game): game is DraftReportGameResult => Boolean(game))
  const firstLinkedGame = games.find(game => game.replayUrl || game.wayfinderMatchId)

  return {
    id,
    source: 'competitive',
    label: roundNumber ? `Round ${roundNumber}` : 'Match',
    roundNumber,
    wayfinderMatchId: row.wayfinder_match_id || firstLinkedGame?.wayfinderMatchId || null,
    replayUrl: row.wayfinder_replay_url || null,
    playedAt: formatTimestamp(row.created_at),
    result: competitiveResultFromPerspective(row, userSide),
    gameResults,
    games,
    player: deckIdentity(row, userSide || 'player1'),
    opponent: {
      username: row[`${opponentSide}_username` as keyof RawCompetitiveReportMatch] as string | null || null,
      avatarUrl: row[`${opponentSide}_avatar_url` as keyof RawCompetitiveReportMatch] as string | null || null,
      ...deckIdentity(row, opponentSide),
    },
  }
}

export function normalizeCasualReportMatch(row: RawCasualReportMatch): DraftReportMatch {
  const id = row.id || row.wayfinder_match_id || row.wayfinder_replay_url || ''

  return {
    id,
    source: 'casual',
    label: 'Match',
    roundNumber: null,
    wayfinderMatchId: row.wayfinder_match_id || null,
    replayUrl: row.wayfinder_replay_url || null,
    playedAt: formatTimestamp(row.played_at || row.created_at),
    result: casualResult(row.result),
    gameResults: [row.game1_result, row.game2_result, row.game3_result]
      .map(casualGame)
      .filter((game): game is DraftReportGameResult => Boolean(game)),
    games: [],
    player: deckIdentity(row, 'player'),
    opponent: {
      username: row.opponent_name || null,
      avatarUrl: null,
      ...deckIdentity(row, 'opponent'),
    },
  }
}

function playedAtMs(match: Pick<DraftReportMatch, 'playedAt'>): number {
  const value = match.playedAt ? new Date(match.playedAt).getTime() : 0
  return Number.isFinite(value) ? value : 0
}

export function sortDraftReportMatches<T extends Pick<DraftReportMatch, 'roundNumber' | 'playedAt' | 'source'>>(
  matches: T[]
): T[] {
  return [...matches].sort((a, b) => {
    const aHasRound = a.roundNumber != null
    const bHasRound = b.roundNumber != null

    if (aHasRound && bHasRound && a.roundNumber !== b.roundNumber) {
      return Number(a.roundNumber) - Number(b.roundNumber)
    }

    if (aHasRound !== bHasRound) {
      return aHasRound ? -1 : 1
    }

    return playedAtMs(a) - playedAtMs(b)
  })
}

export type ReplayResult = 'win' | 'loss' | 'draw' | 'pending'
export type GameResult = 'W' | 'L' | 'D'

export interface DeckGameplayReplay {
  result?: ReplayResult
  gameResults?: GameResult[]
  opponent?: {
    username?: string | null
    leaderName?: string | null
    leaderImageUrl?: string | null
    baseName?: string | null
    archetype?: string | null
  } | null
}

export interface RecordSummary {
  wins: number
  losses: number
  draws: number
  matches: number
  winRate: number
}

export interface ResultDistributionBucket {
  key: '2-0' | '2-1' | '1-2' | '0-2' | 'draw'
  label: string
  count: number
}

export interface DeckGameplayMetrics {
  matchRecord: RecordSummary
  gameRecord: RecordSummary
  distribution: ResultDistributionBucket[]
  distributionMatches: number
  canShowDistributionChart: boolean
}

export interface OpponentBreakdown {
  key: string
  opponentName: string
  leaderName: string | null
  leaderImageUrl: string | null
  baseName: string | null
  archetype: string | null
  wins: number
  losses: number
  draws: number
  matches: number
  winRate: number
  sufficientData: boolean
}

export const MIN_DISTRIBUTION_MATCHES = 5
export const MIN_MATCHUP_MATCHES = 5

function pct(wins: number, total: number): number {
  return total > 0 ? Math.round((wins / total) * 1000) / 10 : 0
}

function emptyRecord(): RecordSummary {
  return { wins: 0, losses: 0, draws: 0, matches: 0, winRate: 0 }
}

function finishRecord(record: Omit<RecordSummary, 'matches' | 'winRate'>): RecordSummary {
  const matches = record.wins + record.losses + record.draws
  return { ...record, matches, winRate: pct(record.wins, matches) }
}

function distributionKey(replay: DeckGameplayReplay): ResultDistributionBucket['key'] | null {
  if (replay.result === 'draw') return 'draw'
  if (replay.result !== 'win' && replay.result !== 'loss') return null
  const games = replay.gameResults || []
  const wins = games.filter((game) => game === 'W').length
  const losses = games.filter((game) => game === 'L').length
  const draws = games.filter((game) => game === 'D').length

  if (draws > 0 && wins === losses) return 'draw'
  if (replay.result === 'win') return losses > 0 ? '2-1' : '2-0'
  return wins > 0 ? '1-2' : '0-2'
}

export function buildDeckGameplayMetrics(replays: DeckGameplayReplay[]): DeckGameplayMetrics {
  const matchRecord = { wins: 0, losses: 0, draws: 0 }
  const gameRecord = { wins: 0, losses: 0, draws: 0 }
  const distributionCounts: Record<ResultDistributionBucket['key'], number> = {
    '2-0': 0,
    '2-1': 0,
    '1-2': 0,
    '0-2': 0,
    draw: 0,
  }

  for (const replay of replays || []) {
    if (replay.result === 'win') matchRecord.wins += 1
    else if (replay.result === 'loss') matchRecord.losses += 1
    else if (replay.result === 'draw') matchRecord.draws += 1
    else continue

    for (const game of replay.gameResults || []) {
      if (game === 'W') gameRecord.wins += 1
      else if (game === 'L') gameRecord.losses += 1
      else if (game === 'D') gameRecord.draws += 1
    }

    const key = distributionKey(replay)
    if (key) distributionCounts[key] += 1
  }

  const distribution: ResultDistributionBucket[] = [
    { key: '2-0', label: '2-0 wins', count: distributionCounts['2-0'] },
    { key: '2-1', label: '2-1 wins', count: distributionCounts['2-1'] },
    { key: '1-2', label: '1-2 losses', count: distributionCounts['1-2'] },
    { key: '0-2', label: '0-2 losses', count: distributionCounts['0-2'] },
    { key: 'draw', label: 'Draws', count: distributionCounts.draw },
  ]
  const distributionMatches = distribution.reduce((sum, bucket) => sum + bucket.count, 0)
  const finalMatchRecord = finishRecord(matchRecord)

  return {
    matchRecord: finalMatchRecord,
    gameRecord: gameRecord.wins + gameRecord.losses + gameRecord.draws > 0
      ? finishRecord(gameRecord)
      : emptyRecord(),
    distribution,
    distributionMatches,
    canShowDistributionChart: finalMatchRecord.matches >= MIN_DISTRIBUTION_MATCHES,
  }
}

function opponentKey(replay: DeckGameplayReplay): string {
  const opponent = replay.opponent || {}
  return [
    opponent.leaderName || 'Unknown opponent',
    opponent.baseName || 'Unknown base',
    opponent.archetype || 'Unknown archetype',
  ].join('|')
}

export function buildOpponentBreakdown(replays: DeckGameplayReplay[]): OpponentBreakdown[] {
  const map = new Map<string, OpponentBreakdown>()

  for (const replay of replays || []) {
    if (replay.result !== 'win' && replay.result !== 'loss' && replay.result !== 'draw') continue
    const opponent = replay.opponent || {}
    const key = opponentKey(replay)
    const entry = map.get(key) || {
      key,
      opponentName: opponent.username || opponent.leaderName || 'Unknown opponent',
      leaderName: opponent.leaderName || null,
      leaderImageUrl: opponent.leaderImageUrl || null,
      baseName: opponent.baseName || null,
      archetype: opponent.archetype || null,
      wins: 0,
      losses: 0,
      draws: 0,
      matches: 0,
      winRate: 0,
      sufficientData: false,
    }

    if (!entry.leaderImageUrl && opponent.leaderImageUrl) entry.leaderImageUrl = opponent.leaderImageUrl
    if (replay.result === 'win') entry.wins += 1
    else if (replay.result === 'loss') entry.losses += 1
    else entry.draws += 1
    map.set(key, entry)
  }

  return Array.from(map.values())
    .map((entry) => {
      const matches = entry.wins + entry.losses + entry.draws
      return {
        ...entry,
        matches,
        winRate: pct(entry.wins, matches),
        sufficientData: matches >= MIN_MATCHUP_MATCHES,
      }
    })
    .sort((a, b) => b.matches - a.matches || b.winRate - a.winRate || a.opponentName.localeCompare(b.opponentName))
}

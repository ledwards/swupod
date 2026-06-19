import { rankPlayers, type MatchForCalc } from './results'

export interface MatchPlayerForStandings {
  id: string
  username?: string | null
}

export interface MatchForStandings {
  id?: string
  player1: MatchPlayerForStandings | null
  player2: MatchPlayerForStandings | null
  isBye: boolean
  finalConfirmed: boolean
  matchWinner: 'player1' | 'player2' | 'draw' | string | null
}

export interface RoundForStandings {
  roundNumber: number
  matches?: MatchForStandings[] | null
}

export interface PlayerForStandings {
  id: string
  username?: string | null
  dropped?: boolean | null
}

export interface PlayerRecord {
  wins: number
  losses: number
  draws: number
}

export interface RankedStanding extends PlayerRecord {
  id: string
  username: string
  dropped: boolean
  rank: number
  omwPercent: number
}

function emptyRecord(): PlayerRecord {
  return { wins: 0, losses: 0, draws: 0 }
}

function ensureRecord(records: Map<string, PlayerRecord>, playerId: string): PlayerRecord {
  const existing = records.get(playerId)
  if (existing) return existing

  const record = emptyRecord()
  records.set(playerId, record)
  return record
}

function roundIsBefore(round: RoundForStandings, throughRound?: number): boolean {
  return throughRound == null || round.roundNumber < throughRound
}

export function hasConfirmedMatch(rounds: RoundForStandings[] = []): boolean {
  return rounds.some(round =>
    (round.matches || []).some(match => match.finalConfirmed)
  )
}

export function tallyRecords(
  rounds: RoundForStandings[] = [],
  options: { throughRound?: number } = {}
): Map<string, PlayerRecord> {
  const records = new Map<string, PlayerRecord>()

  for (const round of rounds || []) {
    if (!roundIsBefore(round, options.throughRound)) continue

    for (const match of round.matches || []) {
      if (match.player1?.id) ensureRecord(records, match.player1.id)
      if (match.player2?.id) ensureRecord(records, match.player2.id)
      if (!match.finalConfirmed) continue

      if (match.isBye && match.player1?.id) {
        ensureRecord(records, match.player1.id).wins += 1
        continue
      }

      if (match.matchWinner === 'player1' && match.player1?.id) {
        ensureRecord(records, match.player1.id).wins += 1
        if (match.player2?.id) ensureRecord(records, match.player2.id).losses += 1
      } else if (match.matchWinner === 'player2' && match.player2?.id) {
        ensureRecord(records, match.player2.id).wins += 1
        if (match.player1?.id) ensureRecord(records, match.player1.id).losses += 1
      } else if (match.matchWinner === 'draw') {
        if (match.player1?.id) ensureRecord(records, match.player1.id).draws += 1
        if (match.player2?.id) ensureRecord(records, match.player2.id).draws += 1
      }
    }
  }

  return records
}

export function recordsThroughRound(
  rounds: RoundForStandings[] = [],
  beforeRound: number
): Map<string, PlayerRecord> {
  return tallyRecords(rounds, { throughRound: beforeRound })
}

export function toRankMatches(rounds: RoundForStandings[] = []): MatchForCalc[] {
  const rankMatches: MatchForCalc[] = []

  for (const round of rounds || []) {
    for (const match of round.matches || []) {
      if (!match.player1?.id) continue

      let matchWinner: string | null = null
      if (match.matchWinner === 'player1') {
        matchWinner = match.player1.id
      } else if (match.matchWinner === 'player2') {
        matchWinner = match.player2?.id || null
      } else if (match.matchWinner === 'draw') {
        matchWinner = 'draw'
      }

      rankMatches.push({
        player1Id: match.player1.id,
        player2Id: match.player2?.id || null,
        matchWinner,
        isBye: match.isBye,
        finalConfirmed: match.finalConfirmed,
      })
    }
  }

  return rankMatches
}

export function computeRankedStandings(
  rounds: RoundForStandings[] = [],
  players: PlayerForStandings[] = []
): RankedStanding[] {
  const records = tallyRecords(rounds)
  const playerMap = new Map<string, { username: string; dropped: boolean }>()

  for (const player of players || []) {
    if (!player?.id) continue
    playerMap.set(player.id, {
      username: player.username || 'Unknown Player',
      dropped: Boolean(player.dropped),
    })
    ensureRecord(records, player.id)
  }

  for (const round of rounds || []) {
    for (const match of round.matches || []) {
      for (const player of [match.player1, match.player2]) {
        if (!player?.id || playerMap.has(player.id)) continue
        playerMap.set(player.id, {
          username: player.username || 'Unknown Player',
          dropped: false,
        })
      }
    }
  }

  const rankInput = Array.from(records.entries()).map(([id, record]) => ({
    id,
    matchWins: record.wins,
    matchLosses: record.losses,
  }))
  const rankMatches = toRankMatches(rounds)
  const ranked = rankPlayers(rankInput, rankMatches, Array.from(records.keys()))

  return ranked.map(player => {
    const record = records.get(player.id) || emptyRecord()
    const meta = playerMap.get(player.id)

    return {
      id: player.id,
      username: meta?.username || 'Unknown Player',
      dropped: meta?.dropped || false,
      rank: player.rank,
      wins: record.wins,
      losses: record.losses,
      draws: record.draws,
      omwPercent: player.omwPercent,
    }
  })
}

export function formatRecord(record?: PlayerRecord | null): string {
  const value = record || emptyRecord()
  return `${value.wins}-${value.losses}${value.draws > 0 ? `-${value.draws}` : ''}`
}

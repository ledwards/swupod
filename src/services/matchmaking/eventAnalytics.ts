import { archetypeShortName } from '@/src/utils/archetypeName'

export interface EventAnalyticsPlayer {
  id: string
  username?: string | null
  dropped?: boolean | null
  poolShareId?: string | null
  activeLeaderName?: string | null
  baseName?: string | null
  baseAspects?: string[] | null
  baseHp?: number | null
  archetypeName?: string | null
  poolCardCount?: number | null
}

export interface EventAnalyticsMatchPlayer {
  id: string
}

export interface EventAnalyticsMatch {
  player1: EventAnalyticsMatchPlayer | null
  player2: EventAnalyticsMatchPlayer | null
  isBye: boolean
  finalConfirmed: boolean
  matchWinner: 'player1' | 'player2' | 'draw' | string | null
}

export interface EventAnalyticsRound {
  matches?: EventAnalyticsMatch[] | null
}

export interface DeckIdentitySummary {
  activeLeaderName: string | null
  baseName: string | null
  baseAspects: string[]
  baseHp: number | null
  archetypeName: string | null
}

export interface EventMetaRow {
  name: string
  deckCount: number
  metaShare: number
  matchWins: number
  matchLosses: number
  matchDraws: number
  matchCount: number
  matchWinRate: number | null
  smallSample: boolean
}

export interface EventPoolContext {
  totalPlayers: number
  playersWithPools: number
  playersWithDecks: number
  averagePoolCards: number | null
  expectedPacksPerPlayer: number | null
  status: 'ready' | 'insufficient_data'
}

export interface SwissPracticeEventSummary {
  totalDecks: number
  knownLeaderDecks: number
  knownArchetypeDecks: number
  leaderMeta: EventMetaRow[]
  archetypeMeta: EventMetaRow[]
  poolContext: EventPoolContext
}

interface NonByeRecord {
  wins: number
  losses: number
  draws: number
}

export function deckIdentityFromDeckState(
  deckBuilderState: unknown,
  draftedLeaders: Array<{ name?: string | null; aspects?: string[] | null }> = []
): DeckIdentitySummary {
  const state = typeof deckBuilderState === 'string'
    ? safeJsonParse(deckBuilderState)
    : deckBuilderState as Record<string, unknown> | null
  const positions = state?.cardPositions && typeof state.cardPositions === 'object'
    ? state.cardPositions as Record<string, { card?: Record<string, unknown> | null }>
    : {}

  const leaderCard = typeof state?.activeLeader === 'string'
    ? positions[state.activeLeader]?.card
    : null
  const baseCard = typeof state?.activeBase === 'string'
    ? positions[state.activeBase]?.card
    : null

  const activeLeaderName = stringOrNull(leaderCard?.name)
    ?? stringOrNull(draftedLeaders[0]?.name)
  const baseName = stringOrNull(baseCard?.name)
  const baseAspects = Array.isArray(baseCard?.aspects)
    ? (baseCard.aspects as unknown[]).filter((aspect): aspect is string => typeof aspect === 'string')
    : []
  const baseHp = typeof baseCard?.hp === 'number' ? baseCard.hp : null
  const archetypeName = activeLeaderName
    ? archetypeShortName({
        archetypeNickname: null,
        leaderName: activeLeaderName,
        baseAspects,
        baseHp,
      })
    : null

  return {
    activeLeaderName,
    baseName,
    baseAspects,
    baseHp,
    archetypeName,
  }
}

export function computeSwissPracticeEventSummary({
  players,
  rounds,
  expectedPacksPerPlayer = 3,
}: {
  players: EventAnalyticsPlayer[]
  rounds: EventAnalyticsRound[]
  expectedPacksPerPlayer?: number | null
}): SwissPracticeEventSummary {
  const records = nonByeRecordsByPlayer(rounds)
  const playersWithDecks = players.filter(player => Boolean(player.poolShareId))
  const knownLeaderDecks = players.filter(player => Boolean(player.activeLeaderName)).length
  const knownArchetypeDecks = players.filter(player => Boolean(player.archetypeName || player.activeLeaderName)).length

  return {
    totalDecks: players.length,
    knownLeaderDecks,
    knownArchetypeDecks,
    leaderMeta: metaRowsFor(players, records, player => player.activeLeaderName || 'Unknown leader'),
    archetypeMeta: metaRowsFor(players, records, player => player.archetypeName || player.activeLeaderName || 'Unknown archetype'),
    poolContext: {
      totalPlayers: players.length,
      playersWithPools: players.filter(player => Boolean(player.poolShareId)).length,
      playersWithDecks: playersWithDecks.length,
      averagePoolCards: average(
        players
          .map(player => player.poolCardCount)
          .filter((count): count is number => typeof count === 'number' && Number.isFinite(count))
      ),
      expectedPacksPerPlayer,
      status: playersWithDecks.length === players.length && players.length > 0 ? 'ready' : 'insufficient_data',
    },
  }
}

function metaRowsFor(
  players: EventAnalyticsPlayer[],
  records: Map<string, NonByeRecord>,
  labelFor: (player: EventAnalyticsPlayer) => string
): EventMetaRow[] {
  const groups = new Map<string, { players: EventAnalyticsPlayer[]; record: NonByeRecord }>()

  for (const player of players) {
    const name = labelFor(player)
    const group = groups.get(name) || { players: [], record: { wins: 0, losses: 0, draws: 0 } }
    const record = records.get(player.id) || { wins: 0, losses: 0, draws: 0 }
    group.players.push(player)
    group.record.wins += record.wins
    group.record.losses += record.losses
    group.record.draws += record.draws
    groups.set(name, group)
  }

  const totalDecks = Math.max(players.length, 1)
  return Array.from(groups.entries())
    .map(([name, group]) => {
      const matchCount = group.record.wins + group.record.losses + group.record.draws
      return {
        name,
        deckCount: group.players.length,
        metaShare: group.players.length / totalDecks,
        matchWins: group.record.wins,
        matchLosses: group.record.losses,
        matchDraws: group.record.draws,
        matchCount,
        matchWinRate: matchCount > 0 ? group.record.wins / matchCount : null,
        smallSample: matchCount < 3,
      }
    })
    .sort((a, b) => {
      const deckDiff = b.deckCount - a.deckCount
      if (deckDiff !== 0) return deckDiff
      const winRateDiff = (b.matchWinRate ?? -1) - (a.matchWinRate ?? -1)
      if (winRateDiff !== 0) return winRateDiff
      return a.name.localeCompare(b.name)
    })
}

function nonByeRecordsByPlayer(rounds: EventAnalyticsRound[]): Map<string, NonByeRecord> {
  const records = new Map<string, NonByeRecord>()

  for (const round of rounds || []) {
    for (const match of round.matches || []) {
      if (!match.finalConfirmed || match.isBye) continue
      const player1Id = match.player1?.id
      const player2Id = match.player2?.id
      if (!player1Id || !player2Id) continue

      const player1 = ensureRecord(records, player1Id)
      const player2 = ensureRecord(records, player2Id)
      if (match.matchWinner === 'player1') {
        player1.wins += 1
        player2.losses += 1
      } else if (match.matchWinner === 'player2') {
        player2.wins += 1
        player1.losses += 1
      } else if (match.matchWinner === 'draw') {
        player1.draws += 1
        player2.draws += 1
      }
    }
  }

  return records
}

function ensureRecord(records: Map<string, NonByeRecord>, playerId: string): NonByeRecord {
  const existing = records.get(playerId)
  if (existing) return existing
  const record = { wins: 0, losses: 0, draws: 0 }
  records.set(playerId, record)
  return record
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function safeJsonParse(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

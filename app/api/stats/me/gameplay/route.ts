// GET /api/stats/me/gameplay - Authenticated user's play record and capture stats.
import { queryRow, queryRows } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { applyRateLimit } from '@/lib/rateLimit'
import { getAspectColor } from '@/src/utils/aspectColors'
import { hyperspaceLeaderArt } from '@/src/utils/hyperspaceLeaderArt'
import { NextRequest, NextResponse } from 'next/server'

/** Replay list items use unit-side leader art, preferring Hyperspace variants. */
function withPreferredReplayArt(replay: GameplayReplay): GameplayReplay {
  const set = replay.pool?.setCode
  return {
    ...replay,
    leaderImageUrl: hyperspaceLeaderArt(replay.leaderName, set) || replay.leaderBackImageUrl || replay.leaderImageUrl,
    opponent: {
      ...replay.opponent,
      leaderImageUrl: hyperspaceLeaderArt(replay.opponent.leaderName, set) || replay.opponent.leaderImageUrl,
    },
  }
}

const DEFAULT_SINCE = '2020-01-01'
const DEFAULT_UNTIL = '2099-12-31'
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

interface RawRecordRow {
  wins?: string | number | null
  losses?: string | number | null
  draws?: string | number | null
  pools?: string | number | null
  captured_matches?: string | number | null
  decks_played?: string | number | null
}

interface RawBreakdownRow extends RawRecordRow {
  key?: string | null
  label?: string | null
}

interface RawRecentPoolRow extends RawRecordRow {
  share_id?: string | null
  name?: string | null
  set_code?: string | null
  pool_type?: string | null
  deck_builder_state?: unknown
  updated_at?: string | Date | null
}

type DevFixturePoolRow = Pick<RawRecentPoolRow, 'share_id' | 'name' | 'set_code' | 'pool_type' | 'deck_builder_state' | 'updated_at'>

interface RawReplayRow {
  match_id?: string | null
  wayfinder_match_id?: string | null
  wayfinder_replay_url?: string | null
  created_at?: string | Date | null
  match_winner?: string | null
  game1_result?: string | null
  game2_result?: string | null
  game3_result?: string | null
  player1_id?: string | null
  player2_id?: string | null
  opponent_username?: string | null
  opponent_avatar_url?: string | null
  opponent_leader?: string | null
  opponent_leader_image?: string | null
  opponent_base?: string | null
  opponent_archetype?: string | null
  my_archetype?: string | null
  pool_share_id?: string | null
  pool_name?: string | null
  set_code?: string | null
  pool_type?: string | null
  deck_builder_state?: unknown
}

export interface GameplayBreakdown {
  key: string
  label: string
  wins: number
  losses: number
  draws: number
  matches: number
  winRate: number
  pools: number
  capturedMatches: number
}

export interface GameplayRecentPool {
  shareId: string
  name: string
  setCode: string
  format: string
  formatLabel: string
  leaderName: string | null
  baseName: string | null
  leaderImageUrl: string | null
  leaderBackImageUrl: string | null
  baseImageUrl: string | null
  deckCardCount: number
  wins: number
  losses: number
  draws: number
  matches: number
  capturedMatches: number
  updatedAt: string | null
}

export interface GameplayBaseSplit {
  aspect: string
  wins: number
  losses: number
  draws: number
  matches: number
  winRate: number
}

export interface GameplayLeaderBreakdown {
  leaderName: string
  leaderImageUrl: string | null
  leaderBackImageUrl: string | null
  baseColor: string | null
  wins: number
  losses: number
  draws: number
  matches: number
  winRate: number
  pools: number
  // Win rate split by the base's color aspect — drives the hover bars.
  byBase: GameplayBaseSplit[]
}

export interface GameplayReplay {
  id: string
  wayfinderMatchId: string | null
  replayUrl: string
  playedAt: string | null
  result: 'win' | 'loss' | 'draw' | 'pending'
  gameResults: Array<'W' | 'L' | 'D'>
  opponent: {
    username: string | null
    avatarUrl: string | null
    leaderName: string | null
    leaderImageUrl: string | null
    baseName: string | null
    archetype: string | null
  }
  pool: {
    shareId: string | null
    name: string
    setCode: string
    format: string
    formatLabel: string
  }
  leaderName: string | null
  baseName: string | null
  leaderImageUrl: string | null
  leaderBackImageUrl: string | null
  baseImageUrl: string | null
  archetype: string | null
  deckCardCount: number
}

export interface GameplayResponse {
  summary: GameplayBreakdown & {
    decksPlayed: number
    replaysRecorded: number
  }
  formatBreakdown: GameplayBreakdown[]
  setBreakdown: GameplayBreakdown[]
  leaderBreakdown: GameplayLeaderBreakdown[]
  recentPools: GameplayRecentPool[]
  replays: GameplayReplay[]
}

interface RawLeaderPoolRow {
  deck_builder_state?: unknown
  wins?: string | number | null
  losses?: string | number | null
  draws?: string | number | null
}

/**
 * Aggregate the player's record by the leader they ran, across every pool with
 * games — drives the "Leaders" widget (their mix of leaders + win rate per
 * leader). Pools with no leader picked yet are skipped.
 */
export function buildLeaderBreakdown(rows: RawLeaderPoolRow[]): GameplayLeaderBreakdown[] {
  const byLeader = new Map<string, GameplayLeaderBreakdown>()
  // leaderName -> aspect -> tally
  const baseTallies = new Map<string, Map<string, { wins: number; losses: number; draws: number }>>()
  for (const row of rows) {
    const wins = toInt(row.wins)
    const losses = toInt(row.losses)
    const draws = toInt(row.draws)
    if (wins + losses + draws === 0) continue
    const preview = extractDeckPreview(row.deck_builder_state)
    const name = preview.leaderName
    if (!name) continue
    const existing = byLeader.get(name) || {
      leaderName: name,
      leaderImageUrl: preview.leaderImageUrl,
      leaderBackImageUrl: preview.leaderBackImageUrl,
      baseColor: preview.baseColor,
      wins: 0,
      losses: 0,
      draws: 0,
      matches: 0,
      winRate: 0,
      pools: 0,
      byBase: [],
    }
    existing.wins += wins
    existing.losses += losses
    existing.draws += draws
    existing.pools += 1
    if (!existing.leaderImageUrl && preview.leaderImageUrl) existing.leaderImageUrl = preview.leaderImageUrl
    if (!existing.leaderBackImageUrl && preview.leaderBackImageUrl) existing.leaderBackImageUrl = preview.leaderBackImageUrl
    if (!existing.baseColor && preview.baseColor) existing.baseColor = preview.baseColor
    byLeader.set(name, existing)

    // Per-base-aspect tally (skip pools where the base has no color aspect).
    if (preview.baseAspect) {
      let aspects = baseTallies.get(name)
      if (!aspects) { aspects = new Map(); baseTallies.set(name, aspects) }
      const t = aspects.get(preview.baseAspect) || { wins: 0, losses: 0, draws: 0 }
      t.wins += wins; t.losses += losses; t.draws += draws
      aspects.set(preview.baseAspect, t)
    }
  }
  return Array.from(byLeader.values())
    .map((entry) => {
      const matches = entry.wins + entry.losses + entry.draws
      const aspects = baseTallies.get(entry.leaderName)
      const byBase: GameplayBaseSplit[] = COLOR_ASPECTS
        .map((aspect) => {
          const t = aspects?.get(aspect)
          if (!t) return null
          const m = t.wins + t.losses + t.draws
          if (m === 0) return null
          return { aspect, wins: t.wins, losses: t.losses, draws: t.draws, matches: m, winRate: Math.round((t.wins / m) * 1000) / 10 }
        })
        .filter(Boolean) as GameplayBaseSplit[]
      return {
        ...entry,
        matches,
        winRate: matches > 0 ? Math.round((entry.wins / matches) * 1000) / 10 : 0,
        byBase,
      }
    })
    .sort((a, b) => b.matches - a.matches || b.winRate - a.winRate || a.leaderName.localeCompare(b.leaderName))
}

function parseDateParam(raw: string | null): string | null {
  if (raw == null || raw === '') return null
  const trimmed = raw.trim()
  if (!DATE_RE.test(trimmed)) {
    throw new Error('Invalid date format. Expected YYYY-MM-DD.')
  }
  const ts = Date.parse(trimmed + 'T00:00:00Z')
  if (Number.isNaN(ts)) {
    throw new Error('Invalid date value.')
  }
  return trimmed
}

function toInt(value: unknown): number {
  const n = typeof value === 'number' ? value : parseInt(String(value ?? '0'), 10)
  return Number.isFinite(n) ? n : 0
}

function parseDeckBuilderState(raw: unknown): Record<string, any> {
  if (!raw) return {}
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) || {}
    } catch {
      return {}
    }
  }
  return typeof raw === 'object' ? raw as Record<string, any> : {}
}

function cardDisplayName(card: any): string | null {
  return card?.name || card?.title || null
}

const COLOR_ASPECTS = ['Vigilance', 'Command', 'Aggression', 'Cunning']

function extractDeckPreview(raw: unknown): {
  leaderName: string | null
  baseName: string | null
  leaderImageUrl: string | null
  leaderBackImageUrl: string | null
  baseImageUrl: string | null
  baseColor: string | null
  baseAspect: string | null
  deckCardCount: number
} {
  const state = parseDeckBuilderState(raw)
  const positions = state.cardPositions || {}
  const leaderCard = state.activeLeader ? positions[state.activeLeader]?.card : null
  const baseCard = state.activeBase ? positions[state.activeBase]?.card : null
  const deckCardCount = Object.values(positions).filter((pos: any) =>
    pos?.section === 'deck' &&
    pos?.enabled !== false &&
    pos?.visible !== false &&
    !pos?.card?.isLeader &&
    !pos?.card?.isBase
  ).length

  // Primary color aspect of the base — drives the per-base win-rate bars.
  const baseAspect = (baseCard?.aspects || []).find((a: string) => COLOR_ASPECTS.includes(a)) || null

  return {
    leaderName: cardDisplayName(leaderCard),
    baseName: cardDisplayName(baseCard),
    leaderImageUrl: leaderCard?.imageUrl || leaderCard?.artUrl || null,
    leaderBackImageUrl: leaderCard?.backImageUrl || null,
    baseImageUrl: baseCard?.imageUrl || baseCard?.artUrl || null,
    baseColor: baseCard ? getAspectColor(baseCard) : null,
    baseAspect,
    deckCardCount,
  }
}

function formatLabel(format: string): string {
  switch (format) {
    case 'draft':
      return 'Draft'
    case 'sealed':
      return 'Sealed'
    case 'chaos_sealed':
      return 'Chaos Sealed'
    case 'pack_blitz':
      return 'Pack Blitz'
    case 'pack_wars':
      return 'Pack Wars'
    case 'rotisserie':
      return 'Rotisserie'
    default:
      return format
        .split(/[_-]/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ') || 'Unknown'
  }
}

function buildBreakdown(row: RawBreakdownRow, fallbackKey: string, fallbackLabel: string): GameplayBreakdown {
  const wins = toInt(row.wins)
  const losses = toInt(row.losses)
  const draws = toInt(row.draws)
  const matches = wins + losses + draws

  return {
    key: row.key || fallbackKey,
    label: row.label || fallbackLabel,
    wins,
    losses,
    draws,
    matches,
    winRate: matches > 0 ? Math.round((wins / matches) * 1000) / 10 : 0,
    pools: toInt(row.pools),
    capturedMatches: toInt(row.captured_matches),
  }
}

function recentPoolFromFixture(
  row: DevFixturePoolRow,
  record: Pick<RawRecordRow, 'wins' | 'losses' | 'draws' | 'captured_matches'>,
  fallbackName: string
): GameplayRecentPool {
  const format = row.pool_type || 'sealed'
  const wins = toInt(record.wins)
  const losses = toInt(record.losses)
  const draws = toInt(record.draws)

  return {
    shareId: row.share_id || '',
    name: row.name || fallbackName,
    setCode: row.set_code || 'LAW',
    format,
    formatLabel: formatLabel(format),
    ...extractDeckPreview(row.deck_builder_state),
    wins,
    losses,
    draws,
    matches: wins + losses + draws,
    capturedMatches: toInt(record.captured_matches),
    updatedAt: row.updated_at instanceof Date
      ? row.updated_at.toISOString()
      : row.updated_at ? String(row.updated_at) : null,
  }
}

function formatTimestamp(value: string | Date | null | undefined): string | null {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : String(value)
}

function resultFromPerspective(row: RawReplayRow, currentUserId: string): GameplayReplay['result'] {
  const winner = row.match_winner
  if (winner === 'draw') return 'draw'
  if (winner !== 'player1' && winner !== 'player2') return 'pending'
  const userSide = row.player1_id === currentUserId ? 'player1' : row.player2_id === currentUserId ? 'player2' : null
  if (!userSide) return 'pending'
  return winner === userSide ? 'win' : 'loss'
}

function gameResultFromPerspective(
  gameResult: string | null | undefined,
  row: RawReplayRow,
  currentUserId: string
): 'W' | 'L' | 'D' | null {
  if (!gameResult) return null
  if (gameResult === 'draw') return 'D'
  const userSide = row.player1_id === currentUserId ? 'player1' : row.player2_id === currentUserId ? 'player2' : null
  if (!userSide) return null
  return gameResult === userSide ? 'W' : 'L'
}

export function buildTerronkDevGameplayFixture(poolRows: DevFixturePoolRow[]): GameplayResponse {
  const seededRecords: Array<Pick<RawRecordRow, 'wins' | 'losses' | 'draws' | 'captured_matches'>> = [
    { wins: 3, losses: 1, draws: 0, captured_matches: 4 },
    { wins: 2, losses: 2, draws: 1, captured_matches: 5 },
    { wins: 4, losses: 0, draws: 0, captured_matches: 4 },
    { wins: 1, losses: 3, draws: 0, captured_matches: 3 },
    { wins: 3, losses: 2, draws: 0, captured_matches: 3 },
    { wins: 2, losses: 1, draws: 0, captured_matches: 2 },
  ]
  const recentPools = poolRows
    .slice(0, seededRecords.length)
    .map((row, index) => recentPoolFromFixture(
      row,
      seededRecords[index] || seededRecords[0]!,
      `${row.set_code || 'LAW'} ${formatLabel(row.pool_type || 'sealed')} Pool`
    ))
    .filter((pool) => pool.shareId)
  const replays = recentPools.slice(0, 5).map((pool, index) => ({
    id: `terronk-replay-${index + 1}`,
    wayfinderMatchId: `terronk-dev-${index + 1}`,
    replayUrl: `https://wayfinder.news/replay/terronk-dev-${index + 1}`,
    playedAt: pool.updatedAt,
    result: index % 3 === 1 ? 'loss' as const : 'win' as const,
    gameResults: index % 3 === 1 ? ['L', 'W', 'L'] as Array<'W' | 'L' | 'D'> : ['W', 'L', 'W'] as Array<'W' | 'L' | 'D'>,
    opponent: {
      username: index % 2 === 0 ? 'Karabast Opponent' : 'Wayfinder Rival',
      avatarUrl: null,
      leaderName: index % 2 === 0 ? 'Boba Fett' : 'Darth Vader',
      leaderImageUrl: null,
      baseName: index % 2 === 0 ? 'Tarkintown' : 'Command Center',
      archetype: index % 2 === 0 ? 'Boba Aggro' : 'Vader Control',
    },
    pool: {
      shareId: pool.shareId,
      name: pool.name,
      setCode: pool.setCode,
      format: pool.format,
      formatLabel: pool.formatLabel,
    },
    leaderName: pool.leaderName,
    baseName: pool.baseName,
    leaderImageUrl: pool.leaderImageUrl,
    leaderBackImageUrl: pool.leaderBackImageUrl,
    baseImageUrl: pool.baseImageUrl,
    archetype: null,
    deckCardCount: pool.deckCardCount,
  }))

  return {
    summary: {
      key: 'all',
      label: 'All Play',
      wins: 15,
      losses: 9,
      draws: 1,
      matches: 25,
      winRate: 60,
      pools: 9,
      capturedMatches: 21,
      decksPlayed: 10,
      replaysRecorded: 21,
    },
    formatBreakdown: [
      {
        key: 'sealed',
        label: 'Sealed',
        wins: 9,
        losses: 5,
        draws: 1,
        matches: 15,
        winRate: 60,
        pools: 5,
        capturedMatches: 13,
      },
      {
        key: 'draft',
        label: 'Draft',
        wins: 6,
        losses: 4,
        draws: 0,
        matches: 10,
        winRate: 60,
        pools: 4,
        capturedMatches: 8,
      },
    ],
    leaderBreakdown: buildLeaderBreakdown(
      recentPools.map((pool, index) => ({
        deck_builder_state: {
          activeLeader: 'L',
          activeBase: 'B',
          cardPositions: {
            L: { card: { name: pool.leaderName || `Leader ${index + 1}`, imageUrl: pool.leaderImageUrl } },
          },
        },
        wins: seededRecords[index]?.wins ?? 0,
        losses: seededRecords[index]?.losses ?? 0,
        draws: seededRecords[index]?.draws ?? 0,
      }))
    ),
    setBreakdown: [
      {
        key: 'LAW',
        label: 'LAW',
        wins: 8,
        losses: 4,
        draws: 1,
        matches: 13,
        winRate: 61.5,
        pools: 4,
        capturedMatches: 11,
      },
      {
        key: 'SEC',
        label: 'SEC',
        wins: 5,
        losses: 3,
        draws: 0,
        matches: 8,
        winRate: 62.5,
        pools: 3,
        capturedMatches: 7,
      },
      {
        key: 'LOF',
        label: 'LOF',
        wins: 2,
        losses: 2,
        draws: 0,
        matches: 4,
        winRate: 50,
        pools: 2,
        capturedMatches: 3,
      },
    ],
    recentPools,
    replays,
  }
}

function shouldUseTerronkDevFixture(
  sessionUsername: string | undefined,
  summaryRow: RawRecordRow | null,
  formatRows: RawBreakdownRow[],
  replayRow: { replays_recorded?: string | number | null } | null
): boolean {
  if (process.env.NODE_ENV === 'production') return false
  if ((sessionUsername || '').toLowerCase() !== 'terronk') return false

  const realMatches =
    toInt(summaryRow?.wins) +
    toInt(summaryRow?.losses) +
    toInt(summaryRow?.draws) +
    toInt(summaryRow?.captured_matches) +
    toInt(summaryRow?.decks_played) +
    toInt(replayRow?.replays_recorded)

  return realMatches === 0 && formatRows.length === 0
}

interface RawCasualRow {
  id?: string | null
  wayfinder_match_id?: string | null
  wayfinder_replay_url?: string | null
  result?: string | null
  game1_result?: string | null
  game2_result?: string | null
  game3_result?: string | null
  opponent_name?: string | null
  player_archetype?: string | null
  opponent_leader?: string | null
  opponent_leader_image?: string | null
  opponent_base?: string | null
  opponent_archetype?: string | null
  played_at?: string | Date | null
  pool_share_id?: string | null
  pool_name?: string | null
  set_code?: string | null
  pool_type?: string | null
  deck_builder_state?: unknown
}

/** Map a casual_matches row (already user-perspective) to the replay shape. */
function mapCasualReplay(row: RawCasualRow): GameplayReplay {
  const format = row.pool_type || 'sealed'
  const deckPreview = extractDeckPreview(row.deck_builder_state)
  const replayUrl = row.wayfinder_replay_url || ''
  const result = (row.result === 'win' || row.result === 'loss' || row.result === 'draw') ? row.result : 'pending'
  return {
    id: row.id || row.wayfinder_match_id || replayUrl,
    wayfinderMatchId: row.wayfinder_match_id || null,
    replayUrl,
    playedAt: formatTimestamp(row.played_at),
    result,
    gameResults: [row.game1_result, row.game2_result, row.game3_result]
      .filter((g): g is 'W' | 'L' | 'D' => g === 'W' || g === 'L' || g === 'D'),
    opponent: {
      username: row.opponent_name || null,
      avatarUrl: null,
      leaderName: row.opponent_leader || null,
      leaderImageUrl: row.opponent_leader_image || null,
      baseName: row.opponent_base || null,
      archetype: row.opponent_archetype || null,
    },
    pool: {
      shareId: row.pool_share_id || null,
      name: row.pool_name || `${row.set_code || 'SWU'} ${formatLabel(format)}`,
      setCode: row.set_code || 'UNK',
      format,
      formatLabel: formatLabel(format),
    },
    ...deckPreview,
    archetype: row.player_archetype || null,
  }
}

export function buildGameplayResponse(
  summaryRow: RawRecordRow | null,
  formatRows: RawBreakdownRow[],
  setRows: RawBreakdownRow[],
  recentPoolRows: RawRecentPoolRow[],
  replayRow: { replays_recorded?: string | number | null } | null,
  replayRows: RawReplayRow[] = [],
  currentUserId = '',
  leaderPoolRows: RawLeaderPoolRow[] = [],
  casualRows: RawCasualRow[] = []
): GameplayResponse {
  const summary = buildBreakdown(summaryRow || {}, 'all', 'All Play')
  const decksPlayed = toInt(summaryRow?.decks_played)
  const replayUrlCount = toInt(replayRow?.replays_recorded)

  return {
    summary: {
      ...summary,
      decksPlayed,
      replaysRecorded: Math.max(summary.capturedMatches, replayUrlCount),
    },
    leaderBreakdown: buildLeaderBreakdown(leaderPoolRows),
    formatBreakdown: formatRows.map((row) => {
      const key = row.key || 'unknown'
      return buildBreakdown({ ...row, label: formatLabel(key) }, key, formatLabel(key))
    }),
    setBreakdown: setRows.map((row) => {
      const key = row.key || 'unknown'
      return buildBreakdown(row, key, row.label || key)
    }),
    recentPools: recentPoolRows.map((row) => {
      const format = row.pool_type || 'sealed'
      const wins = toInt(row.wins)
      const losses = toInt(row.losses)
      const draws = toInt(row.draws)
      const deckPreview = extractDeckPreview(row.deck_builder_state)

      return {
        shareId: row.share_id || '',
        name: row.name || `${row.set_code || 'SWU'} ${formatLabel(format)}`,
        setCode: row.set_code || 'UNK',
        format,
        formatLabel: formatLabel(format),
        ...deckPreview,
        wins,
        losses,
        draws,
        matches: wins + losses + draws,
        capturedMatches: toInt(row.captured_matches),
        updatedAt: formatTimestamp(row.updated_at),
      }
    }).filter((pool) => pool.shareId),
    replays: [
      ...replayRows.map((row): GameplayReplay => {
        const format = row.pool_type || 'sealed'
        const deckPreview = extractDeckPreview(row.deck_builder_state)
        const replayUrl = row.wayfinder_replay_url || ''
        return {
          id: row.match_id || row.wayfinder_match_id || replayUrl,
          wayfinderMatchId: row.wayfinder_match_id || null,
          replayUrl,
          playedAt: formatTimestamp(row.created_at),
          result: resultFromPerspective(row, currentUserId),
          gameResults: [row.game1_result, row.game2_result, row.game3_result]
            .map((game) => gameResultFromPerspective(game, row, currentUserId))
            .filter(Boolean) as Array<'W' | 'L' | 'D'>,
          opponent: {
            username: row.opponent_username || null,
            avatarUrl: row.opponent_avatar_url || null,
            leaderName: row.opponent_leader || null,
            leaderImageUrl: row.opponent_leader_image || null,
            baseName: row.opponent_base || null,
            archetype: row.opponent_archetype || null,
          },
          pool: {
            shareId: row.pool_share_id || null,
            name: row.pool_name || `${row.set_code || 'SWU'} ${formatLabel(format)}`,
            setCode: row.set_code || 'UNK',
            format,
            formatLabel: formatLabel(format),
          },
          ...deckPreview,
          archetype: row.my_archetype || null,
        }
      }),
      // Casual (non-competitive) games come from casual_matches, already
      // user-perspective, and interleave by date with competitive replays.
      ...casualRows.map(mapCasualReplay),
    ]
      .filter((replay) => replay.replayUrl)
      .sort((a, b) => new Date(b.playedAt || 0).getTime() - new Date(a.playedAt || 0).getTime())
      .slice(0, 50)
      .map(withPreferredReplayArt),
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const rateLimitResponse = applyRateLimit(request)
    if (rateLimitResponse) return rateLimitResponse as unknown as NextResponse

    const session = requireAuth(request)
    const { searchParams } = new URL(request.url)

    let since: string
    let until: string
    try {
      since = parseDateParam(searchParams.get('since')) ?? DEFAULT_SINCE
      until = parseDateParam(searchParams.get('until')) ?? DEFAULT_UNTIL
    } catch (e) {
      return errorResponse(
        e instanceof Error ? e.message : 'Invalid date parameter',
        400
      ) as unknown as NextResponse
    }

    // Global Set filter. A normal pool's set lives on card_pools.set_code (and
    // every card / leader / base in it shares that set), so we filter on the
    // pool's set rather than tagging individual matches. 'all' = no filter.
    const rawSet = (searchParams.get('setCode') || 'all').trim()
    const setCode = /^[A-Z]{3}(?:-CB)?$/.test(rawSet) ? rawSet : 'all'

    // $4 carries the set filter for every pool-scoped query below.
    const params = [session.id, since, until, setCode]
    const ownedPoolWhere = `
      user_id = $1
      AND pool_type IN ('sealed', 'draft', 'chaos_sealed', 'pack_blitz', 'pack_wars', 'rotisserie')
      AND updated_at >= $2
      AND updated_at < ($3::date + interval '1 day')
      AND ($4 = 'all' OR set_code = $4)
    `

    const summaryRow = await queryRow(
      `SELECT
         COALESCE(SUM(wins), 0) AS wins,
         COALESCE(SUM(losses), 0) AS losses,
         COALESCE(SUM(draws), 0) AS draws,
         COUNT(*) FILTER (WHERE wins + losses + draws > 0) AS pools,
         COALESCE(SUM(cardinality(wayfinder_match_ids)), 0) AS captured_matches,
         (
           SELECT COUNT(*)
           FROM deck_play_visits dpv
           WHERE dpv.user_id = $1
             AND dpv.first_visited_at >= $2
             AND dpv.first_visited_at < ($3::date + interval '1 day')
         ) AS decks_played
       FROM card_pools
       WHERE ${ownedPoolWhere}`,
      params
    ) as RawRecordRow | null

    const formatRows = await queryRows(
      `SELECT
         COALESCE(pool_type, 'sealed') AS key,
         COALESCE(pool_type, 'sealed') AS label,
         COALESCE(SUM(wins), 0) AS wins,
         COALESCE(SUM(losses), 0) AS losses,
         COALESCE(SUM(draws), 0) AS draws,
         COUNT(*) FILTER (WHERE wins + losses + draws > 0) AS pools,
         COALESCE(SUM(cardinality(wayfinder_match_ids)), 0) AS captured_matches
       FROM card_pools
       WHERE ${ownedPoolWhere}
       GROUP BY COALESCE(pool_type, 'sealed')
       HAVING COALESCE(SUM(wins + losses + draws), 0) > 0
          OR COALESCE(SUM(cardinality(wayfinder_match_ids)), 0) > 0
       ORDER BY COALESCE(SUM(wins + losses + draws), 0) DESC, key ASC`,
      params
    ) as RawBreakdownRow[]

    const setRows = await queryRows(
      `SELECT
         COALESCE(set_code, 'UNK') AS key,
         COALESCE(set_code, 'UNK') AS label,
         COALESCE(SUM(wins), 0) AS wins,
         COALESCE(SUM(losses), 0) AS losses,
         COALESCE(SUM(draws), 0) AS draws,
         COUNT(*) FILTER (WHERE wins + losses + draws > 0) AS pools,
         COALESCE(SUM(cardinality(wayfinder_match_ids)), 0) AS captured_matches
       FROM card_pools
       WHERE ${ownedPoolWhere}
       GROUP BY COALESCE(set_code, 'UNK')
       HAVING COALESCE(SUM(wins + losses + draws), 0) > 0
          OR COALESCE(SUM(cardinality(wayfinder_match_ids)), 0) > 0
       ORDER BY COALESCE(SUM(wins + losses + draws), 0) DESC, key ASC
       LIMIT 8`,
      params
    ) as RawBreakdownRow[]

    const recentPoolRows = await queryRows(
      `SELECT
         share_id,
         name,
         set_code,
         pool_type,
         deck_builder_state,
         wins,
         losses,
         draws,
         cardinality(wayfinder_match_ids) AS captured_matches,
         updated_at
       FROM card_pools
       WHERE ${ownedPoolWhere}
         AND (wins + losses + draws > 0 OR cardinality(wayfinder_match_ids) > 0)
       ORDER BY updated_at DESC
       LIMIT 6`,
      params
    ) as RawRecentPoolRow[]

    // Every owned pool with games — aggregated by leader in JS for the
    // leader-mix + win-rate-per-leader widget (leader lives in the JSON state,
    // so we can't GROUP BY it in SQL).
    const leaderPoolRows = await queryRows(
      `SELECT deck_builder_state, wins, losses, draws
       FROM card_pools
       WHERE ${ownedPoolWhere}
         AND (wins + losses + draws > 0)
       ORDER BY updated_at DESC
       LIMIT 300`,
      params
    ) as RawLeaderPoolRow[]

    const replayRow = await queryRow(
      `SELECT COUNT(*) AS replays_recorded
       FROM practice_matches pm
       WHERE (pm.player1_id = $1 OR pm.player2_id = $1)
         AND pm.wayfinder_replay_url IS NOT NULL
         AND pm.created_at >= $2
         AND pm.created_at < ($3::date + interval '1 day')
         AND ($4 = 'all' OR EXISTS (
           SELECT 1 FROM card_pools cp
           WHERE cp.pod_id = pm.pod_id AND cp.user_id = $1 AND cp.set_code = $4
         ))`,
      params
    ) as { replays_recorded?: string | number | null } | null

    // DISTINCT ON (pm.id): a user can own several pools that share a pod_id
    // (multiple builds of one draft pool), and the card_pools join fans out one
    // match into N rows. Collapse to one row per match so the history isn't
    // double-counted (R5). Pick the most recently updated matching pool.
    const replayRows = await queryRows(
      `SELECT * FROM (
         SELECT DISTINCT ON (pm.id)
           pm.id AS match_id,
           pm.wayfinder_match_id,
           pm.wayfinder_replay_url,
           pm.created_at,
           pm.match_winner,
           pm.game1_result,
           pm.game2_result,
           pm.game3_result,
           pm.player1_id,
           pm.player2_id,
           CASE WHEN pm.player1_id = $1 THEN u2.username ELSE u1.username END AS opponent_username,
           CASE WHEN pm.player1_id = $1 THEN u2.avatar_url ELSE u1.avatar_url END AS opponent_avatar_url,
           CASE WHEN pm.player1_id = $1 THEN pm.player2_leader ELSE pm.player1_leader END AS opponent_leader,
           CASE WHEN pm.player1_id = $1 THEN pm.player2_leader_image ELSE pm.player1_leader_image END AS opponent_leader_image,
           CASE WHEN pm.player1_id = $1 THEN pm.player2_base ELSE pm.player1_base END AS opponent_base,
           CASE WHEN pm.player1_id = $1 THEN pm.player2_archetype ELSE pm.player1_archetype END AS opponent_archetype,
           CASE WHEN pm.player1_id = $1 THEN pm.player1_archetype ELSE pm.player2_archetype END AS my_archetype,
           cp.share_id AS pool_share_id,
           cp.name AS pool_name,
           cp.set_code,
           cp.pool_type,
           cp.deck_builder_state
         FROM practice_matches pm
         LEFT JOIN users u1 ON u1.id = pm.player1_id
         LEFT JOIN users u2 ON u2.id = pm.player2_id
         LEFT JOIN card_pools cp ON cp.pod_id = pm.pod_id AND cp.user_id = $1
         WHERE (pm.player1_id = $1 OR pm.player2_id = $1)
           AND pm.wayfinder_replay_url IS NOT NULL
           AND pm.created_at >= $2
           AND pm.created_at < ($3::date + interval '1 day')
           AND ($4 = 'all' OR cp.set_code = $4)
         ORDER BY pm.id, cp.updated_at DESC NULLS LAST
       ) deduped
       ORDER BY created_at DESC
       LIMIT 50`,
      params
    ) as RawReplayRow[]

    // Casual (non-competitive) games — logged to casual_matches by the plugin.
    const casualRows = await queryRows(
      `SELECT
         cm.id,
         cm.wayfinder_match_id,
         cm.wayfinder_replay_url,
         cm.result,
         cm.game1_result,
         cm.game2_result,
         cm.game3_result,
         cm.opponent_name,
         cm.player_archetype,
         cm.opponent_leader,
         cm.opponent_leader_image,
         cm.opponent_base,
         cm.opponent_archetype,
         cm.played_at,
         cp.share_id AS pool_share_id,
         cp.name AS pool_name,
         cp.set_code,
         cp.pool_type,
         cp.deck_builder_state
       FROM casual_matches cm
       LEFT JOIN card_pools cp ON cp.id = cm.card_pool_id
       WHERE cm.user_id = $1
         AND cm.wayfinder_replay_url IS NOT NULL
         AND cm.played_at >= $2
         AND cm.played_at < ($3::date + interval '1 day')
         AND ($4 = 'all' OR cp.set_code = $4)
       ORDER BY cm.played_at DESC
       LIMIT 50`,
      params
    ) as RawCasualRow[]

    if (shouldUseTerronkDevFixture(session.username, summaryRow, formatRows, replayRow)) {
      const devFixturePoolRows = await queryRows(
        `SELECT
           share_id,
           name,
           set_code,
           pool_type,
           deck_builder_state,
           updated_at
         FROM card_pools
         WHERE ${ownedPoolWhere}
         ORDER BY updated_at DESC
         LIMIT 6`,
        params
      ) as DevFixturePoolRow[]

      const response = jsonResponse(buildTerronkDevGameplayFixture(devFixturePoolRows))
      response.headers.set('Cache-Control', 'private, max-age=60')
      response.headers.set('Vary', 'Cookie')
      response.headers.set('X-PTP-Dev-Fixture', 'terronk-gameplay')
      return response as unknown as NextResponse
    }

    const response = jsonResponse(buildGameplayResponse(
      summaryRow,
      formatRows,
      setRows,
      recentPoolRows,
      replayRow,
      replayRows,
      session.id,
      leaderPoolRows,
      casualRows
    ))
    response.headers.set('Cache-Control', 'private, max-age=60')
    response.headers.set('Vary', 'Cookie')
    return response as unknown as NextResponse
  } catch (error) {
    return handleApiError(error) as unknown as NextResponse
  }
}

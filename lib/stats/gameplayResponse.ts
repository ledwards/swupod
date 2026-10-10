import { gameOutcome, snapshotState, type PtpGame } from './ptpGameplay'
import { archetypeShortName } from '@/src/utils/archetypeName'
import { getAspectColor } from '@/src/utils/aspectColors'
import { hyperspaceLeaderArt } from '@/src/utils/hyperspaceLeaderArt'
import { isLeaderMirrorMatch } from '@/src/utils/mirrorMatch'
import { resolveReplayUrl } from '@/src/utils/wayfinderUrls'

/** Replay list items use unit-side leader art, preferring Hyperspace variants. */
function withPreferredReplayArt(replay: GameplayReplay): GameplayReplay {
  const set = replay.pool?.setCode
  // Resolve art by the (authoritative) leader name so the back/unit art stays in
  // sync with the leader actually played — never a stale image from a sibling
  // pool that shares the pod. The archetype legend thumbnail prefers
  // leaderBackImageUrl, so both fields must point at the resolved leader.
  const art = hyperspaceLeaderArt(replay.leaderName, set)
  return {
    ...replay,
    leaderImageUrl: art || replay.leaderBackImageUrl || replay.leaderImageUrl,
    leaderBackImageUrl: art || replay.leaderBackImageUrl,
    opponent: {
      ...replay.opponent,
      leaderImageUrl: hyperspaceLeaderArt(replay.opponent.leaderName, set) || replay.opponent.leaderImageUrl,
    },
  }
}

export const DEFAULT_SINCE = '2020-01-01'
export const DEFAULT_UNTIL = '2099-12-31'
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export interface RawRecordRow {
  pool_ids?: string[]
  played_pool_ids?: string[]
  wins?: string | number | null
  losses?: string | number | null
  draws?: string | number | null
  pools?: string | number | null
  captured_matches?: string | number | null
  decks_played?: string | number | null
}

export interface RawBreakdownRow extends RawRecordRow {
  key?: string | null
  label?: string | null
}

export interface RawRecentPoolRow extends RawRecordRow {
  share_id?: string | null
  name?: string | null
  set_code?: string | null
  pool_type?: string | null
  deck_builder_state?: unknown
  updated_at?: string | Date | null
}

type DevFixturePoolRow = Pick<RawRecentPoolRow, 'share_id' | 'name' | 'set_code' | 'pool_type' | 'deck_builder_state' | 'updated_at'>

export interface RawReplayRow {
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
  // The leader the current user actually played this match (recorded by the
  // plugin), independent of which sibling pool deck the row joins to.
  my_leader?: string | null
  pool_share_id?: string | null
  pool_draft_share_id?: string | null
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

export interface GameplayArchetypeBreakdown {
  archetype: string
  leaderName: string | null
  leaderImageUrl: string | null
  leaderBackImageUrl: string | null
  wins: number
  losses: number
  draws: number
  matches: number
  winRate: number
}

export interface GameplayReplay {
  id: string
  wayfinderMatchId: string | null
  replayUrl: string
  playedAt: string | null
  result: 'win' | 'loss' | 'draw' | 'pending'
  gameResults: Array<'W' | 'L' | 'D'>
  playerSide: 'player1' | 'player2' | null
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
    draftShareId: string | null
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
  archetypeBreakdown: GameplayArchetypeBreakdown[]
  recentPools: GameplayRecentPool[]
  replays: GameplayReplay[]
}

export interface RawLeaderPoolRow {
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

/** Drop a trailing "(Limited)" tag so a draft archetype and its constructed twin
 *  collapse onto one row (the swuapi name is the source of truth — we never build
 *  a "Leader / Base" string here). */
function canonicalArchetype(name: string | null): string | null {
  if (!name) return null
  const trimmed = name.replace(/\s*\(limited\)\s*$/i, '').trim()
  return trimmed || null
}

function isGameplayReplayMirror(replay: GameplayReplay): boolean {
  return isLeaderMirrorMatch(replay.leaderName, replay.opponent.leaderName)
}

/**
 * Aggregate captured games by archetype for the "Your Archetypes" usage pie —
 * the archetype mirror of buildLeaderBreakdown. Each replay contributes its
 * individual GAMES (gameResults), falling back to the single match result when a
 * replay carries no per-game breakdown. Keyed by the archetype with its
 * "(Limited)" tag stripped; replays with no archetype or no scored game are
 * skipped. Keeps the leader's unit-side art for the legend thumbnail.
 */
export function buildArchetypeBreakdown(replays: GameplayReplay[]): GameplayArchetypeBreakdown[] {
  const byArchetype = new Map<string, GameplayArchetypeBreakdown>()
  for (const replay of replays) {
    if (isGameplayReplayMirror(replay)) continue
    const archetype = canonicalArchetype(replay.archetype)
    if (!archetype) continue
    let wins = 0
    let losses = 0
    let draws = 0
    if (replay.gameResults && replay.gameResults.length > 0) {
      for (const g of replay.gameResults) {
        if (g === 'W') wins += 1
        else if (g === 'L') losses += 1
        else if (g === 'D') draws += 1
      }
    } else if (replay.result === 'win') {
      wins += 1
    } else if (replay.result === 'loss') {
      losses += 1
    } else if (replay.result === 'draw') {
      draws += 1
    }
    if (wins + losses + draws === 0) continue
    const existing = byArchetype.get(archetype) || {
      archetype,
      leaderName: replay.leaderName,
      leaderImageUrl: replay.leaderImageUrl,
      leaderBackImageUrl: replay.leaderBackImageUrl,
      wins: 0,
      losses: 0,
      draws: 0,
      matches: 0,
      winRate: 0,
    }
    existing.wins += wins
    existing.losses += losses
    existing.draws += draws
    if (!existing.leaderName && replay.leaderName) existing.leaderName = replay.leaderName
    if (!existing.leaderImageUrl && replay.leaderImageUrl) existing.leaderImageUrl = replay.leaderImageUrl
    if (!existing.leaderBackImageUrl && replay.leaderBackImageUrl) existing.leaderBackImageUrl = replay.leaderBackImageUrl
    byArchetype.set(archetype, existing)
  }
  return Array.from(byArchetype.values())
    .map((entry) => {
      const matches = entry.wins + entry.losses + entry.draws
      return { ...entry, matches, winRate: matches > 0 ? Math.round((entry.wins / matches) * 1000) / 10 : 0 }
    })
    .sort((a, b) => b.matches - a.matches || b.winRate - a.winRate || a.archetype.localeCompare(b.archetype))
}

export function parseDateParam(raw: string | null): string | null {
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

function userSideFromReplay(row: RawReplayRow, currentUserId: string): 'player1' | 'player2' | null {
  if (row.player1_id === currentUserId) return 'player1'
  if (row.player2_id === currentUserId) return 'player2'
  return null
}

function resultFromPerspective(row: RawReplayRow, currentUserId: string): GameplayReplay['result'] {
  const winner = row.match_winner
  if (winner === 'draw') return 'draw'
  if (winner !== 'player1' && winner !== 'player2') return 'pending'
  const userSide = userSideFromReplay(row, currentUserId)
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
  const userSide = userSideFromReplay(row, currentUserId)
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
    playerSide: index % 2 === 0 ? 'player1' as const : 'player2' as const,
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
      draftShareId: null,
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
    // Dev-only illustrative archetype labels so the Your Archetypes pie renders.
    archetype: index % 2 === 0 ? 'Aggro' : 'Midrange',
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
    archetypeBreakdown: buildArchetypeBreakdown(replays),
    replays,
  }
}



export interface RawCasualRow {
  id?: string | null
  wayfinder_match_id?: string | null
  wayfinder_replay_url?: string | null
  result?: string | null
  game1_result?: string | null
  game2_result?: string | null
  game3_result?: string | null
  opponent_name?: string | null
  player_archetype?: string | null
  // The leader the user actually played (recorded by the plugin).
  player_leader?: string | null
  opponent_leader?: string | null
  opponent_leader_image?: string | null
  opponent_base?: string | null
  opponent_archetype?: string | null
  played_at?: string | Date | null
  pool_share_id?: string | null
  pool_draft_share_id?: string | null
  pool_name?: string | null
  set_code?: string | null
  pool_type?: string | null
  deck_builder_state?: unknown
}

/** Map a casual_matches row (already user-perspective) to the replay shape. */
function mapCasualReplay(row: RawCasualRow): GameplayReplay {
  const format = row.pool_type || 'sealed'
  const deckPreview = extractDeckPreview(row.deck_builder_state)
  // Prefer a stored canonical /playback/ URL; otherwise derive from the match id.
  // Strips the bogus `ing-` ingestion prefix (see resolveReplayUrl) so the link
  // resolves instead of showing "out of range" + Discord login.
  const replayUrl = resolveReplayUrl(row.wayfinder_match_id, row.wayfinder_replay_url)
  const result = (row.result === 'win' || row.result === 'loss' || row.result === 'draw') ? row.result : 'pending'
  return {
    id: row.id || row.wayfinder_match_id || replayUrl,
    wayfinderMatchId: row.wayfinder_match_id || null,
    replayUrl,
    playedAt: formatTimestamp(row.played_at),
    result,
    playerSide: 'player1',
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
      draftShareId: row.pool_draft_share_id || null,
      name: row.pool_name || `${row.set_code || 'SWU'} ${formatLabel(format)}`,
      setCode: row.set_code || 'UNK',
      format,
      formatLabel: formatLabel(format),
    },
    ...deckPreview,
    // Prefer the plugin-recorded leader over the joined pool's deck leader.
    leaderName: row.player_leader || deckPreview.leaderName,
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

  // Built once so the replay history list and the archetype usage pie aggregate
  // the exact same per-game results.
  const replays: GameplayReplay[] = [
    ...replayRows.map((row): GameplayReplay => {
      const format = row.pool_type || 'sealed'
      const deckPreview = extractDeckPreview(row.deck_builder_state)
      // Canonical replay link (see mapCasualReplay): prefer stored /playback/,
      // else derive from the match id, stripping the bogus `ing-` prefix.
      const replayUrl = resolveReplayUrl(row.wayfinder_match_id, row.wayfinder_replay_url)
      return {
        id: row.match_id || row.wayfinder_match_id || replayUrl,
        wayfinderMatchId: row.wayfinder_match_id || null,
        replayUrl,
        playedAt: formatTimestamp(row.created_at),
        result: resultFromPerspective(row, currentUserId),
        playerSide: userSideFromReplay(row, currentUserId),
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
          draftShareId: row.pool_draft_share_id || null,
          name: row.pool_name || `${row.set_code || 'SWU'} ${formatLabel(format)}`,
          setCode: row.set_code || 'UNK',
          format,
          formatLabel: formatLabel(format),
        },
        ...deckPreview,
        // The plugin-recorded leader is authoritative for which leader was
        // actually played; the joined pool can be a sibling deck in the same pod.
        leaderName: row.my_leader || deckPreview.leaderName,
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
    .map(withPreferredReplayArt)

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
    archetypeBreakdown: buildArchetypeBreakdown(replays),
    replays,
  }
}

/** Merge completed native games using each frozen deck, never the pool's current deck. */
export function appendPtpGameplay(
  result: GameplayResponse,
  games: PtpGame[],
  recordedPools: string[] = [],
  visitedPools: string[] = [],
): GameplayResponse {
  const pools = new Set(recordedPools)
  const decks = new Set(visitedPools)
  const leaderPools = new Set<string>()
  for (const game of games) {
    const outcome = gameOutcome(game)
    const deck = game.deck
    const state = snapshotState(deck)
    const preview = extractDeckPreview(state)
    const other = extractDeckPreview(snapshotState(game.opponent_deck))
    const record = { wins: Number(outcome === 'win'), losses: Number(outcome === 'loss'), draws: Number(outcome === 'draw') }
    const add = (row: { wins: number; losses: number; draws: number; matches: number; winRate: number }) => {
      row.wins += record.wins
      row.losses += record.losses
      row.draws += record.draws
      row.matches++
      row.winRate = Math.round(row.wins / row.matches * 1000) / 10
    }
    const newPool = !pools.has(deck.poolId)
    if (newPool) result.summary.pools++
    if (!decks.has(deck.poolId)) result.summary.decksPlayed++
    pools.add(deck.poolId)
    decks.add(deck.poolId)
    add(result.summary)
    result.summary.replaysRecorded++
    result.summary.capturedMatches++
    for (const [list, key, label] of [
      [result.formatBreakdown, deck.poolType, formatLabel(deck.poolType)],
      [result.setBreakdown, deck.setCode, deck.setCode],
    ] as const) {
      let row = list.find(r => r.key === key)
      if (!row) { row = buildBreakdown({}, key, label); list.push(row) }
      add(row)
      row.capturedMatches++
      if (newPool) row.pools++
    }
    for (const leader of buildLeaderBreakdown([{ deck_builder_state: state, ...record }])) {
      const existing = result.leaderBreakdown.find(l => l.leaderName === leader.leaderName)
      const leaderPool = `${leader.leaderName}:${deck.poolId}`
      if (!existing) result.leaderBreakdown.push(leader)
      else {
        add(existing)
        if (!leaderPools.has(leaderPool) && !recordedPools.includes(deck.poolId)) existing.pools++
        for (const split of leader.byBase) {
          const base = existing.byBase.find(b => b.aspect === split.aspect)
          if (base) add(base)
          else existing.byBase.push(split)
        }
      }
      leaderPools.add(leaderPool)
    }
    const replay: GameplayReplay = {
      id: `ptp-${game.id}`,
      wayfinderMatchId: null,
      replayUrl: `/api/stats/me/gameplay/replays/${game.id}?kind=${game.kind}`,
      playedAt: formatTimestamp(game.played_at),
      result: outcome,
      gameResults: [outcome === 'win' ? 'W' : outcome === 'loss' ? 'L' : 'D'],
      playerSide: game.seat === 0 ? 'player1' : 'player2',
      opponent: {
        username: game.opponent, avatarUrl: null, leaderName: other.leaderName,
        leaderImageUrl: other.leaderImageUrl, baseName: other.baseName, archetype: null,
      },
      pool: {
        shareId: deck.poolShareId, draftShareId: null,
        name: `${deck.setCode} ${formatLabel(deck.poolType)}`,
        setCode: deck.setCode, format: deck.poolType, formatLabel: formatLabel(deck.poolType),
      },
      ...preview,
      deckCardCount: deck.deck.reduce((n, card) => n + card.count, 0),
      archetype: archetypeShortName({
        leaderName: preview.leaderName,
        baseName: preview.baseName,
        baseAspects: state.cardPositions.base.card?.aspects ?? null,
        baseHp: state.cardPositions.base.card?.hp ?? null,
        baseRarity: state.cardPositions.base.card?.rarity ?? null,
      }),
    }
    result.replays.push(withPreferredReplayArt(replay))
  }
  result.replays.sort((a, b) => new Date(b.playedAt ?? 0).getTime() - new Date(a.playedAt ?? 0).getTime())
  result.leaderBreakdown.sort((a, b) => b.matches - a.matches)
  result.archetypeBreakdown = buildArchetypeBreakdown(result.replays)
  return result
}


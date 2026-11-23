// @ts-nocheck
/**
 * Draft Stats & Profile Cache Module
 *
 * Loads and caches datasets per set from the database:
 * 1. Leader stats from draft_picks (is_leader=true) — first-pick rates
 * 2. Card stats from draft_picks (is_leader=false) — avg pick position
 * 3. Deck profiles from built_decks — what real human decks look like
 * 4. Segmented leader/card stats (top players, tournament players, specific user)
 * 5. Per-leader card stats — card popularity given a specific leader
 *
 * All data is human-only (filters out bot picks/decks via pod_players.is_bot).
 * Uses a 1-hour TTL cache to avoid repeated DB queries.
 */

import { queryRows } from '@/lib/db'
import tournamentUserIds from '@/src/data/tournament-user-ids.json'

// --- Data Structures ---

export interface CardPickStats {
  cardName: string
  avgPickPosition: number  // 1-14, lower = picked earlier = better
  timesPicked: number
  rarity: string
  cardType: string
}

export interface LeaderPickStats {
  leaderName: string
  timesPicked: number
  firstPickRate: number  // % picked in round 1 (0-1)
}

export interface DeckProfile {
  leaderName: string
  sampleSize: number
  avgUnits: number
  avgUpgrades: number
  avgEvents: number
  avgCostCurve: Record<number, number>  // cost -> avg count
  cardFrequency: Map<string, number>    // cardName -> % of decks containing it (0-1)
  baseAspects: Record<string, number>   // aspect -> count of decks using it
}

/** Segmented leader stats by player category */
export interface SegmentedLeaderStats {
  topPlayers?: Map<string, LeaderPickStats>
  tournamentPlayers?: Map<string, LeaderPickStats>
  specificUser?: Map<string, LeaderPickStats>
}

/** Segmented card stats by player category */
export interface SegmentedCardStats {
  topPlayers?: Map<string, CardPickStats>
  tournamentPlayers?: Map<string, CardPickStats>
}

/** Per-leader card popularity stats */
export interface PerLeaderCardStats {
  /** Card popularity when playing a specific leader */
  byLeader: Map<string, Map<string, { avgPickPosition: number; timesPicked: number }>>
  /** Card popularity when playing a specific leader + base aspect */
  byLeaderAndBase: Map<string, Map<string, { avgPickPosition: number; timesPicked: number }>>
}

export interface SetDraftStats {
  cardStats: Map<string, CardPickStats>
  leaderStats: Map<string, LeaderPickStats>
  deckProfiles: Map<string, DeckProfile>  // leaderName -> profile
  segmentedLeaderStats?: SegmentedLeaderStats
  segmentedCardStats?: SegmentedCardStats
  perLeaderCardStats?: PerLeaderCardStats
  totalDrafts: number
  fetchedAt: number
}

// --- Cache ---

const CACHE_TTL_MS = 60 * 60 * 1000  // 1 hour

// The set-wide stats (card/leader/deck-profile/per-leader maps) are the same for
// every host, and they are the heavy part: several MB per set in production.
// They are cached ONCE per set. Only the small per-host leader map (Nemesis) is
// cached per (set, host). Caching the whole object per host kept a full copy for
// every distinct host that ever drafted against bots, and nothing evicted it —
// heap grew with uptime until /api/health reported "High memory usage".
const setStatsCache = new Map<string, SetDraftStats>()
const userLeaderCache = new Map<string, { fetchedAt: number; stats: Map<string, LeaderPickStats> | null }>()
const MAX_USER_LEADER_ENTRIES = 500

const MIN_DRAFTS_FOR_DATA = 5

/**
 * Check if stats have enough data to be useful
 */
export function hasEnoughData(stats: SetDraftStats | null): boolean {
  return stats !== null && stats.totalDrafts >= MIN_DRAFTS_FOR_DATA
}

/**
 * Clear the stats cache (for testing)
 */
export function clearStatsCache(): void {
  setStatsCache.clear()
  userLeaderCache.clear()
}

/** Cache sizes, for tests and diagnostics. */
export function statsCacheSizes(): { sets: number; userLeaderStats: number } {
  return { sets: setStatsCache.size, userLeaderStats: userLeaderCache.size }
}

export interface DraftStatsLoaders {
  fetchSetStats: (setCode: string) => Promise<SetDraftStats | null>
  fetchUserLeaderStats: (setCode: string, userId: string) => Promise<Map<string, LeaderPickStats> | null>
}

const defaultLoaders: DraftStatsLoaders = {
  fetchSetStats: fetchDraftStats,
  fetchUserLeaderStats: async (setCode, userId) => {
    const rows = await fetchUserLeaderStats(setCode, userId)
    return rows.length > 0 ? buildLeaderStatsMap(rows) : null
  },
}

/**
 * Get draft stats for a set, using cache with TTL.
 * Optional hostUserId enables per-user stats (for Nemesis strategy).
 */
export async function getDraftStats(
  setCode: string,
  hostUserId?: string,
  loaders: DraftStatsLoaders = defaultLoaders,
  now: () => number = Date.now
): Promise<SetDraftStats | null> {
  const shared = await getSetStats(setCode, loaders, now)
  if (!shared || !hostUserId) return shared

  const specificUser = await getUserLeaderStats(setCode, hostUserId, loaders, now)
  if (!specificUser) return shared
  return {
    ...shared,
    segmentedLeaderStats: { ...shared.segmentedLeaderStats, specificUser },
  }
}

async function getSetStats(setCode: string, loaders: DraftStatsLoaders, now: () => number): Promise<SetDraftStats | null> {
  const cached = setStatsCache.get(setCode)
  if (cached && (now() - cached.fetchedAt) < CACHE_TTL_MS) {
    return cached
  }

  try {
    const stats = await loaders.fetchSetStats(setCode)
    if (stats) {
      setStatsCache.set(setCode, stats)
    }
    return stats
  } catch (err) {
    console.error(`[DRAFT_STATS] Error fetching stats for ${setCode}:`, err)
    return cached || null  // Return stale cache on error, or null
  }
}

async function getUserLeaderStats(
  setCode: string,
  userId: string,
  loaders: DraftStatsLoaders,
  now: () => number
): Promise<Map<string, LeaderPickStats> | null> {
  const key = `${setCode}:${userId}`
  const cached = userLeaderCache.get(key)
  if (cached && (now() - cached.fetchedAt) < CACHE_TTL_MS) {
    return cached.stats
  }

  let stats: Map<string, LeaderPickStats> | null
  try {
    stats = await loaders.fetchUserLeaderStats(setCode, userId)
  } catch {
    return cached?.stats ?? null
  }

  // Drop expired entries, then the oldest ones past the cap (Map keeps insertion order).
  const t = now()
  for (const [k, v] of userLeaderCache) {
    if (t - v.fetchedAt >= CACHE_TTL_MS) userLeaderCache.delete(k)
  }
  userLeaderCache.delete(key)
  while (userLeaderCache.size >= MAX_USER_LEADER_ENTRIES) {
    userLeaderCache.delete(userLeaderCache.keys().next().value!)
  }
  userLeaderCache.set(key, { fetchedAt: t, stats })
  return stats
}

/**
 * Fetch fresh set-wide stats from the database (no per-user data)
 */
async function fetchDraftStats(setCode: string): Promise<SetDraftStats | null> {
  try {
    // Core queries (always run)
    const [leaderRows, cardRows, deckRows, draftCountRows] = await Promise.all([
      fetchLeaderStats(setCode),
      fetchCardStats(setCode),
      fetchDeckRows(setCode),
      fetchDraftCount(setCode),
    ])

    const totalDrafts = draftCountRows?.[0]?.count ? parseInt(draftCountRows[0].count, 10) : 0

    // Build leader stats map
    const leaderStats = new Map<string, LeaderPickStats>()
    for (const row of leaderRows) {
      const timesPicked = parseInt(row.times_picked, 10)
      const round1Picks = parseInt(row.round_1_picks, 10)
      leaderStats.set(row.card_name, {
        leaderName: row.card_name,
        timesPicked,
        firstPickRate: timesPicked > 0 ? round1Picks / timesPicked : 0,
      })
    }

    // Build card stats map
    const cardStats = new Map<string, CardPickStats>()
    for (const row of cardRows) {
      cardStats.set(row.card_name, {
        cardName: row.card_name,
        avgPickPosition: parseFloat(row.avg_pick_position),
        timesPicked: parseInt(row.times_picked, 10),
        rarity: row.rarity,
        cardType: row.card_type,
      })
    }

    // Build deck profiles
    const deckProfiles = aggregateDeckProfiles(deckRows)

    // Segmented queries (run in parallel, non-blocking)
    const [
      topPlayerLeaderRows,
      topPlayerCardRows,
      tournamentLeaderRows,
      tournamentCardRows,
      perLeaderCardRows,
      perLeaderBaseCardRows,
    ] = await Promise.all([
      fetchTopPlayerLeaderStats(setCode).catch(() => []),
      fetchTopPlayerCardStats(setCode).catch(() => []),
      fetchTournamentLeaderStats(setCode).catch(() => []),
      fetchTournamentCardStats(setCode).catch(() => []),
      fetchPerLeaderCardStats(setCode).catch(() => []),
      fetchPerLeaderBaseCardStats(setCode).catch(() => []),
    ])

    // Build segmented leader stats
    const segmentedLeaderStats: SegmentedLeaderStats = {}

    if (topPlayerLeaderRows.length > 0) {
      segmentedLeaderStats.topPlayers = buildLeaderStatsMap(topPlayerLeaderRows)
    }
    if (tournamentLeaderRows.length > 0) {
      segmentedLeaderStats.tournamentPlayers = buildLeaderStatsMap(tournamentLeaderRows)
    }

    // Build segmented card stats
    const segmentedCardStats: SegmentedCardStats = {}

    if (topPlayerCardRows.length > 0) {
      segmentedCardStats.topPlayers = buildCardStatsMap(topPlayerCardRows)
    }
    if (tournamentCardRows.length > 0) {
      segmentedCardStats.tournamentPlayers = buildCardStatsMap(tournamentCardRows)
    }

    // Build per-leader card stats
    const perLeaderCardStats: PerLeaderCardStats = {
      byLeader: buildPerLeaderCardMap(perLeaderCardRows),
      byLeaderAndBase: buildPerLeaderBaseCardMap(perLeaderBaseCardRows),
    }

    return {
      cardStats,
      leaderStats,
      deckProfiles,
      segmentedLeaderStats,
      segmentedCardStats,
      perLeaderCardStats,
      totalDrafts,
      fetchedAt: Date.now(),
    }
  } catch (err) {
    console.error(`[DRAFT_STATS] Failed to fetch stats for ${setCode}:`, err)
    return null
  }
}

// --- Helper Functions for Building Maps ---

function buildLeaderStatsMap(rows: Record<string, unknown>[]): Map<string, LeaderPickStats> {
  const map = new Map<string, LeaderPickStats>()
  for (const row of rows) {
    const timesPicked = parseInt(row.times_picked as string, 10)
    const round1Picks = parseInt((row.round_1_picks as string) || '0', 10)
    map.set(row.card_name as string, {
      leaderName: row.card_name as string,
      timesPicked,
      firstPickRate: timesPicked > 0 ? round1Picks / timesPicked : 0,
    })
  }
  return map
}

function buildCardStatsMap(rows: Record<string, unknown>[]): Map<string, CardPickStats> {
  const map = new Map<string, CardPickStats>()
  for (const row of rows) {
    map.set(row.card_name as string, {
      cardName: row.card_name as string,
      avgPickPosition: parseFloat(row.avg_pick_position as string),
      timesPicked: parseInt(row.times_picked as string, 10),
      rarity: (row.rarity as string) || '',
      cardType: (row.card_type as string) || '',
    })
  }
  return map
}

function buildPerLeaderCardMap(rows: Record<string, unknown>[]): Map<string, Map<string, { avgPickPosition: number; timesPicked: number }>> {
  const map = new Map<string, Map<string, { avgPickPosition: number; timesPicked: number }>>()
  for (const row of rows) {
    const leaderName = row.leader_name as string
    if (!map.has(leaderName)) {
      map.set(leaderName, new Map())
    }
    map.get(leaderName)!.set(row.card_name as string, {
      avgPickPosition: parseFloat(row.avg_pick_position as string),
      timesPicked: parseInt(row.times_picked as string, 10),
    })
  }
  return map
}

function buildPerLeaderBaseCardMap(rows: Record<string, unknown>[]): Map<string, Map<string, { avgPickPosition: number; timesPicked: number }>> {
  const map = new Map<string, Map<string, { avgPickPosition: number; timesPicked: number }>>()
  for (const row of rows) {
    const leaderName = row.leader_name as string
    const baseAspect = row.base_aspect as string
    const key = `${leaderName}|${baseAspect}`
    if (!map.has(key)) {
      map.set(key, new Map())
    }
    map.get(key)!.set(row.card_name as string, {
      avgPickPosition: parseFloat(row.avg_pick_position as string),
      timesPicked: parseInt(row.times_picked as string, 10),
    })
  }
  return map
}

// --- SQL Queries (Original) ---

function fetchLeaderStats(setCode: string) {
  return queryRows(
    `SELECT dp.card_name,
            COUNT(*) as times_picked,
            COUNT(*) FILTER (WHERE dp.leader_round = 1) as round_1_picks
     FROM draft_picks dp
     JOIN pods p ON p.id = dp.pod_id
     JOIN pod_players pp ON pp.pod_id = dp.pod_id AND pp.user_id = dp.user_id
     WHERE dp.set_code = $1 AND dp.is_leader = true
       AND p.status = 'complete' AND (pp.is_bot = false OR pp.is_bot IS NULL)
     GROUP BY dp.card_name`,
    [setCode]
  )
}

function fetchCardStats(setCode: string) {
  return queryRows(
    `SELECT dp.card_name, dp.rarity, dp.card_type,
            COUNT(*) as times_picked,
            ROUND(AVG(dp.pick_in_pack)::numeric, 2) as avg_pick_position
     FROM draft_picks dp
     JOIN pods p ON p.id = dp.pod_id
     JOIN pod_players pp ON pp.pod_id = dp.pod_id AND pp.user_id = dp.user_id
     WHERE dp.set_code = $1 AND dp.is_leader = false
       AND p.status = 'complete' AND (pp.is_bot = false OR pp.is_bot IS NULL)
     GROUP BY dp.card_name, dp.rarity, dp.card_type`,
    [setCode]
  )
}

function fetchDeckRows(setCode: string) {
  return queryRows(
    `SELECT bd.leader, bd.base, bd.deck
     FROM built_decks bd
     JOIN card_pools cp ON cp.id = bd.card_pool_id
     JOIN pod_players pp ON pp.pod_id = cp.pod_id AND pp.user_id = bd.user_id
     WHERE bd.set_code = $1 AND bd.pool_type = 'draft'
       AND (pp.is_bot = false OR pp.is_bot IS NULL)`,
    [setCode]
  )
}

function fetchDraftCount(setCode: string) {
  return queryRows(
    `SELECT COUNT(DISTINCT dp.pod_id) as count
     FROM draft_picks dp
     JOIN pods p ON p.id = dp.pod_id
     JOIN pod_players pp ON pp.pod_id = dp.pod_id AND pp.user_id = dp.user_id
     WHERE dp.set_code = $1 AND p.status = 'complete'
       AND (pp.is_bot = false OR pp.is_bot IS NULL)`,
    [setCode]
  )
}

// --- Segmented SQL Queries ---

/** Leader stats from top players only */
function fetchTopPlayerLeaderStats(setCode: string) {
  return queryRows(
    `SELECT dp.card_name,
            COUNT(*) as times_picked,
            COUNT(*) FILTER (WHERE dp.leader_round = 1) as round_1_picks
     FROM draft_picks dp
     JOIN pods p ON p.id = dp.pod_id
     JOIN pod_players pp ON pp.pod_id = dp.pod_id AND pp.user_id = dp.user_id
     JOIN top_players tp ON tp.user_id = dp.user_id
     WHERE dp.set_code = $1 AND dp.is_leader = true
       AND p.status = 'complete' AND (pp.is_bot = false OR pp.is_bot IS NULL)
     GROUP BY dp.card_name`,
    [setCode]
  )
}

/** Card stats from top players only */
function fetchTopPlayerCardStats(setCode: string) {
  return queryRows(
    `SELECT dp.card_name, dp.rarity, dp.card_type,
            COUNT(*) as times_picked,
            ROUND(AVG(dp.pick_in_pack)::numeric, 2) as avg_pick_position
     FROM draft_picks dp
     JOIN pods p ON p.id = dp.pod_id
     JOIN pod_players pp ON pp.pod_id = dp.pod_id AND pp.user_id = dp.user_id
     JOIN top_players tp ON tp.user_id = dp.user_id
     WHERE dp.set_code = $1 AND dp.is_leader = false
       AND p.status = 'complete' AND (pp.is_bot = false OR pp.is_bot IS NULL)
     GROUP BY dp.card_name, dp.rarity, dp.card_type`,
    [setCode]
  )
}

/** Leader stats from tournament players only */
function fetchTournamentLeaderStats(setCode: string) {
  if (!tournamentUserIds || tournamentUserIds.length === 0) return Promise.resolve([])
  return queryRows(
    `SELECT dp.card_name,
            COUNT(*) as times_picked,
            COUNT(*) FILTER (WHERE dp.leader_round = 1) as round_1_picks
     FROM draft_picks dp
     JOIN pods p ON p.id = dp.pod_id
     JOIN pod_players pp ON pp.pod_id = dp.pod_id AND pp.user_id = dp.user_id
     WHERE dp.set_code = $1 AND dp.is_leader = true
       AND dp.user_id = ANY($2::uuid[])
       AND p.status = 'complete' AND (pp.is_bot = false OR pp.is_bot IS NULL)
     GROUP BY dp.card_name`,
    [setCode, tournamentUserIds]
  )
}

/** Card stats from tournament players only */
function fetchTournamentCardStats(setCode: string) {
  if (!tournamentUserIds || tournamentUserIds.length === 0) return Promise.resolve([])
  return queryRows(
    `SELECT dp.card_name, dp.rarity, dp.card_type,
            COUNT(*) as times_picked,
            ROUND(AVG(dp.pick_in_pack)::numeric, 2) as avg_pick_position
     FROM draft_picks dp
     JOIN pods p ON p.id = dp.pod_id
     JOIN pod_players pp ON pp.pod_id = dp.pod_id AND pp.user_id = dp.user_id
     WHERE dp.set_code = $1 AND dp.is_leader = false
       AND dp.user_id = ANY($2::uuid[])
       AND p.status = 'complete' AND (pp.is_bot = false OR pp.is_bot IS NULL)
     GROUP BY dp.card_name, dp.rarity, dp.card_type`,
    [setCode, tournamentUserIds]
  )
}

/** Leader stats for a specific user (for Nemesis) */
function fetchUserLeaderStats(setCode: string, userId: string) {
  return queryRows(
    `SELECT dp.card_name,
            COUNT(*) as times_picked,
            COUNT(*) FILTER (WHERE dp.leader_round = 1) as round_1_picks
     FROM draft_picks dp
     JOIN pods p ON p.id = dp.pod_id
     JOIN pod_players pp ON pp.pod_id = dp.pod_id AND pp.user_id = dp.user_id
     WHERE dp.set_code = $1 AND dp.is_leader = true
       AND dp.user_id = $2
       AND p.status = 'complete' AND (pp.is_bot = false OR pp.is_bot IS NULL)
     GROUP BY dp.card_name`,
    [setCode, userId]
  )
}

/** Card popularity by leader (from built decks) */
function fetchPerLeaderCardStats(setCode: string) {
  return queryRows(
    `SELECT bd.leader->>'name' as leader_name,
            dp.card_name,
            COUNT(*) as times_picked,
            ROUND(AVG(dp.pick_in_pack)::numeric, 2) as avg_pick_position
     FROM draft_picks dp
     JOIN pods p ON p.id = dp.pod_id
     JOIN built_decks bd ON bd.user_id = dp.user_id AND bd.set_code = dp.set_code
     JOIN pod_players pp ON pp.pod_id = dp.pod_id AND pp.user_id = dp.user_id
     WHERE dp.set_code = $1 AND dp.is_leader = false
       AND p.status = 'complete'
       AND (pp.is_bot = false OR pp.is_bot IS NULL)
     GROUP BY bd.leader->>'name', dp.card_name`,
    [setCode]
  )
}

/** Card popularity by leader + base aspect */
function fetchPerLeaderBaseCardStats(setCode: string) {
  return queryRows(
    `SELECT bd.leader->>'name' as leader_name,
            a.value as base_aspect,
            dp.card_name,
            COUNT(*) as times_picked,
            ROUND(AVG(dp.pick_in_pack)::numeric, 2) as avg_pick_position
     FROM draft_picks dp
     JOIN pods p ON p.id = dp.pod_id
     JOIN built_decks bd ON bd.user_id = dp.user_id AND bd.set_code = dp.set_code
     JOIN pod_players pp ON pp.pod_id = dp.pod_id AND pp.user_id = dp.user_id
     CROSS JOIN LATERAL jsonb_array_elements_text(bd.base->'aspects') a(value)
     WHERE dp.set_code = $1 AND dp.is_leader = false
       AND p.status = 'complete'
       AND (pp.is_bot = false OR pp.is_bot IS NULL)
       AND a.value IN ('Vigilance', 'Command', 'Aggression', 'Cunning')
     GROUP BY bd.leader->>'name', a.value, dp.card_name`,
    [setCode]
  )
}

// --- Deck Profile Aggregation ---

const COLOR_ASPECTS = ['Vigilance', 'Command', 'Aggression', 'Cunning']

/**
 * Aggregate raw deck rows into DeckProfile objects grouped by leader name.
 * Exported for testing.
 */
export function aggregateDeckProfiles(deckRows: Record<string, unknown>[]): Map<string, DeckProfile> {
  // Group decks by leader name
  const decksByLeader = new Map<string, Array<{ leader: Record<string, unknown>, base: Record<string, unknown>, deck: Array<{ id: string, count?: number }> }>>()

  for (const row of deckRows) {
    const leader = typeof row.leader === 'string' ? JSON.parse(row.leader) : row.leader
    const base = typeof row.base === 'string' ? JSON.parse(row.base) : row.base
    const deck = typeof row.deck === 'string' ? JSON.parse(row.deck) : row.deck

    if (!leader?.name || !Array.isArray(deck)) continue

    const leaderName = leader.name as string
    if (!decksByLeader.has(leaderName)) {
      decksByLeader.set(leaderName, [])
    }
    decksByLeader.get(leaderName)!.push({ leader, base, deck })
  }

  // Aggregate per leader
  const profiles = new Map<string, DeckProfile>()

  for (const [leaderName, decks] of decksByLeader) {
    const sampleSize = decks.length
    let totalUnits = 0
    let totalUpgrades = 0
    let totalEvents = 0
    const costCurveTotals: Record<number, number> = {}
    const cardAppearances = new Map<string, number>()  // cardName -> decks containing it
    const baseAspectCounts: Record<string, number> = {}

    for (const { base, deck } of decks) {
      let deckUnits = 0
      let deckUpgrades = 0
      let deckEvents = 0
      const costCounts: Record<number, number> = {}
      const cardsInThisDeck = new Set<string>()

      for (const entry of deck) {
        // Deck entries are { id, count } — we need to look at the card data
        // Since we only have id and count, we track card names from the id
        // The entry may also have card data embedded
        const card = entry as Record<string, unknown>
        const count = (card.count as number) || 1
        const cardName = card.name as string
        const cardType = card.type as string
        const cardCost = (card.cost as number) || 0

        if (cardType === 'Unit') deckUnits += count
        else if (cardType === 'Upgrade') deckUpgrades += count
        else if (cardType === 'Event') deckEvents += count

        const bucket = Math.min(cardCost, 7)
        costCounts[bucket] = (costCounts[bucket] || 0) + count

        if (cardName) cardsInThisDeck.add(cardName)
      }

      totalUnits += deckUnits
      totalUpgrades += deckUpgrades
      totalEvents += deckEvents

      for (const [cost, count] of Object.entries(costCounts)) {
        costCurveTotals[Number(cost)] = (costCurveTotals[Number(cost)] || 0) + count
      }

      for (const cardName of cardsInThisDeck) {
        cardAppearances.set(cardName, (cardAppearances.get(cardName) || 0) + 1)
      }

      // Track base aspects
      const baseAspects = (base?.aspects as string[]) || []
      for (const aspect of baseAspects) {
        if (COLOR_ASPECTS.includes(aspect)) {
          baseAspectCounts[aspect] = (baseAspectCounts[aspect] || 0) + 1
        }
      }
    }

    // Calculate averages
    const avgCostCurve: Record<number, number> = {}
    for (const [cost, total] of Object.entries(costCurveTotals)) {
      avgCostCurve[Number(cost)] = total / sampleSize
    }

    const cardFrequency = new Map<string, number>()
    for (const [cardName, count] of cardAppearances) {
      cardFrequency.set(cardName, count / sampleSize)
    }

    profiles.set(leaderName, {
      leaderName,
      sampleSize,
      avgUnits: totalUnits / sampleSize,
      avgUpgrades: totalUpgrades / sampleSize,
      avgEvents: totalEvents / sampleSize,
      avgCostCurve,
      cardFrequency,
      baseAspects: baseAspectCounts,
    })
  }

  return profiles
}

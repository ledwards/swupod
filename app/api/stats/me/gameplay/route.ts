import { ptpGameplay } from '@/lib/stats/ptpGameplay'
import { queryRow, queryRows } from '@/lib/db'
import { requireAlphaAccess, requireAuth } from '@/lib/auth'
import { jsonResponse, errorResponse, handleApiError } from '@/lib/utils'
import { applyRateLimit } from '@/lib/rateLimit'
import { NextRequest, NextResponse } from 'next/server'
import {
  DEFAULT_SINCE, DEFAULT_UNTIL, parseDateParam, buildGameplayResponse, appendPtpGameplay,
  type RawRecordRow, type RawBreakdownRow, type RawRecentPoolRow, type RawReplayRow,
  type RawLeaderPoolRow, type RawCasualRow,
} from '@/lib/stats/gameplayResponse'

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

    // Native PTP games are an alpha surface: everyone else gets the Karabast
    // record exactly as before, and their platform/opponent params are ignored.
    const alpha = await requireAlphaAccess(request).then(() => true, () => false)
    const platforms = alpha
      ? (searchParams.get('platforms') ?? 'karabast,ptp').split(',').filter(v => ['karabast', 'ptp'].includes(v))
      : ['karabast']
    const opponents = alpha
      ? (searchParams.get('opponents') ?? 'human,ai').split(',').filter(v => ['human', 'ai'].includes(v))
      : ['human', 'ai']
    const includeKarabast = platforms.includes('karabast') && opponents.includes('human')
    const nativeGamesPromise = platforms.includes('ptp')
      ? ptpGameplay(session.id, since, until, setCode, opponents)
      : Promise.resolve([])

    // $4 carries the set filter for every pool-scoped query below.
    const params = [session.id, since, until, setCode]
    // 'imported' pools are the home for Wayfinder-companion-captured / imported
    // games (record + wayfinder_match_ids live on the pool). This dashboard is
    // about play record and Wayfinder captures, so imported pools MUST count —
    // otherwise a set whose only games are in an imported pool reads 0 matches /
    // 0 captures even though the replay history (which doesn't filter pool_type)
    // lists them. (The Activity dashboard's /summary route intentionally
    // EXCLUDES imported from "pools opened" — different metric, different route.)
    const ownedPoolWhere = `
      user_id = $1
      AND ${includeKarabast ? 'TRUE' : 'FALSE'}
      AND pool_type IN ('sealed', 'draft', 'chaos_sealed', 'pack_blitz', 'pack_wars', 'rotisserie', 'imported')
      AND updated_at >= $2
      AND updated_at < ($3::date + interval '1 day')
      AND ($4 = 'all' OR set_code = $4)
    `

    // All eight reads below are independent and hit indexed columns. Fire them
    // concurrently (the pg pool allows up to 20 connections) so the route waits
    // on one round-trip, not eight in series — the dominant cost on /me.
    const [
      summaryRow,
      formatRows,
      setRows,
      recentPoolRows,
      leaderPoolRows,
      replayRow,
      replayRows,
      casualRows,
      nativeGames,
    ] = await Promise.all([
      queryRow(
        `SELECT
           ARRAY_AGG(id::text) FILTER (WHERE wins + losses + draws > 0) AS pool_ids,
           ARRAY(SELECT DISTINCT dpv.pool_id::text FROM deck_play_visits dpv
             JOIN card_pools cp ON cp.id = dpv.pool_id
             WHERE dpv.user_id = $1 AND dpv.first_visited_at >= $2
             AND dpv.first_visited_at < ($3::date + interval '1 day')
             AND ($4 = 'all' OR cp.set_code = $4)) AS played_pool_ids,
           COALESCE(SUM(wins), 0) AS wins,
           COALESCE(SUM(losses), 0) AS losses,
           COALESCE(SUM(draws), 0) AS draws,
           COUNT(*) FILTER (WHERE wins + losses + draws > 0) AS pools,
           COALESCE(SUM(cardinality(wayfinder_match_ids)), 0) AS captured_matches,
           (
             SELECT COUNT(*)
             FROM deck_play_visits dpv
             JOIN card_pools cp ON cp.id = dpv.pool_id
             WHERE dpv.user_id = $1
               AND dpv.first_visited_at >= $2
               AND dpv.first_visited_at < ($3::date + interval '1 day')
               AND ($4 = 'all' OR cp.set_code = $4)
           ) AS decks_played
         FROM card_pools
         WHERE ${ownedPoolWhere}`,
        params
      ) as Promise<RawRecordRow | null>,

      queryRows(
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
      ) as Promise<RawBreakdownRow[]>,

      queryRows(
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
      ) as Promise<RawBreakdownRow[]>,

      queryRows(
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
      ) as Promise<RawRecentPoolRow[]>,

      // Every owned pool with games — aggregated by leader in JS for the
      // leader-mix + win-rate-per-leader widget (leader lives in the JSON state,
      // so we can't GROUP BY it in SQL).
      //
      // buildLeaderBreakdown reads ONLY the leader + base out of each pool, so
      // we trim deck_builder_state down to { activeLeader, activeBase, and those
      // two cardPositions } in SQL instead of shipping up to 300 full pool blobs
      // (every card with full card objects). The CASE guards a malformed/legacy
      // shape by passing it through untouched, so the JS path is unchanged for
      // those rows. The trim is spec'd + locked by leaderBreakdownPayload.test.ts
      // (trimForLeader) — keep the two in sync.
      queryRows(
        `SELECT
           CASE
             WHEN jsonb_typeof(deck_builder_state) = 'object'
              AND jsonb_typeof(deck_builder_state->'cardPositions') = 'object'
             THEN jsonb_build_object(
               'activeLeader', deck_builder_state->'activeLeader',
               'activeBase', deck_builder_state->'activeBase',
               'cardPositions', COALESCE((
                 SELECT jsonb_object_agg(key, value)
                 FROM jsonb_each(deck_builder_state->'cardPositions')
                 WHERE key IN (deck_builder_state->>'activeLeader', deck_builder_state->>'activeBase')
               ), '{}'::jsonb)
             )
             ELSE deck_builder_state
           END AS deck_builder_state,
           wins, losses, draws
         FROM card_pools
         WHERE ${ownedPoolWhere}
           AND (wins + losses + draws > 0)
         ORDER BY updated_at DESC
         LIMIT 300`,
        params
      ) as Promise<RawLeaderPoolRow[]>,

      queryRow(
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
      ) as Promise<{ replays_recorded?: string | number | null } | null>,

      // DISTINCT ON (pm.id): a user can own several pools that share a pod_id
      // (multiple builds of one draft pool), and the card_pools join fans out one
      // match into N rows. Collapse to one row per match so the history isn't
      // double-counted (R5). Pick the most recently updated matching pool.
      queryRows(
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
             CASE WHEN pm.player1_id = $1 THEN pm.player1_leader ELSE pm.player2_leader END AS my_leader,
             cp.share_id AS pool_share_id,
             p.share_id AS pool_draft_share_id,
             cp.name AS pool_name,
             cp.set_code,
             cp.pool_type,
             cp.deck_builder_state
           FROM practice_matches pm
           LEFT JOIN users u1 ON u1.id = pm.player1_id
           LEFT JOIN users u2 ON u2.id = pm.player2_id
           LEFT JOIN card_pools cp ON cp.pod_id = pm.pod_id AND cp.user_id = $1
           LEFT JOIN pods p ON p.id = pm.pod_id
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
      ) as Promise<RawReplayRow[]>,

      // Casual (non-competitive) games — logged to casual_matches by the plugin.
      queryRows(
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
           cm.player_leader,
           cm.opponent_leader,
           cm.opponent_leader_image,
           cm.opponent_base,
           cm.opponent_archetype,
           cm.played_at,
           cp.share_id AS pool_share_id,
           p.share_id AS pool_draft_share_id,
           cp.name AS pool_name,
           cp.set_code,
           cp.pool_type,
           cp.deck_builder_state
         FROM casual_matches cm
         LEFT JOIN card_pools cp ON cp.id = cm.card_pool_id
         LEFT JOIN pods p ON p.id = cp.pod_id
         WHERE cm.user_id = $1
           -- A retracted result is a game that never happened in this pool
           -- (migration 094). It stays as a row for audit and must never be
           -- shown as gameplay.
           AND cm.retracted_at IS NULL
           AND cm.wayfinder_replay_url IS NOT NULL
           AND cm.played_at >= $2
           AND cm.played_at < ($3::date + interval '1 day')
           AND ($4 = 'all' OR cp.set_code = $4)
         ORDER BY cm.played_at DESC
         LIMIT 50`,
        params
      ) as Promise<RawCasualRow[]>,
      nativeGamesPromise,
    ])

    const result = buildGameplayResponse(
      summaryRow,
      formatRows,
      setRows,
      recentPoolRows,
      replayRow,
      replayRows,
      session.id,
      leaderPoolRows,
      casualRows
    )
    if (!includeKarabast) Object.assign(result, buildGameplayResponse(null, [], [], [], null))
    appendPtpGameplay(result, nativeGames, includeKarabast ? summaryRow?.pool_ids ?? [] : [], includeKarabast ? summaryRow?.played_pool_ids ?? [] : [])
    const response = jsonResponse(result)
    response.headers.set('Cache-Control', 'private, max-age=60')
    response.headers.set('Vary', 'Cookie')
    return response as unknown as NextResponse
  } catch (error) {
    return handleApiError(error) as unknown as NextResponse
  }
}

import { queryRows } from '../../lib/db'

/** Only archived authoritative games and the frozen build belonging to that seat.
 * Legacy pool counters cannot establish which deck was used in a physical game.
 */
export async function nativeCardDataRows(filters: {
  setCode: string; since: string; until: string; format: string; userId: string | null
  includeHumans: boolean; tournamentOnly: boolean; tournamentUserIds: string[]; topPlayersOnly: boolean
}) {
  return queryRows(`WITH sides AS (
    SELECT m.id AS game_id, s.seat, s.user_id, v.id AS deck_id, v.content_hash,
      v.snapshot, m.result,
      CASE WHEN m.result = CASE s.seat WHEN 0 THEN 'player1' ELSE 'player2' END THEN 1 ELSE 0 END AS wins,
      CASE WHEN m.result <> 'draw' AND m.result <> CASE s.seat WHEN 0 THEN 'player1' ELSE 'player2' END THEN 1 ELSE 0 END AS losses,
      CASE WHEN m.result = 'draw' THEN 1 ELSE 0 END AS draws
    FROM ptp_native_matches m
    JOIN ptp_native_game_records r ON r.match_id = m.id
    JOIN ptp_native_match_seats s ON s.match_id = m.id
    JOIN ptp_play_deck_versions v ON v.id = s.deck_version_id AND v.owner_user_id = s.user_id
    WHERE m.status = 'complete' AND m.result IN ('player1','player2','draw')
      AND ($1 = 'all' OR v.snapshot->>'setCode' = $1)
      AND m.completed_at >= $2::date AND m.completed_at < ($3::date + interval '1 day')
      AND ($4 IN ('all','limited') OR v.snapshot->>'poolType' = $4)
      AND ($5::uuid IS NULL OR s.user_id = $5::uuid)
      AND $6::boolean
      AND (NOT $7::boolean OR s.user_id = ANY($8::uuid[]))
      AND (NOT $9::boolean OR EXISTS (SELECT 1 FROM top_players tp WHERE tp.user_id=s.user_id))
  ), coverage AS (
    SELECT jsonb_build_object('uniqueGames', count(DISTINCT game_id), 'gameSides', count(*),
      'uniquePlayers', count(DISTINCT user_id), 'uniqueBuilds', count(DISTINCT deck_id)) AS population_counts
    FROM sides
  )
  SELECT deck_id, snapshot->'deck' AS deck,
    jsonb_build_object('id', snapshot->>'leader') AS leader,
    jsonb_build_object('id', snapshot->>'base') AS base,
    snapshot->>'poolType' AS pool_type,
    sum(wins)::integer AS wins, sum(losses)::integer AS losses, sum(draws)::integer AS draws,
    count(*)::integer AS linked_match_count, population_counts
  FROM sides CROSS JOIN coverage GROUP BY deck_id, snapshot, population_counts`,
  [filters.setCode, filters.since, filters.until, filters.format, filters.userId, filters.includeHumans,
    filters.tournamentOnly, filters.tournamentUserIds, filters.topPlayersOnly])
}

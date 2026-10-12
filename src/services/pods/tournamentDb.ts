import { randomUUID } from 'node:crypto'
import { queryRows, withTransaction, type TxClient } from '../../../lib/db'
import {
  autoResolveGames, botTablesMayResolve, decideMatch, normalizeSettings, overrideGames, planAdvance,
  type Entrant, type GameResult, type TournamentMatch, type TournamentSettings, type TournamentState,
} from './tournament'

/**
 * Persistence for pod tournaments (migration 116). Every state change runs
 * inside one transaction holding the pod's advisory lock, so a game result,
 * a host override and the reconciliation job can never pair a round twice.
 */

export class PodTournamentError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message) }
}

type Db = TxClient
const parse = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v)
const lockKey = (podId: string) => `pod-tournament:${podId}`

export interface StoredTournament extends TournamentState {
  podId: string
  startedAt: number
  overridden: Set<string>
}

export async function lockPod(tx: Db, podId: string) {
  await tx.query('SELECT pg_advisory_xact_lock(hashtext($1::text))', [lockKey(podId)])
}

export async function loadTournament(db: Db, podId: string): Promise<StoredTournament | null> {
  const t = await db.queryRow('SELECT * FROM pod_tournaments WHERE pod_id=$1', [podId])
  if (!t) return null
  const entrants = (await db.queryRows('SELECT user_id,seat,is_bot FROM pod_tournament_entrants WHERE pod_id=$1 ORDER BY seat', [podId]))
    .map(r => ({ id: String(r.user_id), seat: Number(r.seat), isBot: r.is_bot === true }))
  const matchRows = await db.queryRows('SELECT * FROM pod_tournament_matches WHERE pod_id=$1 ORDER BY stage DESC,round_number,table_number', [podId])
  const gameRows = matchRows.length ? await db.queryRows(
    'SELECT match_id,game_number,result FROM pod_tournament_games WHERE match_id = ANY($1::uuid[]) AND result IS NOT NULL ORDER BY game_number',
    [matchRows.map(r => r.id)]) : []
  const games = new Map<string, GameResult[]>()
  for (const g of gameRows) {
    const list = games.get(String(g.match_id)) ?? []
    list.push(g.result as GameResult)
    games.set(String(g.match_id), list)
  }
  const overridden = new Set<string>()
  const matches: TournamentMatch[] = matchRows.map(r => {
    const override = parse(r.override_games) as GameResult[] | null
    if (override) overridden.add(String(r.id))
    return {
      id: String(r.id), stage: r.stage as TournamentMatch['stage'], round: Number(r.round_number), table: Number(r.table_number),
      player1: String(r.player1_id), player2: r.player2_id ? String(r.player2_id) : null, bestOf: Number(r.best_of) === 1 ? 1 : 3,
      games: override ?? games.get(String(r.id)) ?? [], winner: (r.winner as TournamentMatch['winner']) ?? null,
    }
  })
  return {
    podId, settings: parse(t.settings) as TournamentSettings, status: t.status === 'complete' ? 'complete' : 'running',
    entrants, matches,
    startedAt: new Date(String(t.started_at)).getTime(), overridden,
  }
}

/**
 * Bring a tournament up to date: decide matches from their games, resolve
 * bot-vs-bot tables once a human in their round has started, then pair the next round or finish. Repeats until nothing changes (a bye or a bot table can finish a
 * round on its own). Caller holds the pod lock.
 */
export async function advanceLocked(tx: Db, podId: string, now = Date.now()): Promise<boolean> {
  let changed = false
  for (let step = 0; step < 32; step++) {
    const state = await loadTournament(tx, podId)
    if (!state || state.status !== 'running') break
    const bots = new Set(state.entrants.filter(e => e.isBot).map(e => e.id))
    const open = state.matches.filter(m => !m.winner)
    // Bot tables wait until a human table in their round has started (Play reserved a game).
    const botOpen = open.filter(m => m.player2 && bots.has(m.player1) && bots.has(m.player2))
    let started = new Set<string>(), gone = new Set<string>()
    if (botOpen.length) {
      started = new Set((await tx.queryRows('SELECT DISTINCT match_id FROM pod_tournament_games WHERE match_id = ANY($1::uuid[])',
        [open.map(m => m.id)])).map(r => String(r.match_id)))
      gone = new Set((await tx.queryRows('SELECT user_id FROM pod_players WHERE pod_id=$1 AND COALESCE(dropped,false)=true', [podId])).map(r => String(r.user_id)))
    }
    let decided = false
    for (const m of state.matches) {
      if (m.winner) continue
      let winner = decideMatch(m.games, m.bestOf, m.stage)
      if (!winner && botOpen.includes(m) && botTablesMayResolve(state.matches, m.stage, m.round, bots, started, gone)) {
        const games = autoResolveGames(m.id, m.bestOf, m.stage)
        for (const [i, result] of games.entries()) {
          await tx.query(`INSERT INTO pod_tournament_games(id,match_id,game_number,source,result,completed_at)
            VALUES($1,$2,$3,'auto',$4,NOW()) ON CONFLICT (match_id,game_number) DO NOTHING`, [randomUUID(), m.id, i + 1, result])
        }
        winner = decideMatch(games, m.bestOf, m.stage)
      }
      if (!winner) continue
      await tx.query('UPDATE pod_tournament_matches SET winner=$2,finished_at=NOW() WHERE id=$1 AND winner IS NULL', [m.id, winner])
      decided = true
    }
    if (decided) { changed = true; continue }
    const action = planAdvance(state)
    if (action.type === 'wait') break
    changed = true
    if (action.type === 'complete') {
      await tx.query("UPDATE pod_tournaments SET status='complete',completed_at=NOW(),updated_at=NOW() WHERE pod_id=$1", [podId])
      break
    }
    for (const p of action.pairings) {
      await tx.query(`INSERT INTO pod_tournament_matches(pod_id,stage,round_number,table_number,player1_id,player2_id,best_of,winner,finished_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (pod_id,stage,round_number,table_number) DO NOTHING`,
        [podId, p.stage, p.round, p.table, p.player1, p.player2, state.settings.bestOf, p.player2 ? null : 'player1', p.player2 ? null : new Date(now)])
    }
    await tx.query('UPDATE pod_tournaments SET updated_at=NOW() WHERE pod_id=$1', [podId])
  }
  return changed
}

export async function advanceTournament(podId: string, now = Date.now()): Promise<boolean> {
  return withTransaction(async tx => { await lockPod(tx, podId); return advanceLocked(tx, podId, now) })
}

async function hostPod(tx: Db, shareId: string, userId: string) {
  const pod = await tx.queryRow('SELECT id,host_id,status,settings FROM pods WHERE share_id=$1 FOR UPDATE', [shareId])
  if (!pod) throw new PodTournamentError(404, 'pod_not_found', 'Pod not found.')
  if (String(pod.host_id) !== userId) throw new PodTournamentError(403, 'host_only', 'Only the host can do that.')
  return pod
}

/** A competitive pod that already ran the old Swiss Practice event keeps it; the pod page shows it read-only. */
async function refuseLegacyEvent(tx: Db, podId: string) {
  if (await tx.queryRow('SELECT 1 FROM practice_rounds WHERE pod_id=$1 LIMIT 1', [podId])) throw new PodTournamentError(409, 'legacy_event', 'This pod already played its Swiss rounds.')
}

/** Who plays: every human still in the pod, plus bots when bots play their decks. */
export async function rosterFor(db: Db, podId: string, botsPlay: boolean): Promise<Entrant[]> {
  const rows = await db.queryRows(`SELECT user_id,seat_number,is_bot FROM pod_players
    WHERE pod_id=$1 AND COALESCE(dropped,false)=false ORDER BY seat_number`, [podId])
  return rows.filter(r => botsPlay || r.is_bot !== true).map(r => ({ id: String(r.user_id), seat: Number(r.seat_number), isBot: r.is_bot === true }))
}

/** Host edits before Round 1. Kept on the pod so the sheet reopens as it was left. */
export async function saveTournamentSettings(shareId: string, userId: string, raw: unknown) {
  return withTransaction(async tx => {
    const pod = await hostPod(tx, shareId, userId)
    await lockPod(tx, String(pod.id))
    if (await tx.queryRow('SELECT 1 FROM pod_tournaments WHERE pod_id=$1', [pod.id])) throw new PodTournamentError(409, 'already_started', 'Round 1 has already started.')
    await refuseLegacyEvent(tx, String(pod.id))
    const sizing = normalizeSettings(raw, 8)
    const settings = normalizeSettings(raw, (await rosterFor(tx, String(pod.id), sizing.botsPlay)).length)
    await tx.query(`UPDATE pods SET settings=COALESCE(settings,'{}'::jsonb)||jsonb_build_object('tournament',$2::jsonb) WHERE id=$1`, [pod.id, JSON.stringify(settings)])
    return settings
  })
}

/** Host's "Decks and pools public": any time, before or during the event. Kept on the pod's settings. */
export async function saveDecksPublic(shareId: string, userId: string, decksPublic: boolean) {
  return withTransaction(async tx => {
    const pod = await hostPod(tx, shareId, userId)
    await tx.query(`UPDATE pods SET settings=COALESCE(settings,'{}'::jsonb)||jsonb_build_object('decksPublic',$2::boolean) WHERE id=$1`, [pod.id, decksPublic])
    return { decksPublic }
  })
}

/** Start Round 1. Later rounds start on their own. */
export async function startTournament(shareId: string, userId: string, raw: unknown, now = Date.now()) {
  return withTransaction(async tx => {
    const pod = await hostPod(tx, shareId, userId)
    if (pod.status !== 'complete') throw new PodTournamentError(409, 'still_drafting', 'The draft is not finished yet.')
    await lockPod(tx, String(pod.id))
    if (await tx.queryRow('SELECT 1 FROM pod_tournaments WHERE pod_id=$1', [pod.id])) throw new PodTournamentError(409, 'already_started', 'Round 1 has already started.')
    await refuseLegacyEvent(tx, String(pod.id))
    const botsPlay = normalizeSettings(raw, 8).botsPlay
    const entrants = await rosterFor(tx, String(pod.id), botsPlay)
    const settings = normalizeSettings(raw, entrants.length)
    if (settings.format === 'none') throw new PodTournamentError(400, 'no_tournament', 'This pod has no tournament.')
    if (entrants.length < 2) throw new PodTournamentError(409, 'too_few_players', 'A tournament needs at least two players.')
    await tx.query(`UPDATE pods SET settings=COALESCE(settings,'{}'::jsonb)||jsonb_build_object('tournament',$2::jsonb) WHERE id=$1`, [pod.id, JSON.stringify(settings)])
    await tx.query('INSERT INTO pod_tournaments(pod_id,settings,started_by) VALUES($1,$2,$3)', [pod.id, JSON.stringify(settings), userId])
    for (const e of entrants) await tx.query('INSERT INTO pod_tournament_entrants(pod_id,user_id,seat,is_bot) VALUES($1,$2,$3,$4)', [pod.id, e.id, e.seat, e.isBot])
    await advanceLocked(tx, String(pod.id), now)
    return { podId: String(pod.id), settings }
  })
}

/**
 * Fix a result. The host sets the match score; it replaces whatever the games
 * said. A finished bracket round can no longer change once the next one starts.
 */
export async function overrideMatchResult(shareId: string, userId: string, matchId: string, player1Wins: number, player2Wins: number, now = Date.now()) {
  return withTransaction(async tx => {
    const pod = await hostPod(tx, shareId, userId)
    await lockPod(tx, String(pod.id))
    const state = await loadTournament(tx, String(pod.id))
    if (!state) throw new PodTournamentError(404, 'no_tournament', 'This pod has no tournament.')
    const match = state.matches.find(m => m.id === matchId)
    if (!match) throw new PodTournamentError(404, 'match_not_found', 'Match not found.')
    if (!match.player2) throw new PodTournamentError(409, 'bye', 'A bye has no result to fix.')
    const later = state.matches.some(m => m.stage === 'elimination' && (match.stage === 'swiss' || m.round > match.round))
    if (later) throw new PodTournamentError(409, 'result_locked', 'The next bracket round has started; this result is final.')
    let fixed
    try { fixed = overrideGames(player1Wins, player2Wins, match.bestOf, match.stage) }
    catch (error) { throw new PodTournamentError(400, 'invalid_score', error instanceof Error ? error.message : 'Invalid score') }
    await tx.query(`UPDATE pod_tournament_matches SET override_games=$2,winner=$3,overridden_by=$4,finished_at=COALESCE(finished_at,NOW()) WHERE id=$1`,
      [matchId, JSON.stringify(fixed.games), fixed.winner, userId])
    // A fixed Swiss result can reopen a finished event only through standings; completion stands.
    await advanceLocked(tx, String(pod.id), now)
    return fixed
  })
}

/**
 * Attach finished native games to their tournament game slots, then advance
 * those pods. Native game ids are tournament game ids and seat 0 is always
 * player one, so the engine's result maps straight across. A cancelled native
 * game frees its slot to be launched again.
 *
 * `refresh` asks the engine about games still marked active (the page does
 * this for the viewer's own table; the 30-second reconciliation job refreshes
 * every active native game before calling this).
 */
export async function syncNativeResults(podId: string | null, refresh?: (gameId: string, seat0UserId: string) => Promise<void>) {
  const rows = await queryRows(`SELECT g.id,m.pod_id,n.status,n.result,s.user_id AS seat0
    FROM pod_tournament_games g JOIN pod_tournament_matches m ON m.id=g.match_id
    JOIN ptp_native_matches n ON n.id=g.id
    JOIN ptp_native_match_seats s ON s.match_id=n.id AND s.seat=0
    WHERE g.result IS NULL AND g.source='native' AND m.winner IS NULL AND ($1::uuid IS NULL OR m.pod_id=$1)`, [podId])
  const pods = new Set<string>()
  for (const row of rows) {
    let status = String(row.status), result = row.result as GameResult | null
    if (refresh && ['starting', 'active'].includes(status)) {
      try { await refresh(String(row.id), String(row.seat0)) } catch { /* The job retries. */ }
      const fresh = (await queryRows('SELECT status,result FROM ptp_native_matches WHERE id=$1', [row.id]))[0]
      status = String(fresh?.status ?? status); result = (fresh?.result as GameResult | null) ?? result
    }
    if (status === 'complete' && result) {
      await withTransaction(async tx => {
        await lockPod(tx, String(row.pod_id))
        await tx.query('UPDATE pod_tournament_games SET result=$2,completed_at=NOW() WHERE id=$1 AND result IS NULL', [row.id, result])
      })
      pods.add(String(row.pod_id))
    } else if (status === 'cancelled') {
      await withTransaction(async tx => {
        await lockPod(tx, String(row.pod_id))
        await tx.query('DELETE FROM pod_tournament_games WHERE id=$1 AND result IS NULL', [row.id])
      })
    }
  }
  for (const id of pods) await advanceTournament(id)
  return { updated: pods.size }
}

/** The reconciliation job: attach finished games' results. */
export async function reconcilePodTournaments() {
  await syncNativeResults(null)
}

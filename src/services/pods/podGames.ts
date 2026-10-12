import { randomUUID } from 'node:crypto'
import { queryRow, withTransaction } from '../../../lib/db'
import { PtpPlayError } from '../play/playState'
import { freezeSavedDeck, loadSupport } from '../play/native/savedDeck'
import { createRuntime, nativeConfig, runtimeStatus, validateLaunchUrl, verifyRuntimeRevision } from '../play/native/runtimeClient'
import { getMatch, launchMatch } from '../play/native/privateMatches'
import { AI_POLICY } from '../play/solo/opponent'
import type { NativeDeckVersion } from '../play/deckVersions'
import { advanceLocked, lockPod, loadTournament, syncNativeResults } from './tournamentDb'
import { nextGameNumber } from './tournament'
import { podReplayAccess } from './podReplay'
import { memberGameRecord } from '../play/native/gameRecords'

/**
 * Pod tournament games on the native table.
 *
 * Every game is its own native match whose id is the tournament game id, with
 * player one in seat 0. Human-vs-human games go through the ordinary private
 * match launch. A bot seat is played by the engine's AI with the bot's drafted
 * deck — the same vs-AI path solo play uses — so the human launches as usual
 * and the AI answers. Bot-vs-bot games never reach the engine (tournamentDb
 * resolves them once a human in their round starts a game here).
 */

const parseSnapshot = (value: unknown) => (typeof value === 'string' ? JSON.parse(value) : value) as NativeDeckVersion
const podPath = (shareId: string) => `/draft/${encodeURIComponent(shareId)}/pod`

async function podFor(shareId: string) {
  const pod = await queryRow('SELECT id FROM pods WHERE share_id=$1', [shareId])
  if (!pod) throw new PtpPlayError(404, 'pod_not_found', 'Pod not found.')
  return String(pod.id)
}

/** Reserve (or reuse) the current game of a match, freezing both decks on first use. */
async function reserveGame(shareId: string, matchId: string, userId: string) {
  const config = nativeConfig()
  const podId = await podFor(shareId)
  return withTransaction(async tx => {
    await lockPod(tx, podId)
    const state = await loadTournament(tx, podId)
    if (!state || state.status !== 'running') throw new PtpPlayError(409, 'not_running', 'This tournament is not running.')
    const match = state.matches.find(m => m.id === matchId)
    if (!match) throw new PtpPlayError(404, 'match_not_found', 'Match not found.')
    if (match.player1 !== userId && match.player2 !== userId) throw new PtpPlayError(403, 'not_participant', 'You are not playing this match.')
    const gameNumber = nextGameNumber(match)
    if (!gameNumber) throw new PtpPlayError(409, 'match_finished', 'This match is finished.')
    const bots = new Set(state.entrants.filter(e => e.isBot).map(e => e.id))
    const existing = await tx.queryRow('SELECT id FROM pod_tournament_games WHERE match_id=$1 AND game_number=$2', [matchId, gameNumber])
    const gameId = existing ? String(existing.id) : randomUUID()
    if (!existing) await tx.query("INSERT INTO pod_tournament_games(id,match_id,game_number,source) VALUES($1,$2,$3,'native')", [gameId, matchId, gameNumber])
    const native = await tx.queryRow('SELECT status FROM ptp_native_matches WHERE id=$1', [gameId])
    if (!native) {
      const seats = [match.player1, match.player2!]
      const ownActive = await tx.queryRow('SELECT match_id FROM ptp_native_match_seats WHERE user_id=$1 AND released_at IS NULL', [userId])
      if (ownActive) throw new PtpPlayError(409, 'own_game_active', 'End your current game before joining this table.')
      const versions = []
      for (const owner of seats) {
        const active = await tx.queryRow('SELECT match_id FROM ptp_native_match_seats WHERE user_id=$1 AND released_at IS NULL', [owner])
        if (active) throw new PtpPlayError(409, 'opponent_busy', bots.has(owner) ? 'That bot is still finishing a game. Try again shortly.' : 'Your opponent needs to finish their current game before this table can open.')
        const pool = await tx.queryRow(`SELECT cp.share_id FROM card_pools cp JOIN built_decks b ON b.card_pool_id=cp.id
          WHERE cp.pod_id=$1 AND cp.user_id=$2 AND cp.parent_pool_id IS NULL ORDER BY b.built_at DESC LIMIT 1`, [podId, owner])
        if (!pool) throw new PtpPlayError(409, 'deck_not_ready', 'Both players need a built deck.')
        versions.push(await freezeSavedDeck(tx, owner, String(pool.share_id), config.supportPath))
      }
      const creator = bots.has(match.player1) ? match.player2! : match.player1
      await tx.query(`INSERT INTO ptp_native_matches(id,creator_user_id,request_id,invite_hash,status) VALUES($1,$2,$1,$3,'starting')`, [gameId, creator, `pod:${gameId}`])
      for (const seat of [0, 1]) await tx.query('INSERT INTO ptp_native_match_seats(match_id,seat,user_id,deck_version_id) VALUES($1,$2,$3,$4)', [gameId, seat, seats[seat], versions[seat]!.id])
    } else if (native.status === 'cancelled') {
      throw new PtpPlayError(409, 'game_cancelled', 'This game was cancelled. Refresh to start it again.')
    }
    // A human has started this round: its bot-vs-bot tables can resolve now.
    if (!existing) await advanceLocked(tx, podId)
    return { gameId, stage: match.stage, botSeats: [bots.has(match.player1), bots.has(match.player2!)] as [boolean, boolean] }
  })
}

/** A bot seat is AI-controlled: the runtime must exist with its policy before the human's launch. */
async function ensureBotRuntime(gameId: string, botSeats: [boolean, boolean]) {
  if (!botSeats[0] && !botSeats[1]) return
  const config = nativeConfig(process.env, true)
  try { await runtimeStatus(config, gameId); return }
  catch (error) { if (!(error instanceof PtpPlayError && error.code === 'runtime_not_found')) throw error }
  const rows = await withTransaction(tx => tx.queryRows('SELECT v.snapshot FROM ptp_native_match_seats s JOIN ptp_play_deck_versions v ON v.id=s.deck_version_id WHERE s.match_id=$1 ORDER BY s.seat', [gameId]))
  const decks = rows.map(r => parseSnapshot(r.snapshot))
  const support = await loadSupport(config.supportPath)
  await verifyRuntimeRevision(config, support.engineRevision)
  await createRuntime(config, gameId, decks, [botSeats[0] ? AI_POLICY : null, botSeats[1] ? AI_POLICY : null])
}

/** Play ↗: launch (or resume) the viewer's current game in their table. */
export async function launchPodGame(shareId: string, matchId: string, userId: string, expiresAt: number) {
  const podId = await podFor(shareId)
  // Catch a result that landed while the player was away before choosing the game number.
  await syncNativeResults(podId, refreshNative)
  const reserved = await reserveGame(shareId, matchId, userId)
  await ensureBotRuntime(reserved.gameId, reserved.botSeats)
  const launch = await launchMatch(reserved.gameId, userId, expiresAt, { isolated: true, returnPath: podPath(shareId), eventFormat: reserved.stage === 'elimination' ? 'elimination' : 'swiss' })
  return { ...launch, gameId: reserved.gameId }
}

export async function refreshNative(gameId: string, seat0UserId: string) {
  await getMatch(gameId, seat0UserId)
}

/**
 * Watch ↗: any human in the pod may spectate a live table. The gateway issues
 * a read-only observer session that only ever receives the public board.
 */
export async function watchPodGame(shareId: string, matchId: string, userId: string, expiresAt: number) {
  const config = nativeConfig()
  const row = await queryRow(`SELECT g.id FROM pod_tournament_games g
    JOIN pod_tournament_matches m ON m.id=g.match_id JOIN pods p ON p.id=m.pod_id
    JOIN ptp_native_matches n ON n.id=g.id
    WHERE p.share_id=$1 AND m.id=$2 AND g.result IS NULL AND n.status='active'
      AND $3::uuid NOT IN (m.player1_id, COALESCE(m.player2_id, m.player1_id))
      AND EXISTS (SELECT 1 FROM pod_players pp WHERE pp.pod_id=p.id AND pp.user_id=$3 AND pp.is_bot=false)
    ORDER BY g.game_number DESC LIMIT 1`, [shareId, matchId, userId])
  if (!row) throw new PtpPlayError(404, 'no_live_game', 'This table has no live game to watch.')
  const response = await fetch(`${config.gatewayUrl}/internal/launch`, {
    method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(12000),
    headers: { authorization: `Bearer ${config.gatewayKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ issuer: 'ptp', subject: userId, matchId: String(row.id), seat: 0, mode: 'observe', isolated: true,
      returnUrl: `${config.hostOrigin}${podPath(shareId)}`, expiresAt: Math.min(expiresAt, Date.now() + 6 * 60 * 60_000) }),
  })
  if (!response.ok) throw new PtpPlayError(503, 'watch_unavailable', 'Watching is unavailable right now.')
  return { launchUrl: validateLaunchUrl((await response.json()).launchUrl, config.publicOrigin) }
}

/**
 * Replay ↗: a finished, recorded game of this table. Players, the host, and
 * (with public decks) any human member may open it; see podReplayAccess.
 */
export async function replayPodGame(shareId: string, matchId: string, gameId: string, userId: string, expiresAt: number) {
  const config = nativeConfig()
  const access = await podReplayAccess(gameId, userId)
  if (!access || access.shareId !== shareId || access.matchId !== matchId) throw new PtpPlayError(404, 'no_replay', 'This game has no replay.')
  await memberGameRecord(gameId, userId) // archives the record on first use
  const response = await fetch(`${config.gatewayUrl}/internal/launch`, {
    method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(12000),
    headers: { authorization: `Bearer ${config.gatewayKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ issuer: 'ptp', subject: userId, matchId: gameId, seat: access.seat, mode: 'replay', isolated: true,
      returnUrl: `${config.hostOrigin}${podPath(shareId)}`, expiresAt: Math.min(expiresAt, Date.now() + 6 * 60 * 60_000) }),
  })
  if (!response.ok) throw new PtpPlayError(503, 'replay_unavailable', 'Replay is unavailable right now.')
  return { launchUrl: validateLaunchUrl((await response.json()).launchUrl, config.publicOrigin) }
}

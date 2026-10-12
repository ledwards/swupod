import { randomUUID } from 'node:crypto'
import { queryRow, withTransaction, type TxClient } from '../../../lib/db'
import { PtpPlayError } from '../play/playState'
import { freezeSavedDeck, loadSupport } from '../play/native/savedDeck'
import { nativeConfig } from '../play/native/runtimeClient'
import { launchMatch } from '../play/native/privateMatches'
import { selectionFromDeck, type SideboardData } from '../play/solo/sideboard'
import type { NativeDeckVersion } from '../play/deckVersions'
import { checkedSelection, poolBuilds, poolCards, selectionDeckState, sourcePool } from '../../../lib/play/soloSideboard'
import { advanceLocked, lockPod, loadTournament, syncNativeResults } from './tournamentDb'
import { gameScore, nextGameNumber, overrideGames, type TournamentMatch } from './tournament'
import { ensureBotRuntime, latestPodDeck, ownActiveGame, podLaunchOptions, podPath, refreshNative } from './podGames'

/**
 * Between games of a Bo3 pod match, at the table. This is the same in-game
 * sideboarding solo runs use (lib/play/inGameSideboard.ts), driven by the
 * tournament instead of a solo run:
 *
 *  open  — record the finished game, then either `complete` (the match is
 *          decided, return to the pod) or the player's pod pool to sideboard.
 *  ready — lock this player's deck into the next game. Against a bot (who keeps
 *          its deck) the game starts at once; against a person it starts when
 *          both have readied (`waiting` until then).
 *
 * Every game is still its own native match whose id is its pod_tournament_games
 * id, so results keep auto-reporting through syncNativeResults.
 */

const parsed = (value: unknown): any => (typeof value === 'string' ? JSON.parse(value) : value)
type Input = { action: string; gameId?: string; selection?: unknown; buildShareId?: string; expiresAt: number }

/** The pod match a finished game belongs to, when the viewer plays in it. */
export async function podGameOwner(gameId: string, userId: string) {
  const row = await queryRow(`SELECT g.match_id,m.pod_id,p.share_id FROM pod_tournament_games g
    JOIN pod_tournament_matches m ON m.id=g.match_id JOIN pods p ON p.id=m.pod_id
    WHERE g.id=$1 AND $2::uuid IN (m.player1_id, COALESCE(m.player2_id, m.player1_id))`, [gameId, userId])
  return row ? { matchId: String(row.match_id), podId: String(row.pod_id), shareId: String(row.share_id) } : null
}

async function matchState(tx: TxClient, podId: string, matchId: string) {
  const state = await loadTournament(tx, podId)
  const match = state?.matches.find(m => m.id === matchId)
  if (!state || !match) throw new PtpPlayError(404, 'match_not_found', 'Match not found.')
  return { state, match, bots: new Set(state.entrants.filter(e => e.isBot).map(e => e.id)) }
}

/** The next game's slot, reserved so both players sideboard for the same game id. */
async function nextGame(tx: TxClient, match: TournamentMatch) {
  const number = nextGameNumber(match)!
  const existing = await tx.queryRow('SELECT id FROM pod_tournament_games WHERE match_id=$1 AND game_number=$2', [match.id, number])
  if (existing) return { id: String(existing.id), number }
  const id = randomUUID()
  await tx.query("INSERT INTO pod_tournament_games(id,match_id,game_number,source) VALUES($1,$2,$3,'native')", [id, match.id, number])
  return { id, number }
}

/** The deck this player last played in the match (or their saved pod deck), and whether it is locked into the next game. */
async function currentDeck(tx: TxClient, podId: string, matchId: string, nextGameId: string, userId: string, supportPath: string) {
  const row = await tx.queryRow(`SELECT v.snapshot,g.id FROM pod_tournament_games g
    JOIN ptp_native_match_seats s ON s.match_id=g.id AND s.user_id=$2 JOIN ptp_play_deck_versions v ON v.id=s.deck_version_id
    WHERE g.match_id=$1 ORDER BY g.game_number DESC LIMIT 1`, [matchId, userId])
  if (row) return { deck: parsed(row.snapshot) as NativeDeckVersion, locked: String(row.id) === nextGameId }
  return { deck: (await latestPodDeck(tx, podId, userId, supportPath)).snapshot, locked: false }
}

/** The finished game is recorded (auto-reporting) before anything else is decided. */
async function recorded(owner: NonNullable<Awaited<ReturnType<typeof podGameOwner>>>, gameId: string) {
  await syncNativeResults(owner.podId, refreshNative)
  const game = await queryRow('SELECT g.result,m.winner FROM pod_tournament_games g JOIN pod_tournament_matches m ON m.id=g.match_id WHERE g.id=$1', [gameId])
  if (!game) throw new PtpPlayError(409, 'game_cancelled', 'This game was cancelled.')
  return !!game.result || !!game.winner
}

export async function podSideboard(gameId: string, userId: string, input: Input) {
  const owner = await podGameOwner(gameId, userId)
  if (!owner) throw new PtpPlayError(404, 'game_not_found', 'Game not found.')
  if (!(await recorded(owner, gameId))) return { state: 'recording' }
  const config = nativeConfig(process.env, true)
  const support = await loadSupport(config.supportPath)
  const step = await withTransaction(async tx => {
    await lockPod(tx, owner.podId)
    const { match, bots } = await matchState(tx, owner.podId, owner.matchId)
    const seat = match.player1 === userId ? 0 : 1
    const [a, b] = gameScore(match.games)
    if (match.winner || !nextGameNumber(match)) return { state: 'complete' as const, score: [a, b] }
    const opponent = seat === 0 ? match.player2! : match.player1
    const game = await nextGame(tx, match)
    const native = await tx.queryRow('SELECT status FROM ptp_native_matches WHERE id=$1', [game.id])
    const seated = native ? (await tx.queryRows('SELECT user_id FROM ptp_native_match_seats WHERE match_id=$1', [game.id])).map(r => String(r.user_id)) : []
    const current = await currentDeck(tx, owner.podId, match.id, game.id, userId, config.supportPath)
    const root = await sourcePool(tx, current.deck, userId)
    const cards = poolCards(root, support)
    if (input.action !== 'ready') {
      const data: SideboardData & { score: number[]; opponentReady: boolean } = {
        locked: seated.includes(userId), runId: match.id, gameId: game.id, gameNumber: game.number, poolShareId: String(root.share_id),
        returnUrl: podPath(owner.shareId), cards, selection: selectionFromDeck(current.deck, cards),
        builds: await poolBuilds(tx, userId, String(root.id), cards, support),
        score: seat === 0 ? [a, b] : [b, a], opponentReady: bots.has(opponent) || seated.includes(opponent),
      }
      return { state: 'sideboarding' as const, data }
    }
    if (input.gameId !== game.id) throw new PtpPlayError(409, 'stale_game', 'The match has moved on. Reopen sideboarding.')
    if (!seated.includes(userId)) {
      if (native && native.status !== 'waiting') throw new PtpPlayError(409, 'game_unavailable', 'This game is no longer available. Return to the pod.')
      // Validate against the pool, then freeze it without saving over the player's build.
      const selection = checkedSelection(input.selection, cards)
      const build = input.buildShareId ? await tx.queryRow('SELECT share_id,parent_pool_id,id,deck_builder_state FROM card_pools WHERE share_id=$1 AND user_id=$2', [input.buildShareId, userId]) : root
      if (!build || String(build.parent_pool_id ?? build.id) !== String(root.id)) throw new PtpPlayError(409, 'wrong_pool', 'Choose a saved build from this pool.')
      const version = await freezeSavedDeck(tx, userId, String(build.share_id), config.supportPath, selectionDeckState(cards, selection, build.deck_builder_state))
      await ownActiveGame(tx, userId)
      if (!native) await tx.query(`INSERT INTO ptp_native_matches(id,creator_user_id,request_id,invite_hash,status) VALUES($1,$2,$1,$3,'waiting')`, [game.id, userId, `pod:${game.id}`])
      await tx.query('INSERT INTO ptp_native_match_seats(match_id,seat,user_id,deck_version_id) VALUES($1,$2,$3,$4)', [game.id, seat, userId, version.id])
      if (bots.has(opponent)) {
        // The bot keeps the deck it has been playing this match.
        const deck = await tx.queryRow(`SELECT s.deck_version_id FROM pod_tournament_games g JOIN ptp_native_match_seats s ON s.match_id=g.id AND s.user_id=$2
          WHERE g.match_id=$1 ORDER BY g.game_number DESC LIMIT 1`, [match.id, opponent])
        const versionId = deck ? String(deck.deck_version_id) : (await latestPodDeck(tx, owner.podId, opponent, config.supportPath)).id
        await tx.query('INSERT INTO ptp_native_match_seats(match_id,seat,user_id,deck_version_id) VALUES($1,$2,$3,$4)', [game.id, 1 - seat, opponent, versionId])
        seated.push(opponent)
      }
      seated.push(userId)
      if (seated.includes(opponent)) await tx.query("UPDATE ptp_native_matches SET status='starting' WHERE id=$1 AND status='waiting'", [game.id])
    }
    if (!seated.includes(opponent)) return { state: 'waiting' as const }
    return { state: 'launch' as const, gameId: game.id, botSeats: [bots.has(match.player1), bots.has(match.player2!)] as [boolean, boolean], stage: match.stage, bestOf: match.bestOf }
  })
  if (step.state === 'complete') return { state: 'complete', score: step.score }
  if (step.state === 'sideboarding') return { state: 'sideboarding', ...step.data }
  if (step.state === 'waiting') return { state: 'waiting', opponentReady: false }
  await ensureBotRuntime(step.gameId, step.botSeats)
  const launch = await launchMatch(step.gameId, userId, input.expiresAt, podLaunchOptions(owner.shareId, step.stage, step.bestOf))
  if (!('launchUrl' in launch)) throw new PtpPlayError(409, 'game_finished', 'This game has already finished.')
  return { state: 'launch', launchUrl: launch.launchUrl }
}

/** Forfeit a Bo3 pod match from the table: the opponent takes the match; games already won stand. */
export async function concedePodMatch(gameId: string, userId: string) {
  const owner = await podGameOwner(gameId, userId)
  if (!owner) throw new PtpPlayError(404, 'game_not_found', 'Game not found.')
  await syncNativeResults(owner.podId, refreshNative)
  await withTransaction(async tx => {
    await lockPod(tx, owner.podId)
    const { match } = await matchState(tx, owner.podId, owner.matchId)
    if (match.winner || !match.player2) return
    const need = match.bestOf === 1 ? 1 : 2
    const [a, b] = gameScore(match.games)
    const { games, winner } = match.player1 === userId
      ? overrideGames(Math.min(a, need - 1), need, match.bestOf, match.stage)
      : overrideGames(need, Math.min(b, need - 1), match.bestOf, match.stage)
    await tx.query('UPDATE pod_tournament_matches SET override_games=$2,winner=$3,finished_at=NOW() WHERE id=$1 AND winner IS NULL', [match.id, JSON.stringify(games), winner])
    // A next game that was waiting on sideboarding will never start.
    const waiting = await tx.queryRows(`SELECT g.id FROM pod_tournament_games g JOIN ptp_native_matches n ON n.id=g.id
      WHERE g.match_id=$1 AND g.result IS NULL AND n.status='waiting'`, [match.id])
    for (const row of waiting) {
      await tx.query("UPDATE ptp_native_matches SET status='cancelled' WHERE id=$1", [row.id])
      await tx.query('UPDATE ptp_native_match_seats SET released_at=NOW() WHERE match_id=$1', [row.id])
    }
    await tx.query('DELETE FROM pod_tournament_games g WHERE g.match_id=$1 AND g.result IS NULL AND NOT EXISTS (SELECT 1 FROM ptp_native_matches n WHERE n.id=g.id AND n.status IN (\'starting\',\'active\',\'complete\'))', [match.id])
    await advanceLocked(tx, owner.podId)
  })
  return { ok: true }
}

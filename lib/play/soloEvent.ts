import type { SoloOpponentSnapshot } from '../../src/services/play/solo/savedOpponent'
import { randomUUID } from 'node:crypto'
import { queryRow, withTransaction, type TxClient } from '../db'
import { PtpPlayError } from '../../src/services/play/playState'
import { buildSoloOpponent, type PreparedSolo } from '../../src/services/play/solo/opponent'
import { loadSupport } from '../../src/services/play/native/savedDeck'
import {
  nativeConfig,
  createRuntime,
  verifyRuntimeRevision,
  issueLaunch,
} from '../../src/services/play/native/runtimeClient'
import {
  matchScore,
  nextPairings,
  type SoloMatch,
  type SoloParticipant,
  type SoloResult,
} from '../../src/services/play/solo/progression'
export const parsed = (value: unknown): any =>
  typeof value === 'string' ? JSON.parse(value) : value
export async function ownedRun(runId: string, userId: string) {
  const run = await queryRow('SELECT * FROM ptp_solo_ai_runs WHERE id=$1 AND owner_user_id=$2', [
    runId,
    userId,
  ])
  if (!run) throw new PtpPlayError(404, 'run_not_found', 'Solo run not found.')
  return run
}
export async function initializeSoloEvent(
  run: Record<string, unknown>,
  prepared: PreparedSolo,
  opponent: SoloOpponentSnapshot,
  support: Awaited<ReturnType<typeof loadSupport>>
) {
  await withTransaction(async (tx) => {
    await tx.queryRow('SELECT id FROM ptp_solo_ai_runs WHERE id=$1 FOR UPDATE', [run.id])
    if (
      await tx.queryRow('SELECT id FROM ptp_solo_ai_participants WHERE run_id=$1 LIMIT 1', [run.id])
    )
      return
    const roster = [
      {
        id: 'human',
        seat: prepared.humanSeat ?? 1,
        kind: 'human',
        name: 'You',
        deck: prepared.human,
      },
      ...(prepared.bots ?? [prepared.bot]).map((bot) => ({
        id: bot.participantId,
        seat: prepared.bots ? bot.seat! : 2,
        kind: 'ai',
        name: bot.name,
        deck:
          bot.participantId === prepared.bot.participantId
            ? opponent
            : buildSoloOpponent(String(run.id), { ...prepared, bot }, support),
      })),
    ]
    for (const p of roster)
      await tx.query(
        'INSERT INTO ptp_solo_ai_participants(run_id,id,seat,kind,name,deck) VALUES($1,$2,$3,$4,$5,$6)',
        [run.id, p.id, p.seat, p.kind, p.name, JSON.stringify(p.deck)]
      )
    await advanceSolo(tx, String(run.id))
  })
}
/** Caller holds the run row lock. Scores are derived from unique archived games. */
export async function advanceSolo(tx: TxClient, runId: string) {
  const singleGame =
    parsed(
      (await tx.queryRow('SELECT prepared FROM ptp_solo_ai_runs WHERE id=$1', [runId]))?.prepared
    )?.singleGame === true
  const participants = (await tx.queryRows(
    'SELECT id,seat,kind,name FROM ptp_solo_ai_participants WHERE run_id=$1 ORDER BY seat',
    [runId]
  )) as SoloParticipant[]
  let matches = (await tx.queryRows(
    'SELECT * FROM ptp_solo_ai_matches WHERE run_id=$1 ORDER BY round,ordinal',
    [runId]
  )) as SoloMatch[]
  for (const m of matches.filter((m) => !m.winner)) {
    const games = await tx.queryRows(
      'SELECT id,game_no,result FROM ptp_solo_ai_games WHERE match_id=$1 ORDER BY game_no',
      [m.id]
    )
    if (singleGame) {
      const result = games[0]?.result
      if (result === 'player1' || result === 'player2')
        await tx.query('UPDATE ptp_solo_ai_matches SET winner=$2 WHERE id=$1 AND winner IS NULL', [
          m.id,
          m[result],
        ])
      continue
    }
    const score = matchScore(games.flatMap((g) => (g.result ? [g.result as SoloResult] : [])))
    if (score.winner) {
      m.winner = m[score.winner]
      await tx.query('UPDATE ptp_solo_ai_matches SET winner=$2 WHERE id=$1 AND winner IS NULL', [
        m.id,
        m.winner,
      ])
    } else if (games.length && games.every((g) => g.result) && games.length < 20) {
      await addGame(tx, runId, m, games.length + 1, participants)
    }
  }
  if (singleGame && matches.length) return
  const pairs = nextPairings(participants, matches)
  for (const [ordinal, pair] of pairs.entries()) {
    const m = { id: randomUUID(), ...pair, winner: null }
    await tx.query(
      'INSERT INTO ptp_solo_ai_matches(id,run_id,round,ordinal,player1,player2) VALUES($1,$2,$3,$4,$5,$6)',
      [m.id, runId, m.round, ordinal, m.player1, m.player2]
    )
    await addGame(tx, runId, m, 1, participants)
  }
}
async function addGame(
  tx: TxClient,
  runId: string,
  m: SoloMatch,
  number: number,
  participants: SoloParticipant[]
) {
  const human = participants.some(
    (p) => p.kind === 'human' && (p.id === m.player1 || p.id === m.player2)
  )
  // Preserve the runtime identity of the first locally created solo game.
  const id = human && m.round === 1 && number === 1 ? runId : randomUUID()
  await tx.query(
    'INSERT INTO ptp_solo_ai_games(id,run_id,match_id,game_no,requested) VALUES($1,$2,$3,$4,$5) ON CONFLICT(match_id,game_no) DO NOTHING',
    [id, runId, m.id, number, !human]
  )
}
export async function ensureSoloRuntime(gameId: string) {
  const row = await queryRow(
    `SELECT g.*,r.prepared,p1.deck AS deck1,p1.kind AS kind1,p2.deck AS deck2,p2.kind AS kind2
 FROM ptp_solo_ai_games g JOIN ptp_solo_ai_runs r ON r.id=g.run_id JOIN ptp_solo_ai_matches m ON m.id=g.match_id
 JOIN ptp_solo_ai_participants p1 ON p1.run_id=g.run_id AND p1.id=m.player1
 JOIN ptp_solo_ai_participants p2 ON p2.run_id=g.run_id AND p2.id=m.player2 WHERE g.id=$1`,
    [gameId]
  )
  if (!row || !row.requested)
    throw new PtpPlayError(409, 'game_not_started', 'Start this game from the solo run.')
  const prepared = parsed(row.prepared) as PreparedSolo,
    config = nativeConfig(process.env, true)
  await verifyRuntimeRevision(config, prepared.engineRevision)
  await createRuntime(
    config,
    gameId,
    [parsed(row.deck1), parsed(row.deck2)],
    [row.kind1 === 'ai' ? prepared.aiPolicy : null, row.kind2 === 'ai' ? prepared.aiPolicy : null]
  )
  return row
}
export async function launchSoloGame(runId: string, userId: string, expiresAt: number) {
  const run = await ownedRun(runId, userId)
  const { reconcileSoloGames } = await import('./soloRecords')
  // Also catch completion before the next worker tick when returning immediately.
  await reconcileSoloGames(runId)
  const game = await withTransaction(async (tx) => {
    await tx.queryRow('SELECT id FROM ptp_solo_ai_runs WHERE id=$1 FOR UPDATE', [runId])
    await advanceSolo(tx, runId)
    const row = await tx.queryRow(
      `SELECT g.id FROM ptp_solo_ai_games g JOIN ptp_solo_ai_matches m ON m.id=g.match_id
   WHERE g.run_id=$1 AND m.player1='human' AND m.winner IS NULL AND g.result IS NULL ORDER BY m.round,g.game_no LIMIT 1`,
      [runId]
    )
    if (!row)
      throw new PtpPlayError(
        409,
        'round_not_ready',
        'The match is finished. Return to the solo run for results or the next round.'
      )
    await tx.query('UPDATE ptp_solo_ai_games SET requested=true,next_check_at=NOW() WHERE id=$1', [
      row.id,
    ])
    return row
  })
  await ensureSoloRuntime(String(game.id))
  return {
    ...(await issueLaunch(nativeConfig(process.env, true), String(game.id), userId, 0, expiresAt, {
      isolated: true,
      returnPath: `${parsed(run.prepared)?.singleGame ? '/limited/ai' : '/play/solo'}?pool=${encodeURIComponent(String(run.pool_share_id))}&request=${run.request_id}`,
    })),
    runId,
  }
}

import {soloGameReadySql} from './soloGameGate'
import { soloArchetypeName } from './soloArchetype'
import { getAllCards } from '../../src/utils/cardData'
import { archetypeShortName } from '../../src/utils/archetypeName'
import { loadSupport } from '../../src/services/play/native/savedDeck'
import { nativeConfig } from '../../src/services/play/native/runtimeClient'
import { queryRow, queryRows } from '../db'
import {
  matchScore,
  soloStandings,
  type SoloParticipant,
  type SoloMatch,
  type SoloResult,
} from '../../src/services/play/solo/progression'
import { reconcileSoloGames } from './soloRecords'
export async function soloStatus(userId: string, pool: string, request?: string, eventFormat?: 'elimination' | 'swiss') {
  const run = await queryRow(
    `SELECT id,request_id,pool_share_id,prepared,best_of_three,(SELECT username FROM users WHERE id=owner_user_id) AS owner_name FROM ptp_solo_ai_runs WHERE owner_user_id=$1 AND pool_share_id=$2
 AND ($3::uuid IS NULL OR request_id=$3) AND ($4::text IS NULL OR (COALESCE(prepared->>'singleGame','false') <> 'true' AND COALESCE(prepared->>'eventFormat','swiss')=$4)) ORDER BY created_at DESC LIMIT 1`,
    [userId, pool, request ?? null, eventFormat ?? null]
  )
  if (!run) {
    const source = await queryRow(
      `SELECT p.user_id,p.pool_type,EXISTS(SELECT 1 FROM ptp_native_pool_evidence e WHERE e.source_pool_id=COALESCE(p.parent_pool_id,p.id) AND e.owner_user_id=$2) AS verified FROM card_pools p WHERE p.share_id=$1`,
      [pool, userId]
    )
    const unavailableReason = !source
      ? 'Saved deck not found.'
      : source.user_id === null
        ? 'This pool was opened while signed out. AI play currently requires a pool opened while signed in.'
        : source.user_id !== userId
          ? 'This deck belongs to another account.'
          : source.pool_type === 'sealed' && !source.verified
            ? 'This sealed pool predates AI play support. Open a new sealed pool while signed in to play against AI.'
            : null
    return { run: null, unavailableReason }
  }
  await reconcileSoloGames(String(run.id))
  const participants = (await queryRows(
    'SELECT id,seat,kind,name,deck FROM ptp_solo_ai_participants WHERE run_id=$1 ORDER BY seat',
    [run.id]
  )) as (SoloParticipant & {deck: unknown})[]
  const matches = (await queryRows(
    'SELECT id,round,player1,player2,winner FROM ptp_solo_ai_matches WHERE run_id=$1 ORDER BY round,ordinal',
    [run.id]
  )) as SoloMatch[]
  const games = await queryRows(
    `SELECT g.id,g.match_id,g.game_no,g.requested,g.result,g.error,(${soloGameReadySql('g')}) AS ready_to_run FROM ptp_solo_ai_games g WHERE g.run_id=$1 ORDER BY g.game_no`,
    [run.id]
  )
  const rounds = participants.length === 8 ? 3 : 1,
    round = matches.length ? Math.max(...matches.map((m) => m.round)) : 1
  const singleGame =
    (typeof run.prepared === 'string' ? JSON.parse(run.prepared) : run.prepared)?.singleGame ===
    true && run.best_of_three !== true
  const prepared = typeof run.prepared === 'string' ? JSON.parse(run.prepared) : run.prepared
  const matchBestOf: 1 | 3 = singleGame ? 1 : prepared.matchBestOf === 1 ? 1 : 3
  const support = await loadSupport(nativeConfig(process.env,true).supportPath)
  const cards = new Map<string, ReturnType<typeof getAllCards>[number]>()
  // Canonical normal printing: alternate/promo UUIDs are not always resolvable by SWUAPI.
  for (const card of getAllCards()) {
    const engineId = support.catalog.get(card.id)?.engineId
    if (engineId && (!cards.has(engineId) || Number(card.number) < Number(cards.get(engineId)!.number))) cards.set(engineId,card)
  }
  const standings = soloStandings(participants,matches)
  const players = new Map(await Promise.all(participants.map(async p => {
    const deck = typeof p.deck === 'string' ? JSON.parse(p.deck) : p.deck as any
    const leader = cards.get(deck?.leader), base = cards.get(deck?.base)
    const nickname = leader && base ? await soloArchetypeName(leader.id,base.id,(deck?.deck ?? []).map((c: {id:string}) => cards.get(c.id)?.id).filter((id:unknown): id is string => typeof id === 'string')) : null
    const record = standings.find(s => s.id === p.id)
    return [p.id, {id:p.id,name:p.id==='human'?(prepared.humanName??run.owner_name??p.name):p.name,leaderName:leader?.name??null,leaderSubtitle:leader?.subtitle??null,leaderImageUrl:leader?.imageUrl??null,baseName:base?.name??null,basePlanet:base?.traits?.join(' · ')||null,baseImageUrl:base?.imageUrl??null,archetype:archetypeShortName({archetypeNickname:nickname,leaderName:leader?.name??null,baseAspects:base?.aspects??null,baseHp:Number(base?.hp)||null,baseName:base?.name??null,baseRarity:base?.rarity??null}),wins:record?.wins??0,losses:record?.losses??0}] as const
  })))
  const complete = singleGame
    ? games.some((g) => g.result)
    : matches.length > 0 && round === rounds && matches.every((m) => m.winner)
  const current = games.find(
    (g) =>
      !g.result && matches.some((m) => m.id === g.match_id && m.player1 === 'human' && !m.winner)
  )
  return {
    run: {
      id: String(run.id),
      requestId: String(run.request_id),
      poolShareId: String(run.pool_share_id),
      round,
      rounds,
      complete,
      singleGame,
      matchBestOf,
      eventFormat: (typeof run.prepared === 'string' ? JSON.parse(run.prepared) : run.prepared)?.eventFormat ?? 'swiss',
      eliminated: matches.some(m => (m.player1 === 'human' || m.player2 === 'human') && !!m.winner && m.winner !== 'human'),
      preparing: participants.length === 0,
      currentGame: current
        ? {
            id: String(current.id),
            number: Number(current.game_no),
            started: current.requested === true,
          }
        : null,
      standings: standings.map(s => ({...s,...players.get(s.id),username:players.get(s.id)?.name??s.username,archetype:players.get(s.id)?.archetype??''})),
      matches: matches.map((m) => {
        const list = games.filter((g) => g.match_id === m.id),
          score = matchScore(list.flatMap((g) => (g.result ? [g.result as SoloResult] : [])), matchBestOf)
        return {
          id: m.id,
          round: m.round,
          players: [m.player1, m.player2].map(id => players.get(id)!),
          wins: score.wins,
          winner: m.winner,
          games: list.map((g) => ({
            id: String(g.id),
            number: Number(g.game_no),
            result: g.result as SoloResult | null,
            started: g.requested === true && g.ready_to_run,
            waitingForHuman: !g.result && !g.ready_to_run,
            error: g.error as string | null,
          })),
          stalled: !m.winner && list.length >= 20 && list.every((g) => g.result),
        }
      }),
    },
  }
}
export type SoloStatus = Awaited<ReturnType<typeof soloStatus>>

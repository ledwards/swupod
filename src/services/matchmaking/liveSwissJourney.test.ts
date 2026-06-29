import { after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const TEST_DB_URL =
  process.env['SWUPOD_TEST_DATABASE_URL'] || 'postgresql://localhost:5432/swupod_test'

process.env['DATABASE_URL'] = TEST_DB_URL
process.env['POSTGRES_URL'] = TEST_DB_URL

const db = await import('@/lib/db')
const { query, queryRow, closePool } = db
const {
  claimPracticeMatchGame,
  recordPracticeMatchGameLifecycle,
  recordPracticeMatchGameResult,
  forfeitPracticeMatch,
} = await import('./liveGames')
const { liveRoundMatchGroups } = await import('@/src/components/MatchmakingPanel.helpers')
const { fetchRoundsWithMatches } = await import('@/src/utils/matchmakingRounds')
const { getPracticeSwissSummary } = await import('./practiceSummary')

let dbAvailable = false
try {
  dbAvailable = await db.testConnection()
  if (dbAvailable) {
    const table = await queryRow("SELECT to_regclass('public.practice_match_games') AS table_name")
    dbAvailable = Boolean(table?.table_name)
  }
} catch {
  dbAvailable = false
}

if (!dbAvailable) {
  console.warn(
    `liveSwissJourney.test.ts: test database unavailable or missing practice_match_games at ${TEST_DB_URL} - skipping. ` +
    'Create it with: createdb swupod_test && POSTGRES_URL=postgresql://localhost:5432/swupod_test npx tsx scripts/migrate.ts dev --yes'
  )
}

interface SeededLiveSwissPod {
  podId: string
  shareId: string
  userIds: string[]
  poolShareIds: string[]
  round1Id: string
  matchIds: string[]
}

const seededPods: string[] = []
const seededUsers: string[] = []

after(async () => {
  if (!dbAvailable) return

  for (const podId of seededPods) {
    await query('DELETE FROM pods WHERE id = $1', [podId])
  }
  for (const userId of seededUsers) {
    await query('DELETE FROM users WHERE id = $1', [userId])
  }
  await closePool()
})

describe('live Swiss Practice fake Companion journey', { skip: !dbAvailable }, () => {
  it('serves a Companion-readable Swiss summary for the active practice match', async () => {
    process.env['PTP_SERVICE_KEY'] = process.env['PTP_SERVICE_KEY'] || 'test-service-key-for-unit-tests'
    const seeded = await seedFourPlayerLiveSwissPod()
    const [playerA, , playerC] = seeded.userIds
    const [poolA] = seeded.poolShareIds
    const [matchOne] = seeded.matchIds

    const claim = await claimPracticeMatchGame({
      shareId: seeded.shareId,
      matchId: matchOne!,
      userId: playerA!,
      now: new Date('2026-06-20T18:00:00.000Z'),
    })

    await recordPracticeMatchGameLifecycle({
      practiceMatchGameId: claim.practiceMatchGameId!,
      poolShareId: poolA!,
      status: 'lobby_ready',
      lobbyId: 'karabast-summary-r1m1',
      lobbyUrl: 'https://karabast.example/lobby/summary-r1m1',
      lifecycleIdempotencyKey: `summary-lobby-ready-${claim.practiceMatchGameId}`,
      occurredAt: '2026-06-20T18:01:00.000Z',
    })

    const opponent = await queryRow('SELECT username FROM users WHERE id = $1', [playerC])
    const summary = await getPracticeSwissSummary({
      practiceMatchGameId: claim.practiceMatchGameId,
      poolShareId: poolA,
    })

    assert.equal(summary.status, 'ready')
    assert.equal(summary.currentRound, 1)
    assert.equal(summary.pairing?.opponent, opponent!.username)
    assert.equal(summary.pairing?.status, 'lobby_ready')
    assert.equal(summary.playerRecord, '0-0')
    assert.equal(summary.standings.length, 4)
    assert.equal(summary.unavailableReason, null)

    const { GET } = await import('@/app/api/plugin/v1/practice/swiss-summary/route')
    const res = await GET(
      new Request(`http://localhost/api/plugin/v1/practice/swiss-summary?practiceMatchGameId=${claim.practiceMatchGameId}&poolShareId=${poolA}`, {
        headers: { Authorization: `Bearer ${process.env['PTP_SERVICE_KEY']}` },
      }) as unknown as import('next/server').NextRequest,
    )
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.data.status, 'ready')
    assert.equal(body.data.pairing.opponent, opponent!.username)
  })

  it('claims one lobby, records lifecycle/results, separates completed matches, and advances Swiss pairings', async () => {
    const seeded = await seedFourPlayerLiveSwissPod()
    const [playerA, playerB, playerC, playerD] = seeded.userIds
    const [poolA, poolB, poolC] = seeded.poolShareIds
    const [matchOne, matchTwo] = seeded.matchIds

    const firstClick = await claimPracticeMatchGame({
      shareId: seeded.shareId,
      matchId: matchOne!,
      userId: playerA!,
      now: new Date('2026-06-20T18:00:00.000Z'),
    })
    const opponentClickBeforeLobby = await claimPracticeMatchGame({
      shareId: seeded.shareId,
      matchId: matchOne!,
      userId: playerC!,
      now: new Date('2026-06-20T18:00:01.000Z'),
    })

    assert.equal(firstClick.action, 'create_lobby')
    assert.equal(firstClick.gameNumber, 1)
    assert.equal(firstClick.isNewlyCreated, true)
    assert.equal(opponentClickBeforeLobby.action, 'wait_for_lobby')
    assert.equal(opponentClickBeforeLobby.practiceMatchGameId, firstClick.practiceMatchGameId)

    await recordPracticeMatchGameLifecycle({
      practiceMatchGameId: firstClick.practiceMatchGameId!,
      poolShareId: poolA!,
      status: 'lobby_ready',
      lobbyId: 'karabast-private-r1m1',
      lobbyUrl: 'https://karabast.example/lobby/r1m1',
      spectateUrl: 'https://wayfinder.example/watch/r1m1',
      wayfinderMatchId: 'wf-r1m1',
      lifecycleIdempotencyKey: 'r1m1-lobby-ready',
      occurredAt: '2026-06-20T18:01:00.000Z',
    })

    const opponentClickAfterLobby = await claimPracticeMatchGame({
      shareId: seeded.shareId,
      matchId: matchOne!,
      userId: playerC!,
      now: new Date('2026-06-20T18:02:00.000Z'),
    })

    assert.equal(opponentClickAfterLobby.action, 'join_lobby')
    assert.equal(opponentClickAfterLobby.lobbyUrl, 'https://karabast.example/lobby/r1m1')
    assert.equal(opponentClickAfterLobby.spectateUrl, 'https://wayfinder.example/watch/r1m1')

    await recordPracticeMatchGameLifecycle({
      practiceMatchGameId: firstClick.practiceMatchGameId!,
      poolShareId: poolC!,
      status: 'in_progress',
      wayfinderGameId: 'wf-game-r1m1-g1',
      lifecycleIdempotencyKey: 'r1m1-game-started',
      occurredAt: '2026-06-20T18:03:00.000Z',
    })

    let rounds = await fetchRoundsWithMatches(seeded.podId)
    assert.equal(rounds.length, 1)
    assert.equal(rounds[0]!.matches.find(match => match.id === matchOne)!.currentGame.status, 'in_progress')

    await recordPracticeMatchGameResult({
      poolShareId: poolA!,
      wayfinderMatchId: 'wf-r1m1',
      practiceMatchGameId: firstClick.practiceMatchGameId,
      wayfinderGameId: 'wf-game-r1m1-g1',
      result: 'win',
      replayUrl: 'https://wayfinder.example/replay/r1m1-g1',
      occurredAt: '2026-06-20T18:20:00.000Z',
    })
    await recordPracticeMatchGameResult({
      poolShareId: poolA!,
      wayfinderMatchId: 'wf-r1m1',
      gameNumber: 2,
      wayfinderGameId: 'wf-game-r1m1-g2',
      result: 'win',
      replayUrl: 'https://wayfinder.example/replay/r1m1-g2',
      occurredAt: '2026-06-20T18:40:00.000Z',
    })

    rounds = await fetchRoundsWithMatches(seeded.podId)
    const roundOneAfterMatchOne = rounds.find(round => round.roundNumber === 1)!
    const groups = liveRoundMatchGroups(roundOneAfterMatchOne)
    assert.deepEqual(groups.live.map(match => match.id), [matchTwo])
    assert.deepEqual(groups.completed.map(match => match.id), [matchOne])

    await recordPracticeMatchGameResult({
      poolShareId: poolB!,
      wayfinderMatchId: 'wf-r1m2',
      gameNumber: 1,
      result: 'win',
      replayUrl: 'https://wayfinder.example/replay/r1m2-g1',
    })
    const finalMatch = await recordPracticeMatchGameResult({
      poolShareId: poolB!,
      wayfinderMatchId: 'wf-r1m2',
      gameNumber: 2,
      result: 'win',
      replayUrl: 'https://wayfinder.example/replay/r1m2-g2',
    })

    assert.equal(finalMatch.matchFinalized, true)
    assert.equal(finalMatch.roundAdvanced, true)
    assert.equal(finalMatch.advanceResult?.nextRoundNumber, 2)

    rounds = await fetchRoundsWithMatches(seeded.podId)
    assert.equal(rounds.length, 2)
    assert.equal(rounds.find(round => round.roundNumber === 1)!.status, 'complete')
    assert.equal(rounds.find(round => round.roundNumber === 2)!.status, 'active')

    const pod = await queryRow('SELECT draft_state FROM pods WHERE id = $1', [seeded.podId])
    assert.equal(pod!.draft_state.currentRound, 2)
    assert.equal(pod!.draft_state.matchmakingStatus, 'active')

    const roundTwoPairings = rounds
      .find(round => round.roundNumber === 2)!
      .matches
      .map(match => playerPairKey(match.player1?.id, match.player2?.id))
      .sort()

    assert.deepEqual(roundTwoPairings, [
      playerPairKey(playerA, playerB),
      playerPairKey(playerC, playerD),
    ].sort())
  })

  it('forfeits a Bo3 match on a SET concede: winner = non-conceder regardless of game count, and the match counts toward advancement', async () => {
    const seeded = await seedFourPlayerLiveSwissPod()
    const [playerA, , playerC] = seeded.userIds
    const [poolA, poolB, poolC] = seeded.poolShareIds
    const [matchOne] = seeded.matchIds // player1 = playerA, player2 = playerC

    // Game 1: playerA wins → 1-0 (player1). Not enough for a 2-win finish.
    await recordPracticeMatchGameResult({
      poolShareId: poolA!,
      wayfinderMatchId: 'wf-ff-r1m1',
      gameNumber: 1,
      result: 'win',
      occurredAt: '2026-06-20T18:20:00.000Z',
    })

    let m = await queryRow(
      'SELECT final_confirmed, match_winner, game1_result, game2_result, game3_result FROM practice_matches WHERE id = $1',
      [matchOne],
    )
    assert.equal(m!.final_confirmed, false) // a 1-0 lead does NOT finalize a Bo3

    // playerA (ahead 1-0) concedes the SET. Reported from the OPPONENT pool
    // (playerC), owner POV "win". PTP forfeit-finalizes: playerC wins the match.
    const forfeited = await forfeitPracticeMatch({
      poolShareId: poolC!,
      result: 'win',
      wayfinderMatchId: 'wf-ff-r1m1',
    })
    assert.equal(forfeited.changed, true)
    assert.equal(forfeited.alreadyFinalized, false)
    assert.equal(forfeited.matchWinner, 'player2') // playerC is player2 in matchOne

    m = await queryRow(
      'SELECT final_confirmed, match_winner, player1_id, player2_id, game1_result, game2_result, game3_result FROM practice_matches WHERE id = $1',
      [matchOne],
    )
    assert.equal(m!.final_confirmed, true)
    // Winner is the NON-conceder (playerC), despite the 1-0 game tally favoring playerA.
    assert.equal(m!.match_winner === 'player1' ? m!.player1_id : m!.player2_id, playerC)
    // Per-game slots are NOT fabricated — only the one real game stays recorded.
    assert.equal(m!.game2_result, null)
    assert.equal(m!.game3_result, null)

    // Idempotent: the real-time report + the ingestion reaffirmation both fire.
    const again = await forfeitPracticeMatch({ poolShareId: poolA!, result: 'loss', wayfinderMatchId: 'wf-ff-r1m1' })
    assert.equal(again.alreadyFinalized, true)
    assert.equal(again.changed, false)

    // Pool W/L: winner +1 win, conceder +1 loss (deduped on wayfinderMatchId).
    const winPool = await queryRow('SELECT wins, losses FROM card_pools WHERE share_id = $1', [poolC])
    assert.equal(Number(winPool!.wins), 1)
    assert.equal(Number(winPool!.losses), 0)
    const losePool = await queryRow('SELECT wins, losses FROM card_pools WHERE share_id = $1', [poolA])
    assert.equal(Number(losePool!.wins), 0)
    assert.equal(Number(losePool!.losses), 1)

    // Completing the OTHER match now advances the round — proving the
    // forfeited match counts as complete for advancement.
    await recordPracticeMatchGameResult({ poolShareId: poolB!, wayfinderMatchId: 'wf-ff-r1m2', gameNumber: 1, result: 'win' })
    const final = await recordPracticeMatchGameResult({ poolShareId: poolB!, wayfinderMatchId: 'wf-ff-r1m2', gameNumber: 2, result: 'win' })
    assert.equal(final.matchFinalized, true)
    assert.equal(final.roundAdvanced, true)
    assert.equal(final.advanceResult?.nextRoundNumber, 2)
  })

  it('POST /api/plugin/v1/match/result with matchForfeit finalizes the match (route → forfeit → DB), no gameNumber required', async () => {
    process.env['PTP_SERVICE_KEY'] = process.env['PTP_SERVICE_KEY'] || 'test-service-key-for-unit-tests'
    const { POST } = await import('@/app/api/plugin/v1/match/result/route')

    const seeded = await seedFourPlayerLiveSwissPod()
    const [playerA, , playerC] = seeded.userIds
    const [poolA, , poolC] = seeded.poolShareIds
    const [matchOne] = seeded.matchIds // player1 = playerA, player2 = playerC

    // Game 1: playerA wins → 1-0, match not yet finalized.
    await recordPracticeMatchGameResult({
      poolShareId: poolA!,
      wayfinderMatchId: 'wf-route-ff',
      gameNumber: 1,
      result: 'win',
    })

    // playerA concedes the SET. The opponent (playerC) reports the forfeit win
    // via the real route — match-grained, NO gameNumber in the body.
    const res = await POST(
      new Request('http://localhost/api/plugin/v1/match/result', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env['PTP_SERVICE_KEY']}`,
        },
        body: JSON.stringify({
          poolShareId: poolC,
          result: 'win',
          matchId: 'wf-route-ff',
          matchForfeit: true,
        }),
      }) as unknown as import('next/server').NextRequest,
    )

    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.data.forfeit, true)
    assert.equal(body.data.matchWinner, 'player2') // playerC won by forfeit

    const m = await queryRow(
      'SELECT final_confirmed, match_winner, player1_id, player2_id FROM practice_matches WHERE id = $1',
      [matchOne],
    )
    assert.equal(m!.final_confirmed, true)
    assert.equal(m!.match_winner === 'player1' ? m!.player1_id : m!.player2_id, playerC)
    // playerA (the conceder) is NOT the winner despite leading 1-0.
    assert.notEqual(m!.match_winner === 'player1' ? m!.player1_id : m!.player2_id, playerA)
  })

  it('records a Bo3 game 2 reported against game 1\'s ANCHOR + gameNumber=2 (does not collapse onto game 1)', async () => {
    // SPEC: the Companion only ever claims game 1 of a single-lobby Bo3, then
    // reports games 2/3 against that SAME practiceMatchGameId with an incremented
    // gameNumber. The result must land on game 2's slot — not silently re-record
    // game 1 (the old bug, which 409'd or no-op'd and never finished the match).
    const seeded = await seedFourPlayerLiveSwissPod()
    const [playerA] = seeded.userIds
    const [poolA] = seeded.poolShareIds
    const [matchOne] = seeded.matchIds

    const click = await claimPracticeMatchGame({
      shareId: seeded.shareId,
      matchId: matchOne!,
      userId: playerA!,
      now: new Date('2026-06-21T18:00:00.000Z'),
    })
    const anchor = click.practiceMatchGameId!

    await recordPracticeMatchGameResult({
      poolShareId: poolA!,
      wayfinderMatchId: 'wf-anchor-bo3',
      practiceMatchGameId: anchor,
      gameNumber: 1,
      result: 'win',
    })
    // Game 2 reported against game 1's anchor — the real Companion pattern.
    const afterGame2 = await recordPracticeMatchGameResult({
      poolShareId: poolA!,
      wayfinderMatchId: 'wf-anchor-bo3',
      practiceMatchGameId: anchor,
      gameNumber: 2,
      result: 'win',
    })

    assert.equal(afterGame2.gameNumber, 2, 'result resolves to game 2, not the anchor row\'s game 1')
    assert.equal(afterGame2.matchFinalized, true, '2-0 finishes the match')

    const rounds = await fetchRoundsWithMatches(seeded.podId)
    const match = rounds.flatMap(r => r.matches).find(x => x.id === matchOne)!
    assert.notEqual(match.game2Result, null, 'game 2 slot is recorded')
    assert.equal(match.game2Result, match.game1Result, 'same player won both games')
    assert.notEqual(match.matchWinner, null, 'match has a winner')
  })

  it('BOTH players reporting the SAME game 1 records it once — no phantom 2-0', async () => {
    // The double-report bug: when both players have the Companion they each report
    // game 1. They carry the SAME claim anchor (practiceMatchGameId) but DIFFERENT
    // per-player wayfinderMatchIds. Before the fix the divergent fallback key let
    // the second report slip the dedup and get redirected onto game 2 — recording
    // one real game as a phantom 2-0 sweep. Now both converge on the anchor+slot.
    const seeded = await seedFourPlayerLiveSwissPod()
    const [playerA] = seeded.userIds
    const [poolA, , poolC] = seeded.poolShareIds // matchOne pairs playerA vs playerC
    const [matchOne] = seeded.matchIds

    const click = await claimPracticeMatchGame({
      shareId: seeded.shareId,
      matchId: matchOne!,
      userId: playerA!,
      now: new Date('2026-06-22T18:00:00.000Z'),
    })
    const anchor = click.practiceMatchGameId!

    // Player A's Companion reports game 1 (A won).
    const first = await recordPracticeMatchGameResult({
      poolShareId: poolA!,
      wayfinderMatchId: 'wf-a-side',
      practiceMatchGameId: anchor,
      gameNumber: 1,
      result: 'win',
    })
    // Player C's Companion reports the SAME game 1 (C lost) — own match id.
    const second = await recordPracticeMatchGameResult({
      poolShareId: poolC!,
      wayfinderMatchId: 'wf-c-side',
      practiceMatchGameId: anchor,
      gameNumber: 1,
      result: 'loss',
    })

    assert.equal(first.duplicate ?? false, false, 'first report records the game')
    assert.equal(second.duplicate, true, 'second player\'s report is deduped, not a new game')
    assert.equal(second.matchFinalized ?? false, false, 'a single game must not finish a Bo3')

    const rounds = await fetchRoundsWithMatches(seeded.podId)
    const match = rounds.flatMap(r => r.matches).find(x => x.id === matchOne)!
    assert.notEqual(match.game1Result, null, 'game 1 is recorded')
    assert.equal(match.game2Result, null, 'NO phantom game 2 was invented')
    assert.equal(match.matchWinner, null, 'the match is still 1-0, not won')
  })

  it('a duplicate report backfills a replay the first report lacked', async () => {
    // The replay link often is not ready when the result is first captured, so it
    // arrives on the OTHER player's slightly-later (duplicate) report. That report
    // must not re-count the game, but it MUST contribute the replay URL.
    const seeded = await seedFourPlayerLiveSwissPod()
    const [playerA] = seeded.userIds
    const [poolA, , poolC] = seeded.poolShareIds
    const [matchOne] = seeded.matchIds

    const click = await claimPracticeMatchGame({
      shareId: seeded.shareId,
      matchId: matchOne!,
      userId: playerA!,
      now: new Date('2026-06-23T18:00:00.000Z'),
    })
    const anchor = click.practiceMatchGameId!

    // Player A reports game 1 — the Karabast replay link isn't ready yet.
    await recordPracticeMatchGameResult({
      poolShareId: poolA!,
      wayfinderMatchId: 'wf-a-noreplay',
      practiceMatchGameId: anchor,
      gameNumber: 1,
      result: 'win',
    })
    let match = (await fetchRoundsWithMatches(seeded.podId)).flatMap(r => r.matches).find(x => x.id === matchOne)!
    assert.equal(match.games.find(g => g.gameNumber === 1)!.replayUrl, null, 'no replay captured yet')

    // Player C reports the SAME game 1 a moment later, now with the replay URL.
    const second = await recordPracticeMatchGameResult({
      poolShareId: poolC!,
      wayfinderMatchId: 'wf-c-withreplay',
      practiceMatchGameId: anchor,
      gameNumber: 1,
      result: 'loss',
      replayUrl: 'https://karabast.net/replay/round1-game1',
    })
    assert.equal(second.duplicate, true, 'still deduped — not a new game')

    match = (await fetchRoundsWithMatches(seeded.podId)).flatMap(r => r.matches).find(x => x.id === matchOne)!
    assert.equal(
      match.games.find(g => g.gameNumber === 1)!.replayUrl,
      'https://karabast.net/replay/round1-game1',
      'the replay from the duplicate report is backfilled onto game 1'
    )
    assert.equal(match.game2Result, null, 'still no phantom game 2')
  })
})

async function seedFourPlayerLiveSwissPod(): Promise<SeededLiveSwissPod> {
  const suffix = randomUUID().slice(0, 8)
  const userIds: string[] = []
  const poolShareIds: string[] = []

  for (let i = 0; i < 4; i++) {
    const user = await queryRow(
      `INSERT INTO users (username, email, is_beta_tester)
       VALUES ($1, $2, true)
       RETURNING id`,
      [`live-swiss-${suffix}-${i}`, `live-swiss-${suffix}-${i}@example.test`]
    )
    userIds.push(user!.id as string)
    seededUsers.push(user!.id as string)
  }

  const shareId = `live-swiss-${suffix}`
  const pod = await queryRow(
    `INSERT INTO pods (
       share_id,
       host_id,
       set_code,
       status,
       draft_state,
       state_version,
       max_players,
       current_players,
       competitive
     )
     VALUES ($1, $2, 'TST', 'active', $3, 1, 4, 4, true)
     RETURNING id`,
    [
      shareId,
      userIds[0],
      JSON.stringify({
        phase: 'matchmaking',
        matchmakingStatus: 'active',
        currentRound: 1,
      }),
    ]
  )
  const podId = pod!.id as string
  seededPods.push(podId)

  for (let i = 0; i < 4; i++) {
    const poolShareId = `live-swiss-pool-${suffix}-${i}`
    await query(
      `INSERT INTO card_pools (user_id, share_id, set_code, pool_type, cards, deck_builder_state, pod_id)
       VALUES ($1, $2, 'TST', 'draft', '[]', $3, $4)`,
      [
        userIds[i],
        poolShareId,
        JSON.stringify({
          cardPositions: {},
          poolName: `Live Swiss Test Deck ${i + 1}`,
        }),
        podId,
      ]
    )
    poolShareIds.push(poolShareId)
  }

  for (let seat = 0; seat < 4; seat++) {
    await query(
      `INSERT INTO pod_players (
         pod_id,
         user_id,
         seat_number,
         pick_status,
         is_bot,
         leaders,
         drafted_leaders,
         drafted_cards,
         current_pack
       )
       VALUES ($1, $2, $3, 'done', false, '[]', '[]', '[]', '[]')`,
      [podId, userIds[seat], seat + 1]
    )
  }

  const round = await queryRow(
    `INSERT INTO practice_rounds (pod_id, round_number, status)
     VALUES ($1, 1, 'active')
     RETURNING id`,
    [podId]
  )
  const round1Id = round!.id as string

  const matchOne = await insertPracticeMatch(round1Id, podId, userIds[0]!, userIds[2]!)
  const matchTwo = await insertPracticeMatch(round1Id, podId, userIds[1]!, userIds[3]!)

  return {
    podId,
    shareId,
    userIds,
    poolShareIds,
    round1Id,
    matchIds: [matchOne, matchTwo],
  }
}

async function insertPracticeMatch(
  roundId: string,
  podId: string,
  player1Id: string,
  player2Id: string
): Promise<string> {
  const match = await queryRow(
    `INSERT INTO practice_matches (
       round_id,
       pod_id,
       player1_id,
       player2_id,
       is_bye,
       final_confirmed,
       created_at
     )
     VALUES ($1, $2, $3, $4, false, false, NOW())
     RETURNING id`,
    [roundId, podId, player1Id, player2Id]
  )

  return match!.id as string
}

function playerPairKey(player1Id?: string | null, player2Id?: string | null): string {
  return [player1Id, player2Id].filter(Boolean).sort().join(':')
}

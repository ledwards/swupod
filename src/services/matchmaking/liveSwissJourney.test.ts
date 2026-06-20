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
} = await import('./liveGames')
const { liveRoundMatchGroups } = await import('@/src/components/MatchmakingPanel.helpers')
const { fetchRoundsWithMatches } = await import('@/src/utils/matchmakingRounds')

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

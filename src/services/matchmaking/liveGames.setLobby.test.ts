// DB-backed tests for the Swiss Practice "set lobby link" recovery path. These
// skip when the local test database is unavailable or has not run migrations.
import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const TEST_DB_URL =
  process.env['SWUPOD_TEST_DATABASE_URL'] || 'postgresql://localhost:5432/swupod_test'

process.env['DATABASE_URL'] = TEST_DB_URL
process.env['POSTGRES_URL'] = TEST_DB_URL

const VALID_LOBBY_URL = 'https://karabast.net/lobby?lobbyId=11111111-2222-3333-4444-555555555555'
const VALID_LOBBY_URL_2 = 'https://karabast.net/lobby?lobbyId=99999999-8888-7777-6666-555555555555'

const db = await import('@/lib/db')
const { query, queryRows, closePool } = db
const {
  claimPracticeMatchGame,
  setPracticeMatchGameLobby,
  summarizeCurrentPracticeGame,
  normalizePracticeMatchGameRow,
  PracticeGameClaimError,
} = await import('./liveGames')

let dbAvailable = false
try {
  dbAvailable = await db.testConnection()
  if (dbAvailable) {
    const table = await db.queryRow("SELECT to_regclass('public.practice_match_games') AS table_name")
    dbAvailable = Boolean(table?.table_name)
  }
} catch {
  dbAvailable = false
}

if (!dbAvailable) {
  console.warn(
    `liveGames.setLobby.test.ts: test database unavailable or missing practice_match_games at ${TEST_DB_URL} - skipping. ` +
    'Create it with: createdb swupod_test && POSTGRES_URL=postgresql://localhost:5432/swupod_test npx tsx scripts/migrate.ts dev --yes'
  )
}

interface SeededMatch {
  podId: string
  shareId: string
  roundId: string
  matchId: string
  userIds: string[]
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

async function seedActiveSwissMatch(): Promise<SeededMatch> {
  const suffix = randomUUID().slice(0, 8)
  const userIds: string[] = []

  for (let i = 0; i < 3; i++) {
    const user = await db.queryRow(
      `INSERT INTO users (username, email)
       VALUES ($1, $2)
       RETURNING id`,
      [`live-setlobby-${suffix}-${i}`, `live-setlobby-${suffix}-${i}@example.test`]
    )
    userIds.push(user!.id as string)
    seededUsers.push(user!.id as string)
  }

  const shareId = `live-setlobby-${suffix}`
  const draftState = { phase: 'matchmaking', matchmakingStatus: 'active', currentRound: 1 }
  const pod = await db.queryRow(
    `INSERT INTO pods (
       share_id, host_id, set_code, status, draft_state,
       state_version, max_players, current_players, competitive
     )
     VALUES ($1, $2, 'TST', 'active', $3, 1, 2, 2, true)
     RETURNING id`,
    [shareId, userIds[0], JSON.stringify(draftState)]
  )
  const podId = pod!.id as string
  seededPods.push(podId)

  for (let i = 0; i < 2; i++) {
    await query(
      `INSERT INTO card_pools (user_id, share_id, set_code, cards, pod_id)
       VALUES ($1, $2, 'TST', '[]', $3)`,
      [userIds[i], `live-setlobby-pool-${suffix}-${i}`, podId]
    )
  }

  for (let seat = 0; seat < 2; seat++) {
    await query(
      `INSERT INTO pod_players (
         pod_id, user_id, seat_number, pick_status, is_bot,
         leaders, drafted_leaders, drafted_cards, current_pack
       )
       VALUES ($1, $2, $3, 'done', false, '[]', '[]', '[]', '[]')`,
      [podId, userIds[seat], seat + 1]
    )
  }

  const round = await db.queryRow(
    `INSERT INTO practice_rounds (pod_id, round_number, status)
     VALUES ($1, 1, 'active')
     RETURNING id`,
    [podId]
  )
  const roundId = round!.id as string

  const matchRow = await db.queryRow(
    `INSERT INTO practice_matches (round_id, pod_id, player1_id, player2_id, is_bye, final_confirmed)
     VALUES ($1, $2, $3, $4, false, false)
     RETURNING id`,
    [roundId, podId, userIds[0], userIds[1]]
  )

  return { podId, shareId, roundId, matchId: matchRow!.id as string, userIds }
}

async function gamesForMatch(matchId: string) {
  return (await queryRows(
    `SELECT * FROM practice_match_games WHERE match_id = $1 ORDER BY game_number, attempt_number`,
    [matchId]
  )).map(normalizePracticeMatchGameRow)
}

describe('setPracticeMatchGameLobby', { skip: !dbAvailable }, () => {
  it('creates a lobby_ready attempt that summarizeCurrentPracticeGame returns as canonical', async () => {
    const seeded = await seedActiveSwissMatch()

    const result = await setPracticeMatchGameLobby({
      shareId: seeded.shareId,
      matchId: seeded.matchId,
      userId: seeded.userIds[0],
      lobbyUrl: VALID_LOBBY_URL,
    })

    assert.equal(result.status, 'lobby_ready')
    assert.equal(result.gameNumber, 1)
    assert.equal(result.lobbyUrl, VALID_LOBBY_URL)
    assert.equal(result.isNewlyCreated, true)
    // liveGameAction turns a lobby_ready game WITH a lobbyUrl into a join link.
    assert.equal(result.action, 'join_lobby')

    const games = await gamesForMatch(seeded.matchId)
    const summary = summarizeCurrentPracticeGame({}, games)
    assert.equal(summary.status, 'lobby_ready')
    assert.equal(summary.gameNumber, 1)
    assert.equal(summary.lobbyUrl, VALID_LOBBY_URL)
    assert.equal(summary.game?.createdByUserId, seeded.userIds[0])
  })

  it('newest-wins: a second submission supersedes the first as canonical', async () => {
    const seeded = await seedActiveSwissMatch()

    const first = await setPracticeMatchGameLobby({
      shareId: seeded.shareId,
      matchId: seeded.matchId,
      userId: seeded.userIds[0],
      lobbyUrl: VALID_LOBBY_URL,
    })
    const second = await setPracticeMatchGameLobby({
      shareId: seeded.shareId,
      matchId: seeded.matchId,
      userId: seeded.userIds[1],
      lobbyUrl: VALID_LOBBY_URL_2,
    })

    assert.equal(second.attemptNumber, (first.attemptNumber ?? 1) + 1)
    assert.notEqual(second.practiceMatchGameId, first.practiceMatchGameId)
    assert.equal(second.status, 'lobby_ready')

    const games = await gamesForMatch(seeded.matchId)
    assert.equal(games.length, 2)
    // The first attempt is voided so the newest can take the active slot; the
    // newest lobby_ready attempt is canonical via officialGameForNumber.
    const firstRow = games.find(g => g.id === first.practiceMatchGameId)
    assert.equal(firstRow?.status, 'voided')
    const summary = summarizeCurrentPracticeGame({}, games)
    assert.equal(summary.status, 'lobby_ready')
    assert.equal(summary.lobbyUrl, VALID_LOBBY_URL_2)
    assert.equal(summary.game?.id, second.practiceMatchGameId)
  })

  it('supersedes an in-flight auto-create (creating) attempt with a pasted lobby', async () => {
    const seeded = await seedActiveSwissMatch()

    const claim = await claimPracticeMatchGame({
      shareId: seeded.shareId,
      matchId: seeded.matchId,
      userId: seeded.userIds[0],
    })
    assert.equal(claim.status, 'creating')

    const pasted = await setPracticeMatchGameLobby({
      shareId: seeded.shareId,
      matchId: seeded.matchId,
      userId: seeded.userIds[1],
      lobbyUrl: VALID_LOBBY_URL,
    })

    assert.equal(pasted.status, 'lobby_ready')
    assert.equal(pasted.attemptNumber, 2)

    const games = await gamesForMatch(seeded.matchId)
    const claimRow = games.find(g => g.id === claim.practiceMatchGameId)
    assert.equal(claimRow?.status, 'voided')
    // lobby_ready (rank 2) outranks the voided creating row, so the pasted
    // lobby is canonical and gives both players a join link.
    const summary = summarizeCurrentPracticeGame({}, games)
    assert.equal(summary.status, 'lobby_ready')
    assert.equal(summary.lobbyUrl, VALID_LOBBY_URL)
  })

  it('recovers a previously failed game by opening a fresh lobby_ready attempt', async () => {
    const seeded = await seedActiveSwissMatch()

    const claim = await claimPracticeMatchGame({
      shareId: seeded.shareId,
      matchId: seeded.matchId,
      userId: seeded.userIds[0],
    })
    await query(
      `UPDATE practice_match_games SET status = 'failed', failed_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [claim.practiceMatchGameId]
    )

    const recovered = await setPracticeMatchGameLobby({
      shareId: seeded.shareId,
      matchId: seeded.matchId,
      userId: seeded.userIds[1],
      lobbyUrl: VALID_LOBBY_URL,
    })

    assert.equal(recovered.status, 'lobby_ready')
    assert.equal(recovered.gameNumber, 1)
    assert.equal(recovered.attemptNumber, 2)

    const games = await gamesForMatch(seeded.matchId)
    // Failed attempts are filtered out of the official selection; the new
    // lobby_ready attempt is canonical.
    const summary = summarizeCurrentPracticeGame({}, games)
    assert.equal(summary.status, 'lobby_ready')
    assert.equal(summary.lobbyUrl, VALID_LOBBY_URL)
  })

  it('rejects setting a lobby on an in_progress game', async () => {
    const seeded = await seedActiveSwissMatch()
    const claim = await claimPracticeMatchGame({
      shareId: seeded.shareId,
      matchId: seeded.matchId,
      userId: seeded.userIds[0],
    })
    await query(
      `UPDATE practice_match_games SET status = 'in_progress', started_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [claim.practiceMatchGameId]
    )

    await assert.rejects(
      setPracticeMatchGameLobby({
        shareId: seeded.shareId,
        matchId: seeded.matchId,
        userId: seeded.userIds[1],
        lobbyUrl: VALID_LOBBY_URL,
      }),
      (error: unknown) =>
        error instanceof PracticeGameClaimError &&
        error.status === 409 &&
        error.code === 'game_in_progress'
    )
  })

  it('rejects setting a lobby on the current complete game before its result is mirrored', async () => {
    // A game row that is complete for the *currently needed* game number (its
    // result not yet mirrored to the match aggregate) must not be hijacked.
    const seeded = await seedActiveSwissMatch()
    const claim = await claimPracticeMatchGame({
      shareId: seeded.shareId,
      matchId: seeded.matchId,
      userId: seeded.userIds[0],
    })
    await query(
      `UPDATE practice_match_games SET status = 'complete', completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [claim.practiceMatchGameId]
    )

    await assert.rejects(
      setPracticeMatchGameLobby({
        shareId: seeded.shareId,
        matchId: seeded.matchId,
        userId: seeded.userIds[1],
        lobbyUrl: VALID_LOBBY_URL,
      }),
      (error: unknown) =>
        error instanceof PracticeGameClaimError &&
        error.status === 409 &&
        error.code === 'game_in_progress'
    )
  })

  it('rejects setting a lobby once the match is already decided', async () => {
    const seeded = await seedActiveSwissMatch()
    // Mirror two wins to the aggregate so the match is decided (no game needed).
    await query(
      `UPDATE practice_matches SET game1_result = 'player1', game2_result = 'player1' WHERE id = $1`,
      [seeded.matchId]
    )

    await assert.rejects(
      setPracticeMatchGameLobby({
        shareId: seeded.shareId,
        matchId: seeded.matchId,
        userId: seeded.userIds[0],
        lobbyUrl: VALID_LOBBY_URL,
      }),
      (error: unknown) =>
        error instanceof PracticeGameClaimError &&
        error.status === 409 &&
        error.code === 'match_already_decided'
    )
  })

  it('rejects an invalid lobby URL before touching the match', async () => {
    const seeded = await seedActiveSwissMatch()

    await assert.rejects(
      setPracticeMatchGameLobby({
        shareId: seeded.shareId,
        matchId: seeded.matchId,
        userId: seeded.userIds[0],
        lobbyUrl: 'https://example.com/not-a-karabast-lobby',
      }),
      (error: unknown) =>
        error instanceof PracticeGameClaimError &&
        error.status === 400 &&
        error.code === 'invalid_lobby_url'
    )

    assert.equal((await gamesForMatch(seeded.matchId)).length, 0)
  })

  it('rejects callers who are not match participants', async () => {
    const seeded = await seedActiveSwissMatch()

    await assert.rejects(
      setPracticeMatchGameLobby({
        shareId: seeded.shareId,
        matchId: seeded.matchId,
        userId: seeded.userIds[2],
        lobbyUrl: VALID_LOBBY_URL,
      }),
      (error: unknown) =>
        error instanceof PracticeGameClaimError &&
        error.status === 403 &&
        error.code === 'not_participant'
    )
  })
})

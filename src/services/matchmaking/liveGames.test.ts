import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  assertPracticeGameStatusTransition,
  canTransitionPracticeGameStatus,
  completedResultsByGameNumber,
  elapsedPracticeGameSeconds,
  formatElapsedPracticeGame,
  isRetryablePracticeGame,
  isStalePracticeGame,
  latestAttemptForGameNumber,
  mirrorCompletedGameToAggregate,
  nextAttemptNumber,
  nextNeededGameNumber,
  officialGameForNumber,
  resultFromReporterPerspective,
  resultColumnForGameNumber,
  summarizeCurrentPracticeGame,
  type PracticeMatchAggregateLike,
  type PracticeMatchGameLike,
} from './liveGames'

const match = (overrides: PracticeMatchAggregateLike = {}): PracticeMatchAggregateLike => ({
  isBye: false,
  finalConfirmed: false,
  matchWinner: null,
  game1Result: null,
  game2Result: null,
  game3Result: null,
  ...overrides,
})

const game = (overrides: Partial<PracticeMatchGameLike>): PracticeMatchGameLike => ({
  id: overrides.id ?? `game-${overrides.gameNumber ?? 1}-${overrides.attemptNumber ?? 1}`,
  gameNumber: overrides.gameNumber ?? 1,
  attemptNumber: overrides.attemptNumber ?? 1,
  status: overrides.status ?? 'creating',
  result: overrides.result ?? null,
  replayUrl: overrides.replayUrl ?? null,
  lobbyUrl: overrides.lobbyUrl ?? null,
  spectateUrl: overrides.spectateUrl ?? null,
  claimedAt: overrides.claimedAt ?? null,
  startedAt: overrides.startedAt ?? null,
  completedAt: overrides.completedAt ?? null,
  createdAt: overrides.createdAt ?? null,
  updatedAt: overrides.updatedAt ?? null,
  failureReason: overrides.failureReason ?? null,
})

describe('live Swiss Practice game helpers', () => {
  it('computes the next needed Bo3 game from aggregate results', () => {
    assert.equal(nextNeededGameNumber(match()), 1)
    assert.equal(nextNeededGameNumber(match({ game1Result: 'player1' })), 2)
    assert.equal(nextNeededGameNumber(match({ game1Result: 'player1', game2Result: 'player1' })), null)
    assert.equal(nextNeededGameNumber(match({ game1Result: 'player1', game2Result: 'player2' })), 3)
    assert.equal(nextNeededGameNumber(match({ game1Result: 'draw', game2Result: 'draw' })), 3)
    assert.equal(nextNeededGameNumber(match({ game1Result: 'draw', game2Result: 'draw', game3Result: 'draw' })), null)
    assert.equal(nextNeededGameNumber(match({ finalConfirmed: true })), null)
    assert.equal(nextNeededGameNumber(match({ isBye: true })), null)
  })

  it('lets completed per-game rows override the compatibility aggregate', () => {
    const games = [
      game({ gameNumber: 1, status: 'complete', result: 'player2', replayUrl: 'https://wf.example/replay/one' }),
      game({ gameNumber: 2, status: 'complete', result: 'player2', replayUrl: 'https://wf.example/replay/two' }),
    ]

    assert.deepEqual(completedResultsByGameNumber(match({ game1Result: 'player1' }), games), {
      game1: 'player2',
      game2: 'player2',
      game3: null,
    })
    assert.equal(nextNeededGameNumber(match({ game1Result: 'player1' }), games), null)
    assert.equal(officialGameForNumber(games, 1)?.replayUrl, 'https://wf.example/replay/one')
    assert.equal(officialGameForNumber(games, 2)?.replayUrl, 'https://wf.example/replay/two')
  })

  it('mirrors a completed game row to the matching aggregate result column', () => {
    const mirrored = mirrorCompletedGameToAggregate(
      match({ game1Result: 'player1' }),
      game({ gameNumber: 2, status: 'complete', result: 'player2' })
    )

    assert.deepEqual(mirrored, {
      isBye: false,
      finalConfirmed: false,
      matchWinner: null,
      game1Result: 'player1',
      game2Result: 'player2',
      game3Result: null,
    })
    assert.equal(resultColumnForGameNumber(3), 'game3Result')
    assert.throws(() => resultColumnForGameNumber(4), /Unsupported Swiss Practice game number/)
  })

  it('rejects illegal lifecycle transitions while allowing idempotent repeats', () => {
    assert.equal(canTransitionPracticeGameStatus('pending', 'creating'), true)
    assert.equal(canTransitionPracticeGameStatus('creating', 'lobby_ready'), true)
    assert.equal(canTransitionPracticeGameStatus('lobby_ready', 'in_progress'), true)
    assert.equal(canTransitionPracticeGameStatus('in_progress', 'complete'), true)
    assert.equal(canTransitionPracticeGameStatus('complete', 'complete'), true)
    assert.equal(canTransitionPracticeGameStatus('complete', 'in_progress'), false)
    assert.equal(canTransitionPracticeGameStatus('failed', 'complete'), false)

    assert.doesNotThrow(() => assertPracticeGameStatusTransition('creating', 'complete'))
    assert.throws(
      () => assertPracticeGameStatusTransition('failed', 'complete'),
      /Illegal Swiss Practice game transition/
    )
  })

  it('detects stale creating/lobby rows as retryable without deleting attempt history', () => {
    const now = new Date('2026-06-19T19:30:00.000Z')
    const staleCreating = game({
      gameNumber: 1,
      attemptNumber: 1,
      status: 'creating',
      claimedAt: '2026-06-19T19:00:00.000Z',
    })
    const freshCreating = game({
      gameNumber: 1,
      attemptNumber: 2,
      status: 'creating',
      claimedAt: '2026-06-19T19:29:00.000Z',
    })

    assert.equal(isStalePracticeGame(staleCreating, { now, staleAfterMs: 15 * 60 * 1000 }), true)
    assert.equal(isRetryablePracticeGame(staleCreating, { now, staleAfterMs: 15 * 60 * 1000 }), true)
    assert.equal(isStalePracticeGame(freshCreating, { now, staleAfterMs: 15 * 60 * 1000 }), false)
    assert.equal(isRetryablePracticeGame(game({ gameNumber: 1, attemptNumber: 3, status: 'failed' })), true)
    assert.equal(nextAttemptNumber([staleCreating, freshCreating], 1), 3)
    assert.equal(latestAttemptForGameNumber([staleCreating, freshCreating], 1)?.attemptNumber, 2)
  })

  it('summarizes pending, active, failed, and complete states for the live UI', () => {
    const now = new Date('2026-06-19T20:20:00.000Z')
    const inProgress = game({
      gameNumber: 1,
      status: 'in_progress',
      lobbyUrl: 'https://karabast.example/lobby/abc',
      spectateUrl: 'https://wayfinder.example/watch/abc',
      startedAt: '2026-06-19T20:05:00.000Z',
    })
    const failed = game({ gameNumber: 2, status: 'failed', attemptNumber: 1, failureReason: 'Karabast did not open' })

    assert.equal(summarizeCurrentPracticeGame(match()).status, 'pending')

    const active = summarizeCurrentPracticeGame(match(), [inProgress], { now })
    assert.equal(active.status, 'in_progress')
    assert.equal(active.gameNumber, 1)
    assert.equal(active.lobbyUrl, 'https://karabast.example/lobby/abc')
    assert.equal(active.spectateUrl, 'https://wayfinder.example/watch/abc')
    assert.equal(active.elapsedSeconds, 15 * 60)

    const failedSummary = summarizeCurrentPracticeGame(match({ game1Result: 'player1' }), [failed], { now })
    assert.equal(failedSummary.status, 'failed')
    assert.equal(failedSummary.gameNumber, 2)
    assert.equal(failedSummary.retryable, true)

    const completeSummary = summarizeCurrentPracticeGame(match({ game1Result: 'player1', game2Result: 'player1' }))
    assert.equal(completeSummary.status, 'complete')
    assert.equal(completeSummary.gameNumber, null)
  })

  it('formats elapsed in-progress time from started_at timestamps', () => {
    const activeGame = game({
      gameNumber: 1,
      status: 'in_progress',
      startedAt: '2026-06-19T20:00:30.000Z',
    })

    assert.equal(elapsedPracticeGameSeconds(activeGame, new Date('2026-06-19T20:00:10.000Z')), 0)
    assert.equal(elapsedPracticeGameSeconds(activeGame, new Date('2026-06-19T21:07:45.000Z')), 67 * 60 + 15)
    assert.equal(formatElapsedPracticeGame(59), '0m')
    assert.equal(formatElapsedPracticeGame(60), '1m')
    assert.equal(formatElapsedPracticeGame(67 * 60 + 15), '1h 07m')
    assert.equal(formatElapsedPracticeGame(null), null)
  })

  it('maps Wayfinder win/loss reports to player1/player2 perspective', () => {
    assert.equal(resultFromReporterPerspective('win', true), 'player1')
    assert.equal(resultFromReporterPerspective('loss', true), 'player2')
    assert.equal(resultFromReporterPerspective('win', false), 'player2')
    assert.equal(resultFromReporterPerspective('loss', false), 'player1')
    assert.equal(resultFromReporterPerspective('draw', true), 'draw')
    assert.equal(resultFromReporterPerspective('draw', false), 'draw')
  })
})

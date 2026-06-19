import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  confirmedCount,
  liveConsoleRoundOrder,
  liveGameAction,
  liveGameStatusLabel,
  nextActiveTabAfterRoundChange,
  roundProgressLabel,
  roundTabState,
  shouldShowInstallNudge,
  statusLine,
  wayfinderMatchState,
} from './MatchmakingPanel.helpers'

const player = (id: string, username = id) => ({ id, username })
const A = player('A', 'You')
const B = player('B', 'Benthic')

const match = (overrides = {}) => ({
  id: 'm1',
  player1: A,
  player2: B,
  isBye: false,
  game1Result: null,
  game2Result: null,
  game3Result: null,
  player1Submitted: false,
  player2Submitted: false,
  finalConfirmed: false,
  matchWinner: null,
  podOwnerOverride: false,
  ...overrides,
})

const round = (matches: any[]) => ({ roundNumber: 2, status: 'active', matches })

describe('MatchmakingPanel helpers', () => {
  it('counts confirmed non-bye matches for the round progress label', () => {
    const activeRound = round([
      match({ id: 'm1', finalConfirmed: true }),
      match({ id: 'm2', finalConfirmed: true }),
      match({ id: 'm3' }),
      match({ id: 'm4' }),
    ])

    assert.deepEqual(confirmedCount(activeRound), { confirmed: 2, total: 4 })
    assert.equal(roundProgressLabel(2, 3, activeRound), 'Round 2 of 3 · 2 of 4 matches confirmed')
  })

  it('excludes byes from confirmed progress totals', () => {
    const activeRound = round([
      match({ id: 'm1', finalConfirmed: true }),
      match({ id: 'm2' }),
      match({ id: 'm3' }),
      match({ id: 'bye', player2: null, isBye: true, finalConfirmed: true }),
    ])

    assert.deepEqual(confirmedCount(activeRound), { confirmed: 1, total: 3 })
    assert.equal(roundProgressLabel(2, 3, activeRound), 'Round 2 of 3 · 1 of 3 matches confirmed')
  })

  it('returns specific player status lines across matchmaking states', () => {
    assert.equal(
      statusLine({ matchmakingStatus: 'deck_building', currentRound: 1, currentUserId: 'A' }),
      'Build and lock your deck. Round 1 starts when deck building ends.'
    )
    assert.equal(
      statusLine({ matchmakingStatus: 'active', currentRound: 1, currentUserId: 'A', myMatch: match({ isBye: true, player2: null }) }),
      'You have a bye this round. You are credited with a win while the rest of the round plays out.'
    )
    assert.equal(
      statusLine({ matchmakingStatus: 'active', currentRound: 1, currentUserId: 'A', myMatch: match() }),
      'Round 1 is ready. Play your best-of-three match against Benthic, then report the result.'
    )
    assert.equal(
      statusLine({ matchmakingStatus: 'active', currentRound: 1, currentUserId: 'A', myMatch: match({ player1Submitted: true }) }),
      'Result reported. Waiting for Benthic to confirm.'
    )
    assert.equal(
      statusLine({ matchmakingStatus: 'active', currentRound: 1, currentUserId: 'A', myMatch: match({ player2Submitted: true }) }),
      'Benthic reported a result. Confirm it to finish your match.'
    )
    assert.equal(
      statusLine({ matchmakingStatus: 'active', currentRound: 1, currentUserId: 'A', myMatch: match({ finalConfirmed: true }) }),
      'Your match is complete. Waiting for the next round.'
    )
    assert.equal(
      statusLine({ matchmakingStatus: 'complete', currentRound: 3, currentUserId: 'A' }),
      'Swiss Practice complete. Review the final standings.'
    )
  })

  it('derives round tab state from round number and matchmaking status', () => {
    assert.equal(roundTabState(1, 2, 'active'), 'completed')
    assert.equal(roundTabState(2, 2, 'active'), 'current')
    assert.equal(roundTabState(3, 2, 'active'), 'upcoming')
    assert.equal(roundTabState(3, 1, 'active'), 'upcoming')
    assert.equal(roundTabState(3, 3, 'complete'), 'completed')
  })

  it('auto-follows silent round advances only when the user was on the old current round', () => {
    assert.equal(nextActiveTabAfterRoundChange('round-1', 1, 2, 'active'), 'round-2')
    assert.equal(nextActiveTabAfterRoundChange('results', 1, 2, 'active'), 'results')
    assert.equal(nextActiveTabAfterRoundChange('round-1', 2, 3, 'active'), 'round-1')
    assert.equal(nextActiveTabAfterRoundChange('round-3', 3, 3, 'complete'), 'results')
  })

  it('maps Wayfinder match state without a login dimension', () => {
    assert.equal(wayfinderMatchState(true, null, true), 'auto-recording')
    assert.equal(wayfinderMatchState(false, 'wf-123', true), 'recorded')
    assert.equal(wayfinderMatchState(false, null, true), 'manual')
    assert.equal(wayfinderMatchState(true, null, false), 'manual')
  })

  it('shows the install nudge only after detection settles for beta users without the Companion', () => {
    assert.equal(shouldShowInstallNudge(false, true, true), true)
    assert.equal(shouldShowInstallNudge(false, false, true), false)
    assert.equal(shouldShowInstallNudge(false, true, false), false)
    assert.equal(shouldShowInstallNudge(true, true, true), false)
  })

  it('keeps the active round primary and prior rounds as newest-first history', () => {
    assert.deepEqual(
      liveConsoleRoundOrder([
        { roundNumber: 1, matches: [match()] },
        { roundNumber: 2, matches: [match()] },
      ], 2, 'active'),
      { primaryRoundNumber: 2, historyRoundNumbers: [1] }
    )
  })

  it('uses the latest known round as the primary complete-round view', () => {
    assert.deepEqual(
      liveConsoleRoundOrder([
        { roundNumber: 1, matches: [match()] },
        { roundNumber: 2, matches: [match()] },
        { roundNumber: 3, matches: [match()] },
      ], 99, 'complete'),
      { primaryRoundNumber: 3, historyRoundNumbers: [2, 1] }
    )
  })

  it('does not show empty history while deck building has not started rounds', () => {
    assert.deepEqual(
      liveConsoleRoundOrder([], 1, 'deck_building'),
      { primaryRoundNumber: null, historyRoundNumbers: [] }
    )
  })

  it('offers Play for a participant before the next live game is claimed', () => {
    assert.deepEqual(
      liveGameAction({
        match: match({ currentGame: { status: 'pending', gameNumber: 1 } }),
        currentUserId: 'A',
        liveLaunchEnabled: true,
      }),
      { kind: 'play', label: 'Play Game 1' }
    )
  })

  it('hides live launch actions when Companion launch is not enabled', () => {
    assert.deepEqual(
      liveGameAction({
        match: match({ currentGame: { status: 'pending', gameNumber: 1 } }),
        currentUserId: 'A',
        liveLaunchEnabled: false,
      }),
      { kind: 'none', label: '' }
    )
  })

  it('distinguishes the creator from the opponent while Wayfinder creates the lobby', () => {
    assert.deepEqual(
      liveGameAction({
        match: match({
          currentGame: {
            status: 'creating',
            gameNumber: 1,
            game: { createdByUserId: 'A' },
          },
        }),
        currentUserId: 'A',
        liveLaunchEnabled: true,
      }),
      { kind: 'creating', label: 'Creating...', disabled: true }
    )

    assert.deepEqual(
      liveGameAction({
        match: match({
          currentGame: {
            status: 'creating',
            gameNumber: 1,
            game: { createdByUserId: 'A' },
          },
        }),
        currentUserId: 'B',
        liveLaunchEnabled: true,
      }),
      { kind: 'waiting', label: 'Waiting for lobby', disabled: true }
    )
  })

  it('lets a participant join a ready lobby without exposing the raw link as the primary action', () => {
    assert.deepEqual(
      liveGameAction({
        match: match({
          currentGame: {
            status: 'lobby_ready',
            gameNumber: 2,
            lobbyUrl: 'https://karabast.net/?lobbyId=abc',
          },
        }),
        currentUserId: 'A',
        liveLaunchEnabled: true,
      }),
      { kind: 'join', label: 'Join Game' }
    )
  })

  it('reuses the watch/replay link path for spectators and completed matches', () => {
    assert.deepEqual(
      liveGameAction({
        match: match({
          currentGame: {
            status: 'in_progress',
            gameNumber: 1,
            spectateUrl: 'https://karabast.net/watch/abc',
          },
        }),
        currentUserId: 'C',
        liveLaunchEnabled: true,
      }),
      { kind: 'watch', label: 'Watch', href: 'https://karabast.net/watch/abc' }
    )

    assert.deepEqual(
      liveGameAction({
        match: match({
          finalConfirmed: true,
          currentGame: { status: 'complete', gameNumber: null },
          games: [
            { gameNumber: 1, attemptNumber: 1, status: 'complete', replayUrl: 'https://karabast.net/replay/one' },
            { gameNumber: 2, attemptNumber: 1, status: 'complete', replayUrl: 'https://karabast.net/replay/two' },
          ],
        }),
        currentUserId: 'A',
        liveLaunchEnabled: true,
      }),
      { kind: 'replay', label: 'Replay', href: 'https://karabast.net/replay/two' }
    )
  })

  it('surfaces stale or failed lobby setup as a retry for participants', () => {
    assert.deepEqual(
      liveGameAction({
        match: match({ currentGame: { status: 'creating', gameNumber: 1, stale: true, retryable: true } }),
        currentUserId: 'A',
        liveLaunchEnabled: true,
      }),
      { kind: 'retry', label: 'Retry Game 1' }
    )

    assert.deepEqual(
      liveGameAction({
        match: match({ currentGame: { status: 'failed', gameNumber: 2 } }),
        currentUserId: 'A',
        liveLaunchEnabled: true,
      }),
      { kind: 'retry', label: 'Retry Game 2' }
    )
  })

  it('formats live game status with elapsed time for active games', () => {
    assert.equal(
      liveGameStatusLabel({ status: 'in_progress', gameNumber: 3, elapsedSeconds: 12 * 60 + 5 }),
      'Game 3 In Progress · 12m'
    )
    assert.equal(
      liveGameStatusLabel({ status: 'in_progress', gameNumber: 1, elapsedSeconds: 65 * 60 }),
      'Game 1 In Progress · 1h 05m'
    )
  })
})

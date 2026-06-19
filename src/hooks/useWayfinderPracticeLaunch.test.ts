import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildWayfinderPracticeCreatePayload,
  buildWayfinderPracticeJoinPayload,
  extractPracticeClaim,
} from './useWayfinderPracticeLaunch'

const claim = {
  action: 'create_lobby' as const,
  practiceMatchGameId: 'game-1',
  matchId: 'match-1',
  podId: 'pod-1',
  roundId: 'round-1',
  shareId: 'draft-share',
  gameNumber: 1,
  attemptNumber: 1,
  status: 'creating',
  createdByUserId: 'user-1',
  lobbyUrl: null,
  spectateUrl: null,
  stale: false,
  retryable: false,
  manualFallbackAvailable: true as const,
  isNewlyCreated: true,
}

const payloadOptions = {
  claim,
  draftShareId: 'draft-share',
  poolShareId: 'pool-share',
  deckUrl: 'https://protectthepod.com/pool/pool-share/deck/play',
  format: 'pool',
  cardPool: 'Current',
}

describe('useWayfinderPracticeLaunch helpers', () => {
  it('extracts the claim from the standard API response envelope', () => {
    assert.equal(extractPracticeClaim({ success: true, data: claim }), claim)
    assert.equal(extractPracticeClaim(null), null)
  })

  it('builds the private game creation payload Wayfinder needs', () => {
    const payload = buildWayfinderPracticeCreatePayload(payloadOptions)

    assert.equal(payload.type, 'wayfinder:practice-create-game')
    assert.equal(payload.privacy, 'private')
    assert.equal(payload.openInNewTab, true)
    assert.equal(payload.practiceMatchGameId, 'game-1')
    assert.equal(payload.poolShareId, 'pool-share')
    assert.equal(payload.callbackContext.lifecycleUrl, '/api/plugin/v1/practice/match-game/lifecycle')
    assert.equal(payload.callbackContext.resultUrl, '/api/plugin/v1/match/result')
  })

  it('builds the join payload without replacing the official lobby URL with a raw user link', () => {
    const joinClaim = {
      ...claim,
      action: 'join_lobby' as const,
      status: 'lobby_ready',
      lobbyUrl: 'https://karabast.net/?lobbyId=123',
      isNewlyCreated: false,
    }
    const payload = buildWayfinderPracticeJoinPayload({ ...payloadOptions, claim: joinClaim })

    assert.equal(payload.type, 'wayfinder:practice-join-game')
    assert.equal(payload.lobbyUrl, 'https://karabast.net/?lobbyId=123')
    assert.equal(payload.practiceMatchGameId, 'game-1')
    assert.equal(payload.callbackContext.poolShareId, 'pool-share')
  })
})

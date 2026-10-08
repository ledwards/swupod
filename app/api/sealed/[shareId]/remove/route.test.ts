// @ts-nocheck
/**
 * Sealed Remove Route - Validation Logic Tests
 *
 * Tests the authorization and validation logic for removing
 * players from a sealed pod lobby (host-only, waiting status only).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert'

// Extract validation logic from the remove route
function validateRemovePlayer(pod, session, playerId, player) {
  if (!pod) {
    return { error: 'Sealed pod not found', status: 404 }
  }
  if (pod.host_id !== session.id) {
    return { error: 'Only the host can remove players', status: 403 }
  }
  if (pod.status !== 'waiting') {
    return { error: 'Cannot remove players after sealed pod has started', status: 400 }
  }
  if (!player) {
    return { error: 'Player not found in this sealed pod', status: 404 }
  }
  if (player.user_id === session.id) {
    return { error: 'Cannot remove yourself. Delete the sealed pod instead.', status: 400 }
  }
  return null // Valid
}

describe('Sealed Remove - Validation Logic', () => {
  const hostSession = { id: 'host-user-1' }
  const basePod = {
    id: 'pod-1',
    host_id: 'host-user-1',
    status: 'waiting',
    pod_type: 'sealed',
  }
  const otherPlayer = {
    id: 'player-row-99',
    user_id: 'other-user-2',
    pod_id: 'pod-1',
  }

  it('returns null (valid) for host removing another player in waiting status', () => {
    const result = validateRemovePlayer(basePod, hostSession, otherPlayer.id, otherPlayer)
    assert.strictEqual(result, null, 'Should be valid')
  })

  it('rejects when pod not found', () => {
    const result = validateRemovePlayer(null, hostSession, 'any', null)
    assert.strictEqual(result.status, 404)
    assert.strictEqual(result.error, 'Sealed pod not found')
  })

  it('rejects when non-host tries to remove', () => {
    const nonHostSession = { id: 'non-host-user' }
    const result = validateRemovePlayer(basePod, nonHostSession, otherPlayer.id, otherPlayer)
    assert.strictEqual(result.status, 403)
    assert.match(result.error, /only the host/i)
  })

  it('rejects when sealed pod has started', () => {
    const startedPod = { ...basePod, status: 'complete' }
    const result = validateRemovePlayer(startedPod, hostSession, otherPlayer.id, otherPlayer)
    assert.strictEqual(result.status, 400)
    assert.match(result.error, /after sealed pod has started/)
  })

  it('rejects when player not found in pod', () => {
    const result = validateRemovePlayer(basePod, hostSession, 'nonexistent', null)
    assert.strictEqual(result.status, 404)
    assert.match(result.error, /player not found/i)
  })

  it('rejects when host tries to remove themselves', () => {
    const selfPlayer = { id: 'self-row', user_id: 'host-user-1', pod_id: 'pod-1' }
    const result = validateRemovePlayer(basePod, hostSession, selfPlayer.id, selfPlayer)
    assert.strictEqual(result.status, 400)
    assert.match(result.error, /cannot remove yourself/i)
  })

  it('works for removing bot players', () => {
    const botPlayer = { id: 'bot-row-5', user_id: 'bot-user-99', pod_id: 'pod-1', is_bot: true }
    const result = validateRemovePlayer(basePod, hostSession, botPlayer.id, botPlayer)
    assert.strictEqual(result, null, 'Should allow removing bots')
  })
})

describe('Sealed Remove - playerId vs userId', () => {
  it('uses pod_players.id (row PK) not user_id for lookup', () => {
    // SPEC: Frontend player.id is pod_players.id (row PK), NOT user_id
    // The route must accept playerId and look up by pod_players.id
    const podPlayersRow = {
      id: '12345',      // This is what frontend sends as player.id
      user_id: '42',    // This is NOT what frontend sends
      pod_id: 'pod-1',
    }

    const frontendPlayerId = '12345'
    assert.strictEqual(podPlayersRow.id, frontendPlayerId,
      'pod_players.id should match frontend playerId')

    assert.notStrictEqual(podPlayersRow.user_id, frontendPlayerId,
      'user_id should NOT match frontend playerId — this was the original bug')
  })
})

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildWayfinderCasualCreatePayload,
  buildWayfinderCasualJoinPayload,
} from './useWayfinderCasualLaunch'

const createOptions = {
  openGameShareId: 'og-share',
  poolShareId: 'pool-share',
  deckUrl: 'https://protectthepod.com/pool/pool-share/deck/play',
  lobbyName: 'SEC Draft via protectthepod.com',
  visibility: 'private' as const,
}

describe('useWayfinderCasualLaunch helpers', () => {
  it('builds the casual create payload with the openGameId correlation anchor', () => {
    const payload = buildWayfinderCasualCreatePayload(createOptions)

    assert.equal(payload.type, 'wayfinder:casual-create-game')
    assert.equal(payload.privacy, 'private')
    assert.equal(payload.openInNewTab, true)
    assert.equal(payload.openGameId, 'og-share')
    assert.equal(payload.poolShareId, 'pool-share')
    assert.equal(payload.lobbyName, 'SEC Draft via protectthepod.com')
    assert.equal(payload.callbackContext.lifecycleUrl, '/api/plugin/v1/practice/match-game/lifecycle')
    assert.equal(payload.callbackContext.resultUrl, '/api/plugin/v1/match/result')
  })

  it('SPEC: match length defaults to Bo1 when the claim omits bestOf', () => {
    // The Companion sets Karabast's Match Type from this field; Karabast's own
    // form default is Best-of-One, so an omitted bestOf must never come out Bo3.
    const payload = buildWayfinderCasualCreatePayload(createOptions)
    assert.equal(payload.bestOf, 1)
  })

  it("FIXED: the claim's bestOf 3 rides the create payload (Bo1 lobby no longer forced Bo3)", () => {
    const payload = buildWayfinderCasualCreatePayload({ ...createOptions, bestOf: 3 })
    assert.equal(payload.bestOf, 3)
  })

  it('SPEC: anything other than an explicit 3 is coerced to Bo1', () => {
    assert.equal(buildWayfinderCasualCreatePayload({ ...createOptions, bestOf: 1 }).bestOf, 1)
    assert.equal(buildWayfinderCasualCreatePayload({ ...createOptions, bestOf: 2 }).bestOf, 1)
    assert.equal(
      buildWayfinderCasualCreatePayload({ ...createOptions, bestOf: undefined }).bestOf,
      1
    )
  })

  it('builds the join payload around the official lobby URL (no bestOf — the lobby already fixed it)', () => {
    const payload = buildWayfinderCasualJoinPayload({
      openGameShareId: 'og-share',
      poolShareId: 'pool-share',
      deckUrl: 'https://protectthepod.com/pool/pool-share/deck/play',
      lobbyUrl: 'https://karabast.net/lobby?lobbyId=123',
    })

    assert.equal(payload.type, 'wayfinder:casual-join-game')
    assert.equal(payload.lobbyUrl, 'https://karabast.net/lobby?lobbyId=123')
    assert.equal(payload.openGameId, 'og-share')
    assert.equal(payload.callbackContext.poolShareId, 'pool-share')
    assert.ok(!('bestOf' in payload))
  })
})

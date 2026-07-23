// app/api/plugin/v1/play/[format]/[shareId]/route.test.ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getLatestReleasedSetCode } from '../../../../../../../src/utils/setConfigs/latest.js'
import { KARABAST_PUBLIC_LOBBY_NAME } from '../../../../../../../src/utils/karabastLobby.js'

describe('getLatestReleasedSetCode', () => {
  // Pinned clocks: "latest released" moves every time a set ships, so assert the spec at
  // fixed dates instead of tracking today (this hardcoded LAW and broke when ASH released).
  it('SPEC: returns LAW while it is the newest released set (before ASH release)', () => {
    // LAW released 2026-03-13; ASH releases 2026-07-17.
    assert.equal(getLatestReleasedSetCode(new Date('2026-07-01T00:00:00Z')), 'LAW')
  })

  it('SPEC: returns ASH once its release date has passed', () => {
    assert.equal(getLatestReleasedSetCode(new Date('2026-07-18T00:00:00Z')), 'ASH')
  })
})

describe('Karabast public lobby name', () => {
  it('brands public Karabast lobbies with protectthepod.com', () => {
    assert.equal(KARABAST_PUBLIC_LOBBY_NAME, 'Limited Draft through protectthepod.com')
  })
})

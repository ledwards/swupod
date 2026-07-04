// app/api/plugin/v1/play/[format]/[shareId]/route.test.ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getLatestReleasedSetCode } from '../../../../../../../src/utils/setConfigs/latest.js'
import { KARABAST_PUBLIC_LOBBY_NAME } from '../../../../../../../src/utils/karabastLobby.js'

describe('getLatestReleasedSetCode', () => {
  it('returns LAW — the highest setNumber (7) among all released sets', () => {
    // SPEC: LAW has setNumber 7 and releaseDate 2026-03-13 (released)
    // It is the latest released set as of the current date.
    const expectedLatestSet = 'LAW'
    const code = getLatestReleasedSetCode()
    assert.equal(code, expectedLatestSet)
  })
})

describe('Karabast public lobby name', () => {
  it('brands public Karabast lobbies with protectthepod.com', () => {
    assert.equal(KARABAST_PUBLIC_LOBBY_NAME, 'Limited Draft through protectthepod.com')
  })
})

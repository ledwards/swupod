import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildLobbyName, appendProtectThePod, isValidPrivateLobbyUrl } from './karabastLobby'

describe('buildLobbyName', () => {
  it('builds "SET Sealed archetype protectthepod.com" for a sealed pool', () => {
    assert.equal(
      buildLobbyName({ setCode: 'ash', poolType: 'sealed', archetypeName: 'Boba Aggro' }),
      'ASH Sealed Boba Aggro protectthepod.com'
    )
  })

  it('maps draft and rotisserie pools to Draft', () => {
    assert.equal(
      buildLobbyName({ setCode: 'LOF', poolType: 'draft', archetypeName: 'Vader Control' }),
      'LOF Draft Vader Control protectthepod.com'
    )
    assert.match(buildLobbyName({ setCode: 'LOF', poolType: 'rotisserie' }), /^LOF Draft /)
  })

  it('strips the (Limited) and embedded set tags from the archetype', () => {
    // The set is already the prefix, so "(SEC)" would be redundant.
    assert.equal(
      buildLobbyName({ setCode: 'SEC', poolType: 'draft', archetypeName: 'Leia (SEC) Splash Green (Limited)' }),
      'SEC Draft Leia Splash Green protectthepod.com'
    )
  })

  it('drops missing pieces gracefully but always ends with protectthepod.com', () => {
    assert.equal(buildLobbyName({ setCode: 'ASH', poolType: 'sealed' }), 'ASH Sealed protectthepod.com')
    assert.equal(buildLobbyName({ poolType: 'sealed' }), 'Sealed protectthepod.com')
  })
})

describe('appendProtectThePod', () => {
  it('appends the suffix when missing', () => {
    assert.equal(appendProtectThePod('My Game'), 'My Game protectthepod.com')
  })

  it('is idempotent when the suffix is already present (case-insensitive)', () => {
    assert.equal(appendProtectThePod('My Game protectthepod.com'), 'My Game protectthepod.com')
    assert.equal(appendProtectThePod('My Game ProtectThePod.com'), 'My Game ProtectThePod.com')
  })

  it('falls back to the bare suffix for empty input', () => {
    assert.equal(appendProtectThePod(''), 'protectthepod.com')
    assert.equal(appendProtectThePod(null), 'protectthepod.com')
  })
})

describe('isValidPrivateLobbyUrl', () => {
  const ID = 'd508ac36-c2b9-4601-9695-3b1b416b5b16'

  it('FIXED: accepts the /lobby?lobbyId= URL Karabast now serves', () => {
    // Regression: the old regex pinned lobbyId to the root path (/?lobbyId=)
    // and rejected this real, valid lobby link.
    assert.equal(isValidPrivateLobbyUrl(`https://karabast.net/lobby?lobbyId=${ID}`), true)
  })

  it('still accepts the legacy root /?lobbyId= URL', () => {
    assert.equal(isValidPrivateLobbyUrl(`https://karabast.net/?lobbyId=${ID}`), true)
  })

  it('is tolerant of surrounding whitespace and extra query params', () => {
    assert.equal(isValidPrivateLobbyUrl(`  https://karabast.net/lobby?lobbyId=${ID}  `), true)
    assert.equal(isValidPrivateLobbyUrl(`https://karabast.net/lobby?foo=bar&lobbyId=${ID}`), true)
  })

  it('rejects the wrong host, non-https, a missing/malformed lobbyId, and junk', () => {
    assert.equal(isValidPrivateLobbyUrl(`https://evil.example.com/lobby?lobbyId=${ID}`), false)
    assert.equal(isValidPrivateLobbyUrl(`http://karabast.net/lobby?lobbyId=${ID}`), false)
    assert.equal(isValidPrivateLobbyUrl('https://karabast.net/lobby'), false)
    assert.equal(isValidPrivateLobbyUrl('https://karabast.net/lobby?lobbyId=not-a-uuid'), false)
    assert.equal(isValidPrivateLobbyUrl('not a url'), false)
    assert.equal(isValidPrivateLobbyUrl(''), false)
    assert.equal(isValidPrivateLobbyUrl(null), false)
  })
})

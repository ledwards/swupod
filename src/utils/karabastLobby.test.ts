import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildLobbyName, appendProtectThePod } from './karabastLobby'

describe('buildLobbyName', () => {
  it('builds "SET SEALED archetype protectthepod.com" for a sealed pool', () => {
    assert.equal(
      buildLobbyName({ setCode: 'ash', poolType: 'sealed', archetypeName: 'Boba Aggro' }),
      'ASH SEALED Boba Aggro protectthepod.com'
    )
  })

  it('maps draft and rotisserie pools to DRAFT', () => {
    assert.equal(
      buildLobbyName({ setCode: 'LOF', poolType: 'draft', archetypeName: 'Vader Control' }),
      'LOF DRAFT Vader Control protectthepod.com'
    )
    assert.match(buildLobbyName({ setCode: 'LOF', poolType: 'rotisserie' }), /^LOF DRAFT /)
  })

  it('strips the (Limited) tag from the archetype', () => {
    assert.equal(
      buildLobbyName({ setCode: 'SEC', poolType: 'sealed', archetypeName: 'Boba Aggro (Limited)' }),
      'SEC SEALED Boba Aggro protectthepod.com'
    )
  })

  it('drops missing pieces gracefully but always ends with protectthepod.com', () => {
    assert.equal(buildLobbyName({ setCode: 'ASH', poolType: 'sealed' }), 'ASH SEALED protectthepod.com')
    assert.equal(buildLobbyName({ poolType: 'sealed' }), 'SEALED protectthepod.com')
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

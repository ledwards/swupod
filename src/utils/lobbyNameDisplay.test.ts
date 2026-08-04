import { describe, it } from 'node:test'
import assert from 'node:assert'
import { shortenLobbyName } from './lobbyNameDisplay'

describe('shortenLobbyName', () => {
  it('SPEC: a full set name becomes its set code', () => {
    assert.strictEqual(
      shortenLobbyName('Ashes of the Empire Competitive Practice'),
      'ASH Competitive Practice'
    )
    assert.strictEqual(shortenLobbyName('A Lawless Time Draft'), 'LAW Draft')
  })

  it('SPEC: drops the protectthepod.com attribution — the row\'s ✓ says it', () => {
    assert.strictEqual(
      shortenLobbyName('SEC Draft Leia Splash Green protectthepod.com'),
      'SEC Draft Leia Splash Green'
    )
  })

  it('SPEC: applies both substitutions together', () => {
    assert.strictEqual(
      shortenLobbyName('Ashes of the Empire Sealed protectthepod.com'),
      'ASH Sealed'
    )
  })

  it('matches the set name case-insensitively', () => {
    assert.strictEqual(shortenLobbyName('ashes of the empire sealed'), 'ASH sealed')
  })

  it('leaves a name with nothing to abbreviate alone', () => {
    assert.strictEqual(shortenLobbyName('Friday night games'), 'Friday night games')
  })

  it('does not summarise — unknown words survive', () => {
    assert.strictEqual(shortenLobbyName('ASH Competitive Practice'), 'ASH Competitive Practice')
  })

  it('falls back rather than rendering an empty row', () => {
    assert.strictEqual(shortenLobbyName(''), 'Karabast lobby')
    assert.strictEqual(shortenLobbyName(null), 'Karabast lobby')
    assert.strictEqual(shortenLobbyName('   protectthepod.com  '), 'Karabast lobby')
  })

  it('collapses whitespace left by a removed suffix', () => {
    assert.ok(!/\s{2,}/.test(shortenLobbyName('ASH Draft  protectthepod.com')))
  })
})

// SPEC (plan B3 + POST /api/formats/rotisserie[/:shareId] update-settings):
// the setup step chooses everything the lobby used to, and the create call
// carries it. Server ranges: players 2-16, picks 1-500, timer 10-600 s; modes
// are 'fixed' (Fixed Picks) and 'exhausted' (Entire Pool). Practice Solo fills
// every other seat with a bot (the API names at most 8 bots, so a solo table is
// 2-8 seats) and runs without a pick timer.
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { ROTISSERIE_DEFAULTS, rotisserieCreateBody, rotisserieBotCount, normalizeRotisserieSetup, rotisseriePoolSize, rotisserieShortfall } from './rotisserieSetup.ts'

describe('ROTISSERIE_DEFAULTS', () => {
  it('match the create API defaults: 8 seats, 42 fixed picks, timer off at 120 s', () => {
    assert.strictEqual(ROTISSERIE_DEFAULTS.players, 8)
    assert.strictEqual(ROTISSERIE_DEFAULTS.picksPerPlayer, 42)
    assert.strictEqual(ROTISSERIE_DEFAULTS.draftMode, 'fixed')
    assert.strictEqual(ROTISSERIE_DEFAULTS.timerEnabled, false)
    assert.strictEqual(ROTISSERIE_DEFAULTS.pickTimerSeconds, 120)
  })
})

describe('rotisserieCreateBody', () => {
  const base = { ...ROTISSERIE_DEFAULTS, setCodes: ['SHD', 'TWI'] }

  it('sends the chosen settings in the create API field names', () => {
    assert.deepStrictEqual(rotisserieCreateBody({ ...base, solo: false, timerEnabled: true, pickTimerSeconds: 90 }), {
      setCodes: ['SHD', 'TWI'], maxPlayers: 8, draftMode: 'fixed', picksPerPlayer: 42, timerEnabled: true, pickTimerSeconds: 90,
    })
  })

  it('clamps to the server ranges', () => {
    const body = rotisserieCreateBody({ ...base, solo: false, players: 40, picksPerPlayer: 9000, pickTimerSeconds: 1 })
    assert.strictEqual(body.maxPlayers, 16)
    assert.strictEqual(body.picksPerPlayer, 500)
    assert.strictEqual(body.pickTimerSeconds, 10)
    const low = rotisserieCreateBody({ ...base, solo: false, players: 1, picksPerPlayer: 0, pickTimerSeconds: 5000 })
    assert.strictEqual(low.maxPlayers, 2)
    assert.strictEqual(low.picksPerPlayer, 1)
    assert.strictEqual(low.pickTimerSeconds, 600)
  })

  it('caps a solo table at 8 seats and turns the timer off', () => {
    const body = rotisserieCreateBody({ ...base, solo: true, players: 12, timerEnabled: true })
    assert.strictEqual(body.maxPlayers, 8)
    assert.strictEqual(body.timerEnabled, false)
  })

  it('carries Entire Pool as the exhausted mode', () => {
    assert.strictEqual(rotisserieCreateBody({ ...base, solo: false, draftMode: 'exhausted' }).draftMode, 'exhausted')
  })
})

describe('rotisserieBotCount', () => {
  it('fills every other seat when solo', () => {
    assert.strictEqual(rotisserieBotCount({ ...ROTISSERIE_DEFAULTS, setCodes: ['SOR'], solo: true, players: 4 }), 3)
    assert.strictEqual(rotisserieBotCount({ ...ROTISSERIE_DEFAULTS, setCodes: ['SOR'], solo: true, players: 99 }), 7)
  })
  it('adds none for a table with other players', () => {
    assert.strictEqual(rotisserieBotCount({ ...ROTISSERIE_DEFAULTS, setCodes: ['SOR'], solo: false, players: 4 }), 0)
  })
})

describe('rotisseriePoolSize', () => {
  // SPEC (route generateCardPool): Normal treatment only, no tokens, Special
  // rarity only in TWI and later sets, every leader, rare bases only.
  const card = (over: Record<string, unknown>) => ({ type: 'Unit', rarity: 'Common', variantType: 'Normal', ...over })
  const cards = [
    card({}), card({ rarity: 'Rare' }),
    card({ variantType: 'Hyperspace' }),
    card({ type: 'Token', isToken: true }),
    card({ type: 'Leader', isLeader: true, rarity: 'Common' }),
    card({ type: 'Base', isBase: true, rarity: 'Common' }),
    card({ type: 'Base', isBase: true, rarity: 'Rare' }),
    card({ rarity: 'Special' }),
  ]
  it('counts what the server deals: 2 units, 1 leader, 1 rare base', () => {
    assert.strictEqual(rotisseriePoolSize('SOR', cards), 4)
  })
  it('adds Special cards for sets that print them', () => {
    assert.strictEqual(rotisseriePoolSize('TWI', cards), 5)
  })
})

describe('rotisserieShortfall', () => {
  it('is how many fixed picks the pool cannot cover', () => {
    assert.strictEqual(rotisserieShortfall({ ...ROTISSERIE_DEFAULTS, setCodes: ['SOR'], solo: false, players: 8, picksPerPlayer: 42 }, 300), 36)
    assert.strictEqual(rotisserieShortfall({ ...ROTISSERIE_DEFAULTS, setCodes: ['SOR'], solo: false, players: 4, picksPerPlayer: 42 }, 300), 0)
  })
  it('is never short in Entire Pool mode', () => {
    assert.strictEqual(rotisserieShortfall({ ...ROTISSERIE_DEFAULTS, setCodes: ['SOR'], solo: false, draftMode: 'exhausted', players: 16, picksPerPlayer: 500 }, 10), 0)
  })
})

describe('normalizeRotisserieSetup', () => {
  it('restores a saved setup and drops junk', () => {
    const restored = normalizeRotisserieSetup({ setCodes: ['SOR', 7, 'SHD'], solo: true, players: '5', draftMode: 'nope', picksPerPlayer: 30, timerEnabled: 'yes' })
    assert.deepStrictEqual(restored.setCodes, ['SOR', 'SHD'])
    assert.strictEqual(restored.solo, true)
    assert.strictEqual(restored.players, ROTISSERIE_DEFAULTS.players)
    assert.strictEqual(restored.draftMode, 'fixed')
    assert.strictEqual(restored.picksPerPlayer, 30)
    assert.strictEqual(restored.timerEnabled, false)
  })
  it('is the defaults for anything that is not an object', () => {
    assert.deepStrictEqual(normalizeRotisserieSetup(null), { ...ROTISSERIE_DEFAULTS, setCodes: [] })
  })
})

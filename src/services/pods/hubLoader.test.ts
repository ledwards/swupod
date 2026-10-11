import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initializeCardCache } from '../../utils/cardCache'
import { baseAspectOf, deckFor } from './hubLoader'

const parse = (v: string) => JSON.parse(v) as { id: string }

test('seat tiles and Your deck read real built_decks rows ({"id": "HMW_003", "count": 1})', async () => {
  await initializeCardCache()
  // Lee's pool 5oNAK8wY in the dev database: Doctor Hemlock on a common base.
  const leader = parse('{"id": "HMW_003", "count": 1}'), base = parse('{"id": "HMW_031", "count": 1}')
  const deck = deckFor(leader.id, base.id)!
  assert.equal(deck.leaderName, 'Doctor Hemlock')
  assert.notEqual(deck.baseName, 'Base')
  assert.ok(deck.leaderArt && deck.leaderUnitArt && deck.baseArt, 'split leader/base art')
  // A Normal leader shares its number with another card's Hyperspace printing: the leader wins.
  const ash = deckFor('ASH_003', 'ASH_023')!
  assert.notEqual(ash.leaderName, 'Leader')
  assert.equal(deckFor(null, null), null)
})

test("a seat's deck carries its base aspect for the divider and its archetype name like the build chips", async () => {
  await initializeCardCache()
  assert.equal(baseAspectOf({ aspects: ['Cunning'] }), 'cunning')
  assert.equal(baseAspectOf({ aspects: ['Vigilance', 'Heroism'] }), 'vigilance')
  assert.equal(baseAspectOf({ aspects: [] }), null)
  // Bright Tree Village: a common Command base, 30 HP.
  const fallback = deckFor('HMW_018', 'HMW_023')!
  assert.equal(fallback.baseAspect, 'command')
  assert.equal(fallback.archetype, `${fallback.leaderName} Green 30`, 'no resolved nickname: Leader Color HP')
  assert.equal(deckFor('HMW_018', 'HMW_023', 'Warrior Green 30 (Limited)')!.archetype, 'Warrior Green 30', 'the resolved nickname, without its format')
})

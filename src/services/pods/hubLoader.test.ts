import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initializeCardCache } from '../../utils/cardCache'
import { deckFor } from './hubLoader'

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

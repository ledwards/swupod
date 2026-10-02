import { test } from 'node:test'
import assert from 'node:assert/strict'
import { entryDeckLocked } from './deckLock'
const now = Date.UTC(2026, 9, 2),
  active = {
    competitive: true,
    draft_state: { matchmakingStatus: 'active' },
    created_at: new Date(now - 86400000),
  }
test('only live competitive source builds are locked', () => {
  assert.equal(entryDeckLocked(active, now), true)
  for (const override of [
    { competitive: false },
    { decks_unlocked: true },
    { parent_pool_id: 'parent' },
    { draft_state: { matchmakingStatus: 'complete' } },
    { created_at: new Date(now - 8 * 86400000) },
  ])
    assert.equal(entryDeckLocked({ ...active, ...override }, now), false)
})
test('deck building stays editable until the deadline', () => {
  const building = {
    ...active,
    draft_state: { matchmakingStatus: 'deck_building' },
  }
  assert.equal(entryDeckLocked(building, now), false)
  assert.equal(entryDeckLocked({ ...building, deck_lock_at: new Date(now + 1000) }, now), false)
  assert.equal(entryDeckLocked({ ...building, deck_lock_at: new Date(now - 1000) }, now), true)
})

// Spec-first tests for the alpha "build your packs" picker (Chaos Draft / Chaos Sealed).
//
// SPEC (plans/2026-10-13-style-guide-page-migration.md, Workstream B2):
// - One source of truth: the pack count lives in the summary; picks are one ordered list.
// - Tapping a set adds a pack; tapping a chip in the summary removes that pack.
// - The order the packs are opened/drafted in is the summary's order.
// - Shrinking the count below the packs chosen drops the last set pack (Lee, 2026-10-15).
// - Event Packs are just more packs in the same list. They ride after the set packs
//   (they augment the pool / add bonus rounds, so they don't fill a set-pack slot) and are
//   capped at 8 in total (src/services/chaosSealedSelection.ts).
// - Chaos Draft: always 3 set packs; an Event Pack can fill the 4th slot only (Lee, 2026-10-15).
// - Chaos Sealed: 1–12 packs, default 6 (POST /api/formats/chaos-sealed caps at 12).
import { test, describe } from 'node:test'
import assert from 'node:assert'
import {
  CHAOS_DRAFT_PACK_LIMITS,
  CHAOS_SEALED_PACK_LIMITS,
  addPack,
  canAddPack,
  canChangeCount,
  changeCount,
  createPicker,
  keepAvailable,
  pickerSummary,
  removePackAt,
} from './chaosPackPicker.ts'

const DRAFT = CHAOS_DRAFT_PACK_LIMITS
/** Neutral limits for the picker's generic behavior. */
const FLEX = { min: 1, max: 4, default: 4 }
const SEALED = CHAOS_SEALED_PACK_LIMITS
const SILVER = 'GC2026_SILVER'
const BLACK = 'GC2026_BLACK'

describe('chaosPackPicker limits', () => {
  test('SPEC: Chaos Draft is always 3 set packs, plus at most one Event Pack', () => {
    assert.deepStrictEqual(DRAFT, { min: 3, max: 3, default: 3, maxEventPacks: 1 })
  })
  test('SPEC: Chaos Sealed is 1–12 packs, default 6', () => {
    assert.deepStrictEqual(SEALED, { min: 1, max: 12, default: 6 })
  })
})

describe('createPicker', () => {
  test('starts empty at the default count', () => {
    assert.deepStrictEqual(createPicker(FLEX), { count: 4, picks: [] })
  })

  test('restores saved picks and count', () => {
    assert.deepStrictEqual(
      createPicker(SEALED, { count: 3, picks: ['SOR', 'LAW'] }),
      { count: 3, picks: ['SOR', 'LAW'] },
    )
  })

  test('clamps a saved count into the limits (a stale 12 from the old live page)', () => {
    assert.strictEqual(createPicker(FLEX, { count: 12, picks: [] }).count, 4)
    assert.strictEqual(createPicker(FLEX, { count: 0, picks: [] }).count, 4, '0 is not a count; use the default')
    assert.strictEqual(createPicker(FLEX, { count: -3, picks: [] }).count, 1)
  })

  test('ignores junk from storage', () => {
    assert.deepStrictEqual(createPicker(FLEX, { count: 'x', picks: 'SOR' }), { count: 4, picks: [] })
    assert.deepStrictEqual(createPicker(FLEX, { picks: ['SOR', 7, null] }), { count: 4, picks: ['SOR'] })
    assert.deepStrictEqual(createPicker(FLEX, null), { count: 4, picks: [] })
  })

  test('puts Event Packs after the set packs, keeping each group in order', () => {
    assert.deepStrictEqual(
      createPicker(SEALED, { count: 6, picks: [SILVER, 'LAW', BLACK, 'SOR'] }).picks,
      ['LAW', 'SOR', SILVER, BLACK],
    )
  })

  test('raises the count to fit restored set packs rather than dropping them', () => {
    assert.deepStrictEqual(
      createPicker(SEALED, { count: 2, picks: ['SOR', 'SHD', 'TWI'] }),
      { count: 3, picks: ['SOR', 'SHD', 'TWI'] },
    )
  })

  test('restored set packs beyond the max are cut to the max', () => {
    const state = createPicker(FLEX, { count: 4, picks: ['SOR', 'SHD', 'TWI', 'JTL', 'LOF', 'SEC'] })
    assert.deepStrictEqual(state, { count: 4, picks: ['SOR', 'SHD', 'TWI', 'JTL'] })
  })

  test('restored Event Packs beyond 8 are cut to 8', () => {
    const state = createPicker(SEALED, { count: 1, picks: ['SOR', ...Array(10).fill(SILVER)] })
    assert.strictEqual(state.picks.length, 9)
  })
})

describe('addPack (tapping a set)', () => {
  test('adds one pack of the tapped set per tap', () => {
    let state = createPicker(FLEX)
    state = addPack(state, 'SOR')
    state = addPack(state, 'SOR')
    state = addPack(state, 'LAW')
    assert.deepStrictEqual(state.picks, ['SOR', 'SOR', 'LAW'])
  })

  test('blocks a set pack once every slot is filled (never replaces a pick)', () => {
    let state = createPicker(FLEX, { count: 2, picks: ['SOR', 'LAW'] })
    assert.strictEqual(canAddPack(state, 'SHD'), false)
    state = addPack(state, 'SHD')
    assert.deepStrictEqual(state.picks, ['SOR', 'LAW'])
  })

  test('Event Packs do not need a free slot', () => {
    const state = createPicker(FLEX, { count: 2, picks: ['SOR', 'LAW'] })
    assert.strictEqual(canAddPack(state, SILVER), true)
    assert.deepStrictEqual(addPack(state, SILVER).picks, ['SOR', 'LAW', SILVER])
  })

  test('Event Packs stop at 8 in total, across both tiers', () => {
    let state = createPicker(SEALED, { count: 1, picks: ['SOR'] })
    for (let i = 0; i < 5; i++) state = addPack(state, SILVER)
    for (let i = 0; i < 3; i++) state = addPack(state, BLACK)
    assert.strictEqual(canAddPack(state, SILVER), false)
    assert.strictEqual(addPack(state, BLACK).picks.length, 9)
  })

  test('a set pack added after an Event Pack still lands before it (summary order = open order)', () => {
    let state = createPicker(SEALED, { count: 3, picks: ['SOR', SILVER] })
    state = addPack(state, 'LAW')
    assert.deepStrictEqual(state.picks, ['SOR', 'LAW', SILVER])
  })
})

describe('removePackAt (tapping a chip)', () => {
  test('removes exactly the tapped chip, not the first pack of that set', () => {
    const state = createPicker(SEALED, { count: 4, picks: ['SOR', 'LAW', 'SOR', SILVER] })
    assert.deepStrictEqual(removePackAt(state, 2).picks, ['SOR', 'LAW', SILVER])
    assert.deepStrictEqual(removePackAt(state, 3).picks, ['SOR', 'LAW', 'SOR'])
  })

  test('keeps the count; the freed slot is open again', () => {
    const state = removePackAt(createPicker(FLEX, { count: 2, picks: ['SOR', 'LAW'] }), 0)
    assert.strictEqual(state.count, 2)
    assert.strictEqual(canAddPack(state, 'SHD'), true)
  })

  test('an out-of-range index changes nothing', () => {
    const state = createPicker(FLEX, { count: 2, picks: ['SOR'] })
    assert.strictEqual(removePackAt(state, 5), state)
    assert.strictEqual(removePackAt(state, -1), state)
  })
})

describe('changeCount (the summary stepper)', () => {
  test('raises and lowers within the limits', () => {
    let state = createPicker(FLEX, { count: 2, picks: [] })
    state = changeCount(state, 1, FLEX)
    assert.strictEqual(state.count, 3)
    state = changeCount(state, -1, FLEX)
    assert.strictEqual(state.count, 2)
  })

  test('stops at the max and the min', () => {
    assert.strictEqual(canChangeCount(createPicker(FLEX, { count: 4 }), 1, FLEX), false)
    assert.strictEqual(changeCount(createPicker(FLEX, { count: 4 }), 1, FLEX).count, 4)
    assert.strictEqual(canChangeCount(createPicker(FLEX, { count: 1 }), -1, FLEX), false)
    assert.strictEqual(changeCount(createPicker(FLEX, { count: 1 }), -1, FLEX).count, 1)
  })

  test('SPEC: shrinking below the packs already chosen drops the last set pack', () => {
    const state = createPicker(FLEX, { count: 3, picks: ['SOR', 'LAW', 'SHD', SILVER] })
    assert.strictEqual(canChangeCount(state, -1, FLEX), true)
    assert.deepStrictEqual(changeCount(state, -1, FLEX), { count: 2, picks: ['SOR', 'LAW', SILVER] })
  })

  test('shrinking into empty slots is fine', () => {
    const state = createPicker(FLEX, { count: 4, picks: ['SOR', 'LAW'] })
    assert.strictEqual(changeCount(state, -1, FLEX).count, 3)
    assert.strictEqual(changeCount(changeCount(state, -1, FLEX), -1, FLEX).count, 2)
    assert.strictEqual(canChangeCount(changeCount(changeCount(state, -1, FLEX), -1, FLEX), -1, FLEX), true)
  })

  test('Event Packs never block shrinking (they hold no slot)', () => {
    const state = createPicker(FLEX, { count: 3, picks: ['SOR', SILVER, BLACK] })
    assert.strictEqual(changeCount(state, -1, FLEX).count, 2)
  })
})

describe('keepAvailable (when the set list loads)', () => {
  test('drops picks the viewer cannot choose (locked Event Pack, hidden set)', () => {
    const state = createPicker(SEALED, { count: 3, picks: ['SOR', 'ASH', SILVER] })
    assert.deepStrictEqual(keepAvailable(state, new Set(['SOR', 'LAW'])).picks, ['SOR'])
  })

  test('returns the same state when nothing changes', () => {
    const state = createPicker(SEALED, { count: 3, picks: ['SOR'] })
    assert.strictEqual(keepAvailable(state, new Set(['SOR'])), state)
  })
})

describe('pickerSummary', () => {
  test('counts set packs against the slots and Event Packs on the side', () => {
    const summary = pickerSummary(createPicker(FLEX, { count: 4, picks: ['SOR', 'LAW', SILVER] }))
    assert.deepStrictEqual(summary.setPacks, ['SOR', 'LAW'])
    assert.deepStrictEqual(summary.eventPacks, [SILVER])
    assert.strictEqual(summary.remaining, 2)
    assert.strictEqual(summary.complete, false)
    assert.strictEqual(summary.error, null)
  })

  test('complete once every slot holds a set pack', () => {
    const summary = pickerSummary(createPicker(FLEX, { count: 2, picks: ['SOR', 'LAW', BLACK] }))
    assert.strictEqual(summary.remaining, 0)
    assert.strictEqual(summary.complete, true)
  })

  test('the submitted list is the summary order', () => {
    const state = createPicker(SEALED, { count: 2, picks: ['LAW', SILVER, 'SOR'] })
    assert.deepStrictEqual(pickerSummary(state).ordered, ['LAW', 'SOR', SILVER])
  })
})

describe('Chaos Draft (3 set packs + one Event Pack slot)', () => {
  test('starts at 3 slots and the count never moves', () => {
    const state = createPicker(DRAFT)
    assert.strictEqual(state.count, 3)
    assert.strictEqual(canChangeCount(state, 1, DRAFT), false)
    assert.strictEqual(canChangeCount(state, -1, DRAFT), false)
  })

  test('a stale saved count snaps back to 3', () => {
    assert.strictEqual(createPicker(DRAFT, { count: 4, picks: ['SOR'] }).count, 3)
  })

  test('the 4th slot takes one Event Pack only', () => {
    let state = createPicker(DRAFT, { picks: ['SOR', 'LAW', 'SHD'] })
    assert.strictEqual(canAddPack(state, 'TWI', DRAFT), false, 'no 4th set pack')
    state = addPack(state, SILVER, DRAFT)
    assert.deepStrictEqual(state.picks, ['SOR', 'LAW', 'SHD', SILVER])
    assert.strictEqual(canAddPack(state, BLACK, DRAFT), false, 'one Event Pack at most')
  })

  test('restored Event Packs beyond one are cut', () => {
    assert.deepStrictEqual(createPicker(DRAFT, { picks: ['SOR', SILVER, BLACK] }).picks, ['SOR', SILVER])
  })
})

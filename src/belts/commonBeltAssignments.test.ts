// @ts-nocheck
/**
 * Tests for common belt assignments and pack generation slot patterns
 */

import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert'
import {
  COMMON_BELT_ASSIGNMENTS,
  getBlockForSet,
  getBeltConfig,
} from './data/commonBeltAssignments'
import { CommonBelt, getBeltCards } from './CommonBelt'
import { initializeCardCache, getCachedCards } from '../utils/cardCache'
import { generateBoosterPack, clearBeltCache } from '../utils/boosterPack'

describe('Common Belt Assignments', () => {
  beforeEach(async () => {
    await initializeCardCache()
    clearBeltCache()
  })

  describe('Belt Assignment Sizes', () => {
    test('Block 0 sets (SOR, SHD, TWI) have 60/30 belt sizes', async (t) => {
      const block0Sets = ['SOR', 'SHD', 'TWI']

      for (const setCode of block0Sets) {
        const assignments = COMMON_BELT_ASSIGNMENTS[setCode]
        assert.ok(assignments, `Assignments should exist for ${setCode}`)

        const beltASize = assignments.beltA.length
        const beltBSize = assignments.beltB.length

        assert.strictEqual(beltASize, 60,
          `${setCode} Belt A should have 60 cards, got ${beltASize}`)
        assert.strictEqual(beltBSize, 30,
          `${setCode} Belt B should have 30 cards, got ${beltBSize}`)
      }
    })

    test('Block A sets (JTL, LOF, SEC) have ~50/50 belt sizes', async (t) => {
      const blockASets = ['JTL', 'LOF', 'SEC']

      for (const setCode of blockASets) {
        const assignments = COMMON_BELT_ASSIGNMENTS[setCode]
        assert.ok(assignments, `Assignments should exist for ${setCode}`)

        const beltASize = assignments.beltA.length
        const beltBSize = assignments.beltB.length
        const total = beltASize + beltBSize

        // Should be within 1 of each other (for odd totals)
        assert.ok(Math.abs(beltASize - beltBSize) <= 1,
          `${setCode} belts should be balanced: A=${beltASize}, B=${beltBSize}`)

        // Each should have roughly half
        const expectedSize = Math.floor(total / 2)
        assert.ok(beltASize >= expectedSize - 1 && beltASize <= expectedSize + 1,
          `${setCode} Belt A should be ~${expectedSize}, got ${beltASize}`)
      }
    })
  })

  describe('No Duplicates Within Belt', () => {
    test('No card appears twice in same belt for any set', async (t) => {
      for (const [setCode, assignments] of Object.entries(COMMON_BELT_ASSIGNMENTS)) {
        const beltASet = new Set(assignments.beltA)
        const beltBSet = new Set(assignments.beltB)

        assert.strictEqual(beltASet.size, assignments.beltA.length,
          `${setCode} Belt A has duplicate cards`)
        assert.strictEqual(beltBSet.size, assignments.beltB.length,
          `${setCode} Belt B has duplicate cards`)
      }
    })

    test('No card appears in both belts for same set', async (t) => {
      for (const [setCode, assignments] of Object.entries(COMMON_BELT_ASSIGNMENTS)) {
        const beltASet = new Set(assignments.beltA)
        const overlap = assignments.beltB.filter(name => beltASet.has(name))

        assert.strictEqual(overlap.length, 0,
          `${setCode} has cards in both belts: ${overlap.join(', ')}`)
      }
    })
  })

  describe('Block Detection', () => {
    test('getBlockForSet returns correct block', async (t) => {
      assert.strictEqual(getBlockForSet('SOR'), 0)
      assert.strictEqual(getBlockForSet('SHD'), 0)
      assert.strictEqual(getBlockForSet('TWI'), 0)
      assert.strictEqual(getBlockForSet('JTL'), 'A')
      assert.strictEqual(getBlockForSet('LOF'), 'A')
      assert.strictEqual(getBlockForSet('SEC'), 'A')
      assert.strictEqual(getBlockForSet('LAW'), 'B')
    })
  })

  describe('Belt Configuration', () => {
    test('Block 0 config is correct', async (t) => {
      const config = getBeltConfig(0)
      assert.strictEqual(config.beltASlots, 6)
      assert.strictEqual(config.beltBSlots, 3)
      assert.strictEqual(config.alternatingSlot, null)
      assert.strictEqual(config.hyperspaceSlot, 6)
      assert.strictEqual(config.targetBeltASize, 60)
      assert.strictEqual(config.targetBeltBSize, 30)
    })

    test('Block A config is correct', async (t) => {
      const config = getBeltConfig('A')
      assert.strictEqual(config.beltASlots, 4)
      assert.strictEqual(config.beltBSlots, 4)
      assert.strictEqual(config.alternatingSlot, 5)
      assert.strictEqual(config.hyperspaceSlot, 4)
      assert.strictEqual(config.targetBeltASize, 50)
      assert.strictEqual(config.targetBeltBSize, 50)
    })

    test('Block B config is correct (LAW+)', async (t) => {
      const config = getBeltConfig('B')
      assert.strictEqual(config.beltASlots, 4)
      assert.strictEqual(config.beltBSlots, 4)
      assert.strictEqual(config.alternatingSlot, null, 'LAW has no alternating slot (slot 5 is dedicated HS)')
      assert.strictEqual(config.hyperspaceSlot, 5, 'LAW uses slot 5 for dedicated HS common')
      assert.strictEqual(config.targetBeltASize, 50)
      assert.strictEqual(config.targetBeltBSize, 50)
      assert.strictEqual(config.guaranteedHyperspace, undefined, 'LAW uses dedicated belt, not upgrade flag')
    })
  })

  describe('CommonBelt Card Loading', () => {
    test('getBeltCards returns correct number of cards (static assignments)', async (t) => {
      for (const [setCode, assignments] of Object.entries(COMMON_BELT_ASSIGNMENTS)) {
        // Skip sets with autoAssign - they use dynamic aspect-based assignment
        if (assignments.autoAssign) continue

        const beltACards = getBeltCards(setCode, 'A')
        const beltBCards = getBeltCards(setCode, 'B')

        assert.strictEqual(beltACards.length, assignments.beltA.length,
          `${setCode} Belt A should load ${assignments.beltA.length} cards, got ${beltACards.length}`)
        assert.strictEqual(beltBCards.length, assignments.beltB.length,
          `${setCode} Belt B should load ${assignments.beltB.length} cards, got ${beltBCards.length}`)
      }
    })

    test('LAW uses autoAssign with ~50/50 belt split', async (t) => {
      const assignments = COMMON_BELT_ASSIGNMENTS['LAW']
      assert.ok(assignments.autoAssign, 'LAW should have autoAssign enabled')

      const beltACards = getBeltCards('LAW', 'A')
      const beltBCards = getBeltCards('LAW', 'B')

      // Both belts should have cards (not empty)
      assert.ok(beltACards.length > 0, 'LAW Belt A should have cards via autoAssign')
      assert.ok(beltBCards.length > 0, 'LAW Belt B should have cards via autoAssign')

      // Should have roughly 50/50 split (within 5 cards difference)
      const total = beltACards.length + beltBCards.length
      const diff = Math.abs(beltACards.length - beltBCards.length)
      assert.ok(diff <= 10,
        `LAW belts should be roughly balanced: A=${beltACards.length}, B=${beltBCards.length}`)
      assert.ok(total >= 80,
        `LAW should have ~100 commons total, got ${total}`)
    })

    test('ASH uses observed 50/50 common belt split with neutral overrides', async (t) => {
      const assignments = COMMON_BELT_ASSIGNMENTS['ASH']
      assert.ok(assignments.autoAssign, 'ASH should have autoAssign enabled')

      const beltACards = getBeltCards('ASH', 'A')
      const beltBCards = getBeltCards('ASH', 'B')
      const beltANames = new Set(beltACards.map(c => c.name))
      const beltBNames = new Set(beltBCards.map(c => c.name))

      assert.strictEqual(beltACards.length, 50, `ASH Belt A should have 50 cards, got ${beltACards.length}`)
      assert.strictEqual(beltBCards.length, 50, `ASH Belt B should have 50 cards, got ${beltBCards.length}`)

      for (const name of ['LEP Ratcatcher', 'Mos Espa Watermonger', 'Noti Mobile Pod']) {
        assert.ok(beltANames.has(name), `${name} should be on ASH Belt A`)
      }

      for (const name of ['Faith in the Empire', "The Way of the Mand'alor", 'A New Order']) {
        assert.ok(beltBNames.has(name), `${name} should be on ASH Belt B`)
      }

      for (const name of ['Covert Veteran', 'Imperial Defector', 'Zealous Soldier', 'N5 Sentry Droid', 'Gallofree Transport', 'Rebel Infiltrators', 'Grassroots Resistance']) {
        assert.ok(beltBNames.has(name), `${name} should be on ASH Belt B`)
      }
    })
  })

  describe('Pack Generation Slot Patterns', () => {
    test('Block 0 pack mostly follows slot pattern (some replaced for aspect coverage)', async (t) => {
      const cards = getCachedCards('SOR')

      // Generate multiple packs and check that MOST cards follow the pattern
      // Some may be replaced by ensureAspectCoverage
      let beltACorrect = 0
      let beltBCorrect = 0
      let total = 0
      const packCount = 10

      const assignments = COMMON_BELT_ASSIGNMENTS['SOR']
      const beltANames = new Set(assignments.beltA)
      const beltBNames = new Set(assignments.beltB)

      for (let p = 0; p < packCount; p++) {
        const pack = generateBoosterPack(cards, 'SOR')
        const commons = pack.cards.slice(2, 11)

        // Slots 1-6 should mostly be from Belt A
        for (let i = 0; i < 6; i++) {
          const card = commons[i]
          if (card && beltANames.has(card.name)) beltACorrect++
          total++
        }

        // Slots 7-9 should mostly be from Belt B
        for (let i = 6; i < 9; i++) {
          const card = commons[i]
          if (card && beltBNames.has(card.name)) beltBCorrect++
        }
      }

      // At least 80% should match (allows for aspect coverage fixes)
      const beltARate = beltACorrect / (packCount * 6)
      const beltBRate = beltBCorrect / (packCount * 3)

      assert.ok(beltARate >= 0.8,
        `Belt A slots should be at least 80% correct, got ${(beltARate * 100).toFixed(1)}%`)
      assert.ok(beltBRate >= 0.8,
        `Belt B slots should be at least 80% correct, got ${(beltBRate * 100).toFixed(1)}%`)
    })

    test('Block A pack mostly follows slot pattern', async (t) => {
      const cards = getCachedCards('JTL')

      // Generate multiple packs
      let beltACorrect = 0
      let beltBCorrect = 0
      const packCount = 10

      const assignments = COMMON_BELT_ASSIGNMENTS['JTL']
      const beltANames = new Set(assignments.beltA)
      const beltBNames = new Set(assignments.beltB)

      for (let p = 0; p < packCount; p++) {
        const pack = generateBoosterPack(cards, 'JTL')
        const commons = pack.cards.slice(2, 11)

        // Slots 1-4 should mostly be from Belt A
        for (let i = 0; i < 4; i++) {
          const card = commons[i]
          if (card && beltANames.has(card.name)) beltACorrect++
        }

        // Slots 6-9 should mostly be from Belt B
        for (let i = 5; i < 9; i++) {
          const card = commons[i]
          if (card && beltBNames.has(card.name)) beltBCorrect++
        }
      }

      // At least 80% should match
      const beltARate = beltACorrect / (packCount * 4)
      const beltBRate = beltBCorrect / (packCount * 4)

      assert.ok(beltARate >= 0.8,
        `Belt A slots should be at least 80% correct, got ${(beltARate * 100).toFixed(1)}%`)
      assert.ok(beltBRate >= 0.8,
        `Belt B slots should be at least 80% correct, got ${(beltBRate * 100).toFixed(1)}%`)
    })
  })

  describe('No Pack Duplicates', () => {
    test('Pack should not have duplicate commons', async (t) => {
      for (const setCode of ['SOR', 'JTL']) {
        const cards = getCachedCards(setCode)

        // Generate multiple packs to test
        for (let p = 0; p < 10; p++) {
          const pack = generateBoosterPack(cards, setCode)
          const commons = pack.cards.slice(2, 11)
          const names = commons.map(c => c.name)
          const uniqueNames = new Set(names)

          assert.strictEqual(uniqueNames.size, names.length,
            `${setCode} pack ${p + 1} has duplicate commons: ${names.join(', ')}`)
        }
      }
    })
  })
})

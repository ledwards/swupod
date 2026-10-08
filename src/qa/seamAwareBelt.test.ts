// @ts-nocheck
/**
 * QA Tests for Seam-Aware Belt Refill
 *
 * MANUFACTURING PRINCIPLE:
 * The belt refills when it has exactly drawSize cards left.
 * The new boot's first segment is constructed to complement the
 * remaining "seam cards", ensuring draws that span the seam
 * still satisfy aspect constraints.
 *
 * REFILL THRESHOLDS:
 * - Block 0 Belt A: refill at ≤6 cards (draws 6 per pack)
 * - Block 0 Belt B: refill at ≤3 cards (draws 3 per pack)
 * - Block A Belt A: refill at ≤4 cards (draws 4 per pack)
 * - Block A Belt B: refill at ≤4 cards (draws 4 per pack)
 */

import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert'
import { initializeCardCache, getCachedCards } from '../utils/cardCache'
import { generateBoosterPack, clearBeltCache } from '../utils/boosterPack'
import { CommonBelt } from '../belts/CommonBelt'

// Aspect constants
const BLUE = 'Vigilance'
const GREEN = 'Command'
const RED = 'Aggression'
const YELLOW = 'Cunning'

function cardHasAspect(card: any, aspect: string): boolean {
  return card.aspects && card.aspects.includes(aspect)
}

describe('Seam-Aware Belt Refill QA', () => {
  beforeEach(async () => {
    await initializeCardCache()
    clearBeltCache()
  })

  describe('Refill Threshold Behavior', () => {
    test('Block 0 Belt A refills at ≤6 cards', async (t) => {
      const belt = new CommonBelt('SOR', 'A')
      const initialSize = belt.size

      // Draw until we're at the threshold
      while (belt.size > 6) {
        belt.next()
      }

      const sizeAtThreshold = belt.size
      assert.ok(sizeAtThreshold <= 6, `Should be at threshold: ${sizeAtThreshold}`)

      // Next draw triggers refill
      belt.next()
      assert.ok(belt.size > 6, `Should have refilled: ${belt.size}`)
    })

    test('Block 0 Belt B refills at ≤3 cards', async (t) => {
      const belt = new CommonBelt('SOR', 'B')

      // Draw until we're at the threshold
      while (belt.size > 3) {
        belt.next()
      }

      const sizeAtThreshold = belt.size
      assert.ok(sizeAtThreshold <= 3, `Should be at threshold: ${sizeAtThreshold}`)

      // Next draw triggers refill
      belt.next()
      assert.ok(belt.size > 3, `Should have refilled: ${belt.size}`)
    })

    test('Block A Belt A refills at ≤4 cards', async (t) => {
      const belt = new CommonBelt('JTL', 'A')

      while (belt.size > 4) {
        belt.next()
      }

      const sizeAtThreshold = belt.size
      assert.ok(sizeAtThreshold <= 4, `Should be at threshold: ${sizeAtThreshold}`)

      belt.next()
      assert.ok(belt.size > 4, `Should have refilled: ${belt.size}`)
    })

    test('Block A Belt B refills at ≤4 cards', async (t) => {
      const belt = new CommonBelt('JTL', 'B')

      while (belt.size > 4) {
        belt.next()
      }

      const sizeAtThreshold = belt.size
      assert.ok(sizeAtThreshold <= 4, `Should be at threshold: ${sizeAtThreshold}`)

      belt.next()
      assert.ok(belt.size > 4, `Should have refilled: ${belt.size}`)
    })
  })

  describe('Seam Aspect Coverage', () => {
    test('Block 0 Belt A: 100 consecutive 6-card draws always have BGR', async (t) => {
      const belt = new CommonBelt('SOR', 'A')

      let failures = 0
      const failureDetails: Array<{ pack: number; missing: string[] }> = []

      // Draw 100 packs worth (600 cards, multiple refills)
      for (let pack = 0; pack < 100; pack++) {
        const cards: any[] = []
        for (let i = 0; i < 6; i++) {
          cards.push(belt.next())
        }

        const hasB = cards.some(c => cardHasAspect(c, BLUE))
        const hasG = cards.some(c => cardHasAspect(c, GREEN))
        const hasR = cards.some(c => cardHasAspect(c, RED))

        if (!hasB || !hasG || !hasR) {
          failures++
          if (failureDetails.length < 5) {
            failureDetails.push({
              pack,
              missing: [
                !hasB ? 'B' : null,
                !hasG ? 'G' : null,
                !hasR ? 'R' : null
              ].filter(Boolean) as string[]
            })
          }
        }
      }

      assert.strictEqual(failures, 0,
        `${failures}/100 packs missing BGR. Examples: ${JSON.stringify(failureDetails)}`)
    })

    test('Block 0 Belt B: 100 consecutive 3-card draws always have Y', async (t) => {
      const belt = new CommonBelt('SOR', 'B')

      let failures = 0

      for (let pack = 0; pack < 100; pack++) {
        const cards: any[] = []
        for (let i = 0; i < 3; i++) {
          cards.push(belt.next())
        }

        const hasY = cards.some(c => cardHasAspect(c, YELLOW))

        if (!hasY) failures++
      }

      assert.strictEqual(failures, 0, `${failures}/100 packs missing Yellow`)
    })

    test('Block A Belt A: 100 consecutive 4-card draws always have BG', async (t) => {
      const belt = new CommonBelt('JTL', 'A')

      let failures = 0

      for (let pack = 0; pack < 100; pack++) {
        const cards: any[] = []
        for (let i = 0; i < 4; i++) {
          cards.push(belt.next())
        }

        const hasB = cards.some(c => cardHasAspect(c, BLUE))
        const hasG = cards.some(c => cardHasAspect(c, GREEN))

        if (!hasB || !hasG) failures++
      }

      assert.strictEqual(failures, 0, `${failures}/100 packs missing Blue/Green`)
    })

    test('Block A Belt B: 100 consecutive 4-card draws always have RY', async (t) => {
      const belt = new CommonBelt('JTL', 'B')

      let failures = 0

      for (let pack = 0; pack < 100; pack++) {
        const cards: any[] = []
        for (let i = 0; i < 4; i++) {
          cards.push(belt.next())
        }

        const hasR = cards.some(c => cardHasAspect(c, RED))
        const hasY = cards.some(c => cardHasAspect(c, YELLOW))

        if (!hasR || !hasY) failures++
      }

      assert.strictEqual(failures, 0, `${failures}/100 packs missing Red/Yellow`)
    })
  })

  describe('Cross-Seam Verification', () => {
    test('Aspect coverage maintained across multiple refills', async (t) => {
      // This test specifically targets the seam by drawing exactly
      // to the refill point and verifying the next draw has coverage

      const belt = new CommonBelt('SOR', 'A')
      const drawSize = 6
      let seamCrossings = 0
      let failures = 0

      // Run through 10 complete belt cycles
      for (let cycle = 0; cycle < 10; cycle++) {
        // Draw until we hit the seam (≤ drawSize cards left)
        while (belt.size > drawSize) {
          belt.next()
        }

        // This draw crosses the seam
        seamCrossings++
        const seamCards: any[] = []
        for (let i = 0; i < drawSize; i++) {
          seamCards.push(belt.next())
        }

        const hasB = seamCards.some(c => cardHasAspect(c, BLUE))
        const hasG = seamCards.some(c => cardHasAspect(c, GREEN))
        const hasR = seamCards.some(c => cardHasAspect(c, RED))

        if (!hasB || !hasG || !hasR) {
          failures++
        }
      }

      assert.strictEqual(failures, 0,
        `${failures}/${seamCrossings} seam-crossing draws missing aspects`)
    })

    test('Full pack generation maintains coverage across 200 packs', async (t) => {
      const cards = getCachedCards('SOR')

      let failures = 0
      const basicAspects = [BLUE, GREEN, RED, YELLOW]

      for (let p = 0; p < 200; p++) {
        const pack = generateBoosterPack(cards, 'SOR')
        const commons = pack.cards.slice(2, 11) // 9 commons

        for (const aspect of basicAspects) {
          if (!commons.some((c: any) => cardHasAspect(c, aspect))) {
            failures++
            break
          }
        }
      }

      assert.strictEqual(failures, 0,
        `${failures}/200 packs missing basic aspects`)
    })
  })

  describe('Deduplication at Seam', () => {
    test('No duplicate cards within drawSize window across seam', async (t) => {
      const belt = new CommonBelt('SOR', 'A')
      const drawSize = 6

      let duplicatesFound = 0

      // Draw 50 packs worth, checking each for duplicates
      for (let pack = 0; pack < 50; pack++) {
        const cards: any[] = []
        for (let i = 0; i < drawSize; i++) {
          cards.push(belt.next())
        }

        // Check for duplicates within this draw
        const ids = cards.map(c => c.id)
        const uniqueIds = new Set(ids)
        if (uniqueIds.size !== ids.length) {
          duplicatesFound++
        }
      }

      assert.strictEqual(duplicatesFound, 0,
        `${duplicatesFound}/50 packs had duplicate cards`)
    })
  })

  describe('All Sets Coverage', () => {
    const sets = [
      { code: 'SOR', block: 0 },
      { code: 'SHD', block: 0 },
      { code: 'TWI', block: 0 },
      { code: 'JTL', block: 'A' },
      { code: 'LOF', block: 'A' },
      { code: 'SEC', block: 'A' }
    ]

    for (const { code, block } of sets) {
      test(`${code}: 50 packs have all basic aspects`, async (t) => {
        clearBeltCache()
        const cards = getCachedCards(code)

        let failures = 0
        const basicAspects = [BLUE, GREEN, RED, YELLOW]

        for (let p = 0; p < 50; p++) {
          const pack = generateBoosterPack(cards, code)
          const commons = pack.cards.slice(2, 11)

          for (const aspect of basicAspects) {
            if (!commons.some((c: any) => cardHasAspect(c, aspect))) {
              failures++
              break
            }
          }
        }

        assert.strictEqual(failures, 0,
          `${code}: ${failures}/50 packs missing basic aspects`)
      })
    }
  })
})

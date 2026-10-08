// @ts-nocheck
/**
 * QA Tests for Belt Slot Aspect Distribution
 *
 * MANUFACTURING PRINCIPLE:
 * We mimic a physical card manufacturing process. The belt is constructed
 * so that every segment of N cards (where N = slots filled from that belt)
 * contains the required aspects. No post-hoc fixes are used.
 *
 * Block 0 (Sets 1-3: SOR, SHD, TWI):
 * - Belt A (slots 1-6): Every 6 cards has at least 1 B, 1 G, 1 R
 * - Belt B (slots 7-9): Every 3 cards has at least 1 Y
 *
 * Block A (Sets 4-6: JTL, LOF, SEC):
 * - Belt A (slots 1-4): Every 4 cards has at least 1 B, 1 G
 * - Belt B (slots 6-9): Every 4 cards has at least 1 R, 1 Y
 */

import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert'
import { initializeCardCache, getCachedCards } from '../utils/cardCache'
import { generateBoosterPack, clearBeltCache } from '../utils/boosterPack'

// Aspect color mappings
const BLUE = 'Vigilance'
const GREEN = 'Command'
const RED = 'Aggression'
const YELLOW = 'Cunning'

/**
 * Check if a card has a specific aspect
 */
function cardHasAspect(card: any, aspect: string): boolean {
  return card.aspects && card.aspects.includes(aspect)
}

/**
 * Get aspect description for a card
 */
function getAspectDesc(card: any): string {
  const aspects = card.aspects || []
  return aspects.length === 0 ? 'Neutral' : aspects.join('/')
}

describe('Belt Slot Aspect Distribution QA', () => {
  const PACK_COUNT = 100 // Generate enough packs for statistical confidence

  beforeEach(async () => {
    await initializeCardCache()
    clearBeltCache()
  })

  describe('Block 0 (Sets 1-3): Slots 1-6 should have BGR, Slots 7-9 should have Y', () => {
    const block0Sets = ['SOR', 'SHD', 'TWI']

    for (const setCode of block0Sets) {
      test(`${setCode}: First 6 common slots have B, G, R aspects`, async (t) => {
        const cards = getCachedCards(setCode)

        let missingB = 0
        let missingG = 0
        let missingR = 0

        for (let p = 0; p < PACK_COUNT; p++) {
          const pack = generateBoosterPack(cards, setCode)
          // Commons are at indices 2-10 (after leader and base)
          // Slots 1-6 are indices 2-7
          const beltACommons = pack.cards.slice(2, 8)

          const hasB = beltACommons.some((c: any) => cardHasAspect(c, BLUE))
          const hasG = beltACommons.some((c: any) => cardHasAspect(c, GREEN))
          const hasR = beltACommons.some((c: any) => cardHasAspect(c, RED))

          if (!hasB) missingB++
          if (!hasG) missingG++
          if (!hasR) missingR++
        }

        // Should never be missing any required aspect
        assert.strictEqual(missingB, 0,
          `${setCode} slots 1-6 missing Blue in ${missingB}/${PACK_COUNT} packs`)
        assert.strictEqual(missingG, 0,
          `${setCode} slots 1-6 missing Green in ${missingG}/${PACK_COUNT} packs`)
        assert.strictEqual(missingR, 0,
          `${setCode} slots 1-6 missing Red in ${missingR}/${PACK_COUNT} packs`)
      })

      test(`${setCode}: Slots 7-9 have Yellow aspect`, async (t) => {
        const cards = getCachedCards(setCode)

        let missingY = 0

        for (let p = 0; p < PACK_COUNT; p++) {
          const pack = generateBoosterPack(cards, setCode)
          // Slots 7-9 are indices 8-10
          const beltBCommons = pack.cards.slice(8, 11)

          const hasY = beltBCommons.some((c: any) => cardHasAspect(c, YELLOW))

          if (!hasY) missingY++
        }

        // Should never be missing Yellow
        assert.strictEqual(missingY, 0,
          `${setCode} slots 7-9 missing Yellow in ${missingY}/${PACK_COUNT} packs`)
      })
    }
  })

  describe('Block A (Sets 4-6): Slots 1-4 should have BG, Slots 6-9 should have RY', () => {
    const blockASets = ['JTL', 'LOF', 'SEC']

    for (const setCode of blockASets) {
      test(`${setCode}: First 4 common slots have B, G aspects`, async (t) => {
        const cards = getCachedCards(setCode)

        let missingB = 0
        let missingG = 0

        for (let p = 0; p < PACK_COUNT; p++) {
          const pack = generateBoosterPack(cards, setCode)
          // Slots 1-4 are indices 2-5
          const beltACommons = pack.cards.slice(2, 6)

          const hasB = beltACommons.some((c: any) => cardHasAspect(c, BLUE))
          const hasG = beltACommons.some((c: any) => cardHasAspect(c, GREEN))

          if (!hasB) missingB++
          if (!hasG) missingG++
        }

        // Should never be missing any required aspect
        assert.strictEqual(missingB, 0,
          `${setCode} slots 1-4 missing Blue in ${missingB}/${PACK_COUNT} packs`)
        assert.strictEqual(missingG, 0,
          `${setCode} slots 1-4 missing Green in ${missingG}/${PACK_COUNT} packs`)
      })

      test(`${setCode}: Slots 6-9 have R, Y aspects`, async (t) => {
        const cards = getCachedCards(setCode)

        let missingR = 0
        let missingY = 0

        for (let p = 0; p < PACK_COUNT; p++) {
          const pack = generateBoosterPack(cards, setCode)
          // Slots 6-9 are indices 7-10
          const beltBCommons = pack.cards.slice(7, 11)

          const hasR = beltBCommons.some((c: any) => cardHasAspect(c, RED))
          const hasY = beltBCommons.some((c: any) => cardHasAspect(c, YELLOW))

          if (!hasR) missingR++
          if (!hasY) missingY++
        }

        // Should never be missing any required aspect
        assert.strictEqual(missingR, 0,
          `${setCode} slots 6-9 missing Red in ${missingR}/${PACK_COUNT} packs`)
        assert.strictEqual(missingY, 0,
          `${setCode} slots 6-9 missing Yellow in ${missingY}/${PACK_COUNT} packs`)
      })
    }
  })

  describe('Detailed Slot Analysis', () => {
    test('SOR: Show aspect distribution across all slots', async (t) => {
      const cards = getCachedCards('SOR')

      // Track aspect counts per slot
      const slotAspects = Array(9).fill(null).map(() => ({
        [BLUE]: 0, [GREEN]: 0, [RED]: 0, [YELLOW]: 0,
        Heroism: 0, Villainy: 0, Neutral: 0
      }))

      for (let p = 0; p < PACK_COUNT; p++) {
        const pack = generateBoosterPack(cards, 'SOR')
        const commons = pack.cards.slice(2, 11)

        commons.forEach((card: any, idx: number) => {
          if (!card) return
          const aspects = card.aspects || []
          if (aspects.length === 0) {
            slotAspects[idx].Neutral++
          } else {
            aspects.forEach((aspect: string) => {
              if ((slotAspects[idx] as any)[aspect] !== undefined) {
                (slotAspects[idx] as any)[aspect]++
              }
            })
          }
        })
      }

      console.log('\nSOR Slot Aspect Distribution (out of ' + PACK_COUNT + ' packs):')
      console.log('Slot | Blue | Green | Red | Yellow | Heroism | Villainy | Neutral')
      console.log('-----|------|-------|-----|--------|---------|----------|--------')

      slotAspects.forEach((aspects, idx) => {
        const row = [
          `  ${idx + 1}  `,
          String(aspects[BLUE]).padStart(4),
          String(aspects[GREEN]).padStart(5),
          String(aspects[RED]).padStart(3),
          String(aspects[YELLOW]).padStart(6),
          String(aspects.Heroism).padStart(7),
          String(aspects.Villainy).padStart(8),
          String(aspects.Neutral).padStart(7),
        ]
        console.log(row.join(' |'))
      })

      // Verify slots 1-6 always have B, G, R combined
      let packsMissingBGR = 0
      clearBeltCache()
      for (let p = 0; p < PACK_COUNT; p++) {
        const pack = generateBoosterPack(cards, 'SOR')
        const beltACommons = pack.cards.slice(2, 8)

        const hasB = beltACommons.some((c: any) => cardHasAspect(c, BLUE))
        const hasG = beltACommons.some((c: any) => cardHasAspect(c, GREEN))
        const hasR = beltACommons.some((c: any) => cardHasAspect(c, RED))

        if (!hasB || !hasG || !hasR) packsMissingBGR++
      }

      assert.strictEqual(packsMissingBGR, 0,
        `SOR: ${packsMissingBGR} packs missing B/G/R in slots 1-6`)
    })

    test('JTL: Show aspect distribution across all slots', async (t) => {
      const cards = getCachedCards('JTL')

      const slotAspects = Array(9).fill(null).map(() => ({
        [BLUE]: 0, [GREEN]: 0, [RED]: 0, [YELLOW]: 0,
        Heroism: 0, Villainy: 0, Neutral: 0
      }))

      for (let p = 0; p < PACK_COUNT; p++) {
        const pack = generateBoosterPack(cards, 'JTL')
        const commons = pack.cards.slice(2, 11)

        commons.forEach((card: any, idx: number) => {
          if (!card) return
          const aspects = card.aspects || []
          if (aspects.length === 0) {
            slotAspects[idx].Neutral++
          } else {
            aspects.forEach((aspect: string) => {
              if ((slotAspects[idx] as any)[aspect] !== undefined) {
                (slotAspects[idx] as any)[aspect]++
              }
            })
          }
        })
      }

      console.log('\nJTL Slot Aspect Distribution (out of ' + PACK_COUNT + ' packs):')
      console.log('Slot | Blue | Green | Red | Yellow | Heroism | Villainy | Neutral')
      console.log('-----|------|-------|-----|--------|---------|----------|--------')

      slotAspects.forEach((aspects, idx) => {
        const row = [
          `  ${idx + 1}  `,
          String(aspects[BLUE]).padStart(4),
          String(aspects[GREEN]).padStart(5),
          String(aspects[RED]).padStart(3),
          String(aspects[YELLOW]).padStart(6),
          String(aspects.Heroism).padStart(7),
          String(aspects.Villainy).padStart(8),
          String(aspects.Neutral).padStart(7),
        ]
        console.log(row.join(' |'))
      })

      // Verify slots 1-4 always have B, G combined
      let packsMissingBG = 0
      clearBeltCache()
      for (let p = 0; p < PACK_COUNT; p++) {
        const pack = generateBoosterPack(cards, 'JTL')
        const beltACommons = pack.cards.slice(2, 6)

        const hasB = beltACommons.some((c: any) => cardHasAspect(c, BLUE))
        const hasG = beltACommons.some((c: any) => cardHasAspect(c, GREEN))

        if (!hasB || !hasG) packsMissingBG++
      }

      assert.strictEqual(packsMissingBG, 0,
        `JTL: ${packsMissingBG} packs missing B/G in slots 1-4`)

      // Verify slots 6-9 always have R, Y combined
      let packsMissingRY = 0
      clearBeltCache()
      for (let p = 0; p < PACK_COUNT; p++) {
        const pack = generateBoosterPack(cards, 'JTL')
        const beltBCommons = pack.cards.slice(7, 11)

        const hasR = beltBCommons.some((c: any) => cardHasAspect(c, RED))
        const hasY = beltBCommons.some((c: any) => cardHasAspect(c, YELLOW))

        if (!hasR || !hasY) packsMissingRY++
      }

      assert.strictEqual(packsMissingRY, 0,
        `JTL: ${packsMissingRY} packs missing R/Y in slots 6-9`)
    })
  })
})

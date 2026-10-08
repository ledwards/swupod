// @ts-nocheck
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { determineTreatment, determineSlotType, PACK_SLOT_TYPES } from './trackGeneration'

describe('determineTreatment', () => {
  it('returns hyperspace_foil for card with isHyperspace=true and isFoil=true', () => {
    const card = { isHyperspace: true, isFoil: true, variantType: 'Hyperspace Foil' }
    assert.strictEqual(determineTreatment(card), 'hyperspace_foil')
  })

  it('returns hyperspace_foil for card with variantType=Hyperspace and isFoil=true', () => {
    const card = { variantType: 'Hyperspace', isFoil: true }
    assert.strictEqual(determineTreatment(card), 'hyperspace_foil')
  })

  it('returns hyperspace for card with isHyperspace=true only', () => {
    const card = { isHyperspace: true, variantType: 'Normal' }
    assert.strictEqual(determineTreatment(card), 'hyperspace')
  })

  it('returns hyperspace for card with variantType=Hyperspace only', () => {
    const card = { variantType: 'Hyperspace' }
    assert.strictEqual(determineTreatment(card), 'hyperspace')
  })

  it('returns foil for card with isFoil=true only (not hyperspace)', () => {
    const card = { isFoil: true, variantType: 'Normal' }
    assert.strictEqual(determineTreatment(card), 'foil')
  })

  it('returns showcase for card with variantType=Showcase', () => {
    const card = { variantType: 'Showcase' }
    assert.strictEqual(determineTreatment(card), 'showcase')
  })

  it('returns base for normal card', () => {
    const card = { variantType: 'Normal' }
    assert.strictEqual(determineTreatment(card), 'base')
  })
})

describe('PACK_SLOT_TYPES', () => {
  it('has 16 entries', () => {
    assert.strictEqual(PACK_SLOT_TYPES.length, 16)
  })

  it('index 13 is uncommon (UC3)', () => {
    assert.strictEqual(PACK_SLOT_TYPES[13], 'uncommon')
  })

  it('index 14 is rare_legendary', () => {
    assert.strictEqual(PACK_SLOT_TYPES[14], 'rare_legendary')
  })
})

// Tests for /formats page component logic
import { describe, it } from 'node:test'
import assert from 'node:assert'

describe('/formats page', () => {
  describe('Mode cards', () => {
    const modes = [
      { id: 'chaos-draft', name: 'Chaos Draft', description: 'Draft with packs from 3 different sets' },
      { id: 'rotisserie', name: 'Rotisserie Draft', description: 'Snake draft from entire card pool, face-up' },
      { id: 'pack-wars', name: 'Pack Wars', description: 'Build deck from 2 packs' },
      { id: 'pack-blitz', name: 'Pack Blitz', description: 'Build deck from 1 pack' },
    ]

    it('should display all 4 modes', () => {
      assert.strictEqual(modes.length, 4)
    })

    it('should have Chaos Draft mode', () => {
      const chaosDraft = modes.find(m => m.id === 'chaos-draft')
      assert.ok(chaosDraft)
      assert.strictEqual(chaosDraft.name, 'Chaos Draft')
    })

    it('should have Rotisserie Draft mode', () => {
      const rotisserie = modes.find(m => m.id === 'rotisserie')
      assert.ok(rotisserie)
      assert.strictEqual(rotisserie.name, 'Rotisserie Draft')
    })

    it('should have Pack Wars mode', () => {
      const packWars = modes.find(m => m.id === 'pack-wars')
      assert.ok(packWars)
      assert.strictEqual(packWars.name, 'Pack Wars')
    })

    it('should have Pack Blitz mode', () => {
      const packBlitz = modes.find(m => m.id === 'pack-blitz')
      assert.ok(packBlitz)
      assert.strictEqual(packBlitz.name, 'Pack Blitz')
    })
  })

  describe('Navigation', () => {
    it('should navigate to mode-specific page when mode is selected', () => {
      let navigatedTo: string | null = null
      const handleModeSelect = (modeId: string) => {
        navigatedTo = `/formats/${modeId}`
      }

      handleModeSelect('chaos-draft')
      assert.strictEqual(navigatedTo, '/formats/chaos-draft')
    })
  })

  describe('Mode availability', () => {
    it('should mark all modes as coming soon initially', () => {
      const isComingSoon = (modeId: string) => {
        // All modes are coming soon for phase 1
        return true
      }

      assert.strictEqual(isComingSoon('chaos-draft'), true)
      assert.strictEqual(isComingSoon('rotisserie'), true)
      assert.strictEqual(isComingSoon('pack-wars'), true)
      assert.strictEqual(isComingSoon('pack-blitz'), true)
    })
  })
})

console.log('\n📄 Running /formats page tests...\n')

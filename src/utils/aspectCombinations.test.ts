// @ts-nocheck
import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  getAspectCombinationKey,
  getAspectCombinationDisplayName,
  getAspectKey,
} from './aspectCombinations.ts'

describe('aspectCombinations', () => {
  describe('getAspectCombinationKey', () => {
    describe('single aspects', () => {
      it('returns lowercase for primary aspects', () => {
        assert.strictEqual(getAspectCombinationKey({ aspects: ['Vigilance'] }), 'vigilance')
        assert.strictEqual(getAspectCombinationKey({ aspects: ['Command'] }), 'command')
        assert.strictEqual(getAspectCombinationKey({ aspects: ['Aggression'] }), 'aggression')
        assert.strictEqual(getAspectCombinationKey({ aspects: ['Cunning'] }), 'cunning')
      })

      it('returns lowercase for secondary aspects', () => {
        assert.strictEqual(getAspectCombinationKey({ aspects: ['Villainy'] }), 'villainy')
        assert.strictEqual(getAspectCombinationKey({ aspects: ['Heroism'] }), 'heroism')
      })

      it('returns neutral for empty aspects', () => {
        assert.strictEqual(getAspectCombinationKey({ aspects: [] }), 'neutral')
        assert.strictEqual(getAspectCombinationKey({}), 'neutral')
      })
    })

    describe('dual aspects', () => {
      it('returns primary_villainy for primary + villainy', () => {
        assert.strictEqual(getAspectCombinationKey({ aspects: ['Vigilance', 'Villainy'] }), 'vigilance_villainy')
        assert.strictEqual(getAspectCombinationKey({ aspects: ['Command', 'Villainy'] }), 'command_villainy')
      })

      it('returns primary_heroism for primary + heroism', () => {
        assert.strictEqual(getAspectCombinationKey({ aspects: ['Vigilance', 'Heroism'] }), 'vigilance_heroism')
        assert.strictEqual(getAspectCombinationKey({ aspects: ['Aggression', 'Heroism'] }), 'aggression_heroism')
      })

      it('returns villainy_heroism for villainy + heroism', () => {
        assert.strictEqual(getAspectCombinationKey({ aspects: ['Villainy', 'Heroism'] }), 'villainy_heroism')
      })

      it('handles double primary aspects', () => {
        assert.strictEqual(getAspectCombinationKey({ aspects: ['Command', 'Command'] }), 'command_command')
        assert.strictEqual(getAspectCombinationKey({ aspects: ['Vigilance', 'Vigilance'] }), 'vigilance_vigilance')
      })
    })

    describe('three+ aspects', () => {
      it('returns sorted lowercase combination', () => {
        const card = { aspects: ['Vigilance', 'Command', 'Villainy'] }
        const key = getAspectCombinationKey(card)
        assert.strictEqual(key.includes('command'), true)
        assert.strictEqual(key.includes('vigilance'), true)
        assert.strictEqual(key.includes('villainy'), true)
      })
    })
  })

  describe('getAspectCombinationDisplayName', () => {
    it('capitalizes single aspects', () => {
      assert.strictEqual(getAspectCombinationDisplayName('vigilance'), 'Vigilance')
      assert.strictEqual(getAspectCombinationDisplayName('command'), 'Command')
      assert.strictEqual(getAspectCombinationDisplayName('neutral'), 'Neutral')
    })

    it('formats dual aspects with space', () => {
      assert.strictEqual(getAspectCombinationDisplayName('vigilance_villainy'), 'Vigilance Villainy')
      assert.strictEqual(getAspectCombinationDisplayName('command_heroism'), 'Command Heroism')
    })

    it('handles unknown aspects', () => {
      assert.strictEqual(getAspectCombinationDisplayName('unknown'), 'Unknown')
      assert.strictEqual(getAspectCombinationDisplayName('test_value'), 'Test Value')
    })

    it('handles multiple aspects', () => {
      assert.strictEqual(getAspectCombinationDisplayName('a_b_c'), 'A B C')
    })
  })

  describe('getAspectKey', () => {
    describe('single aspects', () => {
      it('returns priority-prefixed keys for primary aspects', () => {
        assert.strictEqual(getAspectKey({ aspects: ['Vigilance'] }), 'A_Vigilance')
        assert.strictEqual(getAspectKey({ aspects: ['Command'] }), 'B_Command')
        assert.strictEqual(getAspectKey({ aspects: ['Aggression'] }), 'C_Aggression')
        assert.strictEqual(getAspectKey({ aspects: ['Cunning'] }), 'D_Cunning')
      })

      it('returns priority-prefixed keys for secondary aspects', () => {
        assert.strictEqual(getAspectKey({ aspects: ['Villainy'] }), 'E_Villainy')
        assert.strictEqual(getAspectKey({ aspects: ['Heroism'] }), 'F_Heroism')
      })

      it('returns ZZZ_Neutral for no aspects', () => {
        assert.strictEqual(getAspectKey({ aspects: [] }), 'ZZZ_Neutral')
        assert.strictEqual(getAspectKey({}), 'ZZZ_Neutral')
      })

      it('handles unknown aspects', () => {
        const key = getAspectKey({ aspects: ['Unknown'] })
        assert.strictEqual(key.startsWith('G_'), true)
      })
    })

    describe('dual aspects', () => {
      it('returns H_ prefix with sorted aspects', () => {
        const key = getAspectKey({ aspects: ['Vigilance', 'Villainy'] })
        assert.strictEqual(key.startsWith('H_'), true)
        assert.strictEqual(key.includes('Vigilance'), true)
        assert.strictEqual(key.includes('Villainy'), true)
      })

      it('sorts aspects alphabetically', () => {
        const key1 = getAspectKey({ aspects: ['Villainy', 'Vigilance'] })
        const key2 = getAspectKey({ aspects: ['Vigilance', 'Villainy'] })
        assert.strictEqual(key1, key2)
      })
    })

    describe('sort order', () => {
      it('Vigilance sorts before Command', () => {
        const vig = getAspectKey({ aspects: ['Vigilance'] })
        const cmd = getAspectKey({ aspects: ['Command'] })
        assert.strictEqual(vig.localeCompare(cmd) < 0, true)
      })

      it('Primary aspects sort before secondary', () => {
        const cunning = getAspectKey({ aspects: ['Cunning'] })
        const villainy = getAspectKey({ aspects: ['Villainy'] })
        assert.strictEqual(cunning.localeCompare(villainy) < 0, true)
      })

      it('All aspects sort before Neutral', () => {
        const heroism = getAspectKey({ aspects: ['Heroism'] })
        const neutral = getAspectKey({ aspects: [] })
        assert.strictEqual(heroism.localeCompare(neutral) < 0, true)
      })

      it('Dual aspects sort after single aspects', () => {
        const single = getAspectKey({ aspects: ['Heroism'] })
        const dual = getAspectKey({ aspects: ['Vigilance', 'Villainy'] })
        assert.strictEqual(single.localeCompare(dual) < 0, true)
      })
    })
  })
})

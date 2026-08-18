// Tests for the JS half of the hover gate.
//
// SPEC (.claude/rules/mobile.md): hover effects are gated on
// `(hover: hover) and (pointer: fine)`. A tap on a touch device fires a
// synthesized mouseenter and never a mouseleave, so hover state set from JS
// would stick to the last card tapped. State must follow the same gate the
// CSS does.

import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert'
import {
  HOVER_POINTER_QUERY,
  hasHoverPointer,
  guardHoverSetter,
} from './hoverCapability'

/** Stand in for a device whose pointer does / does not support hover. */
const withPointer = (matches: boolean, queries: string[] = []) => {
  ;(globalThis as { window?: unknown }).window = {
    matchMedia: (query: string) => {
      queries.push(query)
      return { matches }
    },
  }
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window
})

describe('hoverCapability', () => {
  describe('hasHoverPointer', () => {
    it('SPEC: asks for the same media query the hover styles are gated on', () => {
      const asked: string[] = []
      withPointer(true, asked)
      hasHoverPointer()
      assert.deepStrictEqual(asked, ['(hover: hover) and (pointer: fine)'])
      assert.strictEqual(HOVER_POINTER_QUERY, '(hover: hover) and (pointer: fine)')
    })

    it('SPEC: true for a mouse', () => {
      withPointer(true)
      assert.strictEqual(hasHoverPointer(), true)
    })

    it('SPEC: false for touch', () => {
      withPointer(false)
      assert.strictEqual(hasHoverPointer(), false)
    })

    it('SPEC: false during SSR, where there is no pointer at all', () => {
      assert.strictEqual(hasHoverPointer(), false)
    })
  })

  describe('guardHoverSetter', () => {
    const collect = () => {
      const calls: (string | null)[] = []
      return { calls, set: (v: string | null) => { calls.push(v) } }
    }

    it('SPEC: a mouse entering a card sets hover state', () => {
      const { calls, set } = collect()
      guardHoverSetter(set, () => true)('card-1')
      assert.deepStrictEqual(calls, ['card-1'])
    })

    it('SPEC: a tap on touch sets no hover state — nothing would ever clear it', () => {
      const { calls, set } = collect()
      guardHoverSetter(set, () => false)('card-1')
      assert.deepStrictEqual(calls, [])
    })

    it('SPEC: clearing always passes through, on any pointer', () => {
      for (const capable of [true, false]) {
        const { calls, set } = collect()
        guardHoverSetter(set, () => capable)(null)
        assert.deepStrictEqual(calls, [null], `SPEC: clear must pass with capable=${capable}`)
      }
    })

    it('SPEC: capability is read per call, so a plugged-in mouse takes effect', () => {
      const { calls, set } = collect()
      let capable = false
      const guarded = guardHoverSetter(set, () => capable)
      guarded('card-1')
      capable = true
      guarded('card-2')
      assert.deepStrictEqual(calls, ['card-2'])
    })
  })
})

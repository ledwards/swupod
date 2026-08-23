import { test } from 'node:test'
import assert from 'node:assert/strict'
import { revealSelection, type RevealTarget } from './revealSelection'

function spy() {
  const calls: ScrollIntoViewOptions[] = []
  const el: RevealTarget = { scrollIntoView: (options) => { calls.push(options) } }
  return { el, calls }
}

test('SPEC: animates by default, and only as far as it must', () => {
  const { el, calls } = spy()
  revealSelection(el, false)

  assert.equal(calls.length, 1)
  assert.equal(calls[0].behavior, 'smooth')
  // 'nearest' is the reason this feels fast — it scrolls the shortest distance
  // that works, and not at all when the confirm box is already on screen.
  assert.equal(calls[0].block, 'nearest')
})

test('SPEC: jumps instead of animating when the viewer asked for less motion', () => {
  const { el, calls } = spy()
  revealSelection(el, true)

  assert.equal(calls[0].behavior, 'auto')
  assert.equal(calls[0].block, 'nearest')
})

test('a missing element is a no-op, so callers can pass a ref straight in', () => {
  assert.doesNotThrow(() => revealSelection(null, false))
  assert.doesNotThrow(() => revealSelection(undefined, false))
})

test('a browser that rejects the options form does not break the pick', () => {
  const el: RevealTarget = {
    scrollIntoView: () => { throw new TypeError('not supported') },
  }
  assert.doesNotThrow(() => revealSelection(el, false))
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  scrollDeltaToReveal,
  easeOutCubic,
  revealSelection,
  REVEAL_MARGIN_PX,
} from './revealSelection'

const VIEW = 800

test('SPEC: an element already on screen does not move the page', () => {
  // The one that matters for feel: changing your mind between cards must not
  // lurch the page every time the box re-renders.
  assert.equal(scrollDeltaToReveal({ top: 200, bottom: 300 }, VIEW), 0)
  assert.equal(scrollDeltaToReveal({ top: REVEAL_MARGIN_PX, bottom: 300 }, VIEW), 0)
  assert.equal(scrollDeltaToReveal({ top: 600, bottom: VIEW - REVEAL_MARGIN_PX }, VIEW), 0)
})

test('SPEC: an element below the fold scrolls down by exactly what is needed', () => {
  // Bottom at 900 in an 800 viewport, wanting 16px of margin: 900 - (800-16).
  assert.equal(scrollDeltaToReveal({ top: 800, bottom: 900 }, VIEW), 116)
})

test('SPEC: an element above the fold scrolls up', () => {
  assert.equal(scrollDeltaToReveal({ top: -50, bottom: 60 }, VIEW), -66)
})

test('SPEC: something taller than the viewport aligns its top, not its bottom', () => {
  // Scrolling a too-tall box "fully" into view would push its top — the card
  // name and the confirm button — off the top of the screen.
  const delta = scrollDeltaToReveal({ top: 400, bottom: 1600 }, VIEW)
  assert.equal(delta, 400 - REVEAL_MARGIN_PX)
})

test('easing starts fast and lands exactly on the target', () => {
  assert.equal(easeOutCubic(0), 0)
  assert.equal(easeOutCubic(1), 1)
  assert.ok(easeOutCubic(0.5) > 0.5, 'ease-out is ahead of linear at the midpoint')
  // Out-of-range input is clamped rather than overshooting past the target.
  assert.equal(easeOutCubic(1.4), 1)
  assert.equal(easeOutCubic(-2), 0)
})

test('a missing element is a no-op, so callers can pass a ref straight in', () => {
  assert.doesNotThrow(() => revealSelection(null, false))
  assert.doesNotThrow(() => revealSelection(undefined, false))
})

test('SPEC: a hidden tab jumps instead of animating', () => {
  // requestAnimationFrame is not serviced in a backgrounded tab, so animating
  // there means the scroll never happens at all and the player returns to a page
  // still sitting at the top.
  const scrolls: number[] = []
  const stubWindow = {
    innerHeight: 800,
    scrollY: 0,
    scrollTo: (opts: { top: number }) => { scrolls.push(Math.round(opts.top)) },
    requestAnimationFrame: () => { throw new Error('must not animate while hidden') },
    matchMedia: () => ({ matches: false }),
  }
  const stubDocument = { hidden: true, documentElement: { scrollHeight: 5000 } }

  const originalWindow = (globalThis as Record<string, unknown>).window
  const originalDocument = (globalThis as Record<string, unknown>).document
  ;(globalThis as Record<string, unknown>).window = stubWindow
  ;(globalThis as Record<string, unknown>).document = stubDocument
  try {
    const el = { getBoundingClientRect: () => ({ top: 1200, bottom: 1300 }) } as unknown as Element
    revealSelection(el, false)
  } finally {
    ;(globalThis as Record<string, unknown>).window = originalWindow
    ;(globalThis as Record<string, unknown>).document = originalDocument
  }

  assert.equal(scrolls.length, 1, 'exactly one instant scroll')
  assert.ok(scrolls[0] > 0, 'and it actually moved')
})

/**
 * Bring the confirm control into view after a card is staged.
 *
 * Selecting is only half of a two-step pick, and the half that commits it lives
 * under the pack — on a tall pack that is off the bottom of the screen, so a
 * player clicks a card, sees nothing happen, and clicks it again.
 *
 * WHY THIS ANIMATES ITSELF INSTEAD OF USING `scrollIntoView`
 * ==========================================================
 * The obvious one-liner — `el.scrollIntoView({ behavior: 'smooth' })` — is a
 * SILENT NO-OP in any browser where smooth scrolling is unavailable. That is not
 * hypothetical: it was verified live here, where `window.scrollTo({top,
 * behavior: 'auto'})` scrolls and the identical call with `behavior: 'smooth'`
 * does nothing at all. A player in that situation clicks a card and the confirm
 * box simply never arrives — the exact failure this code exists to prevent.
 *
 * Animating over `requestAnimationFrame` with instant per-frame scrolls works
 * everywhere, and it also buys the thing native smooth cannot give at any price:
 * control over the duration. Native smooth takes as long as it takes; this is
 * deliberately brisk.
 */

/** How long the scroll takes. Long enough to follow, short enough not to wait on. */
export const REVEAL_DURATION_MS = 220

/** Breathing room left between the revealed element and the viewport edge. */
export const REVEAL_MARGIN_PX = 16

export interface RevealRect {
  top: number
  bottom: number
}

/**
 * How far the page must scroll to bring `rect` fully into view — positive to
 * scroll down, negative to scroll up, and exactly 0 when it already is.
 *
 * Zero is the important case: it means selecting a different card while the box
 * is already on screen moves nothing, instead of lurching the page on every
 * change of mind.
 *
 * @param rect - Viewport-relative rect of the element to reveal
 * @param viewportHeight - Height of the viewport
 * @param margin - Gap to leave at the edge
 */
export function scrollDeltaToReveal(
  rect: RevealRect,
  viewportHeight: number,
  margin: number = REVEAL_MARGIN_PX
): number {
  // Taller than the viewport: line its top edge up and let the rest run off the
  // bottom. Scrolling it "fully" into view is impossible, and trying puts the
  // part that matters — the top — above the fold.
  if (rect.bottom - rect.top >= viewportHeight - margin * 2) {
    return rect.top - margin
  }
  if (rect.bottom > viewportHeight - margin) {
    return rect.bottom - (viewportHeight - margin)
  }
  if (rect.top < margin) {
    return rect.top - margin
  }
  return 0
}

/** Ease-out cubic: quick off the mark, settles rather than stopping dead. */
export function easeOutCubic(t: number): number {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t
  return 1 - Math.pow(1 - clamped, 3)
}

/** Whether the viewer has asked for less animation. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/**
 * Scroll `el` into view, animated unless the viewer asked for less motion.
 *
 * @param el - Element to reveal; null is a no-op so callers can pass a ref
 * @param reducedMotion - Jump straight there instead of animating
 */
export function revealSelection(el: Element | null | undefined, reducedMotion: boolean): void {
  if (!el || typeof window === 'undefined') return

  const rect = el.getBoundingClientRect()
  const delta = scrollDeltaToReveal(rect, window.innerHeight)
  if (delta === 0) return

  const start = window.scrollY
  const maxScroll = Math.max(
    0,
    document.documentElement.scrollHeight - window.innerHeight
  )
  const target = Math.min(Math.max(start + delta, 0), maxScroll)
  if (target === start) return

  // 'auto' on purpose, here and in every frame below: this function owns the
  // animation, so asking the browser to smooth it too would fight us — and in a
  // browser without smooth support it would do nothing at all.
  //
  // A hidden document jumps rather than animates, and that is not an
  // optimisation — browsers stop servicing requestAnimationFrame in a
  // backgrounded tab, so an animated scroll there never runs and the page is
  // still at the top when the player comes back. There is also nobody watching
  // an animation they cannot see.
  const hidden = typeof document !== 'undefined' && document.hidden === true
  if (reducedMotion || hidden || typeof window.requestAnimationFrame !== 'function') {
    window.scrollTo({ top: target, behavior: 'auto' })
    return
  }

  const startedAt = performance.now()
  const step = (nowMs: number) => {
    const progress = Math.min(1, (nowMs - startedAt) / REVEAL_DURATION_MS)
    window.scrollTo({ top: start + (target - start) * easeOutCubic(progress), behavior: 'auto' })
    if (progress < 1) window.requestAnimationFrame(step)
  }
  window.requestAnimationFrame(step)
}

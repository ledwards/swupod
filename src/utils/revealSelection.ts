/**
 * Bring the confirm control into view after a card is staged.
 *
 * Selecting is only half of a two-step pick, and the half that commits it lives
 * under the cards — on a tall pack that is off the bottom of the screen, so a
 * player clicks a card, sees nothing happen, and clicks it again.
 *
 * `block: 'nearest'` is doing real work here, not just being polite: it scrolls
 * the shortest distance that reveals the element and does nothing at all when it
 * is already visible. Native smooth scrolling has no duration control, so the
 * only way to make this feel fast is to keep the distance short — which is
 * exactly what 'nearest' does, and it also stops the page lurching every time
 * you change your mind about a card.
 */
export interface RevealTarget {
  scrollIntoView(options: ScrollIntoViewOptions): void
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
 * @param reducedMotion - Skip the animation and jump instead
 */
export function revealSelection(el: RevealTarget | null | undefined, reducedMotion: boolean): void {
  if (!el) return
  try {
    el.scrollIntoView({
      behavior: reducedMotion ? 'auto' : 'smooth',
      block: 'nearest',
      inline: 'nearest',
    })
  } catch {
    /* jsdom and older Safari throw on the options form; not worth failing a pick over */
  }
}

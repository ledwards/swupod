// Pointer capability — the JS half of the CSS hover gate.
//
// Touch devices synthesize a `mouseenter` on tap and never fire the matching
// `mouseleave`, so any state set from a hover handler survives the tap and
// sticks to whatever the user last touched. CSS handles its half by gating
// hover styles behind `@media (hover: hover) and (pointer: fine)`; state set
// from JS needs the same gate or the two disagree.
//
// See .claude/rules/mobile.md — "CSS :hover on Mobile".

/** The media query the hover styles are gated on. Keep the two in step. */
export const HOVER_POINTER_QUERY = '(hover: hover) and (pointer: fine)'

/**
 * Whether this device has a pointer that can hover and, crucially, leave.
 * False during SSR and on touch, so hover state is never set where it could
 * not be cleared.
 */
export function hasHoverPointer(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(HOVER_POINTER_QUERY).matches
}

/**
 * Wrap a hover-state setter so it ignores hovers on devices that cannot end
 * one. Clearing (null) always passes through — dropping a clear would be the
 * very stuck state this guards against.
 */
export function guardHoverSetter<T>(
  set: (value: T | null) => void,
  capable: () => boolean = hasHoverPointer,
): (value: T | null) => void {
  return (value) => {
    if (value !== null && !capable()) return
    set(value)
  }
}

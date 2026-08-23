/**
 * voiceCueSpeaker — the one-clip-at-a-time floor for spoken draft cues.
 *
 * WHY THIS EXISTS AS ITS OWN MODULE
 *
 * "It played a bunch of audio at once" was reported four separate times, and
 * each fix was a timing patch on top of the previous timing patch. The cause was
 * always the same shape: `muted` was doing two jobs at once — "you cannot hear
 * this" AND "nobody has claimed this element" — so any `play()` promise that
 * resolved late could read the second meaning, decide the element was free, and
 * hand it back UNMUTED while it was still running. Two of those and you hear two
 * clips; ten and you hear the whole pack.
 *
 * So the rule here is not a smarter race: it is that a race cannot produce sound.
 *
 *   1. Every pooled element is MUTED AT REST. `create` mutes it before anything
 *      else touches it, and `ended` mutes it again.
 *   2. `speak()` is the ONLY function in the codebase that may unmute an element.
 *      Priming never unmutes — that is what made `muted` ambiguous.
 *   3. `speak()` mutes every other element first, unconditionally, whether or not
 *      it looks busy. A muted-but-playing prime is exactly the thing earlier
 *      versions skipped over.
 *   4. At most one element holds the floor (`speaking`). A prime that resolves
 *      late checks the floor rather than the element's own flags.
 *
 * Under those rules an element can only be heard if `speak()` unmuted it, and
 * `speak()` unmutes exactly one element after silencing the rest. Overlap is not
 * "unlikely" — there is no ordering of promise resolutions that produces it,
 * which is what the tests in voiceCueSpeaker.test.ts actually assert.
 *
 * The element type is an interface, not HTMLAudioElement, so the tests can drive
 * the gap between `play()` and its promise resolving by hand.
 */

/** The slice of HTMLAudioElement this module needs. */
export interface CueAudioElement {
  muted: boolean
  paused: boolean
  currentTime: number
  volume: number
  play(): Promise<void> | void
  pause(): void
  addEventListener(type: string, listener: () => void): void
}

export interface VoiceCueSpeaker {
  /** The element for a pool key, creating it on first use. Null if unavailable. */
  ensure(key: string, url: string): CueAudioElement | null
  /** Whether the pool already holds this key. */
  has(key: string): boolean
  /**
   * Spend a user gesture on an element so later programmatic plays are allowed.
   * Always silent: it plays muted and pauses again, and never unmutes.
   */
  prime(el: CueAudioElement): void
  /** Play this element out loud, silencing everything else first. */
  speak(el: CueAudioElement): void
  /**
   * Play these back to back, each starting when the one before it ends. Still one
   * voice at a time — this is a queue, not a mix. Any later `speak()` supersedes
   * whatever is left of the queue, because the newer cue is the truer one.
   */
  speakSequence(els: readonly CueAudioElement[]): void
  /** The element currently holding the floor, if any. */
  speaking(): CueAudioElement | null
  /** Silence everything, floor included. */
  silenceAll(): void
}

/**
 * @param create - Builds an element for a url; returns null when audio is unavailable
 */
export function createVoiceCueSpeaker(
  create: (url: string) => CueAudioElement | null
): VoiceCueSpeaker {
  const pool = new Map<string, CueAudioElement>()
  const priming = new WeakSet<CueAudioElement>()
  let speaking: CueAudioElement | null = null
  /** What speaks next, once the current clip finishes. */
  let queued: CueAudioElement[] = []

  /** Back to muted-at-rest. Safe to call on anything, in any state. */
  function silence(el: CueAudioElement): void {
    el.muted = true
    if (speaking === el) speaking = null
    try {
      if (!el.paused) el.pause()
      el.currentTime = 0
    } catch {
      /* a detached or not-yet-loaded element throws; it is silent either way */
    }
  }

  function ensure(key: string, url: string): CueAudioElement | null {
    const existing = pool.get(key)
    if (existing) return existing
    let el: CueAudioElement | null = null
    try {
      el = create(url)
    } catch {
      return null
    }
    if (!el) return null
    // Rule 1: muted before anything can reach it.
    el.muted = true
    el.addEventListener('ended', () => {
      const wasSpeaking = speaking === el
      silence(el)
      // Only the clip that held the floor may hand it on.
      if (wasSpeaking) advance()
    })
    pool.set(key, el)
    return el
  }

  function prime(el: CueAudioElement): void {
    // The clip holding the floor is being heard on purpose — never restart it.
    if (speaking === el) return
    if (priming.has(el)) return
    priming.add(el)
    el.muted = true
    const release = () => {
      priming.delete(el)
      // Between the play() and this resolution the element may have been given
      // the floor. Ask the floor, not the element's own flags — that ambiguity
      // is the whole bug.
      if (speaking === el) return
      silence(el)
    }
    try {
      const result = el.play()
      if (result && typeof (result as Promise<void>).then === 'function') {
        ;(result as Promise<void>).then(release, () => {
          priming.delete(el)
          if (speaking !== el) silence(el)
        })
      } else {
        release()
      }
    } catch {
      priming.delete(el)
      if (speaking !== el) silence(el)
    }
  }

  /** Take the floor. Does NOT touch the queue — see `speak` and `advance`. */
  function takeFloor(el: CueAudioElement): void {
    // Rule 3: silence the rest first, unconditionally.
    for (const other of pool.values()) {
      if (other === el) continue
      silence(other)
    }
    speaking = el
    try {
      el.currentTime = 0
      // Rule 2: the only unmute in the module.
      el.muted = false
      const result = el.play()
      if (result && typeof (result as Promise<void>).catch === 'function') {
        ;(result as Promise<void>).catch(() => {
          // Blocked or interrupted is never an error a player should see — but it
          // must not leave an unmuted element sitting on the floor either, and a
          // clip that never started must still hand on to whatever follows it.
          if (speaking === el) {
            silence(el)
            advance()
          }
        })
      }
    } catch {
      silence(el)
      advance()
    }
  }

  /** Start whatever the finished clip was holding the floor for. */
  function advance(): void {
    const next = queued.shift()
    if (next) takeFloor(next)
  }

  function speak(el: CueAudioElement): void {
    // A direct cue supersedes a pending sequence rather than queueing behind it.
    queued = []
    takeFloor(el)
  }

  function speakSequence(els: readonly CueAudioElement[]): void {
    const [first, ...rest] = els
    if (!first) return
    queued = rest
    takeFloor(first)
  }

  function silenceAll(): void {
    queued = []
    for (const el of pool.values()) silence(el)
    speaking = null
  }

  return {
    ensure,
    has: key => pool.has(key),
    prime,
    speak,
    speakSequence,
    speaking: () => speaking,
    silenceAll,
  }
}

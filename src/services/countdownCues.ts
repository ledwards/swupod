/**
 * Countdown cue thresholds — pure logic for "which spoken countdown clips did
 * this tick just cross?".
 *
 * Two rules make this non-obvious enough to deserve a tested service:
 *
 * 1. DURATION-AWARE. Competitive pods run the Appendix C schedule
 *    (`src/services/matchmaking/timers.ts`), where a pick can be 30s, 15s, 10s
 *    or 5s. A mark cannot be *crossed* on a period no longer than itself — the
 *    clock never passes 30 on a 30-second pick — so such a mark is announced at
 *    the START of the period instead, paired with the next-pick call: "next pick
 *    begins", then "thirty seconds remaining". `openingCountdownThreshold` picks
 *    that mark; `crossedCountdownThresholds` handles the rest.
 *
 *    Between them a mark is either crossed (`<= total - MIN_LEAD_SECONDS`) or it
 *    is the period's own length and opens it — with one deliberate exception:
 *    periods shorter than `MIN_OPENING_PERIOD_SECONDS` get no opening mark at
 *    all, because the sentence would eat the period it is describing.
 * 2. ONCE PER PERIOD. Every client ticks the same timer; a threshold must fire
 *    exactly once per `pick_started_at`. The caller passes what has already
 *    fired and resets that set when the period changes.
 */
import type { VoicePackClip } from '../utils/voicePackAssets'

/** Spoken countdown marks, descending. */
export const COUNTDOWN_THRESHOLDS = [30, 15, 5] as const

export type CountdownThreshold = (typeof COUNTDOWN_THRESHOLDS)[number]

/**
 * A threshold must sit at least this far below the total to be worth CROSSING.
 * Announcing "30 seconds" one second into a 31-second pick is not a countdown, it
 * is an echo of the length — so a mark this close to the top opens the period
 * instead (see `openingCountdownThreshold`).
 */
export const MIN_LEAD_SECONDS = 2

/**
 * The shortest period worth OPENING with a countdown mark.
 *
 * "Five seconds remaining" takes about a second and a half to say. On the
 * five-second picks that end an Appendix C pack, that is a third of the pick
 * spent announcing its own length — and it lands right before the auto-pick,
 * where it reads as a warning about a decision nobody is being asked to make.
 * Those periods get the next-pick call alone.
 */
export const MIN_OPENING_PERIOD_SECONDS = 10

const CLIP_BY_THRESHOLD: Record<CountdownThreshold, VoicePackClip> = {
  30: 'count-30',
  15: 'count-15',
  5: 'count-5',
}

/**
 * The voice clip that announces a threshold.
 *
 * @param threshold - Seconds remaining being announced
 */
export function countdownCueClip(threshold: CountdownThreshold): VoicePackClip {
  return CLIP_BY_THRESHOLD[threshold]
}

/**
 * Whether a threshold is worth announcing for a period of this length.
 *
 * @param threshold - Seconds remaining the cue announces
 * @param totalSeconds - Total length of the timer period
 */
export function isThresholdAudible(threshold: number, totalSeconds: number): boolean {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return false
  return threshold <= totalSeconds - MIN_LEAD_SECONDS
}

/** Thresholds that will ever speak during a period of this length. */
export function audibleThresholds(totalSeconds: number): CountdownThreshold[] {
  return COUNTDOWN_THRESHOLDS.filter(t => isThresholdAudible(t, totalSeconds))
}

/**
 * The mark that announces a period's LENGTH rather than being counted down to.
 *
 * This is the mark sitting in the top `MIN_LEAD_SECONDS` of the period — the one
 * the clock can never be seen to cross, because it is at or above where the clock
 * starts. A 30-second pick opens with "thirty seconds remaining"; a 15-second
 * leader pick opens with "fifteen". A 10-second pick has no such mark (5 is far
 * enough inside to be crossed normally) and simply opens with the next-pick call.
 *
 * @param totalSeconds - Total length of the timer period
 * @returns The threshold to announce at the start, or null
 */
export function openingCountdownThreshold(totalSeconds: number): CountdownThreshold | null {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return null
  if (totalSeconds < MIN_OPENING_PERIOD_SECONDS) return null
  return (
    COUNTDOWN_THRESHOLDS.find(
      threshold => threshold <= totalSeconds && threshold > totalSeconds - MIN_LEAD_SECONDS
    ) ?? null
  )
}

export interface CountdownCrossingInput {
  /**
   * Remaining seconds at the previous tick. `null` on the first observation of
   * a period — nothing has been "crossed" yet, which is also what stops a
   * client that joins mid-pick from blurting out every threshold at once.
   */
  previousSeconds: number | null
  /** Remaining seconds now. */
  currentSeconds: number
  /** Total length of this timer period. */
  totalSeconds: number
  /** Thresholds already announced during this period. */
  firedThresholds?: readonly number[]
}

/**
 * Thresholds crossed between the previous tick and now, filtered by both rules
 * above. Descending order, so a tick that skips (tab throttling, a slow frame)
 * still announces the most urgent mark last.
 *
 * @param input - Previous/current remaining seconds, period length, already-fired marks
 * @returns Thresholds to announce right now
 */
export function crossedCountdownThresholds({
  previousSeconds,
  currentSeconds,
  totalSeconds,
  firedThresholds = [],
}: CountdownCrossingInput): CountdownThreshold[] {
  if (previousSeconds === null || previousSeconds === undefined) return []
  if (!Number.isFinite(currentSeconds) || currentSeconds < 0) return []
  // Timer restarted (or ran backwards): a new period, not a crossing. The
  // caller resets `firedThresholds` on the period key.
  if (currentSeconds >= previousSeconds) return []
  // Zero is `time-is-up`'s moment, not a countdown mark's.
  if (currentSeconds <= 0) return []

  const already = new Set(firedThresholds)
  return COUNTDOWN_THRESHOLDS.filter(threshold =>
    !already.has(threshold) &&
    isThresholdAudible(threshold, totalSeconds) &&
    previousSeconds > threshold &&
    currentSeconds <= threshold
  )
}

/**
 * Same as `crossedCountdownThresholds`, mapped to the clips to play.
 *
 * @param input - See `CountdownCrossingInput`
 */
export function crossedCountdownCues(input: CountdownCrossingInput): VoicePackClip[] {
  return crossedCountdownThresholds(input).map(countdownCueClip)
}

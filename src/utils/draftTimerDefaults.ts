/**
 * Draft round-timer defaults and visibility — shared by the creation API and
 * the in-draft TimerPanel so the server and client agree.
 *
 * Background / regression context: the in-draft host timer controls are hidden
 * for Competitive Practice drafts (so players can't change competitive timing).
 * That means a competitive draft created with the round timer OFF can never have
 * it turned on, and the timer never appears. Casual drafts default OFF because
 * the host can toggle the timer via the visible controls.
 */

import { getCompetitivePickTimeout, getLeaderPickTimeout } from '../services/matchmaking/timers'

export interface DisplayPickSecondsOptions {
  /** Whether this is a Competitive Practice pod (enforced Appendix C timing). */
  competitive: boolean
  /** Current draft phase — 'leader_draft' vs 'pack_draft'. */
  phase?: string | null
  /** Cards left in the pack (pack draft) or leaders left to pick (leader draft). */
  itemsRemaining: number
  /** The casual fixed round timeout, used only for non-competitive pods. */
  roundTimeoutSeconds: number
}

/**
 * Whether a draft's round (pick) timer is ON at creation time.
 * Competitive → on (the host can't toggle it in-draft); casual → off.
 */
export function defaultRoundTimerEnabled(competitive: boolean): boolean {
  return competitive === true
}

/**
 * Whether the round timer should be treated as enabled for an existing draft.
 * The timer is on unless `timed` is explicitly false, matching the DB column
 * default (`timed BOOLEAN DEFAULT true`). A null/undefined value means "on".
 */
export function isRoundTimerEnabled(draft: { timed?: boolean | null } | null | undefined): boolean {
  return draft?.timed !== false
}

/**
 * Seconds to display on the in-draft pick timer (the "round timer").
 *
 * Competitive pods enforce the official Appendix C schedule server-side, where
 * the budget steps down as the pack/leader pile depletes (14 cards→60s … 3→5s;
 * leaders 3→15s, 2→10s, 1→5s). The dial must show THAT schedule, not a fixed value —
 * otherwise the displayed clock disagrees with what actually force-picks the
 * player, increasingly so deep into a pack. Competitive timing is not
 * customizable; the configured round timeout is ignored. Returns null when the
 * schedule yields 0 (currently the last pack card is auto-picked, so there is
 * nothing to time and no timer should render).
 *
 * Casual pods are unaffected: they keep the fixed, host-configured round timeout.
 */
export function getDisplayPickSeconds({
  competitive,
  phase,
  itemsRemaining,
  roundTimeoutSeconds,
}: DisplayPickSecondsOptions): number | null {
  if (!competitive) {
    return roundTimeoutSeconds
  }
  const scheduled = phase === 'leader_draft'
    ? getLeaderPickTimeout(itemsRemaining)
    : getCompetitivePickTimeout(itemsRemaining)
  return scheduled > 0 ? scheduled : null
}

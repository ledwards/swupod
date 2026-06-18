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

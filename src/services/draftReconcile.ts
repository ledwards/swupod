/**
 * Reconciliation rules for a draft's live state.
 *
 * The draft page takes its updates from a socket broadcast, and until now that
 * was the only thing that refreshed it after the initial load. A broadcast
 * that never arrives — a transport hiccup, a throttled tab, an emit that falls
 * between a disconnect and the rejoin — leaves the client's stateVersion
 * behind the server's with nothing to correct it. The next broadcast describes
 * the NEXT change, so a player whose pack has already been passed to them
 * waits for an event that will never come.
 *
 * The socket stays the fast path. These rules drive a slow backstop poll of
 * GET /api/draft/:shareId/state?sinceVersion=N, which answers
 * `{ changed: false }` when there is nothing to say — the same endpoint the
 * older useDraftSync hook polled, and the one that also nudges bot turns and
 * timeout enforcement along as a safety net.
 */

/** The state a poll of /state reports back. */
export interface PolledState {
  changed?: boolean
  stateVersion?: number
}

/** Inputs deciding whether a client should still be reconciling. */
export interface ReconcileContext {
  /** The hook is switched on. */
  enabled: boolean
  /** The draft has been deleted out from under us. */
  deleted: boolean
  /** Latest known status; undefined before the first load returns. */
  status?: string | null
}

/**
 * How often to check.
 *
 * Slow on purpose: this is a backstop, not a transport. The old polling hook
 * ran every 2s because polling was the only channel; here the socket carries
 * the normal case and this just has to notice when it didn't.
 */
export const DRAFT_RECONCILE_INTERVAL_MS = 10_000

/** Statuses in which a draft can still change. */
const LIVE_STATUSES = new Set(['waiting', 'active'])

/**
 * Whether the polled response carries state this client has not seen.
 *
 * A response at or behind the version we already hold says nothing — including
 * the `{ changed: false }` shortcut the endpoint returns when the version
 * matches. A response with no version at all is treated as saying nothing
 * rather than as version 0, which would otherwise read as "you are ahead".
 */
export function hasMissedState(
  polled: PolledState | null | undefined,
  knownVersion: number,
): boolean {
  if (!polled || typeof polled.stateVersion !== 'number') return false
  if (polled.changed === false) return false
  return polled.stateVersion > knownVersion
}

/**
 * Whether to keep reconciling.
 *
 * A finished or cancelled draft will not change again, and a deleted one has
 * nothing to poll for. Before the first load settles a status we do keep
 * polling: backing off there would strand a client that missed its very first
 * broadcast.
 */
export function shouldReconcileDraft({ enabled, deleted, status }: ReconcileContext): boolean {
  if (!enabled || deleted) return false
  if (status === null || status === undefined) return true
  return LIVE_STATUSES.has(status)
}

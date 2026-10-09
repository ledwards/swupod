export interface ReadyPod {
  status?: string
}

export interface ReadyPlayer {
  id?: string
  is_bot?: boolean
  lobby_ready?: boolean
}

type ReadyValidation =
  | { ok: true }
  | { ok: false; status: number; message: string }

/**
 * Pure guard for readying up (exported for unit tests).
 *
 * Ready only means anything while the pod is still in the lobby — once packs
 * are dealt the flag is history, and a late toggle would silently re-enable the
 * host's deal button on a draft that already started.
 *
 * @param pod - Pod row (status)
 * @param player - The caller's pod_players row, or null if they have no seat
 */
export function validateReadyToggle(pod: ReadyPod, player: ReadyPlayer | null): ReadyValidation {
  if (pod.status !== 'waiting') {
    return { ok: false, status: 400, message: 'Draft has already started' }
  }
  if (!player) {
    return { ok: false, status: 403, message: 'Not in this draft' }
  }
  if (player.is_bot === true) {
    // Unreachable through the API (bots have no session) but keeps the rule in
    // one place: a bot is ready by definition and never stores the flag.
    return { ok: false, status: 400, message: 'Bots are always ready' }
  }
  return { ok: true }
}

/**
 * The value to store. Always `true`: readying is one-way (see the file header),
 * so nothing a caller sends can take it back.
 *
 * Kept as a named function rather than inlining `true` so the rule has one place
 * to live and one place to be tested — this used to honour `ready: false` from
 * the body, and it would be an easy thing to quietly reintroduce.
 */
export function resolveReadyValue(): true {
  return true
}

/**
 * Whether every human seat has readied — the gate on the host's deal button.
 * Bots are ready by definition.
 *
 * @param players - Pod player rows
 */
export function allHumansReady(players: { is_bot?: boolean; lobby_ready?: boolean }[]): boolean {
  const humans = players.filter(p => p.is_bot !== true)
  if (humans.length === 0) return true
  return humans.every(p => p.lobby_ready === true)
}

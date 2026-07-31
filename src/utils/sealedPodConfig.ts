/**
 * Sealed pod configuration — pack counts and player caps.
 *
 * SPEC:
 * - Sealed deals 6 booster packs per player by default.
 * - Everyone can choose 6 or 8 packs at creation (solo pools and sealed pods);
 *   no other value is accepted — anything else falls back to 6.
 * - Competitive Sealed pods are always 8 packs per player, whatever is requested.
 * - Standard sealed pods allow 2–16 players (default 8).
 * - Competitive Sealed pods are capped at 8 players.
 */

export const STANDARD_SEALED_PACKS_PER_PLAYER = 6
export const COMPETITIVE_SEALED_PACKS_PER_PLAYER = 8

/** The only pack counts a player may pick. */
export const SEALED_PACK_COUNT_OPTIONS: readonly number[] = [
  STANDARD_SEALED_PACKS_PER_PLAYER,
  COMPETITIVE_SEALED_PACKS_PER_PLAYER,
]

export const STANDARD_SEALED_MIN_PLAYERS = 2
export const STANDARD_SEALED_MAX_PLAYERS = 16
export const COMPETITIVE_SEALED_MAX_PLAYERS = 8

/**
 * Validate a requested pack count. Only 6 and 8 are allowed; anything else
 * (missing, malformed, out of range) falls back to 6. Accepts strings so URL
 * query params and JSON bodies can be passed straight in.
 */
export function normalizeSealedPackCount(
  requested?: number | string | null
): number {
  const parsed = typeof requested === 'string' ? Number(requested) : requested
  return typeof parsed === 'number' && SEALED_PACK_COUNT_OPTIONS.includes(parsed)
    ? parsed
    : STANDARD_SEALED_PACKS_PER_PLAYER
}

/**
 * Packs dealt to each player when a sealed pod starts.
 * Competitive Sealed ignores the request and always deals 8.
 */
export function sealedPacksPerPlayer(
  competitive: boolean,
  requested?: number | string | null
): number {
  return competitive
    ? COMPETITIVE_SEALED_PACKS_PER_PLAYER
    : normalizeSealedPackCount(requested)
}

/**
 * Effective max_players for a sealed pod at creation time.
 * Standard: requested value clamped to 2–16 (default 8).
 * Competitive: always 8.
 */
export function sealedMaxPlayers(
  competitive: boolean,
  requested?: number | null
): number {
  if (competitive) return COMPETITIVE_SEALED_MAX_PLAYERS
  return Math.min(
    STANDARD_SEALED_MAX_PLAYERS,
    Math.max(STANDARD_SEALED_MIN_PLAYERS, requested || 8)
  )
}

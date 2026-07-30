/**
 * Sealed pod configuration — pack counts and player caps.
 *
 * SPEC:
 * - Standard sealed pods deal 6 booster packs per player.
 * - Competitive Sealed pods deal 8 booster packs per player.
 * - Standard sealed pods allow 2–16 players (default 8).
 * - Competitive Sealed pods are capped at 8 players.
 */

export const STANDARD_SEALED_PACKS_PER_PLAYER = 6
export const COMPETITIVE_SEALED_PACKS_PER_PLAYER = 8

export const STANDARD_SEALED_MIN_PLAYERS = 2
export const STANDARD_SEALED_MAX_PLAYERS = 16
export const COMPETITIVE_SEALED_MAX_PLAYERS = 8

/** Packs dealt to each player when a sealed pod starts. */
export function sealedPacksPerPlayer(competitive: boolean): number {
  return competitive
    ? COMPETITIVE_SEALED_PACKS_PER_PLAYER
    : STANDARD_SEALED_PACKS_PER_PLAYER
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

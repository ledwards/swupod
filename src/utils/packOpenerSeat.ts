/**
 * packOpenerSeat — derive the seat that cracked a given draft pack.
 *
 * Inverts the pack-index → seat mapping used by the draft pack generator
 * in `app/api/draft/[shareId]/start/route.ts` (standard mode) and
 * `src/utils/draftLogic.ts` `processBoxPacksForDraft` (chaos mode).
 *
 * `card_generations.pack_index` is written at draft start (one row per card
 * × pack) and is the only durable signal of which seat cracked which pack.
 * The personal-stats luck endpoint (U6) uses this helper to answer
 * "scope = opened" for drafts: among all card_generations rows for a pod,
 * which subset did the authenticated user personally crack?
 *
 * STANDARD MODE
 * =============
 * Write side (`app/api/draft/[shareId]/start/route.ts` ~line 116):
 *
 *     packIndex = playerIndex * packsPerPlayer + packNum
 *
 *   where `playerIndex` is the 0-based index into the `originalPacks`
 *   array — the same loop iterates players in seat-number order (the
 *   players list is `ORDER BY seat_number` from the DB), so
 *   `playerIndex === seat_number - 1`.
 *
 * Inversion:
 *
 *     seat (0-indexed) = floor(packIndex / packsPerPlayer)
 *
 * Examples (8-player, 3 packs/player):
 *   pack_index 0,1,2  → seat 0
 *   pack_index 3,4,5  → seat 1
 *   ...
 *   pack_index 21,22,23 → seat 7
 *
 * CHAOS MODE
 * ==========
 * Write side (`src/utils/draftLogic.ts` ~line 102-104):
 *
 *     packIndex = (packNum * 8) + playerIndex
 *
 *   The constant 8 is hardcoded in `processBoxPacksForDraft` because chaos
 *   draft generation always produces 8 packs per selected set (see
 *   `app/api/draft/route.ts` line 86: `generateSealedBox([], chaosSetCode, 8)`).
 *   It is NOT pulled from `pods.max_players` — even a chaos pod with only
 *   4 players uses 8 as the modulus because the BOX still holds 8 packs
 *   per set group.
 *
 *   So while this helper accepts `playerCount` for symmetry, the chaos
 *   branch must always use 8 to stay faithful to the generator. We
 *   document the fact via the `OPENER MATH MUST MATCH src/utils/draftLogic.ts`
 *   tests so a generator change is caught immediately.
 *
 * Inversion:
 *
 *     seat (0-indexed) = packIndex % 8
 *
 * Examples (chaos, 3 sets selected = 24 total packs):
 *   pack_index 0  → seat 0
 *   pack_index 1  → seat 1
 *   pack_index 7  → seat 7
 *   pack_index 8  → seat 0    (start of round 2)
 *   pack_index 15 → seat 7
 *   pack_index 16 → seat 0    (start of round 3)
 *   pack_index 23 → seat 7
 *
 * RETURN VALUE
 * ============
 * Returns the 0-indexed seat. The actual `pod_players.seat_number` column
 * is 1-indexed (host = 1), so the SQL using this math compares against
 * `seat_number - 1`. Keeping the helper 0-indexed mirrors the generator's
 * own indexing and keeps the math readable.
 */

/**
 * Hardcoded constant used by the chaos box generator. Documented as a named
 * constant so a future change to the generator triggers exactly one failing
 * test (the OPENER MATH test) and an obvious place to update.
 *
 * See `app/api/draft/route.ts` line 86 — `generateSealedBox([], chaosSetCode, 8)`.
 */
export const CHAOS_PACKS_PER_SET_GROUP = 8

export interface PackOpenerSeatInput {
  packIndex: number
  packsPerPlayer: number
  playerCount: number
  isChaos: boolean
}

/**
 * Derive the 0-indexed seat that cracked a pack.
 *
 * @param packIndex - 0-based pack index as recorded in `card_generations.pack_index`.
 * @param packsPerPlayer - packs per player for STANDARD mode. Ignored when isChaos=true.
 * @param playerCount - player count. Accepted for symmetry; chaos uses the
 *                      generator's hardcoded 8 instead, see file header.
 * @param isChaos - true when `pods.settings.draftMode === 'chaos'`.
 * @returns 0-indexed seat number.
 *
 * Throws on negative `packIndex` or non-positive `packsPerPlayer` in standard
 * mode — those are caller bugs, not edge cases.
 */
export function packOpenerSeat(input: PackOpenerSeatInput): number {
  const { packIndex, packsPerPlayer, isChaos } = input

  if (!Number.isFinite(packIndex) || packIndex < 0 || !Number.isInteger(packIndex)) {
    throw new RangeError(
      `packOpenerSeat: packIndex must be a non-negative integer, got ${packIndex}`,
    )
  }

  if (isChaos) {
    // The generator hardcodes 8 packs per chaos set group regardless of
    // player count. Mirror that exactly.
    return packIndex % CHAOS_PACKS_PER_SET_GROUP
  }

  if (!Number.isFinite(packsPerPlayer) || packsPerPlayer <= 0 || !Number.isInteger(packsPerPlayer)) {
    throw new RangeError(
      `packOpenerSeat: standard-mode packsPerPlayer must be a positive integer, got ${packsPerPlayer}`,
    )
  }

  return Math.floor(packIndex / packsPerPlayer)
}

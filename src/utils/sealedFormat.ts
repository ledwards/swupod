/**
 * Sealed pack count as a FORMAT dimension.
 *
 * SPEC (2026-07-30, user): 6-pack sealed and 8-pack sealed are DIFFERENT
 * FORMATS. They never pair. This is a hard split, not a preference — no
 * warning, no "play anyway", no crossing it with a crafted request.
 *
 *  1. Only plain `sealed` pools carry a pack-count bucket. Draft, Chaos Sealed,
 *     Pack Wars, Pack Blitz, Rotisserie and imported pools already separate on
 *     `format` (= card_pools.pool_type), so their bucket is `null` and this
 *     dimension is inert for them.
 *  2. The bucket is DERIVED, never stored twice: it is the length of the pool's
 *     own `packs` array. A build (`parent_pool_id`) is saved with `packs: null`,
 *     so it inherits its parent pool's count.
 *  3. LEGACY RULE — a sealed pool with no packs array anywhere lands in the
 *     6-pack bucket, deterministically, and only there. Sealed dealt exactly 6
 *     packs for the whole life of the app before the 6/8 choice existed, and
 *     every pool that really was 8 (Competitive Sealed included) stores its
 *     8-entry `packs` array, so nothing that was truly 8 can fall into 6. An
 *     unrecorded count therefore has ONE bucket, never both.
 *  4. Two sealed decks share a format only when their buckets are EQUAL. There
 *     is no wildcard.
 *
 * Everything here is pure — the SQL fragment is a string constant so every
 * read path derives the bucket exactly the same way the TS does.
 */
import { STANDARD_SEALED_PACKS_PER_PLAYER } from './sealedPodConfig'

/** The only pool type whose pack count is a format distinction (spec 1). */
export const PACK_COUNT_POOL_TYPE = 'sealed'

/** Spec 3: the bucket a sealed pool with no recorded packs belongs to. */
export const LEGACY_SEALED_PACK_BUCKET = STANDARD_SEALED_PACKS_PER_PLAYER

export interface SealedPackBucketInputs {
  /** card_pools.pool_type */
  poolType?: string | null
  /** Length of the pool's own `packs` array, if it has one. */
  packCount?: number | null
  /** Length of the parent pool's `packs` array (builds, spec 2). */
  parentPackCount?: number | null
}

/**
 * The pack-count bucket that identifies a pool's sealed format. Always a
 * number for sealed pools (spec 3 guarantees a bucket even with no packs
 * recorded); always `null` for every other format (spec 1).
 */
export function sealedPackBucket({
  poolType,
  packCount,
  parentPackCount,
}: SealedPackBucketInputs): number | null {
  if (poolType !== PACK_COUNT_POOL_TYPE) return null
  return (
    normalizeCount(packCount) ??
    normalizeCount(parentPackCount) ??
    LEGACY_SEALED_PACK_BUCKET
  )
}

function normalizeCount(value: number | string | null | undefined): number | null {
  const n = typeof value === 'string' ? Number(value) : value
  if (typeof n !== 'number' || !Number.isFinite(n)) return null
  const rounded = Math.trunc(n)
  // A zero-length packs array carries no format information — fall through to
  // the parent, then to the legacy bucket.
  return rounded > 0 ? rounded : null
}

/**
 * Normalize a bucket coming back from SQL / an API payload. Non-sealed formats
 * legitimately have none, so `null` stays `null` — this never invents a bucket
 * for a format that has no pack-count dimension.
 */
export function toPackBucket(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.trunc(n) : null
}

/**
 * Matchmaking rule (spec 4): a HARD split. Buckets must be equal. Two
 * non-sealed formats (both `null`) are unaffected — their `format` column
 * already separated them.
 */
export function packBucketsMatch(a: number | null | undefined, b: number | null | undefined): boolean {
  return toPackBucket(a) === toPackBucket(b)
}

/** Badge / inline text for a bucket: "8-pack". Empty for formats with none. */
export function packCountLabel(bucket: number | null | undefined): string {
  const n = toPackBucket(bucket)
  return n === null ? '' : `${n}-pack`
}

/**
 * The parenthetical that goes into a pool/deck display name, immediately
 * before the date: "LAW Sealed Pool (8-pack) 07.30.26". Empty for formats with
 * no pack-count dimension, so draft names are untouched.
 */
export function packCountNameSuffix(bucket: number | null | undefined): string {
  const label = packCountLabel(bucket)
  return label ? ` (${label})` : ''
}

/**
 * SQL that derives a pool's sealed pack bucket exactly as `sealedPackBucket()`
 * does, for the read paths that must filter/emit it in one round trip. The
 * matchmaking queries compare on this, so the two implementations MUST agree.
 *
 * `poolAlias` is the pool being described; `parentAlias` must be LEFT JOINed as
 * `card_pools <parentAlias> ON <parentAlias>.id = <poolAlias>.parent_pool_id`.
 * `packs` is JSONB and a few historical rows hold non-array junk, hence the
 * `jsonb_typeof` guard (jsonb_array_length would raise on those).
 */
export function poolPackBucketSql(poolAlias: string, parentAlias: string): string {
  return `CASE
    WHEN ${poolAlias}.pool_type IS DISTINCT FROM '${PACK_COUNT_POOL_TYPE}' THEN NULL
    WHEN jsonb_typeof(${poolAlias}.packs) = 'array'
      AND jsonb_array_length(${poolAlias}.packs) > 0 THEN jsonb_array_length(${poolAlias}.packs)
    WHEN jsonb_typeof(${parentAlias}.packs) = 'array'
      AND jsonb_array_length(${parentAlias}.packs) > 0 THEN jsonb_array_length(${parentAlias}.packs)
    ELSE ${LEGACY_SEALED_PACK_BUCKET}
  END`
}

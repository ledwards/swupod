/**
 * Chaos Sealed generation tracking — pure, shared by the API route (live pools) and
 * the backfill migration (pools created before tracking existed), so the two cannot
 * drift apart.
 *
 * BACKGROUND
 * ==========
 * `card_generations` is the only source the Showcases page reads
 * (`/api/users/:userId/showcase-leaders`). Regular Sealed writes it from
 * `/api/pools` and Draft writes it at draft start, but Chaos Sealed inserted its
 * pool and returned, so nothing it opened was ever attributed to the puller — a
 * Showcase leader pulled in Chaos Sealed simply never appeared in their collection.
 *
 * SPEC
 * ====
 * - Every card of every set pack is recorded, matching what regular Sealed records.
 * - `pack_index` is the pack's position in the pool's stored `packs` array, so a
 *   record can always be traced back to the pack it came from.
 * - Slot types come from position (`PACK_SLOT_TYPES`), as elsewhere.
 * - `set_code` comes from the card, not the pack: a Carbonite pack is selected as
 *   e.g. `ASH-CB` but holds ordinary `ASH` cards, and the collection is per real set.
 * - GC Event Packs are skipped. Their catalog is Units only (see
 *   `packProvidesLeaders`), so they can never carry a Showcase leader, and they are
 *   not 16-card boosters — recording them would both mislabel slots and pull promo
 *   cards into booster distribution stats.
 */
import { PACK_SLOT_TYPES } from '../utils/packSlotTypes'
import { PROMO_SET_CODES } from './chaosSealedSelection'

interface ChaosSealedPool {
  /** `card_pools.id` of the stored pool. */
  poolId: string
  /** `card_pools.share_id` of the stored pool. */
  shareId: string
  /** Pool owner, or null for an anonymous pool. */
  userId: string | null
}

/** Cards as stored in a pool's `packs` JSON. Deliberately loose — this reads persisted data. */
type StoredCard = Record<string, unknown> & { id?: unknown }

/** A stored pack: `{cards, setCode, setName}` today, a bare card array in older pools. */
type StoredPack = { cards?: unknown; setCode?: unknown } | unknown[] | null | undefined

export interface ChaosSealedTrackingRecord {
  card: StoredCard
  options: {
    packType: 'booster'
    sourceType: 'sealed'
    sourceId: string
    sourceShareId: string
    slotType: string | null
    packIndex: number
    userId: string | null
  }
}

/** Whether a stored pack is a GC Event Pack rather than a real set's booster. */
function isEventPack(pack: StoredPack): boolean {
  if (!pack || Array.isArray(pack)) return false
  const setCode = (pack as { setCode?: unknown }).setCode
  return typeof setCode === 'string' && setCode in PROMO_SET_CODES
}

/** The card list of a stored pack, for either stored shape. */
function packCards(pack: StoredPack): StoredCard[] {
  if (Array.isArray(pack)) return pack as StoredCard[]
  if (!pack) return []
  const cards = (pack as { cards?: unknown }).cards
  return Array.isArray(cards) ? (cards as StoredCard[]) : []
}

/**
 * Build the `card_generations` records for a Chaos Sealed pool.
 *
 * Pure and total: malformed packs and cards are skipped rather than throwing, because
 * the backfill reads years of persisted JSON and one bad pool must not stop the run.
 *
 * @param packs - The pool's packs, exactly as stored in `card_pools.packs`.
 * @param pool - Identifiers the records are attributed to.
 */
export function buildChaosSealedTrackingRecords(
  packs: StoredPack[] | null | undefined,
  pool: ChaosSealedPool
): ChaosSealedTrackingRecord[] {
  if (!Array.isArray(packs)) return []

  const records: ChaosSealedTrackingRecord[] = []

  packs.forEach((pack, packIndex) => {
    if (isEventPack(pack)) return

    packCards(pack).forEach((card, cardIndex) => {
      if (!card || !card.id) return

      records.push({
        card,
        options: {
          packType: 'booster',
          sourceType: 'sealed',
          sourceId: pool.poolId,
          sourceShareId: pool.shareId,
          slotType: PACK_SLOT_TYPES[cardIndex] ?? null,
          packIndex,
          userId: pool.userId ?? null,
        },
      })
    })
  })

  return records
}

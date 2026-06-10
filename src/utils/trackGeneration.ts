// @ts-nocheck
// Utility for tracking card generations for statistical analysis
import { query } from '@/lib/db'
import type { RawCard } from './cardData'

type Treatment = 'base' | 'hyperspace' | 'foil' | 'hyperspace_foil' | 'showcase'
type SlotType = 'leader' | 'base' | 'foil' | 'common' | 'uncommon' | 'rare_legendary' | 'unknown'

interface TrackingOptions {
  packType: 'booster' | 'leader'
  sourceType: 'draft' | 'sealed'
  sourceId: string | number
  sourceShareId: string
  slotType?: SlotType | null
  packIndex?: number | null
  userId?: string | null
}

interface TrackingRecord {
  card: RawCard
  options: TrackingOptions
}

/**
 * Position-based slot types for 16-card booster packs.
 * Maps card index within a pack to its slot type.
 * This avoids inference bugs where e.g. UC3 upgrading to Rare
 * gets misclassified as 'rare_legendary'.
 */
export const PACK_SLOT_TYPES: SlotType[] = [
  'leader',        // 0
  'base',          // 1
  'common',        // 2
  'common',        // 3
  'common',        // 4
  'common',        // 5
  'common',        // 6
  'common',        // 7
  'common',        // 8
  'common',        // 9
  'common',        // 10
  'uncommon',      // 11
  'uncommon',      // 12
  'uncommon',      // 13 (UC3 - stays uncommon even when upgraded)
  'rare_legendary', // 14
  'foil',          // 15
]

/**
 * Determine treatment type from card properties
 */
export function determineTreatment(card: RawCard): Treatment {
  const isHyperspace = card.isHyperspace === true || card.variantType === 'Hyperspace'
  const isShowcase = card.variantType === 'Showcase'
  const isFoil = card.isFoil === true

  if (isShowcase) return 'showcase'
  if (isHyperspace && isFoil) return 'hyperspace_foil'
  if (isFoil) return 'foil'
  if (isHyperspace) return 'hyperspace'
  return 'base'
}

/**
 * Determine slot type from card properties and context
 */
export function determineSlotType(card: RawCard, _context: TrackingOptions = {} as TrackingOptions): SlotType {
  if (card.isLeader) return 'leader'
  if (card.isBase) return 'base'
  if (card.isFoil) return 'foil'

  // For non-foil cards, determine by rarity
  if (card.rarity === 'Common') return 'common'
  if (card.rarity === 'Uncommon') return 'uncommon'
  if (card.rarity === 'Rare' || card.rarity === 'Legendary') return 'rare_legendary'

  return 'unknown'
}

/**
 * Track a single card generation
 *
 * @param card - The card object
 * @param options - Tracking options
 * @param options.packType - 'booster' or 'leader'
 * @param options.sourceType - 'draft' or 'sealed'
 * @param options.sourceId - ID of the draft_pod or pool
 * @param options.sourceShareId - Share ID
 * @param options.slotType - Optional: override slot type determination
 * @param options.packIndex - Optional: index of the pack within the pool (0-based)
 * @param options.userId - Optional: UUID of the user who generated the card
 */
export async function trackCardGeneration(card: RawCard, options: TrackingOptions): Promise<void> {
  const {
    packType,
    sourceType,
    sourceId,
    sourceShareId,
    slotType = null,
    packIndex = null,
    userId = null
  } = options

  try {
    await query(
      `INSERT INTO card_generations (
        card_id,
        set_code,
        card_name,
        card_subtitle,
        card_type,
        rarity,
        aspects,
        treatment,
        variant_type,
        is_foil,
        is_hyperspace,
        is_showcase,
        pack_type,
        slot_type,
        source_type,
        source_id,
        source_share_id,
        pack_index,
        user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
      [
        card.id,
        card.set,
        card.name,
        card.subtitle || null,
        card.type,
        card.rarity,
        card.aspects || [],
        determineTreatment(card),
        card.variantType,
        card.isFoil || false,
        card.isHyperspace === true || card.variantType === 'Hyperspace',
        card.variantType === 'Showcase',
        packType,
        slotType || determineSlotType(card),
        sourceType,
        sourceId,
        sourceShareId,
        packIndex,
        userId
      ]
    )
  } catch (error) {
    // Log error but don't fail pack generation if tracking fails
    console.error('Failed to track card generation:', error)
  }
}

/**
 * Track multiple cards from a pack
 *
 * @param cards - Array of card objects
 * @param options - Tracking options (same as trackCardGeneration)
 */
export async function trackPackGeneration(cards: RawCard[], options: TrackingOptions): Promise<void> {
  // Track cards in parallel but don't wait for completion
  // This ensures pack generation isn't slowed down by tracking
  Promise.all(
    cards.map(card => trackCardGeneration(card, options))
  ).catch(error => {
    console.error('Failed to track pack generation:', error)
  })
}

/**
 * Bulk insert card generations for better performance
 * Use this when generating many packs at once (e.g., sealed pools, draft start)
 *
 * @param records - Array of {card, options} objects
 */
export async function trackBulkGenerations(records: TrackingRecord[]): Promise<void> {
  if (!records || records.length === 0) return

  try {
    const values: unknown[] = []
    const placeholders: string[] = []

    records.forEach((record, index) => {
      const { card, options } = record
      const baseIndex = index * 19

      placeholders.push(
        `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, ` +
        `$${baseIndex + 6}, $${baseIndex + 7}, $${baseIndex + 8}, $${baseIndex + 9}, $${baseIndex + 10}, ` +
        `$${baseIndex + 11}, $${baseIndex + 12}, $${baseIndex + 13}, $${baseIndex + 14}, $${baseIndex + 15}, ` +
        `$${baseIndex + 16}, $${baseIndex + 17}, $${baseIndex + 18}, $${baseIndex + 19})`
      )

      values.push(
        card.id,
        card.set,
        card.name,
        card.subtitle || null,
        card.type,
        card.rarity,
        card.aspects || [],
        determineTreatment(card),
        card.variantType,
        card.isFoil || false,
        card.isHyperspace === true || card.variantType === 'Hyperspace',
        card.variantType === 'Showcase',
        options.packType,
        options.slotType || determineSlotType(card),
        options.sourceType,
        options.sourceId,
        options.sourceShareId,
        options.packIndex ?? null,
        options.userId ?? null
      )
    })

    await query(
      `INSERT INTO card_generations (
        card_id, set_code, card_name, card_subtitle, card_type, rarity, aspects,
        treatment, variant_type, is_foil, is_hyperspace, is_showcase,
        pack_type, slot_type, source_type, source_id, source_share_id, pack_index, user_id
      ) VALUES ${placeholders.join(', ')}`,
      values
    )
  } catch (error) {
    console.error('Failed to track bulk generations:', error)
  }
}

/**
 * Attribute one drafted card to its picker in `card_generations.user_id`.
 *
 * Background: draft packs are inserted at start-time with user_id = null
 * (we don't know who'll pick what at generation). Migration 067 backfills
 * historical data; this function is the write-path that keeps new picks
 * correctly attributed going forward, so the U6 "kept" scope query for
 * drafts is `user_id = $authUser` instead of "join through pod_players".
 *
 * Implementation: claim a single matching NULL-attributed row by id-in-
 * subquery + LIMIT 1, ordered (pack_index, id) for determinism. The
 * `user_id IS NULL` guard makes this safe under concurrent picks of the
 * same card_id in the same pod (e.g., two players each pick one of two
 * available copies) — each call grabs one row, the next call grabs the
 * next still-NULL row.
 *
 * Fire-and-forget: errors are logged but never thrown. A failure here
 * costs accurate per-user stats for one card; it must not block a pick.
 *
 * No-ops when userId is falsy. The two pick-route call sites pass
 * `session.id` (human pick) and `player.user_id` (staged pick which
 * iterates both humans and bots). Bots have a non-null user_id in
 * pod_players today, so they'd be attributed by the staged path; that
 * is acceptable — stats endpoints filter by the authenticated reader's
 * user_id, so unattributed bot rows never bleed into a human's "kept"
 * count. The userId-falsy guard is defensive against future callers
 * that pass null explicitly.
 */
export async function attributePickedCard(params: {
  podId: string
  cardId: string
  userId: string | null
}): Promise<void> {
  const { podId, cardId, userId } = params
  if (!userId || !podId || !cardId) return
  try {
    await query(
      `UPDATE card_generations
         SET user_id = $1
       WHERE id = (
         SELECT id FROM card_generations
          WHERE source_type = 'draft'
            AND source_id = $2
            AND card_id = $3
            AND user_id IS NULL
          ORDER BY pack_index NULLS LAST, id
          LIMIT 1
       )`,
      [userId, podId, cardId]
    )
  } catch (error) {
    console.error('[attributePickedCard] failed to attribute', {
      podId, cardId, userId, error: (error as Error).message,
    })
  }
}

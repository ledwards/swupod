import { trackBulkGenerations, PACK_SLOT_TYPES } from '../../utils/trackGeneration'
import { captureLimitedServerEvent } from '../../../lib/posthog'
import { LimitedAnalyticsEvents } from '../../analytics/limitedEvents'
import type { RawCard } from '../../utils/cardData'

interface FinalizedPool {
  newlyCreated: boolean
  shareId: string
  setCode: string
  packs: { cards: Record<string, unknown>[] }[]
}
/** Called only after the finalization transaction commits. Retries never re-emit. */
export async function trackSoloFinalization(pool: FinalizedPool, sourceId: string, userId: string, flowId: string | null,
  dependencies = { track: trackBulkGenerations, capture: captureLimitedServerEvent }): Promise<void> {
  if (!pool.newlyCreated) return
  const records = pool.packs.flatMap((pack, packIndex) => pack.cards.map((card, cardIndex) => ({
    card: card as unknown as RawCard,
    options: { packType: 'booster' as const,sourceType: 'sealed' as const,sourceId,sourceShareId: pool.shareId,
      packIndex,slotType: PACK_SLOT_TYPES[cardIndex] || null,userId },
  })))
  // Match the legacy best-effort behavior: tracking outages cannot undo a saved pool.
  const outcomes = await Promise.allSettled([
    Promise.resolve().then(() => dependencies.track(records)),
    Promise.resolve().then(() => dependencies.capture(LimitedAnalyticsEvents.LIMITED_POOL_CREATED,userId,{
      format:'sealed',mode:'solo',setCode:pool.setCode,pack_count:pool.packs.length,poolShareId:pool.shareId,flowId,
    })),
  ])
  if (outcomes.some(result => result.status === 'rejected')) console.warn('Solo sealed tracking was unavailable; the pool remains saved.')
}

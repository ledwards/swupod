import { queryRow } from '../../../lib/db'
import { buildBotDecks } from '../../utils/botDeckBuilder'

const parse = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v)

/**
 * Bots build their decks when the draft ends. A pod that finished without
 * them (an older draft, or a build that failed) gets them the first time its
 * pod page or leader results load. Cheap when every bot is ready: one query.
 * Safe under concurrent loads: buildBotDecks holds a per-pod lock and skips
 * bots that already have a deck. Returns how many decks were built.
 */
export async function ensureBotDecks(podId: string): Promise<number> {
  const pod = await queryRow(`SELECT p.id,p.set_code,p.settings,p.status,
      EXISTS (SELECT 1 FROM pod_players pp WHERE pp.pod_id=p.id AND pp.is_bot=true AND NOT EXISTS (
        SELECT 1 FROM card_pools cp JOIN built_decks b ON b.card_pool_id=cp.id
        WHERE cp.pod_id=p.id AND cp.user_id=pp.user_id AND cp.parent_pool_id IS NULL)) AS missing
    FROM pods p WHERE p.id=$1`, [podId])
  if (!pod || pod.status !== 'complete' || pod.missing !== true) return 0
  try {
    return await buildBotDecks(podId, String(pod.set_code ?? ''), (parse(pod.settings) ?? {}) as Record<string, unknown>, { announce: false })
  } catch (error) {
    console.error('[BOT_DECK] Backfill failed:', error instanceof Error ? error.message : error)
    return 0
  }
}

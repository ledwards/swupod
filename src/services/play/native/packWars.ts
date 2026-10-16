import type { TxClient } from '../../../../lib/db'
import type { NativeDeckVersion } from '../deckVersions'
import { PtpPlayError } from '../playState'
import { buildPackWarsDeckVersion, unsupportedPackWarsCards, PackWarsUnsupportedError, type PackWarsCard } from '../packWarsDeck'
import type { loadSupport } from './savedDeck'

type Support = Awaited<ReturnType<typeof loadSupport>>
const parsed = (value: unknown): any => (typeof value === 'string' ? JSON.parse(value) : value)

/** Pools opened before generation stored evidence are not backfilled. */
export const PACK_WARS_UNVERIFIED_MESSAGE = 'These packs were opened before Pack Wars could be played on our table. Open new packs to play against the AI.'

/** Pack Wars evidence for an owned root pool, recorded at generation. */
async function packWarsEvidence(tx: TxClient, pool: Record<string, any> | null, userId: string) {
  if (!pool || pool.user_id !== userId) throw new PtpPlayError(404, 'deck_not_found', 'Pack Wars pool not found.')
  if (pool.pool_type !== 'pack_wars') throw new PtpPlayError(409, 'unsupported_format', 'Choose a Pack Wars pool.')
  const row = pool.parent_pool_id ? null : await tx.queryRow('SELECT * FROM ptp_native_pool_evidence WHERE source_pool_id=$1 AND owner_user_id=$2', [pool.id, userId])
  if (!row || row.pool_type !== 'pack_wars') throw new PtpPlayError(409, 'unverified_source', PACK_WARS_UNVERIFIED_MESSAGE)
  const cards = parsed(row.cards)
  return { sourcePoolId: String(row.source_pool_id), setCode: String(row.set_code), packCount: Number(row.pack_count), cards: (Array.isArray(cards) ? cards : []) as PackWarsCard[] }
}

/** The player's Pack Wars deck: the chosen leader and base from their stored packs, every other card as the deck. */
export async function packWarsPoolDeck(tx: TxClient, pool: Record<string, any> | null, userId: string, choice: { leaderId: string; baseId: string }, support: Support): Promise<{ sourcePoolId: string; snapshot: NativeDeckVersion }> {
  const evidence = await packWarsEvidence(tx, pool, userId)
  const snapshot = buildPackWarsDeckVersion({ authenticatedUserId: userId, pool: { id: String(pool!.id), shareId: String(pool!.share_id), userId: String(pool!.user_id) }, evidence, choice, ...support })
  return { sourcePoolId: evidence.sourcePoolId, snapshot }
}

/** Read-only: can this pool be played against the AI, and if not, why. */
export async function packWarsReadiness(tx: TxClient, shareId: string, userId: string, support: Support): Promise<{ ready: true } | { ready: false; code: string; message: string; cards?: string[] }> {
  try {
    const pool = await tx.queryRow('SELECT * FROM card_pools WHERE share_id=$1 AND user_id=$2', [shareId, userId])
    const evidence = await packWarsEvidence(tx, pool, userId)
    if (!support.policy.supportedSets.has(evidence.setCode)) throw new PtpPlayError(409, 'unsupported_set', 'This set is not enabled for table play yet.')
    const unsupported = unsupportedPackWarsCards(evidence.cards, support)
    if (unsupported.length) throw new PackWarsUnsupportedError(unsupported)
    return { ready: true }
  } catch (error) {
    if (error instanceof PackWarsUnsupportedError) return { ready: false, code: error.code, message: error.message, cards: error.cards }
    if (error instanceof PtpPlayError) return { ready: false, code: error.code, message: error.message }
    throw error
  }
}

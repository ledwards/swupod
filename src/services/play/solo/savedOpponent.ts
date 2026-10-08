import { createHash } from 'node:crypto'
import type { NativeDeckVersion } from '../deckVersions'
import { PtpPlayError } from '../playState'
import { practiceDeck } from '../native/localPractice'
import type { loadSupport } from '../native/savedDeck'

export type SoloOpponentSnapshot = Omit<NativeDeckVersion, 'provenance'> & { readonly provenance: NativeDeckVersion['provenance'] | 'saved-practice' }

/** Private AI opponent only: saved builds do not claim verified limited-pool provenance. */
export function savedOpponentSnapshot(pool: Record<string, any>, userId: string, support: Awaited<ReturnType<typeof loadSupport>>): SoloOpponentSnapshot {
  if (pool.user_id !== userId) throw new PtpPlayError(404, 'deck_not_found', 'Saved deck not found.')
  if (!['draft', 'sealed'].includes(pool.pool_type)) throw new PtpPlayError(409, 'opponent_format', 'Choose a Draft or Sealed deck.')
  if (!support.policy.supportedSets.has(pool.set_code)) throw new PtpPlayError(409, 'unsupported_set', 'This set is not supported yet.')
  const deck = practiceDeck(pool.deck_builder_state, support)
  const packs = typeof pool.packs === 'string' ? JSON.parse(pool.packs) : pool.packs
  const snapshot = {
    schemaVersion: 1 as const, sourcePoolId: String(pool.parent_pool_id ?? pool.id),
    poolId: String(pool.id), poolShareId: String(pool.share_id), ownerUserId: userId,
    setCode: String(pool.set_code), poolType: pool.pool_type as 'draft' | 'sealed',
    packCount: Array.isArray(packs) ? packs.length : 0,
    provenance: 'saved-practice' as const, validationVersion: support.policy.version, ...deck,
  }
  return Object.freeze({ ...snapshot, contentHash: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex') })
}

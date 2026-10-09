import { readFile } from 'node:fs/promises'
import type { TxClient } from '../../../../lib/db'
import { buildNativeDeckVersion, type NativeDeckInput, type NativeDeckVersion, type NativeCatalogCard } from '../deckVersions'
import { PtpPlayError } from '../playState'

export async function loadSupport(path: string): Promise<Pick<NativeDeckInput, 'catalog' | 'policy'> & { engineRevision: string; compatibleRevisions: string[] }> {
  const data = JSON.parse(await readFile(path, 'utf8'))
  if (typeof data.engineRevision !== 'string' || !data.engineRevision || typeof data.version !== 'string' || !Array.isArray(data.cards) || !Array.isArray(data.supportedSets) || !Array.isArray(data.unrestrictedBaseIds)) throw new Error('Invalid native support manifest')
  const catalog = new Map<string, NativeCatalogCard>()
  for (const card of data.cards) {
    if (typeof card.ptpId !== 'string' || typeof card.engineId !== 'string' || !['Leader', 'Base', 'Unit', 'Event', 'Upgrade'].includes(card.type) || typeof card.rarity !== 'string' || catalog.has(card.ptpId)) throw new Error('Invalid native card mapping')
    catalog.set(card.ptpId, { id: card.ptpId, engineId: card.engineId, type: card.type, rarity: card.rarity })
  }
  return { compatibleRevisions: Array.isArray(data.compatibleRevisions) ? data.compatibleRevisions.filter((v: unknown): v is string => typeof v === "string") : [], engineRevision: data.engineRevision, catalog, policy: { version: `${data.engineRevision}:${data.version}`, supportedSets: new Set(data.supportedSets), supportedCardIds: new Set(Array.isArray(data.supportedCardIds) ? data.supportedCardIds : [...catalog.values()].map(c => c.engineId)), unrestrictedBaseIds: new Set(data.unrestrictedBaseIds) } }
}
const parsed = (v: unknown): any => typeof v === 'string' ? JSON.parse(v) : v
/** Request-scoped rows for read-only deck listings. Admission always reads/locks fresh rows. */
export interface SavedDeckListing {
  pool: Record<string, any>
  sources: ReadonlyMap<string, Record<string, any>>
  evidence: ReadonlyMap<string, Record<string, any>>
  pods: ReadonlyMap<string, Record<string, any>>
  players: ReadonlyMap<string, Record<string, any>>
}
export async function validateSavedDeck(tx: TxClient, userId: string, shareId: string, supportPath: string, locking = false, support?: Awaited<ReturnType<typeof loadSupport>>, allowSavedSealed = false, listing?: SavedDeckListing) {
  if (locking && listing) throw new Error('Admission cannot use preloaded listing rows')
  const pool = listing ? listing.pool : await tx.queryRow(`SELECT * FROM card_pools WHERE share_id = $1 AND user_id = $2${locking ? ' FOR UPDATE' : ''}`, [shareId, userId])
  if (!pool) throw new PtpPlayError(404, 'deck_not_found', 'Saved deck not found.')
  const source = pool.parent_pool_id ? listing ? listing.sources.get(String(pool.parent_pool_id)) : await tx.queryRow(`SELECT * FROM card_pools WHERE id = $1${locking ? ' FOR SHARE' : ''}`, [pool.parent_pool_id]) : pool
  if (!source || source.parent_pool_id || source.user_id !== userId) throw new PtpPlayError(409, 'unverified_source', 'The original owned pool is unavailable.')
  let evidence: NativeDeckInput['evidence']
  if (source.pool_type === 'sealed') {
    const verified = listing ? listing.evidence.get(String(source.id)) : await tx.queryRow('SELECT * FROM ptp_native_pool_evidence WHERE source_pool_id = $1 AND owner_user_id = $2', [source.id, userId])
    if (!verified && !allowSavedSealed) throw new PtpPlayError(409, 'unverified_source', 'This older sealed pool predates table-play verification and cannot enter the lobby.')
    evidence = verified ? { sourcePoolId: String(source.id), kind: 'server-sealed', setCode: String(verified.set_code), poolType: 'sealed', packCount: Number(verified.pack_count), cards: parsed(verified.cards) } : { sourcePoolId: String(source.id), kind: 'saved-sealed', setCode: String(source.set_code), poolType: 'sealed', packCount: parsed(source.packs)?.length, cards: parsed(source.cards) }
  } else if (source.pool_type === 'draft' && source.pod_id) {
    const pod = listing ? listing.pods.get(String(source.pod_id)) : await tx.queryRow(`SELECT * FROM pods WHERE id = $1${locking ? ' FOR SHARE' : ''}`, [source.pod_id])
    const player = listing ? listing.players.get(String(source.pod_id)) : await tx.queryRow(`SELECT * FROM pod_players WHERE pod_id = $1 AND user_id = $2${locking ? ' FOR SHARE' : ''}`, [source.pod_id, userId])
    const packs = parsed(pod?.all_packs)
    const seatPacks = Array.isArray(packs) && player ? packs[Number(player.seat_number) - 1] : null
    if (!pod || pod.pod_type !== 'draft' || pod.status !== 'complete' || !player || !Array.isArray(seatPacks) || !seatPacks.length) throw new PtpPlayError(409, 'unverified_source', 'A completed server draft is required.')
    const settings = parsed(pod.settings)
    const leaders = parsed(player.drafted_leaders), cards = parsed(player.drafted_cards)
    if (!Array.isArray(leaders) || !Array.isArray(cards)) throw new PtpPlayError(409, 'unverified_source', 'Draft picks are unavailable.')
    const loadedSupport=support??await loadSupport(supportPath)
    const sourceSet=settings?.draftMode==='chaos'?[...new Set([...leaders,...cards].map(c=>loadedSupport.catalog.get(c.id)?.engineId.split('_')[0]??'UNKNOWN'))].sort().join(','):String(pod.set_code)
    evidence = { sourcePoolId: String(source.id), kind: 'server-draft', setCode: sourceSet, poolType: 'draft', packCount: seatPacks.length, cards: [...leaders, ...cards] }
  } else throw new PtpPlayError(409, 'unverified_source', 'This pool type is not supported for table play.')
  const snapshot = buildNativeDeckVersion({ allowSavedSealed, authenticatedUserId: userId, pool: { id: String(pool.id), shareId, userId: String(pool.user_id), sourcePoolId: String(source.id), deckBuilderState: pool.deck_builder_state }, evidence, ...(support ?? await loadSupport(supportPath)) })
  return { poolId: String(pool.id), sourcePoolId: String(source.id), snapshot }
}
export async function freezeSavedDeck(tx: TxClient, userId: string, shareId: string, supportPath: string): Promise<{ id: string; snapshot: NativeDeckVersion }> {
  const {poolId,sourcePoolId,snapshot}=await validateSavedDeck(tx,userId,shareId,supportPath,true)
  // DO NOTHING preserves append-only UPDATE prohibition, including repeated saves.
  await tx.query('INSERT INTO ptp_play_deck_versions (pool_id,source_pool_id,owner_user_id,content_hash,snapshot) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (pool_id,content_hash) DO NOTHING', [poolId, sourcePoolId, userId, snapshot.contentHash, JSON.stringify(snapshot)])
  const row = await tx.queryRow('SELECT id FROM ptp_play_deck_versions WHERE pool_id=$1 AND content_hash=$2', [poolId, snapshot.contentHash])
  if (!row) throw new Error('Snapshot persistence failed')
  return { id: String(row.id), snapshot }
}

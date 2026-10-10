import { savedOpponentSnapshot } from '../solo/savedOpponent'
import { hyperspaceLeaderArt } from '../../../utils/hyperspaceLeaderArt'
import { entryDeckLocked } from '../../entry/deckLock'
import { localPracticeEnabled, practiceDeck } from './localPractice'
import { getAllCards } from '../../../utils/cardData'
import { withTransaction } from '../../../../lib/db'
import { PtpPlayError, summarizeDeckBuilderState } from '../playState'
import { NativeDeckEligibilityError } from '../deckVersions'
import { nativeConfig } from './runtimeClient'
import { loadSupport, validateSavedDeck } from './savedDeck'
export const UNLISTABLE_DECK_CODES = new Set(['not_owner','outside_pool','unsupported_policy','unsupported_set','unsupported_format','unverified_source','deck_not_found'])
/**
 * Read-only eligibility: the same authoritative validation as admission, no snapshot insert.
 *
 * Builds of one pool share a root (`parent_pool_id`). Every deck carries its
 * root pool; with `byPool`, decks are also returned grouped under that root so
 * a player can see every build they made from a pool, newest first.
 */
export async function nativeDecks(userId: string, requestedPool?: string, options: {includeUnplayable?: boolean; requestedOnly?: boolean; byPool?: boolean} = {}) {
  const config = nativeConfig(process.env, true)
  const support = await loadSupport(config.supportPath)
  const cardArt = new Map(
    getAllCards()
      .filter((card) => card.type === 'Leader')
      .map((card) => [card.id, card.imageUrl])
  )
  return withTransaction(async (tx) => {
    const pools = await tx.queryRows(
      `SELECT p.*,d.competitive,d.draft_state,d.deck_lock_at,d.decks_unlocked,d.settings AS pod_settings,d.status AS pod_status FROM card_pools p LEFT JOIN pods d ON d.id=p.pod_id WHERE p.user_id=$1 AND p.hidden IS NOT TRUE ${options.requestedOnly ? "AND p.share_id=$2" : ""} ${options.includeUnplayable ? "" : "AND (p.pool_type IN ('sealed','draft') OR p.share_id=$2) AND deck_builder_state IS NOT NULL"} ORDER BY (p.share_id=$2) DESC NULLS LAST,p.updated_at DESC NULLS LAST ${options.includeUnplayable ? "" : "LIMIT 100"}`,
      [userId, requestedPool ?? null]
    )
    // Fetch each source once, regardless of how many alternate builds use it.
    const parentIds = [...new Set(pools.flatMap(row => row.parent_pool_id ? [String(row.parent_pool_id)] : []))]
    const parents = parentIds.length ? await tx.queryRows('SELECT * FROM card_pools WHERE id=ANY($1::uuid[]) AND user_id=$2', [parentIds,userId]) : []
    const sources = new Map([...pools,...parents].map(row => [String(row.id),row]))
    const roots = [...sources.values()].filter(row => !row.parent_pool_id)
    const sealedIds = roots.filter(row=>row.pool_type==='sealed').map(row=>String(row.id))
    const podIds = [...new Set(roots.filter(row=>row.pool_type==='draft'&&row.pod_id).map(row=>String(row.pod_id)))]
    const evidenceRows = sealedIds.length ? await tx.queryRows('SELECT * FROM ptp_native_pool_evidence WHERE source_pool_id=ANY($1::uuid[]) AND owner_user_id=$2',[sealedIds,userId]) : []
    const podRows = podIds.length ? await tx.queryRows('SELECT id,pod_type,status,all_packs,settings,set_code FROM pods WHERE id=ANY($1::uuid[])',[podIds]) : []
    const playerRows = podIds.length ? await tx.queryRows('SELECT pod_id,seat_number,drafted_leaders,drafted_cards FROM pod_players WHERE pod_id=ANY($1::uuid[]) AND user_id=$2',[podIds,userId]) : []
    const listing = {sources,evidence:new Map(evidenceRows.map(row=>[String(row.source_pool_id),row])),pods:new Map(podRows.map(row=>[String(row.id),row])),players:new Map(playerRows.map(row=>[String(row.pod_id),row]))}
    const decks = []
    let hidden = 0
    for (const row of pools) {
      const summary = summarizeDeckBuilderState({
        shareId: String(row.share_id),
        setCode: String(row.set_code),
        setName: row.set_name as string | null,
        poolType: String(row.pool_type),
        name: row.name as string | null,
        deckBuilderState: row.deck_builder_state,
        createdAt: row.created_at as Date,
        updatedAt: row.updated_at as Date,
      })
      const source = sources.get(String(row.parent_pool_id ?? row.id))
      const root = source ?? row
      const rootCreatedAt = root.created_at as Date | string | null | undefined
      const pool = {
        poolRootShareId: String(root.share_id ?? row.share_id),
        poolName: (root.name ?? null) as string | null,
        poolCreatedAt: rootCreatedAt instanceof Date ? rootCreatedAt.toISOString() : rootCreatedAt ?? null,
      }
      const sourcePacks = typeof source?.packs === 'string' ? JSON.parse(source.packs) : source?.packs
      const library = {
        poolType: String(row.pool_type),
        hasDeck: row.deck_builder_state != null,
        poolUrl: `${config.hostOrigin}/pool/${encodeURIComponent(String(row.share_id))}`,
        editUrl: `${config.hostOrigin}/pool/${encodeURIComponent(String(row.share_id))}/deck`,
        sourcePoolShareId: source?.share_id ? String(source.share_id) : null,
      }
      const podSettings = typeof row.pod_settings === 'string' ? JSON.parse(row.pod_settings) : row.pod_settings
      const bracketEligible = row.pool_type === 'draft' && row.pod_status === 'complete' && podSettings?.isSolo === true
      const minimumCards = summary.baseName === 'Data Vault' ? 40 : summary.baseName === 'Thermal Oscillator' ? 25 : 30
      const complete = Boolean(summary.leaderName && summary.baseName && summary.mainDeckCount >= minimumCards)
      // Use catalog art, never a user-supplied image URL from saved state.
      let leaderImageUrl: string | null = null
      try {
        const state =
          typeof row.deck_builder_state === 'string'
            ? JSON.parse(row.deck_builder_state)
            : row.deck_builder_state
        leaderImageUrl = cardArt.get(state?.cardPositions?.[state?.activeLeader]?.card?.id) ?? null
      } catch {
        /* Invalid saved state still gets its eligibility explanation below. */
      }
      let aiOpponentReady = false
      try { savedOpponentSnapshot(row, userId, support); aiOpponentReady = true } catch { /* Incomplete or unsupported AI opponent. */ }
      let practiceReady = false
      if (localPracticeEnabled()) {
        try {
          practiceDeck(row.deck_builder_state, support)
          practiceReady = true
        } catch {
          /* Regular eligibility explains incomplete builds. */
        }
      }
      try {
        if (!['sealed', 'draft'].includes(String(row.pool_type)))
          throw new PtpPlayError(
            409,
            'unsupported_format',
            'Native play currently supports draft and sealed decks. This format is not supported yet.'
          )
        const { snapshot } = await validateSavedDeck(
          tx,
          userId,
          summary.poolShareId,
          config.supportPath,
          false,
          support,
          false,
          {...listing,pool:row}
        )
        decks.push({
          ...summary,
          ...library,
          ...pool,
          complete,
          bracketEligible,
          editLocked: entryDeckLocked(row),
          leaderImageUrl,
          leaderBackImageUrl: hyperspaceLeaderArt(summary.leaderName, summary.setCode) || leaderImageUrl,
          practiceReady,
          aiOpponentReady,
          ready: true,
          blocker: null,
          blockerCode: null,
          setCode: snapshot.setCode,
          poolType: snapshot.poolType,
          packCount: snapshot.packCount,
        })
      } catch (error) {
        if (!(error instanceof NativeDeckEligibilityError || error instanceof PtpPlayError))
          throw error
        if (!options.includeUnplayable && UNLISTABLE_DECK_CODES.has(error.code) && !practiceReady) { hidden += 1; continue }
        decks.push({
          ...summary,
          ...library,
          ...pool,
          complete,
          bracketEligible,
          editLocked: entryDeckLocked(row),
          leaderImageUrl,
          leaderBackImageUrl: hyperspaceLeaderArt(summary.leaderName, summary.setCode) || leaderImageUrl,
          practiceReady,
          aiOpponentReady,
          ready: false,
          blocker: error.message,
          blockerCode: error.code,
          packCount: Array.isArray(sourcePacks) && sourcePacks.length ? sourcePacks.length : null,
          createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at ?? null,
        })
      }
    }
    if (!options.byPool) return { decks, hiddenCount: hidden, localTesting: localPracticeEnabled() }
    const grouped = new Map<string, {poolShareId: string; name: string | null; setCode: string; setName: string | null; poolType: string; packCount: number | null; createdAt: string | null; decks: typeof decks}>()
    for (const deck of decks) {
      const entry = grouped.get(deck.poolRootShareId) ?? {poolShareId: deck.poolRootShareId, name: deck.poolName, setCode: deck.setCode, setName: deck.setName, poolType: deck.poolType, packCount: deck.packCount, createdAt: deck.poolCreatedAt, decks: []}
      entry.packCount ??= deck.packCount
      entry.decks.push(deck)
      grouped.set(deck.poolRootShareId, entry)
    }
    return { decks, pools: [...grouped.values()], hiddenCount: hidden, localTesting: localPracticeEnabled() }
  })
}

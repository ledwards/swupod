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
/** Read-only eligibility: the same authoritative validation as admission, no snapshot insert. */
export async function nativeDecks(userId: string, requestedPool?: string) {
  const config = nativeConfig(process.env, true)
  const support = await loadSupport(config.supportPath)
  const cardArt = new Map(
    getAllCards()
      .filter((card) => card.type === 'Leader')
      .map((card) => [card.id, card.imageUrl])
  )
  return withTransaction(async (tx) => {
    const pools = await tx.queryRows(
      "SELECT p.*,d.competitive,d.draft_state,d.deck_lock_at,d.decks_unlocked FROM card_pools p LEFT JOIN pods d ON d.id=p.pod_id WHERE p.user_id=$1 AND p.hidden IS NOT TRUE AND (p.pool_type IN ('sealed','draft') OR p.share_id=$2) AND deck_builder_state IS NOT NULL ORDER BY (p.share_id=$2) DESC NULLS LAST,p.updated_at DESC NULLS LAST LIMIT 100",
      [userId, requestedPool ?? null]
    )
    const decks = []
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
          support
        )
        decks.push({
          ...summary,
          complete,
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
        decks.push({
          ...summary,
          complete,
          editLocked: entryDeckLocked(row),
          leaderImageUrl,
          leaderBackImageUrl: hyperspaceLeaderArt(summary.leaderName, summary.setCode) || leaderImageUrl,
          practiceReady,
          aiOpponentReady,
          ready: false,
          blocker: error.message,
          blockerCode: error.code,
          packCount: null,
        })
      }
    }
    return { decks, localTesting: localPracticeEnabled() }
  })
}

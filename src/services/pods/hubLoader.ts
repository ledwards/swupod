import { queryRow, queryRows, withTransaction } from '../../../lib/db'
import { getCachedCardById, getCachedCards, initializeCardCache } from '../../utils/cardCache'
import { nativeConfig } from '../play/native/runtimeClient'
import { buildHubView, type HubInputPlayer } from './hubView'
import type { HubDeck, HubView } from './hubTypes'
import { advanceTournament, loadTournament, syncNativeResults, PodTournamentError } from './tournamentDb'

type Card = { id?: string; name?: string; subtitle?: string | null; set?: string; variantType?: string; imageUrl?: string; backImageUrl?: string | null; isLeader?: boolean; isBase?: boolean; type?: string }
const parse = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v)

/** Hyperspace printing of a leader or base, the art the Play page's split deck tiles use; else the card's own art. */
export function hyperspaceArt(card: Card | null, setCards: Card[], side: 'front' | 'back' = 'front'): string | null {
  if (!card) return null
  const match = setCards.find(c => c.variantType === 'Hyperspace' && c.name === card.name && (c.subtitle ?? null) === (card.subtitle ?? null) && c.type === card.type)
  if (side === 'back') return match?.backImageUrl ?? card.backImageUrl ?? null
  return match?.imageUrl ?? card.imageUrl ?? null
}

function deckFor(leaderId: unknown, baseId: unknown): HubDeck | null {
  const leader = getCachedCardById(typeof leaderId === 'string' ? leaderId : null) as Card | null
  const base = getCachedCardById(typeof baseId === 'string' ? baseId : null) as Card | null
  if (!leader && !base) return null
  return {
    leaderName: leader?.name ?? 'Leader', leaderArt: hyperspaceArt(leader, getCachedCards(leader?.set ?? '') as Card[]),
    leaderUnitArt: hyperspaceArt(leader, getCachedCards(leader?.set ?? '') as Card[], 'back'),
    baseName: base?.name ?? 'Base', baseArt: hyperspaceArt(base, getCachedCards(base?.set ?? '') as Card[]),
  }
}

function nativeAvailable() {
  try { nativeConfig(); return true } catch { return false }
}

/**
 * Everything the pod page shows. Before building it, bring the tournament up
 * to date: attach finished games (asking the engine about the viewer's own
 * live table) and advance rounds or a due top cut.
 */
export async function loadHubView(shareId: string, viewerId: string | null, now = Date.now()): Promise<HubView> {
  const pod = await queryRow(`SELECT id,share_id,name,set_code,set_name,status,host_id,settings FROM pods WHERE share_id=$1`, [shareId])
  if (!pod) throw new PodTournamentError(404, 'pod_not_found', 'Pod not found.')
  if (pod.status !== 'complete') throw new PodTournamentError(409, 'still_drafting', 'The draft is still going.')
  const podId = String(pod.id)
  const hasTournament = await queryRow('SELECT status FROM pod_tournaments WHERE pod_id=$1', [podId])
  if (hasTournament?.status === 'running') {
    const nativePlay = nativeAvailable()
    await syncNativeResults(podId, nativePlay && viewerId ? async (gameId, seat0) => {
      // Only the viewer's own games are refreshed on a page view; the server job covers the rest.
      const own = await queryRow('SELECT 1 FROM ptp_native_match_seats WHERE match_id=$1 AND user_id=$2', [gameId, viewerId])
      if (!own) return
      const { getMatch } = await import('../play/native/privateMatches')
      await getMatch(gameId, seat0)
    } : undefined)
    await advanceTournament(podId, now)
  }
  await initializeCardCache().catch(() => {})
  const rows = await queryRows(`SELECT pp.user_id,pp.seat_number,pp.is_bot,COALESCE(pp.dropped,false) AS dropped,u.username,
      cp.share_id AS pool_share_id,b.leader,b.base,(b.id IS NOT NULL) AS ready
    FROM pod_players pp JOIN users u ON u.id=pp.user_id
    LEFT JOIN LATERAL (SELECT id,share_id FROM card_pools WHERE pod_id=pp.pod_id AND user_id=pp.user_id AND parent_pool_id IS NULL ORDER BY created_at LIMIT 1) cp ON true
    LEFT JOIN built_decks b ON b.card_pool_id=cp.id
    WHERE pp.pod_id=$1 ORDER BY pp.seat_number`, [podId])
  const players: HubInputPlayer[] = rows.map(r => ({
    id: String(r.user_id), name: r.is_bot === true ? 'Bot' : String(r.username ?? 'Player'), seat: Number(r.seat_number),
    isBot: r.is_bot === true, dropped: r.dropped === true, isReady: r.ready === true,
    deck: r.ready ? deckFor(parse(r.leader)?.id, parse(r.base)?.id) : null,
    poolShareId: r.pool_share_id ? String(r.pool_share_id) : null,
  }))
  const tournament = await withTransaction(tx => loadTournament(tx, podId))
  const live = tournament ? await queryRows(`SELECT DISTINCT g.match_id FROM pod_tournament_games g JOIN ptp_native_matches n ON n.id=g.id
    JOIN pod_tournament_matches m ON m.id=g.match_id WHERE m.pod_id=$1 AND m.winner IS NULL AND g.result IS NULL AND n.status='active'`, [podId]) : []
  return buildHubView({
    pod: { shareId: String(pod.share_id), name: String(pod.name ?? `${pod.set_code} Draft`), setCode: String(pod.set_code), setName: String(pod.set_name ?? pod.set_code), status: String(pod.status), hostId: String(pod.host_id), settings: parse(pod.settings) },
    viewerId, nativePlay: nativeAvailable(), players, tournament,
    liveMatches: new Set(live.map(r => String(r.match_id))), now,
  })
}

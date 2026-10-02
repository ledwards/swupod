import { hyperspaceLeaderArt } from '@/src/utils/hyperspaceLeaderArt'
import { soloSession } from '@/lib/play/soloAuth'
import { launchSoloAi } from '@/lib/play/soloAi'
import { soloStatus } from '@/lib/play/soloStatus'
import { launchSoloGame } from '@/lib/play/soloEvent'
import { body, respond, text, uuid } from '@/src/services/play/native/http'
import { PtpPlayError } from '@/src/services/play/playState'
import { nativeDecks } from '@/src/services/play/native/decks'
import { queryRow, queryRows } from '@/lib/db'
import { getAllCards } from '@/src/utils/cardData'
import { loadSupport } from '@/src/services/play/native/savedDeck'
import { nativeConfig } from '@/src/services/play/native/runtimeClient'
async function preview(
  runId: string,
  name: string,
  opponent: import('@/src/services/play/solo/savedOpponent').SoloOpponentSnapshot
) {
  const support = await loadSupport(nativeConfig().supportPath),
    leader = getAllCards().find((c) => support.catalog.get(c.id)?.engineId === opponent.leader)
  return {
    runId,
    name,
    leaderName: leader?.name,
    leaderImageUrl: leader?.imageUrl,
    leaderBackImageUrl: leader ? hyperspaceLeaderArt(leader.name, leader.set) : null,
    mainDeckCount: opponent.deck.reduce((n, c) => n + c.count, 0),
  }
}
export function GET(request: Request) {
  return respond(async () => {
    const user = await soloSession(request),
      params = new URL(request.url).searchParams,
      pool = text(params.get('pool'), 'Saved deck')
    const owned = await queryRow(
      'SELECT p.*,COALESCE(p.pod_id,parent.pod_id) AS source_pod_id FROM card_pools p LEFT JOIN card_pools parent ON parent.id=p.parent_pool_id WHERE p.share_id=$1 AND p.user_id=$2',
      [pool, user.id]
    )
    if (!owned) throw new PtpPlayError(404, 'deck_not_found', 'Saved deck not found.')
    const { decks } = await nativeDecks(user.id, pool)
    const bots =
      owned.pool_type === 'draft'
        ? await queryRows(
            'SELECT id,seat_number FROM pod_players WHERE pod_id=$1 AND is_bot=true ORDER BY seat_number',
            [owned.source_pod_id]
          )
        : []
    const status = params.has('request')
      ? await soloStatus(user.id, pool, uuid(params.get('request')))
      : null
    const run = status?.run
      ? await queryRow(
          'SELECT id,prepared,opponent_deck FROM ptp_solo_ai_runs WHERE id=$1 AND owner_user_id=$2',
          [status.run.id, user.id]
        )
      : null
    const parsed = (v: unknown): any => (typeof v === 'string' ? JSON.parse(v) : v)
    const prepared = parsed(run?.prepared),
      opponent = run?.opponent_deck
        ? await preview(String(run.id), prepared.bot.name, parsed(run.opponent_deck))
        : null
    return {
      opponent,
      choice: prepared?.opponentChoice ?? 'default',
      deck: decks.filter((d) => d.poolShareId === pool).map(d => ({ ...d, ready: d.aiOpponentReady ?? d.ready }))[0],
      savedDecks: decks.filter((d) => d.poolType === owned.pool_type),
      bots: bots.map((b) => ({
        id: String(b.id),
        name: `Draft opponent · seat ${b.seat_number}`,
      })),
      status,
    }
  })
}
export function POST(request: Request) {
  return respond(async () => {
    const user = await soloSession(request, true),
      input = await body(request)
    if (input.action === 'resume') {
      const runId = uuid(input.runId),
        owned = await queryRow(
          'SELECT prepared FROM ptp_solo_ai_runs WHERE id=$1 AND owner_user_id=$2',
          [runId, user.id]
        )
      const prepared =
        typeof owned?.prepared === 'string' ? JSON.parse(owned.prepared) : owned?.prepared
      if (!prepared?.singleGame)
        throw new PtpPlayError(404, 'run_not_found', 'Practice game not found.')
      return launchSoloGame(runId, user.id, (user.exp ?? 0) * 1000)
    }
    if (input.action !== 'prepare')
      throw new PtpPlayError(400, 'invalid_action', 'Unknown opponent action.')
    if (input.opponentPoolShareId && input.opponentParticipantId)
      throw new PtpPlayError(400, 'invalid_opponent', 'Choose one opponent deck.')
    const prepared = await launchSoloAi(
      user.id,
      text(input.poolShareId, 'Saved deck'),
      uuid(input.requestId),
      (user.exp ?? 0) * 1000,
      user,
      {
        singleGame: true,
        prepareOnly: true,
        ...(input.opponentPoolShareId
          ? {
              opponentPoolShareId: text(input.opponentPoolShareId, 'Opponent deck'),
            }
          : {}),
        ...(input.opponentParticipantId
          ? { opponentParticipantId: uuid(input.opponentParticipantId) }
          : {}),
      }
    )
    if (!('opponent' in prepared)) throw Error('Preparation expected')
    return {
      ...(await preview(prepared.runId, prepared.name, prepared.opponent)),
      requestId: prepared.requestId,
    }
  })
}

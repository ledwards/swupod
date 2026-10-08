import { convertSoloToBo3 } from '@/lib/play/soloSideboard'
import { parseAiStyle, styleForPolicy } from '@/src/services/play/solo/aiStyles'
import { choosePracticeOpponent } from '@/src/services/play/solo/opponent'
import { constructBotDeck } from '@/src/utils/botDeckConstruction'
import { archetypeShortName } from '@/src/utils/archetypeName'
import { getBaseSetCode } from '@/src/utils/carboniteConstants'
import { hyperspaceLeaderArt } from '@/src/utils/hyperspaceLeaderArt'
import { soloSession } from '@/lib/play/soloAuth'
import { launchSoloAi, setSoloAiStyle } from '@/lib/play/soloAi'
import { soloStatus } from '@/lib/play/soloStatus'
import { launchSoloGame } from '@/lib/play/soloEvent'
import { body, respond, text, uuid } from '@/src/services/play/native/http'
import { PtpPlayError } from '@/src/services/play/playState'
import { nativeDecks } from '@/src/services/play/native/decks'
import { queryRow, queryRows } from '@/lib/db'
import { getAllCards } from '@/src/utils/cardData'
import { loadSupport } from '@/src/services/play/native/savedDeck'
import { nativeConfig, issueLaunch } from '@/src/services/play/native/runtimeClient'
async function preview(
  runId: string,
  name: string,
  opponent: import('@/src/services/play/solo/savedOpponent').SoloOpponentSnapshot
) {
  const support = await loadSupport(nativeConfig().supportPath),
    leader = getAllCards().find((c) => support.catalog.get(c.id)?.engineId === opponent.leader),
    base = getAllCards().find((c) => support.catalog.get(c.id)?.engineId === opponent.base)
  return {
    runId,
    name,
    leaderName: leader?.name,
    baseName: base?.name,
    archetype: archetypeShortName({leaderName: leader?.name ?? null, baseAspects: base?.aspects ?? null, baseHp: Number(base?.hp) || null, baseName: base?.name ?? null, baseRarity: base?.rarity ?? null}),
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
            'SELECT p.*,u.username FROM pod_players p LEFT JOIN users u ON u.id=p.user_id WHERE p.pod_id=$1 ORDER BY p.seat_number',
            [owned.source_pod_id]
          )
        : []
    const human = bots.find(b => b.user_id === user.id && b.is_bot !== true)
    const defaultBot = human ? choosePracticeOpponent(bots, Number(human.seat_number)) : undefined
    const opponentChoices = bots.filter(b => b.is_bot === true).map(b => {
      const built = constructBotDeck({...b, strategy_name: b.strategy_name ?? 'allPlayer', mixin_name: b.mixin_name ?? 'highConviction'}, getBaseSetCode(String(owned.set_code)))
      const leader = getAllCards().find(c => c.id === built?.selectedLeader?.id), base = getAllCards().find(c => c.id === built?.selectedBase?.id)
      return {
        id: String(b.id), name: String(b.username ?? `Draft opponent · seat ${b.seat_number}`),
        archetype: archetypeShortName({leaderName: leader?.name ?? null, baseAspects: base?.aspects ?? null, baseHp: Number(base?.hp) || null, baseName: base?.name ?? null, baseRarity: base?.rarity ?? null}),
        leaderImageUrl: leader ? hyperspaceLeaderArt(leader.name, leader.set) || leader.imageUrl : null,
        mainDeckCount: built?.deckCards.length ?? 0,
        isDefault: b.id === defaultBot?.id,
      }
    })
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
    const lastHumanGame = run ? await queryRow(`SELECT g.deck_snapshots->0 AS deck FROM ptp_solo_ai_games g
      JOIN ptp_solo_ai_matches m ON m.id=g.match_id WHERE g.run_id=$1 AND m.player1='human'
      AND g.deck_snapshots IS NOT NULL ORDER BY m.round DESC,g.game_no DESC LIMIT 1`, [run.id]) : null
    const humanDeck = parsed(lastHumanGame?.deck)
    const selectedDeck = decks.find(d => d.poolShareId === (humanDeck?.poolShareId ?? pool)) ?? decks.find(d => d.poolShareId === pool)
    return {
      opponent,
      aiStyle: prepared ? styleForPolicy(prepared.aiPolicy) : null,
      choice: prepared?.opponentChoice === 'default' && prepared?.bot?.kind === 'draft-seat'
        ? `draft:${prepared.bot.participantId}`
        : prepared?.opponentChoice ?? 'default',
      deck: selectedDeck ? { ...selectedDeck, ready: selectedDeck.aiOpponentReady ?? selectedDeck.ready,
        ...(humanDeck ? { ...(await preview(String(run!.id),selectedDeck.name,humanDeck)), poolShareId:humanDeck.poolShareId,ready:true } : {}) } : undefined,
      savedDecks: decks.filter((d) => d.poolType === owned.pool_type),
      bots: opponentChoices,
      status,
    }
  })
}
export function POST(request: Request) {
  return respond(async () => {
    const user = await soloSession(request, true),
      input = await body(request)
    if (input.action === 'bo3') return convertSoloToBo3(uuid(input.runId),user.id)
    if (input.action === 'style') {
      const aiStyle = parseAiStyle(input.aiStyle)
      await setSoloAiStyle(uuid(input.runId), user.id, aiStyle)
      return { aiStyle }
    }
    if (input.action === 'resume' || input.action === 'rematch') {
      const runId = uuid(input.runId),
        owned = await queryRow(
          'SELECT prepared,pool_share_id,request_id,best_of_three FROM ptp_solo_ai_runs WHERE id=$1 AND owner_user_id=$2',
          [runId, user.id]
        )
      const prepared =
        typeof owned?.prepared === 'string' ? JSON.parse(owned.prepared) : owned?.prepared
      if (!prepared?.singleGame)
        throw new PtpPlayError(404, 'run_not_found', 'Practice game not found.')
      if (input.action === 'rematch' && owned?.best_of_three)
        throw new PtpPlayError(409,'series_complete','This best-of-three match is finished. Choose an opponent to start a new match.')
      if (input.action === 'rematch') {
        const game = await queryRow(`SELECT g.id FROM ptp_solo_ai_games g
          JOIN ptp_solo_ai_matches m ON m.id=g.match_id
          WHERE g.run_id=$1 AND m.player1='human' AND g.requested=true
          ORDER BY g.game_no DESC LIMIT 1`, [runId])
        if (!game) throw new PtpPlayError(404, 'game_not_found', 'Practice game not found.')
        return issueLaunch(nativeConfig(process.env, true), String(game.id), user.id, 0, (user.exp ?? 0) * 1000, {
          isolated: true, rematch: true,
          returnPath: `/runs/${runId}`,
          opponentPath: `/pools/${encodeURIComponent(String(owned!.pool_share_id))}/play/ai?chooseOpponent=1`,
        })
      }
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
        aiStyle: parseAiStyle(input.aiStyle),
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

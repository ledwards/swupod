import { savedOpponentSnapshot, type SoloOpponentSnapshot } from '../../src/services/play/solo/savedOpponent'
import { initializeSoloEvent, launchSoloGame } from './soloEvent'
import { randomUUID } from 'node:crypto'
import { withTransaction } from '../db'
import { PtpPlayError } from '../../src/services/play/playState'
import { validateSavedDeck, loadSupport } from '../../src/services/play/native/savedDeck'
import { lockPlayAdmission } from '../../src/services/play/native/admission'
import { nativeConfig } from '../../src/services/play/native/runtimeClient'
import {soloAiEnabled} from '../../src/services/entry/rollout'
import { prepareSoloGeneration } from '../../src/services/sealed/soloGeneration'
import {
  AI_POLICY,
  chooseDraftOpponent,
  choosePracticeOpponent,
  buildSoloOpponent,
  type BotPool,
  type PreparedSolo,
} from '../../src/services/play/solo/opponent'
import { BOT_DECK_BUILDER_VERSION } from '../../src/utils/botDeckConstruction'
export type SoloOptions = {
  singleGame?: boolean
  prepareOnly?: boolean
  opponentPoolShareId?: string
  opponentParticipantId?: string
}
const parse = (value: unknown): any => (typeof value === 'string' ? JSON.parse(value) : value)

/** Preparation is durable before deck construction. Retries cannot reroll a pool. */
export async function launchSoloAi(
  userId: string,
  poolShareId: string,
  requestId: string,
  expiresAt: number,
  entitlement: { is_admin?: boolean; is_beta_tester?: boolean },
  options: SoloOptions = {}
) {
  // AI admission has its own switch within the shared beta rollout.
  if (!soloAiEnabled())
    throw new PtpPlayError(
      503,
      'solo_not_enabled',
      'Solo AI is not enabled in this environment yet.'
    )
  const config = nativeConfig(),
    support = await loadSupport(config.supportPath)
  const run = await withTransaction(async (tx) => {
    await lockPlayAdmission(tx, userId)
    const existing = await tx.queryRow(
      'SELECT * FROM ptp_solo_ai_runs WHERE owner_user_id=$1 AND request_id=$2',
      [userId, requestId]
    )
    if (existing) {
      if (
        existing.pool_share_id !== poolShareId ||
        Boolean(parse(existing.prepared).singleGame) !== Boolean(options.singleGame) ||
        (parse(existing.prepared).opponentChoice ?? 'default') !==
          (options.opponentPoolShareId
            ? `saved:${options.opponentPoolShareId}`
            : options.opponentParticipantId
              ? `draft:${options.opponentParticipantId}`
              : 'default')
      )
        throw new PtpPlayError(409, 'request_reused', 'This request belongs to another deck.')
      return existing
    }
    const rate = await tx.queryRow(
      "SELECT COUNT(*)::int AS count FROM ptp_solo_ai_runs WHERE owner_user_id=$1 AND created_at>NOW()-INTERVAL '1 minute'",
      [userId]
    )
    if (Number(rate?.count) >= 3)
      throw new PtpPlayError(
        429,
        'solo_rate_limit',
        'Please wait before preparing another opponent.'
      )
    // Single practice games accept owned, engine-valid saved builds. The
    // event path retains verified limited-pool admission.
    const ownPool = options.singleGame ? await tx.queryRow('SELECT * FROM card_pools WHERE share_id=$1 AND user_id=$2 FOR UPDATE', [poolShareId, userId]) : null
    if (options.singleGame && !ownPool) throw new PtpPlayError(404, 'deck_not_found', 'Saved deck not found.')
    const saved = options.singleGame
      ? { sourcePoolId: String(ownPool!.parent_pool_id ?? ownPool!.id), snapshot: savedOpponentSnapshot(ownPool!, userId, support) }
      : await validateSavedDeck(tx, userId, poolShareId, config.supportPath, true, support)
    const source = await tx.queryRow('SELECT * FROM card_pools WHERE id=$1', [saved.sourcePoolId])
    if (!source || source.user_id !== userId) throw new PtpPlayError(404, 'source_missing', 'The original pool is unavailable.')
    const id = randomUUID()
    let opponentSnapshot: SoloOpponentSnapshot | undefined
    let bot: BotPool
    let bots: BotPool[] | undefined
    let humanSeat = 1
    if (options.opponentPoolShareId) {
      const other = await tx.queryRow('SELECT * FROM card_pools WHERE share_id=$1 AND user_id=$2 FOR UPDATE', [options.opponentPoolShareId, userId])
      if (!other) throw new PtpPlayError(404, 'deck_not_found', 'Saved deck not found.')
      opponentSnapshot = savedOpponentSnapshot(other, userId, support)
      if (opponentSnapshot.poolType !== saved.snapshot.poolType)
        throw new PtpPlayError(409, 'opponent_format', 'Choose a saved deck in the same format.')
      bot = {
        kind: 'sealed-pool',
        participantId: String(other.id),
        name: 'Saved deck opponent',
        cards: [],
        strategyName: 'allPlayer',
        mixinName: 'highConviction',
      }
    } else if (saved.snapshot.poolType === 'draft') {
      const pod = await tx.queryRow('SELECT * FROM pods WHERE id=$1', [source.pod_id])
      if (!options.singleGame && parse(pod?.settings)?.isSolo !== true)
        throw new PtpPlayError(409, 'not_solo', 'Play vs AI requires a solo draft.')
      const rows = await tx.queryRows(
        'SELECT p.*,u.username FROM pod_players p LEFT JOIN users u ON u.id=p.user_id WHERE p.pod_id=$1 ORDER BY p.seat_number',
        [source.pod_id]
      )
      const human = rows.find((r) => r.user_id === userId && r.is_bot !== true)
      if (!human)
        throw new PtpPlayError(
          403,
          'not_solo_player',
          'You are not the human player in this draft.'
        )
      const seat = options.singleGame
        ? options.opponentParticipantId
          ? rows.find((r) => r.is_bot === true && String(r.id) === options.opponentParticipantId)
          : choosePracticeOpponent(rows, Number(human.seat_number))
        : chooseDraftOpponent(rows, Number(human.seat_number))
      if (!seat)
        throw new PtpPlayError(
          409,
          'missing_draft_opponent',
          'Choose a bot opponent from this draft.'
        )
      humanSeat = Number(human.seat_number)
      bots = options.singleGame
        ? undefined
        : rows
            .filter((r) => r.is_bot === true)
            .map((r) => {
              const leaders = parse(r.drafted_leaders),
                cards = parse(r.drafted_cards)
              if (
                !Array.isArray(leaders) ||
                !leaders.length ||
                !Array.isArray(cards) ||
                cards.length < 30
              )
                throw new PtpPlayError(
                  409,
                  'missing_bot_picks',
                  'A draft bot’s original picks are unavailable.'
                )
              return {
                kind: 'draft-seat' as const,
                participantId: String(r.id),
                name: String(r.username ?? 'Draft opponent'),
                seat: Number(r.seat_number),
                cards: [...leaders, ...cards],
                strategyName: String(r.strategy_name ?? 'allPlayer'),
                mixinName: String(r.mixin_name ?? 'highConviction'),
                committedLeader: parse(r.committed_leader),
                committedBaseColor: r.committed_base_color,
              }
            })
      const leaders = parse(seat.drafted_leaders),
        cards = parse(seat.drafted_cards)
      if (!Array.isArray(leaders) || !leaders.length || !Array.isArray(cards) || cards.length < 30)
        throw new PtpPlayError(
          409,
          'missing_bot_picks',
          'The draft opponent’s original picks are unavailable.'
        )
      bot = {
        kind: 'draft-seat',
        participantId: String(seat.id),
        packCount: saved.snapshot.packCount || 3,
        name: String(seat.username ?? 'Draft opponent'),
        seat: Number(seat.seat_number),
        cards: [...leaders, ...cards],
        strategyName: String(seat.strategy_name ?? 'allPlayer'),
        mixinName: String(seat.mixin_name ?? 'highConviction'),
        committedLeader: parse(seat.committed_leader),
        committedBaseColor: seat.committed_base_color,
      }
    } else {
      if (!options.singleGame && source.pod_id)
        throw new PtpPlayError(409, 'not_solo', 'Play vs AI requires solo sealed.')
      // A separate server-generated box, persisted under this run's unique key.
      const generated = await prepareSoloGeneration(
        tx,
        userId,
        {
          requestId: id,
          setCode: saved.snapshot.setCode,
          packCount: [6, 8].includes(saved.snapshot.packCount) ? saved.snapshot.packCount : (Array.isArray(parse(source.packs)) && parse(source.packs).length === 8 ? 8 : 6),
        },
        entitlement
      )
      bot = {
        kind: 'sealed-pool',
        participantId: generated.generationId,
        packCount: generated.packs.length,
        name: 'Sealed opponent',
        cards: generated.cards as BotPool['cards'],
        strategyName: 'allPlayer',
        mixinName: 'highConviction',
      }
    }
    const prepared: PreparedSolo = {
      singleGame: options.singleGame === true,
      opponentChoice: options.opponentPoolShareId
        ? `saved:${options.opponentPoolShareId}`
        : options.opponentParticipantId
          ? `draft:${options.opponentParticipantId}`
          : 'default',
      ...(opponentSnapshot ? { opponentSnapshot } : {}),
      human: saved.snapshot,
      bot,
      ...(bots ? { bots, humanSeat } : {}),
      engineRevision: support.engineRevision,
      builderVersion: BOT_DECK_BUILDER_VERSION,
      aiPolicy: AI_POLICY,
    }
    const row = await tx.queryRow(
      'INSERT INTO ptp_solo_ai_runs(id,owner_user_id,request_id,pool_share_id,prepared) VALUES($1,$2,$3,$4,$5) RETURNING *',
      [id, userId, requestId, poolShareId, JSON.stringify(prepared)]
    )
    if (!row) throw Error('Solo preparation was not saved')
    return row
  })
  const prepared = parse(run.prepared) as PreparedSolo
  if (prepared.engineRevision !== support.engineRevision)
    throw new PtpPlayError(
      409,
      'engine_revision_mismatch',
      'This run requires its original engine revision.'
    )
  // Serialize construction; a crash leaves the saved pool intact for another try.
  const opponent = await withTransaction(async (tx) => {
    const row = await tx.queryRow(
      'SELECT opponent_deck FROM ptp_solo_ai_runs WHERE id=$1 FOR UPDATE',
      [run.id]
    )
    if (row?.opponent_deck) return parse(row.opponent_deck) as SoloOpponentSnapshot
    const deck = prepared.opponentSnapshot ?? buildSoloOpponent(String(run.id), prepared, support)
    await tx.query('UPDATE ptp_solo_ai_runs SET opponent_deck=$2 WHERE id=$1', [
      run.id,
      JSON.stringify(deck),
    ])
    return deck
  })
  await initializeSoloEvent(run, prepared, opponent, support)
  if (options.prepareOnly)
    return {
      runId: String(run.id),
      requestId,
      opponent,
      name: prepared.bot.name,
    }
  return launchSoloGame(String(run.id), userId, expiresAt)
}

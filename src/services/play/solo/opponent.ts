import type { SoloOpponentSnapshot } from './savedOpponent'
import { constructBotDeck, BOT_DECK_BUILDER_VERSION } from '../../../utils/botDeckConstruction'
import {
  buildNativeDeckVersion,
  type NativeDeckInput,
  type NativeDeckVersion,
} from '../deckVersions'
import { PtpPlayError } from '../playState'
import { getBaseSetCode } from '../../../utils/carboniteConstants'

export const AI_POLICY = 'wip-search-v1' as const
export interface BotPool {
  kind: 'draft-seat' | 'sealed-pool'
  participantId: string
  packCount?: number
  name: string
  seat?: number
  cards: { id: string; [key: string]: unknown }[]
  strategyName: string
  mixinName: string
  committedLeader?: unknown
  committedBaseColor?: unknown
}
export interface PreparedSolo {
  singleGame?: boolean
  opponentChoice?: string
  opponentSnapshot?: SoloOpponentSnapshot
  human: SoloOpponentSnapshot
  bot: BotPool
  bots?: BotPool[]
  humanSeat?: number
  engineRevision: string
  builderVersion: string
  aiPolicy: typeof AI_POLICY
}
export function chooseDraftOpponent(
  rows: Record<string, unknown>[],
  humanSeat: number
): Record<string, unknown> {
  // Initial eight-seat bracket uses the existing opposite-seat opening pairing.
  if (
    rows.length !== 8 ||
    rows.filter((r) => r.is_bot !== true).length !== 1 ||
    !rows.some((r) => r.is_bot !== true && Number(r.seat_number) === humanSeat)
  )
    throw new PtpPlayError(
      409,
      'unsupported_solo_draft',
      'This draft needs one human and seven retained bot seats.'
    )
  const seats = rows.map((r) => Number(r.seat_number))
  if (new Set(seats).size !== 8 || seats.some((s) => !Number.isInteger(s) || s < 1 || s > 8))
    throw new PtpPlayError(409, 'invalid_draft_seats', 'Draft seats are incomplete.')
  const opponent = rows.find(
    (r) => Number(r.seat_number) === ((humanSeat - 1 + 4) % 8) + 1 && r.is_bot === true
  )
  if (!opponent)
    throw new PtpPlayError(409, 'missing_draft_opponent', 'The draft opponent is unavailable.')
  return opponent
}
export function buildSoloOpponent(
  runId: string,
  prepared: PreparedSolo,
  support: Pick<NativeDeckInput, 'catalog' | 'policy'>
): NativeDeckVersion {
  if (prepared.builderVersion !== BOT_DECK_BUILDER_VERSION)
    throw new PtpPlayError(409, 'builder_version', 'Resume requires the pinned deck builder.')
  const bot = prepared.bot
  const built = constructBotDeck(
    {
      drafted_leaders: bot.cards.filter((c) => support.catalog.get(c.id)?.type === 'Leader'),
      drafted_cards: bot.cards.filter((c) =>
        ['Unit', 'Event', 'Upgrade', 'Base'].includes(support.catalog.get(c.id)?.type ?? '')
      ),
      strategy_name: bot.strategyName,
      mixin_name: bot.mixinName,
      committed_leader: bot.committedLeader,
      committed_base_color: bot.committedBaseColor,
    },
    getBaseSetCode(prepared.human.setCode)
  )
  if (!built)
    throw new PtpPlayError(
      409,
      'bot_deck_unavailable',
      'The opponent cannot build a legal deck from its pool.'
    )
  // ownerUserId means the private run's access owner, not a fabricated bot user.
  return buildNativeDeckVersion({
    authenticatedUserId: prepared.human.ownerUserId,
    pool: {
      id: runId,
      shareId: runId,
      userId: prepared.human.ownerUserId,
      sourcePoolId: bot.participantId,
      deckBuilderState: built.deckBuilderState,
    },
    evidence: {
      sourcePoolId: bot.participantId,
      kind: bot.kind === 'draft-seat' ? 'server-draft' : 'server-sealed',
      setCode: prepared.human.setCode,
      poolType: prepared.human.poolType,
      packCount: bot.packCount ?? prepared.human.packCount,
      cards: bot.cards,
    },
    ...support,
  })
}

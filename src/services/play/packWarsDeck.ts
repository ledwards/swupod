import { createHash } from 'node:crypto'
import { mainDeckSize, type NativeDeckInput, type NativeDeckVersion } from './deckVersions'
import { PtpPlayError } from './playState'

/**
 * Pack Wars on our table: pick a leader and a base from your packs and every
 * other card is your deck. There is no deck building, no Porg fill and no
 * sideboard. This is Pack Wars's own validation; it never goes through the
 * 30-card limited builder (`buildNativeDeckVersion`).
 */

/** The runtime's main-deck floor for Pack Wars games (sent as `minDeckSize` on create). */
export const PACK_WARS_RUNTIME_MIN_DECK_SIZE = 1

export interface PackWarsCard { id: string; name?: unknown; subtitle?: unknown; [key: string]: unknown }
export interface PackWarsDeckInput {
  authenticatedUserId: string
  pool: { id: string; shareId: string; userId: string | null }
  /** Stored at generation (`ptp_native_pool_evidence`), never browser-provided cards. */
  evidence: { sourcePoolId: string; setCode: string; packCount: number; cards: readonly PackWarsCard[] }
  choice: { leaderId: string; baseId: string }
  catalog: NativeDeckInput['catalog']
  policy: NativeDeckInput['policy']
}

/** A refusal that names the cards our engine can't play yet. */
export class PackWarsUnsupportedError extends PtpPlayError {
  constructor(public readonly cards: string[]) {
    super(409, 'unsupported_cards', `These cards in your packs can't be played on our table yet: ${cards.join('; ')}. Open new packs to play against the AI.`)
  }
}

export function packWarsCardName(card: PackWarsCard): string {
  const name = typeof card.name === 'string' && card.name ? card.name : 'Unknown card'
  return typeof card.subtitle === 'string' && card.subtitle ? `${name}, ${card.subtitle}` : name
}

/** Every card in the pool that has no supported engine identity, by display name (each listed once). */
export function unsupportedPackWarsCards(cards: readonly PackWarsCard[], support: Pick<PackWarsDeckInput, 'catalog' | 'policy'>): string[] {
  const names = cards.filter(card => {
    const found = typeof card?.id === 'string' ? support.catalog.get(card.id) : undefined
    return !found || !found.engineId || !support.policy.supportedCardIds.has(found.engineId)
  }).map(packWarsCardName)
  return [...new Set(names)]
}

export function buildPackWarsDeckVersion(input: PackWarsDeckInput): NativeDeckVersion {
  const { pool, evidence, catalog, policy, choice } = input
  if (!input.authenticatedUserId || pool.userId !== input.authenticatedUserId) throw new PtpPlayError(403, 'not_owner', 'These packs belong to another player.')
  if (!pool.id || !pool.shareId || evidence.sourcePoolId !== pool.id || !Number.isSafeInteger(evidence.packCount) || evidence.packCount < 1 || !Array.isArray(evidence.cards) || !evidence.cards.length)
    throw new PtpPlayError(409, 'unverified_source', 'These packs could not be verified for table play.')
  if (!policy.version) throw new PtpPlayError(409, 'unsupported_policy', 'A pinned rules/support policy is required.')
  if (!policy.supportedSets.has(evidence.setCode)) throw new PtpPlayError(409, 'unsupported_set', 'This set is not enabled for table play yet.')
  const unsupported = unsupportedPackWarsCards(evidence.cards, input)
  if (unsupported.length) throw new PackWarsUnsupportedError(unsupported)
  const cards = evidence.cards.map(card => catalog.get(card.id)!)
  const pick = (id: string, type: 'Leader' | 'Base') => {
    const index = cards.findIndex(card => card.id === id && card.type === type)
    if (index < 0) throw new PtpPlayError(400, 'invalid_selection', `Choose a ${type.toLowerCase()} from your packs.`)
    return index
  }
  const leader = pick(choice.leaderId, 'Leader'), base = pick(choice.baseId, 'Base')
  // Every other card that can be in a main deck; the leaders and bases you didn't pick sit out.
  const counts = new Map<string, number>()
  let total = 0
  for (const [index, card] of cards.entries()) {
    if (index === leader || index === base || !['Unit', 'Event', 'Upgrade'].includes(card.type)) continue
    counts.set(card.engineId, (counts.get(card.engineId) ?? 0) + 1)
    total++
  }
  const size = mainDeckSize('pack_wars', cards[base]!.engineId)
  if (total < size.minimum || total > size.maximum) throw new PtpPlayError(409, 'invalid_deck_size', `Pack Wars needs ${size.minimum} to ${size.maximum} cards besides your leader and base.`)
  const snapshot = {
    schemaVersion: 1 as const, sourcePoolId: evidence.sourcePoolId, poolId: pool.id,
    poolShareId: pool.shareId, ownerUserId: input.authenticatedUserId,
    setCode: evidence.setCode, poolType: 'pack_wars' as const, packCount: evidence.packCount,
    provenance: 'server-pack-wars' as const, validationVersion: policy.version,
    leader: cards[leader]!.engineId, base: cards[base]!.engineId,
    sideboard: Object.freeze([]),
    deck: Object.freeze([...counts].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([id, count]) => Object.freeze({ id, count }))),
  }
  return Object.freeze({ ...snapshot, contentHash: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex') })
}

type Aspected = Record<string, unknown>
const aspectsOf = (card: Aspected | undefined): string[] => Array.isArray(card?.aspects) ? card.aspects.filter((a): a is string => typeof a === 'string') : []

/** Aspect icons on a card that the leader and base don't cover (each icon needs its own match). */
export function missingAspects(card: Aspected, leader: Aspected, base: Aspected): number {
  const have = [...aspectsOf(leader), ...aspectsOf(base)]
  let missing = 0
  for (const aspect of aspectsOf(card)) {
    const at = have.indexOf(aspect)
    if (at < 0) missing++
    else have.splice(at, 1)
  }
  return missing
}

/**
 * The AI's leader and base for its own packs: the pair that leaves the fewest
 * aspect icons uncovered across the deck it plays. Ties go to pack order.
 */
export function chooseAiPackWarsPair(cards: readonly PackWarsCard[], typeOf: (card: PackWarsCard) => string | undefined): { leaderId: string; baseId: string } | null {
  const leaders = cards.filter(card => typeOf(card) === 'Leader')
  const bases = cards.filter(card => typeOf(card) === 'Base')
  const deck = cards.filter(card => ['Unit', 'Event', 'Upgrade'].includes(typeOf(card) ?? ''))
  let best: { leaderId: string; baseId: string; penalty: number } | null = null
  for (const leader of leaders) for (const base of bases) {
    const penalty = deck.reduce((sum, card) => sum + missingAspects(card, leader, base), 0)
    if (!best || penalty < best.penalty) best = { leaderId: leader.id, baseId: base.id, penalty }
  }
  return best && { leaderId: best.leaderId, baseId: best.baseId }
}

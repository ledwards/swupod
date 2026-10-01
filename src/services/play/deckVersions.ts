import { createHash } from 'node:crypto'

export interface NativeCatalogCard {
  id: string
  engineId: string
  type: 'Leader' | 'Base' | 'Unit' | 'Event' | 'Upgrade'
  rarity: string
}
export interface NativeDeckInput {
  authenticatedUserId: string
  pool: { id: string; shareId: string; userId: string | null; sourcePoolId: string; deckBuilderState: unknown }
  /** Resolve from server draft picks/sealed generation, never browser-provided pool JSON. */
  evidence: {
    sourcePoolId: string; kind: 'server-draft' | 'server-sealed'; setCode: string
    poolType: 'draft' | 'sealed'; packCount: number; cards: readonly { id: string }[]
  }
  /** Server-owned, pinned mapping: display cardId is not a unique card identity. */
  catalog: ReadonlyMap<string, NativeCatalogCard>
  policy: {
    version: string; supportedSets: ReadonlySet<string>; supportedCardIds: ReadonlySet<string>
    /** Explicit legal common bases for this rules/format version. */
    unrestrictedBaseIds: ReadonlySet<string>
  }
}
export interface NativeDeckVersion {
  readonly schemaVersion: 1
  readonly sourcePoolId: string
  readonly poolId: string
  readonly poolShareId: string
  readonly ownerUserId: string
  readonly setCode: string
  readonly poolType: 'draft' | 'sealed'
  readonly packCount: number
  readonly provenance: 'server-draft' | 'server-sealed'
  readonly validationVersion: string
  readonly leader: string
  readonly base: string
  readonly deck: readonly Readonly<{ id: string; count: number }>[]
  readonly contentHash: string
}
export class NativeDeckEligibilityError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'NativeDeckEligibilityError'
  }
}
function fail(code: string, message: string): never { throw new NativeDeckEligibilityError(code, message) }
function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

/** Pure validation: caller reads/locks the saved build and evidence in the same transaction as INSERT. */
export function buildNativeDeckVersion(input: NativeDeckInput): NativeDeckVersion {
  const { pool, evidence, policy, catalog } = input
  if (!input.authenticatedUserId || pool.userId !== input.authenticatedUserId) fail('not_owner', 'This saved deck belongs to another player.')
  if (!pool.id || !pool.shareId || !evidence.sourcePoolId || pool.sourcePoolId !== evidence.sourcePoolId
    || !Number.isSafeInteger(evidence.packCount) || evidence.packCount < 1
    || !['draft', 'sealed'].includes(evidence.poolType)
    || evidence.kind !== `server-${evidence.poolType}` || !Array.isArray(evidence.cards)) {
    fail('unverified_source', 'The original limited pool and pack count must be verified before play.')
  }
  if (!policy.version) fail('unsupported_policy', 'A pinned rules/support policy is required.')
  if (!policy.supportedSets.has(evidence.setCode)) fail('unsupported_set', 'This set is not supported by the configured engine.')
  let saved = pool.deckBuilderState
  if (typeof saved === 'string') {
    try { saved = JSON.parse(saved) } catch { fail('invalid_saved_deck', 'The saved deck could not be read.') }
  }
  const state = object(saved)
  const positions = object(state?.cardPositions)
  if (!state || !positions) fail('invalid_saved_deck', 'Save a deck before starting a game.')
  const lookup = (id: unknown): NativeCatalogCard => {
    const card = typeof id === 'string' ? catalog.get(id) : undefined
    if (!card || !card.engineId || card.id !== id) fail('unknown_card', 'A selected card has no verified engine identity.')
    return card
  }
  const available = new Map<string, number>()
  for (const owned of evidence.cards) {
    const card = lookup(owned?.id)
    available.set(card.engineId, (available.get(card.engineId) ?? 0) + 1)
  }
  const selected = (key: unknown, type: 'Leader' | 'Base') => {
    const position = typeof key === 'string' && Object.hasOwn(positions, key) ? object(positions[key]) : null
    if (!position || position.enabled === false) fail('invalid_selection', `Choose an enabled ${type.toLowerCase()}.`)
    const card = lookup(object(position.card)?.id)
    if (card.type !== type) fail('invalid_selection', `Choose a valid ${type.toLowerCase()}.`)
    return card
  }
  const leader = selected(state.activeLeader, 'Leader')
  const base = selected(state.activeBase, 'Base')
  const used = new Map<string, number>()
  const use = (card: NativeCatalogCard, free = false) => {
    if (!policy.supportedCardIds.has(card.engineId)) fail('unsupported_card', 'A selected card is not supported by the configured engine.')
    if (free) return
    const count = (used.get(card.engineId) ?? 0) + 1
    if (count > (available.get(card.engineId) ?? 0)) fail('outside_pool', 'The deck contains cards or copies outside its verified limited pool.')
    used.set(card.engineId, count)
  }
  use(leader)
  use(base, base.rarity === 'Common' && policy.unrestrictedBaseIds.has(base.engineId))
  const counts = new Map<string, number>()
  let total = 0
  for (const raw of Object.values(positions)) {
    const position = object(raw)
    if (!position) fail('invalid_saved_deck', 'A saved card position is invalid.')
    if (position.section !== 'deck' || position.enabled === false) continue
    const card = lookup(object(position.card)?.id)
    if (!['Unit', 'Event', 'Upgrade'].includes(card.type)) fail('invalid_card_type', 'Only units, events and upgrades belong in the main deck.')
    use(card)
    counts.set(card.engineId, (counts.get(card.engineId) ?? 0) + 1)
    total++
  }
  // Data Vault's printed deckbuilding restriction applies to limited as well.
  const minimum = base.engineId === 'JTL_024' ? 40 : base.engineId === 'JTL_025' ? 25 : 30
  if (total < minimum) fail('deck_too_small', `Add ${minimum - total} cards before starting a limited game.`)
  if (total > 100) fail('runtime_deck_limit', 'This engine currently supports at most 100 main-deck cards. Reduce the saved deck before playing.')
  const snapshot = {
    schemaVersion: 1 as const, sourcePoolId: evidence.sourcePoolId, poolId: pool.id,
    poolShareId: pool.shareId, ownerUserId: input.authenticatedUserId,
    setCode: evidence.setCode, poolType: evidence.poolType, packCount: evidence.packCount,
    provenance: evidence.kind, validationVersion: policy.version, leader: leader.engineId, base: base.engineId,
    deck: Object.freeze([...counts].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([id, count]) => Object.freeze({ id, count }))),
  }
  return Object.freeze({ ...snapshot, contentHash: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex') })
}

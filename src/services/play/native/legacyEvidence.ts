import { getAllCards } from '../../../utils/cardData'
import { getBaseSetCode, isCarboniteCode } from '../../../utils/carboniteConstants'

/**
 * Sealed pools opened before table play stored no server evidence
 * (ptp_native_pool_evidence). Admission requires that evidence so a deck can
 * only use cards the server dealt. Two kinds of older pool still qualify:
 *
 * - Pod pools: the server inserted them when the pod started (POST /api/pools
 *   cannot set pod_id), and nothing rewrites their cards afterwards.
 * - Solo pools opened before evidence existed, whose stored packs look like
 *   real boosters of the pool's set and add up to exactly the pool's cards.
 *   Newer pools without evidence came from the browser and stay excluded.
 */
export const LEGACY_SEALED_CUTOFF = new Date('2026-10-02T00:00:00Z')

export type LegacySealedEvidence = { setCode: string; packCount: number; cards: { id: string }[] }
type Row = Record<string, unknown>
const parse = (value: unknown): unknown => typeof value === 'string' ? JSON.parse(value) : value

let catalog: Map<string, { set: string; type: string; rarity: string }> | undefined
function card(id: string) {
  catalog ??= new Map(getAllCards().map(c => [String(c.id), { set: String(c.set), type: String(c.type), rarity: String(c.rarity) }]))
  return catalog.get(id)
}

function ids(cards: unknown): string[] | null {
  if (!Array.isArray(cards)) return null
  const out: string[] = []
  for (const c of cards) {
    const id = c && typeof c === 'object' ? (c as Row).id : null
    if (typeof id !== 'string' || !id) return null
    out.push(id)
  }
  return out
}
const sameCards = (a: string[], b: string[]) => a.length === b.length && JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())

/** A booster of `setCode` as the generator deals it: 16 cards of the set, one leader, a few rares. */
export function plausibleBooster(cards: string[], setCode: string): boolean {
  const set = getBaseSetCode(setCode), carbonite = isCarboniteCode(setCode)
  if (cards.length !== 16) return false
  let leaders = 0, bases = 0, rares = 0
  for (const id of cards) {
    const c = card(id)
    if (!c || c.set !== set) return false
    if (c.type === 'Leader') leaders++
    else if (c.type === 'Base') bases++
    else if (c.rarity === 'Rare' || c.rarity === 'Legendary') rares++
  }
  return leaders >= 1 && leaders <= 2 && bases <= 2 && (carbonite || bases >= 1) && rares <= (carbonite ? 5 : 3)
}

function packCards(packs: unknown): string[][] | null {
  if (!Array.isArray(packs)) return null
  const out: string[][] = []
  for (const pack of packs) {
    const list = ids(Array.isArray(pack) ? pack : pack && typeof pack === 'object' ? (pack as Row).cards : null)
    if (!list) return null
    out.push(list)
  }
  return out
}

/**
 * Evidence for a sealed source pool without a stored evidence row, or null when
 * the pool cannot be trusted. `pod` is the pool's pod and `player` the owner's
 * pod_players row in it (looked up by owner), when the pool came from a pod.
 */
export function legacySealedEvidence(source: Row, userId: string, pod?: Row | null, player?: Row | null): LegacySealedEvidence | null {
  if (source.pool_type !== 'sealed' || source.parent_pool_id || source.user_id !== userId || typeof source.set_code !== 'string') return null
  let cards: string[] | null, packs: string[][] | null
  try { cards = ids(parse(source.cards)); packs = packCards(parse(source.packs)) } catch { return null }
  if (!cards?.length || !packs?.length || !sameCards(cards, packs.flat())) return null
  const evidence = { setCode: source.set_code, packCount: packs.length, cards: cards.map(id => ({ id })) }
  if (source.pod_id) return pod && pod.pod_type === 'sealed' && pod.id === source.pod_id && player && String(pod.set_code) === source.set_code ? evidence : null
  const created = source.created_at instanceof Date ? source.created_at : typeof source.created_at === 'string' ? new Date(source.created_at) : null
  if (!created || Number.isNaN(created.getTime()) || created >= LEGACY_SEALED_CUTOFF) return null
  if (packs.length !== 6 && packs.length !== 8) return null
  return packs.every(pack => plausibleBooster(pack, source.set_code as string)) ? evidence : null
}

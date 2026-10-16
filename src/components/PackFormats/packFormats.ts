/**
 * Pack Wars and Pack Blitz (alpha): one family, two formats. Format rules and the
 * pure deck builders shared by the setup, room and play steps under /other-formats.
 */

export type PackFormatKey = 'pack-wars' | 'pack-blitz'

export interface PackCard {
  id: string
  cardId?: string
  name?: string
  subtitle?: string
  type?: string
  cost?: number
  aspects?: string[]
  imageUrl?: string
  backImageUrl?: string
  isLeader?: boolean
  isBase?: boolean
  isFoil?: boolean
  isShowcase?: boolean
  rarity?: string
  [key: string]: unknown
}

export interface PackPool {
  setCode: string
  setName: string
  leaders: PackCard[]
  bases: PackCard[]
  deckCards: PackCard[]
  packs?: PackCard[][]
}

export interface PackFormat {
  key: PackFormatKey
  title: string
  /** The page's one-line subtitle in the site header. */
  subtitle: string
  packs: number
  facts: string[]
  rules: string[]
  /** Pack Wars pads a short deck to 30 with 0-cost Porgs; Blitz decks stay tiny. */
  porgFill: boolean
  deckName: string
}

export const PACK_FORMATS: Record<PackFormatKey, PackFormat> = {
  'pack-wars': {
    key: 'pack-wars',
    title: 'Pack Wars',
    subtitle: 'Open 2 packs, choose your leader, and battle',
    packs: 2,
    facts: ['2 Packs', 'Best of 3', 'No Aspect Penalties'],
    rules: [
      'Each player opens 2 packs from the same set',
      'Choose 1 leader and 1 base per game',
      'Shuffle all other cards as your deck',
      'Aspect penalties are ignored',
      'Best of 3, and you can switch leaders between games',
    ],
    porgFill: true,
    deckName: 'PTP Pack Wars',
  },
  'pack-blitz': {
    key: 'pack-blitz',
    title: 'Pack Blitz',
    subtitle: 'Open 1 pack, choose your leader, and play fast',
    packs: 1,
    facts: ['1 Pack', 'About 14 Cards', 'No Aspect Penalties'],
    rules: [
      'Each player opens 1 pack from the same set',
      'Choose 1 leader and 1 base per game',
      'Shuffle all other cards as your deck',
      'Aspect penalties are ignored',
      'Games are short: your deck is about 14 cards',
    ],
    porgFill: false,
    deckName: 'PTP Pack Blitz',
  },
}

/** Porg (LOF), the 0-cost unit the legacy Pack Wars page pads decks with. */
export const PORG_CARD_ID = '28294'
const PORG_TARGET = 30

export const isLeaderOrBase = (c: PackCard) => c.type === 'Leader' || c.type === 'Base'

/** The deck is every opened card that isn't a leader or a base. */
export function deckCardsOf(pool: PackPool): PackCard[] {
  return pool.packs ? pool.packs.flatMap(pack => pack.filter(c => !isLeaderOrBase(c))) : (pool.deckCards ?? [])
}

export interface DeckEntry { id: string; count: number }
export interface TtsDeck {
  metadata: { name: string; author: string }
  leader: DeckEntry
  base: DeckEntry
  deck: DeckEntry[]
  sideboard: DeckEntry[]
}

const deckTitle = (pool: PackPool, format: PackFormatKey) => `[${PACK_FORMATS[format].deckName}] ${pool.setName}`

function porgsNeeded(format: PackFormatKey, fillWithPorgs: boolean, total: number): number {
  return PACK_FORMATS[format].porgFill && fillWithPorgs && total < PORG_TARGET ? PORG_TARGET - total : 0
}

function picked(pool: PackPool, leaderIndex: number | null, baseIndex: number | null) {
  if (leaderIndex === null || baseIndex === null) return null
  const leader = pool.leaders[leaderIndex]
  const base = pool.bases[baseIndex]
  return leader && base ? { leader, base } : null
}

/** The Tabletop Simulator deck JSON, exactly as the legacy play pages export it. */
export function buildTtsDeck(
  pool: PackPool,
  format: PackFormatKey,
  leaderIndex: number | null,
  baseIndex: number | null,
  { fillWithPorgs }: { fillWithPorgs: boolean },
): TtsDeck | null {
  const pick = picked(pool, leaderIndex, baseIndex)
  if (!pick) return null
  const counts = new Map<string, number>()
  for (const c of deckCardsOf(pool)) counts.set(c.id, (counts.get(c.id) ?? 0) + 1)
  const deck = Array.from(counts.entries()).map(([id, count]) => ({ id, count }))
  const porgs = porgsNeeded(format, fillWithPorgs, deck.reduce((n, e) => n + e.count, 0))
  if (porgs > 0) deck.push({ id: PORG_CARD_ID, count: porgs })
  return {
    metadata: { name: deckTitle(pool, format), author: 'Protect the Pod' },
    leader: { id: pick.leader.id, count: 1 },
    base: { id: pick.base.id, count: 1 },
    deck,
    sideboard: [],
  }
}

export interface KarabastCardPosition {
  card: PackCard
  section: 'deck' | 'leaders' | 'bases'
  visible: boolean
  enabled: boolean
}
export interface KarabastDeckState {
  cardPositions: Record<string, KarabastCardPosition>
  activeLeader: string
  activeBase: string
  poolName: string
}

/**
 * The deck-builder state `/api/pools/[shareId]/deck.json` reads, so the site's one deck link
 * (`/pool/[shareId]/deck`) resolves to this game's leader, base and deck when pasted into Karabast.
 */
export function buildKarabastDeckState(
  pool: PackPool,
  format: PackFormatKey,
  leaderIndex: number | null,
  baseIndex: number | null,
  { fillWithPorgs }: { fillWithPorgs: boolean },
): KarabastDeckState | null {
  const pick = picked(pool, leaderIndex, baseIndex)
  if (!pick || leaderIndex === null || baseIndex === null) return null
  const cardPositions: Record<string, KarabastCardPosition> = {}
  pool.leaders.forEach((card, i) => { cardPositions[`leader-${i}`] = { card: { ...card, isLeader: true }, section: 'leaders', visible: true, enabled: true } })
  pool.bases.forEach((card, i) => { cardPositions[`base-${i}`] = { card: { ...card, isBase: true }, section: 'bases', visible: true, enabled: true } })
  const deck = deckCardsOf(pool)
  deck.forEach((card, i) => { cardPositions[`deck-${i}`] = { card, section: 'deck', visible: true, enabled: true } })
  // Card id only: the deck export resolves the Porg's printed number from the card catalog.
  for (let i = 0; i < porgsNeeded(format, fillWithPorgs, deck.length); i++) {
    cardPositions[`porg-${i}`] = { card: { id: PORG_CARD_ID, name: 'Porg', type: 'Unit', cost: 0 }, section: 'deck', visible: true, enabled: true }
  }
  return { cardPositions, activeLeader: `leader-${leaderIndex}`, activeBase: `base-${baseIndex}`, poolName: deckTitle(pool, format) }
}

export type SearchParams = Record<string, string | string[] | undefined>

/** `path` plus the request's query string, repeated keys kept. */
export function withQuery(path: string, searchParams: SearchParams): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) for (const v of [value ?? []].flat()) query.append(key, v)
  const qs = query.toString()
  return qs ? `${path}?${qs}` : path
}

/** Alpha routes live under /other-formats; everyone else keeps /formats. */
export const alphaPath = (format: PackFormatKey, rest = '') => `/other-formats/${format}${rest}`
export const legacyPath = (format: PackFormatKey, rest = '') => `/formats/${format}${rest}`

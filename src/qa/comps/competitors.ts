/**
 * Other simulators' booster functions, ported from their published code so
 * their kits can be generated here and graded beside ours.
 *
 * Every port draws from the same ASH card pool the real boxes were opened
 * from, so a column differs from the real record only by how that site
 * builds a pack — leaders, bases, treatments and all. Each port names the
 * file it was read from; when a site changes its code, re-read the file and
 * update the port. Limited Lab's port is in limitedLab.ts.
 */

import type { Group, KitCard, Treatment } from './kitStats'

export type Rng = () => number

/** Seeded mulberry32 so a measurement can be re-run exactly. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface PoolCard {
  name: string
  subtitle?: string | null | undefined
  rarity: string
  group: Group
  /** Primary aspect (aspects[0]), 'Neutral' when none. */
  aspect: string
}

/** One Normal printing per card, split the way the sites split it. */
export interface DeckPool {
  Common: PoolCard[]
  Uncommon: PoolCard[]
  Rare: PoolCard[]
  Legendary: PoolCard[]
  Special: PoolCard[]
  /** Rare non-leader cards, bases included (queries that only exclude leaders). */
  RareNonLeader: PoolCard[]
  /** Deck cards with a prestige printing. */
  Prestige: PoolCard[]
  LeaderCommon: PoolCard[]
  LeaderRare: PoolCard[]
  Leaders: PoolCard[]
  BaseCommon: PoolCard[]
  Bases: PoolCard[]
  /** Every deck card. */
  all: PoolCard[]
}

interface RawCard {
  name: string
  subtitle?: string | null
  rarity: string
  type: string
  variantType?: string
  isLeader?: boolean
  isBase?: boolean
  aspects?: string[]
}

export function deckPool(setCards: RawCard[]): DeckPool {
  const normal = setCards.filter(c => (c.variantType || 'Normal') === 'Normal')
  const groupOf = (c: RawCard): Group =>
    c.isLeader || c.type === 'Leader' ? 'leader' : c.isBase || c.type === 'Base' ? 'base' : 'deck'
  const toPool = (c: RawCard): PoolCard => ({
    name: c.name, subtitle: c.subtitle, rarity: c.rarity, group: groupOf(c), aspect: c.aspects?.[0] || 'Neutral',
  })
  const cards = normal.map(toPool)
  const deck = cards.filter(c => c.group === 'deck')
  const leaders = cards.filter(c => c.group === 'leader')
  const bases = cards.filter(c => c.group === 'base')
  const by = (r: string) => deck.filter(c => c.rarity === r)
  const prestigeIds = new Set(setCards
    .filter(c => /Prestige/.test(c.variantType || '') && groupOf(c) === 'deck')
    .map(c => `${c.name}|${c.subtitle || ''}`))
  return {
    Common: by('Common'),
    Uncommon: by('Uncommon'),
    Rare: by('Rare'),
    Legendary: by('Legendary'),
    Special: by('Special'),
    RareNonLeader: cards.filter(c => c.rarity === 'Rare' && c.group !== 'leader'),
    Prestige: deck.filter(c => prestigeIds.has(`${c.name}|${c.subtitle || ''}`)),
    LeaderCommon: leaders.filter(c => c.rarity === 'Common'),
    LeaderRare: leaders.filter(c => c.rarity === 'Rare'),
    Leaders: leaders,
    BaseCommon: bases.filter(c => c.rarity === 'Common'),
    Bases: bases,
    all: deck,
  }
}

export function pick<T>(rng: Rng, list: T[]): T {
  if (!list.length) throw new Error('pick: empty list')
  return list[Math.floor(rng() * list.length)]!
}

/** n distinct cards from list, like ORDER BY RAND() LIMIT n. */
function pickDistinct<T>(rng: Rng, list: T[], n: number): T[] {
  const copy = list.slice()
  const out: T[] = []
  for (let i = 0; i < n && copy.length; i++) out.push(copy.splice(Math.floor(rng() * copy.length), 1)[0]!)
  return out
}

function weighted<K extends string>(rng: Rng, weights: Record<K, number>): K {
  const entries = Object.entries(weights) as [K, number][]
  let r = rng() * entries.reduce((s, [, w]) => s + w, 0)
  for (const [k, w] of entries) if ((r -= w) < 0) return k
  return entries[entries.length - 1]![0]
}

export const as = (c: PoolCard, treatment: Treatment = 'Normal'): KitCard =>
  ({ name: c.name, subtitle: c.subtitle, rarity: c.rarity, group: c.group, treatment })

/**
 * CCS — doctor-kat/swu-ccs, src/app/api/booster/generateBooster.ts.
 * Leader and base: common ×7 against rare ×1. Then 9 commons, 3 uncommons,
 * rare slot 7 rare : 1 legendary, and a foil 72 C : 24 U : 7 R : 1 L. Every
 * draw is independent. No hyperspace, no specials.
 */
export function ccsKit(pool: DeckPool, rng: Rng, packs = 6): KitCard[] {
  const kit: KitCard[] = []
  const sevenToOne = (c: PoolCard[], r: PoolCard[]) => pick(rng, [...Array(7).fill(c).flat(), ...r])
  for (let p = 0; p < packs; p++) {
    kit.push(as(sevenToOne(pool.LeaderCommon, pool.LeaderRare)))
    kit.push(as(sevenToOne(pool.BaseCommon, pool.Bases.filter(b => b.rarity === 'Rare'))))
    for (let i = 0; i < 9; i++) kit.push(as(pick(rng, pool.Common)))
    for (let i = 0; i < 3; i++) kit.push(as(pick(rng, pool.Uncommon)))
    kit.push(as(pick(rng, rng() < 1 / 8 ? pool.Legendary : pool.Rare)))
    const foil = weighted(rng, { Common: 72, Uncommon: 24, Rare: 7, Legendary: 1 })
    kit.push(as(pick(rng, pool[foil]), 'Foil'))
  }
  return kit
}

/**
 * SWU Sealed — MPaap/SWU-Sealed-Sim, app/Services/Packs/LAWPackStrategy.php
 * (set id 7 and up). Leader: rare 1 in 8, showcase 1 in 288. No base:
 * addBase() is commented out. A prestige card replaces a common 1 in 18.
 * ORDER BY RAND(seed) LIMIT n inside a slot, so a slot never repeats itself.
 * The hyperspace and hyperspace-foil slots share RAND(seed + 250): when they
 * roll the same rarity bucket they return the same card.
 */
export function swuSealedKit(pool: DeckPool, rng: Rng, packs = 6): KitCard[] {
  const kit: KitCard[] = []
  const bucket = (names: string[]) => names.flatMap(n => pool[n as 'Common'])
  for (let p = 0; p < packs; p++) {
    const leader = pick(rng, Math.floor(rng() * 8) === 0 ? pool.LeaderRare : pool.LeaderCommon)
    kit.push(as(leader, Math.floor(rng() * 288) === 0 ? 'Showcase' : 'Normal'))
    let commons = 8
    if (Math.floor(rng() * 18) === 0) {
      commons = 7
      kit.push(as(pick(rng, pool.Prestige), 'Prestige'))
    }
    kit.push(...pickDistinct(rng, pool.Common, commons).map(c => as(c)))
    kit.push(...pickDistinct(rng, pool.Uncommon, 3).map(c => as(c)))
    kit.push(as(pick(rng, Math.floor(rng() * 8) === 0 ? pool.Legendary : pool.RareNonLeader)))

    const hsRoll = 1 + Math.floor(rng() * 48)
    const hs = hsRoll <= 1 ? ['Legendary'] : hsRoll <= 5 ? ['Rare', 'Special'] : hsRoll <= 17 ? ['Uncommon'] : ['Common']
    const hsfRoll = 1 + Math.floor(rng() * 96)
    const hsf = hsfRoll <= 1 ? ['Legendary'] : hsfRoll <= 5 ? ['Rare', 'Special'] : hsfRoll <= 32 ? ['Uncommon'] : ['Common']
    const hsCard = pick(rng, bucket(hs))
    kit.push(as(hsCard, 'Hyperspace'))
    kit.push(as(hs.join() === hsf.join() ? hsCard : pick(rng, bucket(hsf)), 'Hyperspace Foil'))
  }
  return kit
}

/**
 * SWUDraftSim — Trys2Hard/swu-draft-sim, client/src/Hooks/useCreatePacks.jsx
 * and server/app.js. Sealed leaders come as a pool of six, rare 20% each:
 * half the pools are six different leaders, 45% repeat one, 5% repeat two.
 * Packs have no base. Commons and uncommons already seen are redrawn; the
 * rare slot (legendary 20%), the rare-uncommon slot (L 2%, R 8%, U 90%) and
 * the foil (L 2%, S 10%, R 8%, U 30%, C 50%) are not. For ASH the foil
 * slot's printing is Normal, and rare queries exclude only leaders.
 */
export function swuDraftSimKit(pool: DeckPool, rng: Rng, packs = 6): KitCard[] {
  const kit: KitCard[] = []
  const unique = rng() < 0.5 ? 6 : rng() < 0.9 ? 5 : 4
  const leaders: PoolCard[] = []
  while (leaders.length < unique) {
    const l = pick(rng, rng() < 0.2 ? pool.LeaderRare : pool.LeaderCommon)
    if (!leaders.includes(l)) leaders.push(l)
  }
  if (unique === 5) leaders.push(pick(rng, leaders))
  if (unique === 4) {
    const a = Math.floor(rng() * 4)
    let b = a
    if (rng() >= 0.5) while (b === a) b = Math.floor(rng() * 4)
    leaders.push(leaders[a]!, leaders[b]!)
  }
  kit.push(...leaders.map(l => as(l)))

  const seenC = new Set<PoolCard>()
  const seenU = new Set<PoolCard>()
  const fresh = (list: PoolCard[], seen: Set<PoolCard>) => {
    const left = list.filter(c => !seen.has(c))
    const c = pick(rng, left.length ? left : list)
    seen.add(c)
    return c
  }
  for (let p = 0; p < packs; p++) {
    kit.push(as(pick(rng, rng() < 0.2 ? pool.Legendary : pool.RareNonLeader)))
    const ru = rng()
    kit.push(as(pick(rng, ru < 0.02 ? pool.Legendary : ru < 0.1 ? pool.RareNonLeader : pool.Uncommon)))
    for (let i = 0; i < 2; i++) kit.push(as(fresh(pool.Uncommon, seenU)))
    for (let i = 0; i < 9; i++) kit.push(as(fresh(pool.Common, seenC)))
    const f = rng()
    kit.push(as(pick(rng, f < 0.02 ? pool.Legendary : f < 0.12 ? pool.Special : f < 0.2 ? pool.RareNonLeader : f < 0.5 ? pool.Uncommon : pool.Common)))
  }
  return kit
}

/**
 * ManyTCG — manytcg.com/draft, the SWU entry in its pack registry: one leader
 * and one base drawn evenly from all of them, 9 commons, 3 uncommons, a rare
 * slot legendary 1 in 5, and one deck card of any rarity. Every draw is
 * independent; no card is ever foil or hyperspace.
 */
export function manyTcgKit(pool: DeckPool, rng: Rng, packs = 6): KitCard[] {
  const kit: KitCard[] = []
  for (let p = 0; p < packs; p++) {
    kit.push(as(pick(rng, pool.Leaders)))
    kit.push(as(pick(rng, pool.Bases)))
    for (let i = 0; i < 9; i++) kit.push(as(pick(rng, pool.Common)))
    for (let i = 0; i < 3; i++) kit.push(as(pick(rng, pool.Uncommon)))
    kit.push(as(pick(rng, rng() < 0.2 ? pool.Legendary : pool.Rare)))
    kit.push(as(pick(rng, pool.all)))
  }
  return kit
}

/** camelCase of a card's name, the id Felt Table uses for its extra commons. */
function camelId(name: string): string {
  const words = name.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean)
  return words.map((w, i) => i === 0 ? w.toLowerCase() : w[0]!.toUpperCase() + w.slice(1).toLowerCase()).join('')
}

/**
 * Felt Table — forcetable.net/swu, the ASH pack function in
 * static/js/2.b6e781ae.chunk.js; sealed opens six packs, each from a fresh
 * flag. Each slot shuffles its list and takes the first cards, so a slot
 * never repeats itself. Leader rare 1 in 6; one common base; 9 commons from
 * the commons list plus three cards listed again (consortiumStarViper,
 * inspiredRecruit, grassrootsResistance); 3 uncommons; rare slot legendary 1
 * in 5. The last card is a foil: 9/13 common, 3/13 uncommon, 1/13 a R/L/S
 * roll (legendary 1 in 5 unless the pack already has one, else special or
 * rare evenly).
 */
export function feltTableKit(pool: DeckPool, rng: Rng, packs = 6): KitCard[] {
  const extras = ['consortiumStarViper', 'inspiredRecruit', 'grassrootsResistance']
    .map(id => pool.all.find(c => camelId(c.name).toLowerCase() === id.toLowerCase()))
    .filter((c): c is PoolCard => !!c)
  if (extras.length !== 3) throw new Error(`Felt Table extra commons: found ${extras.length} of 3`)
  const commons = [...pool.Common, ...extras]
  const kit: KitCard[] = []
  for (let p = 0; p < packs; p++) {
    let legendary = false
    kit.push(as(pick(rng, Math.floor(rng() * 6) === 0 ? pool.LeaderRare : pool.LeaderCommon)))
    kit.push(as(pick(rng, pool.BaseCommon)))
    kit.push(...pickDistinct(rng, commons, 9).map(c => as(c)))
    kit.push(...pickDistinct(rng, pool.Uncommon, 3).map(c => as(c)))
    if (Math.floor(rng() * 5) === 4) { kit.push(as(pick(rng, pool.Legendary))); legendary = true }
    else kit.push(as(pick(rng, pool.Rare)))
    const f = Math.floor(rng() * 13) + 1
    if (f <= 9) kit.push(as(pick(rng, commons), 'Foil'))
    else if (f <= 12) kit.push(as(pick(rng, pool.Uncommon), 'Foil'))
    else {
      const a = Math.floor(rng() * 5) + 1
      const specialOrRare = () => pool.Special.length > 0 && Math.floor(rng() * 2) === 0 ? pick(rng, pool.Special) : pick(rng, pool.Rare)
      kit.push(as(!legendary && a === 5 ? pick(rng, pool.Legendary) : specialOrRare(), 'Foil'))
    }
  }
  return kit
}

/**
 * SWU-DR4FT — github.com/statukuo/SWU-dr4ft backend/boosterGenerator.js with
 * the ASH booster data in scripts/generateBoosterData.js. Sealed opens six
 * boosters, each with a leader (rare when lodash random(6) is 0: 1 in 7) and
 * no base — bases come as a separate pool. Commons: 9, redrawn until the four
 * main aspects each appear, at most 3 of an aspect. Uncommons: 3, at most 2
 * of an aspect; the third is C 35 / U 58 / R 5.5 / L 1.5. Rare slot R 80 /
 * L 20. Foil C 60 / U 22 / S 5 / R 10.5 / L 2.5. No card repeats inside a slot.
 */
export function swuDr4ftKit(pool: DeckPool, rng: Rng, packs = 6): KitCard[] {
  const group = (r: number, table: Array<[number, PoolCard[]]>) => table.find(([max]) => r <= max)?.[1] ?? table[table.length - 1]![1]
  const MAIN = ['Vigilance', 'Command', 'Aggression', 'Cunning']
  const slot = (count: number, draw: (i: number) => PoolCard[], ensureAspects: boolean, maxPerAspect: number): PoolCard[] => {
    const chosen: PoolCard[] = []
    const perAspect: Record<string, number> = {}
    while (chosen.length < count) {
      const list = draw(chosen.length)
      for (;;) {
        const c = pick(rng, list)
        const seen = perAspect[c.aspect] || 0
        if (ensureAspects && seen > 0 && MAIN.some(a => a !== c.aspect && !perAspect[a])) continue
        if (seen === maxPerAspect) continue
        if (chosen.includes(c)) continue
        perAspect[c.aspect] = seen + 1
        chosen.push(c)
        break
      }
    }
    return chosen
  }
  const rareish = pool.RareNonLeader.filter(c => c.group === 'deck')
  const kit: KitCard[] = []
  for (let p = 0; p < packs; p++) {
    kit.push(as(pick(rng, Math.floor(rng() * 7) === 0 ? pool.LeaderRare : pool.LeaderCommon)))
    kit.push(...slot(9, () => pool.Common, true, 3).map(c => as(c)))
    kit.push(...slot(3, i => i < 2 ? pool.Uncommon
      : group(rng() * 100, [[35, pool.Common], [93, pool.Uncommon], [98.5, rareish], [100, pool.Legendary]]), false, 2).map(c => as(c)))
    kit.push(as(pick(rng, rng() * 100 <= 80 ? rareish : pool.Legendary)))
    const f = rng() * 100
    kit.push(as(pick(rng, group(f, [[60, pool.Common], [82, pool.Uncommon], [87, pool.Special], [97.5, rareish], [100, pool.Legendary]])), 'Foil'))
  }
  return kit
}

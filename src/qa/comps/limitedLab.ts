/**
 * Limited Lab — port of the collation section of limitedlab.app/sealed/app.js
 * (CommonLane, UCBelt, Sheet, makeBox, openKit). Unlike the other ports this
 * site models a box: two common lanes with repeat gaps, an uncommon belt with
 * echoes, rare/legendary/leader sheets and a 24-pack stacking pass. A kit is
 * six consecutive packs from a random start in that box.
 *
 * Printings follow theirs: the hyperspace common is hyperspace 2 times in 3,
 * the foil is a plain foil unless an R/L foil turns hyperspace (2 in 5), the
 * rare slot is a hyperspace rare 1 in 15, a showcase leader 1 in 288. Their
 * code has no hyperspace leaders, no hyperspace bases and no prestige.
 */

import type { KitCard, Treatment } from './kitStats'
import type { Rng } from './competitors'

interface LLCard {
  name: string
  subtitle?: string | null | undefined
  rarity: string
  group: KitCard['group']
  n: number
  prim: string
}

const print = (c: LLCard, treatment: Treatment = 'Normal'): KitCard =>
  ({ name: c.name, subtitle: c.subtitle, rarity: c.rarity, group: c.group, treatment })

const ASPECT: Record<string, string> = {
  Vigilance: 'V', Command: 'C', Aggression: 'A', Cunning: 'N', Villainy: 'D', Heroism: 'H',
}

const COMMON_GAPS: Record<number, number> = { 1: 34, 3: 24, 5: 18, 7: 12, 9: 8, 11: 4 }
const UC_ECHO_GAPS: Record<number, number> = {
  1: 8, 3: 7, 5: 6, 7: 5, 9: 4, 11: 3, 13: 2, 15: 2, 17: 1, 19: 1, 21: 1, 23: 1,
}

function shuffle<T>(arr: T[], rng: Rng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
  return arr
}
function weightedKey(rng: Rng, obj: Record<string | number, number>): string {
  const e = Object.entries(obj)
  let r = rng() * e.reduce((s, x) => s + x[1], 0)
  for (const [k, w] of e) if ((r -= w) < 0) return k
  return e[e.length - 1]![0]
}
function pick<T>(rng: Rng, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)]!
}

class CommonLane {
  private fresh: LLCard[] = []
  private pending: Record<number, LLCard[]> = {}
  private seen: Record<number, number> = {}
  constructor(private cards: LLCard[], private need: string[], private rng: Rng) {}
  pack(p: number): LLCard[] {
    const rng = this.rng
    const chosen: LLCard[] = []
    const miss = () => this.need.filter(a => !chosen.some(c => c.prim === a))
    const due = this.pending[p] || []
    delete this.pending[p]
    for (const c of due) {
      const m = miss(), left = 4 - chosen.length
      const ok = left > 0 && !chosen.includes(c) && (m.length < left || m.includes(c.prim))
      if (ok) chosen.push(c)
      else (this.pending[p + 2] = this.pending[p + 2] || []).push(c)
    }
    let guard = 0
    while (chosen.length < 4 && guard++ < 400) {
      if (!this.fresh.length) this.fresh = shuffle(this.cards.slice(), rng)
      const m = miss(), left = 4 - chosen.length
      const fits = (c: LLCard) => !chosen.includes(c) && (m.length < left || m.includes(c.prim))
      let idx = -1, best = 1e9
      this.fresh.forEach((c, i) => {
        if (!fits(c)) return
        const s = (this.seen[c.n] ?? -99) + rng() * 4
        if (s < best) { best = s; idx = i }
      })
      if (idx < 0) { this.fresh = shuffle(this.cards.slice(), rng); continue }
      const c = this.fresh.splice(idx, 1)[0]!
      chosen.push(c)
      this.seen[c.n] = p
      const g = +weightedKey(rng, COMMON_GAPS);
      (this.pending[p + g] = this.pending[p + g] || []).push(c)
    }
    return chosen
  }
}

class UCBelt {
  private fresh: LLCard[] = []
  private pending: Record<number, LLCard[]> = {}
  private recent: LLCard[] = []
  private seen: Record<number, number> = {}
  constructor(private uncommons: LLCard[], private rng: Rng) {}
  draw(p: number, n: number): LLCard[] {
    const rng = this.rng
    const out: LLCard[] = []
    const due = this.pending[p] || []
    delete this.pending[p]
    for (const c of due) {
      if (out.length < n && !out.includes(c)) out.push(c)
      else (this.pending[p + 2] = this.pending[p + 2] || []).push(c)
    }
    let guard = 0
    while (out.length < n && guard++ < 300) {
      if (!this.fresh.length) this.fresh = shuffle(this.uncommons.slice(), rng)
      let idx = -1, best = 1e9
      const recent = this.recent.slice(-3)
      this.fresh.forEach((c, i) => {
        if (out.includes(c) || recent.includes(c)) return
        const s = (this.seen[c.n] ?? -99) + rng() * 4
        if (s < best) { best = s; idx = i }
      })
      if (idx < 0) { this.fresh = shuffle(this.uncommons.slice(), rng); continue }
      const c = this.fresh.splice(idx, 1)[0]!
      out.push(c)
      this.recent.push(c)
      this.seen[c.n] = p
      if (rng() < 6.5 / 60) {
        const g = +weightedKey(rng, UC_ECHO_GAPS);
        (this.pending[p + g] = this.pending[p + g] || []).push(c)
      }
    }
    return out
  }
}

class Sheet {
  private seq: LLCard[] = []
  private i: number
  constructor(private list: LLCard[], private rng: Rng, private minGap: number) {
    this.build()
    this.i = Math.floor(rng() * this.seq.length)
  }
  private build() {
    const rng = this.rng
    const seq = shuffle(this.list.slice(), rng)
    for (let pass = 0; pass < 6; pass++) {
      let fixed = true
      for (let i = 0; i < seq.length; i++) {
        for (let k = 1; k <= this.minGap; k++) {
          const j = (i + k) % seq.length
          if (seq[j] === seq[i]) {
            fixed = false
            const s = Math.floor(rng() * seq.length);
            [seq[j], seq[s]] = [seq[s]!, seq[j]!]
          }
        }
      }
      if (fixed) break
    }
    this.seq = seq
  }
  next(): LLCard {
    const c = this.seq[this.i]!
    this.i = (this.i + 1) % this.seq.length
    if (this.i === 0) this.build()
    return c
  }
}

interface RawCard {
  name: string
  subtitle?: string | null
  rarity: string
  type: string
  number?: number | string
  aspects?: string[]
  variantType?: string
  isLeader?: boolean
  isBase?: boolean
}

export interface LimitedLabPool {
  commons: LLCard[]
  uncommons: LLCard[]
  rares: LLCard[]
  legends: LLCard[]
  specials: LLCard[]
  leadersC: LLCard[]
  leadersR: LLCard[]
  bases: LLCard[]
}

export function limitedLabPool(setCards: RawCard[]): LimitedLabPool {
  const cards: LLCard[] = setCards
    .filter(c => (c.variantType || 'Normal') === 'Normal')
    .map(c => ({
      name: c.name, subtitle: c.subtitle, rarity: c.rarity, n: Number(c.number),
      group: c.isLeader || c.type === 'Leader' ? 'leader' : c.isBase || c.type === 'Base' ? 'base' : 'deck',
      prim: ASPECT[(c.aspects || [])[0] || ''] || 'X',
    }))
  const deck = cards.filter(c => c.group === 'deck')
  const by = (r: string) => deck.filter(c => c.rarity === r)
  const leaders = cards.filter(c => c.group === 'leader')
  return {
    commons: by('Common'), uncommons: by('Uncommon'), rares: by('Rare'), legends: by('Legendary'), specials: by('Special'),
    leadersC: leaders.filter(c => c.rarity === 'Common'),
    leadersR: leaders.filter(c => c.rarity === 'Rare'),
    bases: cards.filter(c => c.group === 'base'),
  }
}

/** Their base sheet: every base once, no two adjacent sharing an aspect. */
function baseSheet(bases: LLCard[], rng: Rng): LLCard[] {
  const seq = shuffle(bases.slice(), rng)
  for (let t = 0; t < 40; t++) {
    let ok = true
    for (let i = 1; i < seq.length; i++) {
      if (seq[i]!.prim === seq[i - 1]!.prim) {
        ok = false
        const j = Math.floor(rng() * seq.length);
        [seq[i], seq[j]] = [seq[j]!, seq[i]!]
      }
    }
    if (ok) break
  }
  return seq
}

/** One box of 24 packs in their consumption order. */
function makeBox(pool: LimitedLabPool, rng: Rng): KitCard[][] {
  const { commons, uncommons, rares, legends, specials } = pool
  const laneA = commons.filter(c => c.prim === 'V' || c.prim === 'A' || c.prim === 'D' || (c.prim === 'X' && c.n % 2 === 0))
  const laneB = commons.filter(c => !laneA.includes(c))
  const A = new CommonLane(laneA, ['V', 'A'], rng)
  const B = new CommonLane(laneB, ['C', 'N'], rng)
  const uc = new UCBelt(uncommons, rng)
  const rs = new Sheet(rares, rng, 6)
  const ls = new Sheet(legends, rng, 4)
  const ld = new Sheet([...pool.leadersC.flatMap(c => Array(6).fill(c) as LLCard[]), ...pool.leadersR], rng, 3)
  const hs = new Sheet(commons, rng, 20)
  let bases = baseSheet(pool.bases, rng)
  let bi = Math.floor(rng() * 16) % bases.length
  const burn = Math.floor(rng() * 25)
  const line: KitCard[][] = []
  for (let p = 0; p < burn + 24; p++) {
    const pk: KitCard[] = []
    const leader = ld.next()
    pk.push(print(leader, rng() < 1 / 288 ? 'Showcase' : 'Normal'))
    pk.push(print(bases[bi++]!))
    if (bi >= bases.length) { bases = baseSheet(pool.bases, rng); bi = 0 }
    pk.push(...A.pack(p).map(c => print(c)))
    const hsCommon = hs.next()
    pk.push(print(hsCommon, rng() < 2 / 3 ? 'Hyperspace' : 'Normal'))
    pk.push(...B.pack(p).map(c => print(c)))
    const fr = weightedKey(rng, { C: 83, U: 12, R: 4, L: 1 })
    const fhs = (fr === 'R' || fr === 'L') && rng() < 2 / 5
    const foil = pick(rng, { C: commons, U: uncommons, R: fhs ? [...rares, ...specials] : rares, L: legends }[fr]!)
    pk.push(print(foil, fhs ? 'Hyperspace Foil' : 'Foil'))
    pk.push(...uc.draw(p, 3).map(c => print(c)))
    const rleg = rng() < 1 / 8, rhs = rng() < 1 / 15
    pk.push(print(rleg ? ls.next() : rhs ? pick(rng, [...rares, ...specials]) : rs.next(), rhs ? 'Hyperspace' : 'Normal'))
    if (p >= burn) line.push(pk)
  }
  const box: KitCard[][] = []
  for (let q = 1; q <= 24; q++) box.push(q <= 12 ? line[2 * (12 - q)]! : line[2 * (24 - q) + 1]!)
  return box
}

/** Their openKit: a fresh box, six consecutive packs from a random start. */
export function limitedLabKit(pool: LimitedLabPool, rng: Rng): KitCard[] {
  const box = makeBox(pool, rng)
  const start = Math.floor(rng() * 19)
  return box.slice(start, start + 6).flat()
}

/**
 * Packs evidence for the QA report: groups `/api/stats/packs` rows into pools
 * and summarises each pool's duplicates, legendaries and hyperspace cards
 * against the same rough expectations the legacy /qa page used.
 */

import { zStatus, type QAStatus } from './qaReport'

export interface QAPackCard {
  cardId: string
  name: string
  subtitle?: string
  type?: string
  rarity?: string
  treatment: string
  isFoil?: boolean
  isHyperspace?: boolean
  isShowcase?: boolean
  imageUrl?: string
}

export interface QAPack {
  sourceId: string
  sourceType: string
  packIndex: number
  cards: QAPackCard[]
}

export interface QAPoolGroup {
  sourceId: string
  sourceType: string
  packs: QAPack[]
}

export interface QAPoolLine {
  key: 'regular' | 'any' | 'legendary' | 'hyperspace'
  count: number
  label: string
  detail: string
  status: QAStatus
}

export function treatmentLabel(card: QAPackCard): string {
  if (card.isShowcase) return 'showcase'
  if (card.isHyperspace && card.isFoil) return 'hyperspace foil'
  if (card.isHyperspace) return 'hyperspace'
  if (card.isFoil) return 'foil'
  return 'regular'
}

/** Pools in first-seen order, packs within a pool by pack index. */
export function groupPacksByPool(packs: QAPack[]): QAPoolGroup[] {
  const groups = new Map<string, QAPoolGroup>()
  for (const pack of packs) {
    if (!groups.has(pack.sourceId)) groups.set(pack.sourceId, { sourceId: pack.sourceId, sourceType: pack.sourceType, packs: [] })
    groups.get(pack.sourceId)!.packs.push(pack)
  }
  for (const group of groups.values()) group.packs.sort((a, b) => a.packIndex - b.packIndex)
  return [...groups.values()]
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)
const isLeaderOrBase = (c: QAPackCard) => c.type === 'Leader' || c.type === 'Base'

/** Name → copies, keeping only names seen more than once, most copies first. */
function repeats(cards: QAPackCard[]): Array<{ name: string; count: number; treatments: string[] }> {
  const byName = new Map<string, { count: number; treatments: Set<string> }>()
  for (const c of cards) {
    const entry = byName.get(c.name) || { count: 0, treatments: new Set<string>() }
    entry.count++
    entry.treatments.add(treatmentLabel(c))
    byName.set(c.name, entry)
  }
  return [...byName.entries()]
    .filter(([, v]) => v.count > 1)
    .map(([name, v]) => ({ name, count: v.count, treatments: [...v.treatments].sort() }))
    .sort((a, b) => b.count - a.count)
}

export function poolEvidence(packs: QAPack[]): QAPoolLine[] {
  const all = packs.flatMap((p) => p.cards)
  const n = packs.length
  const regular = repeats(all.filter((c) => !c.isFoil && !c.isHyperspace && !c.isShowcase && !isLeaderOrBase(c)))
  const any = repeats(all.filter((c) => !isLeaderOrBase(c)))
  const legendaries = all.filter((c) => c.rarity === 'Legendary')
  const hs = all.filter((c) => c.isHyperspace)
  const hsLeaders = hs.filter((c) => c.type === 'Leader').length
  const hsBases = hs.filter((c) => c.type === 'Base').length
  const hsOther = hs.length - hsLeaders - hsBases

  const regularCount = regular.reduce((s, d) => s + d.count - 1, 0)
  const anyCount = any.reduce((s, d) => s + d.count - 1, 0)
  return [
    {
      key: 'regular', count: regularCount,
      label: `${regularCount} ${plural(regularCount, 'Duplicate', 'Duplicates')} (regular treatment)`,
      detail: regularCount === 0 ? 'None' : regular.map((d) => `${d.name} x${d.count}`).join(', '),
      status: zStatus(regularCount, n === 6 ? 1.0 : 0.5, 0.8),
    },
    {
      key: 'any', count: anyCount,
      label: `${anyCount} ${plural(anyCount, 'Duplicate', 'Duplicates')} (any treatment)`,
      detail: anyCount === 0 ? 'None' : any.map((d) => `${d.name} x${d.count} (${d.treatments.join(', ')})`).join(', '),
      status: zStatus(anyCount, n === 6 ? 3.7 : 1.8, 1.4),
    },
    {
      key: 'legendary', count: legendaries.length,
      label: `${legendaries.length} ${plural(legendaries.length, 'Legendary', 'Legendaries')}`,
      detail: legendaries.length === 0 ? 'None' : legendaries.map((c) => {
        const t = treatmentLabel(c)
        return t === 'regular' ? c.name : `${c.name} (${t})`
      }).join(', '),
      status: zStatus(legendaries.length, n * 0.125, 0.8),
    },
    {
      key: 'hyperspace', count: hs.length,
      label: `${hs.length} Hyperspace`,
      detail: hs.length === 0 ? 'None' : `${hsLeaders} ${plural(hsLeaders, 'leader', 'leaders')}, ${hsBases} ${plural(hsBases, 'base', 'bases')}, ${hsOther} other`,
      status: zStatus(hs.length, n * 0.5, 1.5),
    },
  ]
}

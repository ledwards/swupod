/**
 * Protect the Pod kits, from the same path players open: generateSealedPod,
 * cut from stacked 24-pack boxes.
 */

import { clearBeltCache, generateSealedPod } from '../../utils/boosterPack'
import { kitStat, summarize, treatmentOf, type KitCard, type KitSummary } from './kitStats'

interface GenCard {
  name: string
  subtitle?: string
  rarity: string
  variantType?: string
  isLeader?: boolean
  isBase?: boolean
}

export function ptpCard(c: GenCard): KitCard {
  return {
    name: c.name,
    subtitle: c.subtitle,
    rarity: c.rarity,
    group: c.isLeader ? 'leader' : c.isBase ? 'base' : 'deck',
    treatment: treatmentOf(c.variantType),
  }
}

export function ptpKitSummary(kits: number, packs = 6): KitSummary {
  clearBeltCache()
  return summarize(Array.from({ length: kits }, () =>
    kitStat(generateSealedPod([], 'ASH', packs).flatMap(p => p.cards).map(c => ptpCard(c as unknown as GenCard)))))
}

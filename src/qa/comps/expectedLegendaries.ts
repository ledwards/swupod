/**
 * Legendaries a six-pack kit should hold, computed from the set's strips
 * rather than sampled. Each slot that can carry a legendary contributes its
 * printed rate:
 *
 *   R/L slot       1 / (rareToLegendary + 1)            (ASH 4:1 → 1 in 5)
 *   foil slot      legendary copies / sheet size         (hyperspaceFoilSheetCopies)
 *   UC3 slot       hsLegendary / 2160                    (Set7PlusUc3OutcomeBelt)
 *   prestige       prestige / 2160 × legendary share of the prestige checklist
 *
 * A computed rate is a sharper target than 261 opened packs, whose legendary
 * count carries about ±0.2 per kit of sampling noise.
 */

import { getSetConfig } from '../../utils/setConfigs/index'
import type { MetricId } from '../../services/compsScore'
import { PACK_STRUCTURE } from '../../utils/packConstants'
import { CYCLE_SIZE, HS_OUTCOME_COUNTS } from '../../belts/Set7PlusUc3OutcomeBelt'

interface Card {
  rarity: string
  variantType?: string
  isLeader?: boolean
  isBase?: boolean
  type?: string
}

export interface LegendaryParts { rareSlot: number, foil: number, uc3: number, prestige: number, perPack: number, perKit: number }

export function expectedLegendaries(setCode: string, setCards: Card[]): LegendaryParts {
  const config = getSetConfig(setCode)
  if (!config) throw new Error(`no set config for ${setCode}`)
  const isDeck = (c: Card) => !c.isLeader && !c.isBase && c.type !== 'Leader' && c.type !== 'Base'
  const normal = setCards.filter(c => (c.variantType || 'Normal') === 'Normal' && isDeck(c))
  const count = (cards: Card[], rarity: string) => cards.filter(c => c.rarity === rarity).length

  const rareSlot = 1 / (config.beltRatios.rareToLegendary + 1)

  const copies = config.rarityWeights.hyperspaceFoilSheetCopies
  if (!copies) throw new Error(`${setCode} has no foil sheet copies`)
  const sheet = Object.entries(copies).reduce((sum, [rarity, n]) => sum + (n ?? 0) * count(normal, rarity), 0)
  const foil = ((copies.Legendary ?? 0) * count(normal, 'Legendary')) / sheet

  const uc3 = HS_OUTCOME_COUNTS.hsLegendary / CYCLE_SIZE

  const prestigeCards = setCards.filter(c => c.variantType === 'Standard Prestige' && isDeck(c))
  const prestigeRate = Math.round(CYCLE_SIZE * (config.upgradeProbabilities.uc3ToPrestige ?? 0)) / CYCLE_SIZE
  const prestige = prestigeCards.length ? prestigeRate * count(prestigeCards, 'Legendary') / prestigeCards.length : 0

  const perPack = rareSlot + foil + uc3 + prestige
  return { rareSlot, foil, uc3, prestige, perPack, perKit: perPack * 6 }
}

export type MixRarity = 'Legendary' | 'Rare' | 'Special' | 'Uncommon' | 'Common'
type Mix = Record<MixRarity, number>
const RARITIES: MixRarity[] = ['Legendary', 'Rare', 'Special', 'Uncommon', 'Common']
const zero = (): Mix => ({ Legendary: 0, Rare: 0, Special: 0, Uncommon: 0, Common: 0 })

/**
 * Deck cards per six-pack kit by rarity, computed from the published pack
 * and the set's strips.
 *
 *   base      the published slots: 9 commons, 3 uncommons, one rare or
 *             legendary at the R/L ratio. No foil slot, no upgrades.
 *   modified  what the kit actually holds: the foil slot adds a card at the
 *             foil sheet's rarity mix, and the third uncommon slot becomes a
 *             hyperspace rare, special or legendary, or a prestige card, at
 *             the UC3 sheet's rates.
 */
export function expectedRarityMix(setCode: string, setCards: Card[]): { base: Mix, modified: Mix } {
  const config = getSetConfig(setCode)
  if (!config) throw new Error(`no set config for ${setCode}`)
  const isDeck = (c: Card) => !c.isLeader && !c.isBase && c.type !== 'Leader' && c.type !== 'Base'
  const normal = setCards.filter(c => (c.variantType || 'Normal') === 'Normal' && isDeck(c))
  const count = (cards: Card[], rarity: string) => cards.filter(c => c.rarity === rarity).length

  const legendaryShare = 1 / (config.beltRatios.rareToLegendary + 1)
  const base = zero()
  base.Common = PACK_STRUCTURE.commons
  base.Uncommon = PACK_STRUCTURE.uncommons
  base.Rare = 1 - legendaryShare
  base.Legendary = legendaryShare

  const modified = { ...base }
  const copies = config.rarityWeights.hyperspaceFoilSheetCopies
  if (!copies) throw new Error(`${setCode} has no foil sheet copies`)
  const sheet = Object.entries(copies).reduce((sum, [rarity, n]) => sum + (n ?? 0) * count(normal, rarity), 0)
  for (const r of RARITIES) modified[r] += ((copies[r] ?? 0) * count(normal, r)) / sheet

  const prestigeCards = setCards.filter(c => c.variantType === 'Standard Prestige' && isDeck(c))
  const prestigeRate = prestigeCards.length ? Math.round(CYCLE_SIZE * (config.upgradeProbabilities.uc3ToPrestige ?? 0)) / CYCLE_SIZE : 0
  const uc3: Partial<Mix> = {
    Rare: HS_OUTCOME_COUNTS.hsRare / CYCLE_SIZE,
    Special: HS_OUTCOME_COUNTS.hsSpecial / CYCLE_SIZE,
    Legendary: HS_OUTCOME_COUNTS.hsLegendary / CYCLE_SIZE,
  }
  for (const r of RARITIES) {
    const up = (uc3[r] ?? 0) + (prestigeCards.length ? prestigeRate * count(prestigeCards, r) / prestigeCards.length : 0)
    modified[r] += up
    modified.Uncommon -= up
  }

  const perKit = (m: Mix) => Object.fromEntries(RARITIES.map(r => [r, m[r] * 6])) as Mix
  return { base: perKit(base), modified: perKit(modified) }
}

/**
 * The rarity targets the comparison uses in place of the boxes' sampled
 * means (the boxes still set the tolerance). Legendaries come from
 * expectedLegendaries, which also counts the prestige checklist.
 */
export function computedTargets(setCode: string, setCards: Card[]): Partial<Record<MetricId, number>> {
  const { base, modified } = expectedRarityMix(setCode, setCards)
  return {
    legendary: expectedLegendaries(setCode, setCards).perKit,
    rare: modified.Rare,
    special: modified.Special,
    uncommon: modified.Uncommon,
    common: modified.Common,
    baseLegendary: base.Legendary,
    baseRare: base.Rare,
    baseSpecial: base.Special,
    baseUncommon: base.Uncommon,
    baseCommon: base.Common,
  }
}

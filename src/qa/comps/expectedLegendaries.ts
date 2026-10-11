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

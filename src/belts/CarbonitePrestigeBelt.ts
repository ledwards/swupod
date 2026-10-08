// @ts-nocheck
/**
 * CarbonitePrestigeBelt
 *
 * A belt that draws real Prestige variant cards from cards.json.
 * Three tiers exist as separate variant types in the data:
 *   - 'Standard Prestige' (tier1): 80% — most common, no foil treatment
 *   - 'Foil Prestige' (tier2): 18% — foil treatment
 *   - 'Serialized Prestige' (serialized): 2% — serialized/250, foil treatment
 *
 * Each tier has its own hopper/filling pool. next() rolls a tier then draws
 * from that tier's hopper. nextTier1() always draws from tier1 (used by
 * standard pack UC3 prestige upgrade).
 *
 * Fallback: if a set has no real prestige cards, synthesizes from Normal R/L
 * pool (safety net for sets not yet in the API).
 */

import { getCachedCards } from '../utils/cardCache'
import type { RawCard } from '../utils/cardData'
import type { SetCode } from '../types'
import { getCarboniteConstants } from '../utils/carboniteConstants'

/**
 * Shuffle an array in place (Fisher-Yates)
 */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = arr[i]
    arr[i] = arr[j]!
    arr[j] = temp!
  }
  return arr
}

/**
 * Roll a prestige tier based on per-set weights
 */
function rollPrestigeTier(weights: { tier1: number; tier2: number; serialized: number }): string {
  const total = weights.tier1 + weights.tier2 + weights.serialized
  const roll = Math.random() * total

  if (roll < weights.tier1) return 'tier1'
  if (roll < weights.tier1 + weights.tier2) return 'tier2'
  return 'serialized'
}

/** Map tier key to variantType in cards.json */
const TIER_VARIANT_MAP: Record<string, string> = {
  tier1: 'Standard Prestige',
  tier2: 'Foil Prestige',
  serialized: 'Serialized Prestige',
}

interface TierPool {
  fillingPool: RawCard[]
  hopper: RawCard[]
}

export class CarbonitePrestigeBelt {
  setCode: SetCode
  tiers: Record<string, TierPool>
  useSynthesis: boolean
  // Per-set prestige tier weights (ASH differs from LAW — see carboniteConstants)
  tierWeights: { tier1: number; tier2: number; serialized: number }

  // Synthesis fallback fields (used only when no real prestige cards exist)
  _synthFillingPool: RawCard[]
  _synthHopper: RawCard[]

  constructor(setCode: SetCode | string) {
    this.setCode = setCode as SetCode
    this.tiers = {}
    this.useSynthesis = false
    this.tierWeights = getCarboniteConstants(setCode as string).prestigeTierWeights
    this._synthFillingPool = []
    this._synthHopper = []

    this._initialize()
  }

  _initialize(): void {
    const cards = getCachedCards(this.setCode)

    // Build per-tier filling pools from real prestige cards
    let totalPrestige = 0
    for (const [tierKey, variantType] of Object.entries(TIER_VARIANT_MAP)) {
      const pool = cards.filter(c =>
        c.variantType === variantType &&
        !c.isLeader &&
        !c.isBase
      )
      this.tiers[tierKey] = { fillingPool: pool, hopper: [] }
      totalPrestige += pool.length
    }

    if (totalPrestige > 0) {
      // Real prestige cards found — use them
      this.useSynthesis = false
      for (const tierKey of Object.keys(this.tiers)) {
        this._fillTierIfNeeded(tierKey)
      }
    } else {
      // Fallback: synthesize from Normal R/L cards
      this.useSynthesis = true
      this._synthFillingPool = cards.filter(c =>
        c.variantType === 'Normal' &&
        !c.isLeader &&
        !c.isBase &&
        (c.rarity === 'Rare' || c.rarity === 'Legendary' || c.rarity === 'Special')
      )
      this._fillSynthIfNeeded()
    }
  }

  _fillTierIfNeeded(tierKey: string): void {
    const tier = this.tiers[tierKey]
    if (!tier || tier.fillingPool.length === 0) return
    while (tier.hopper.length < tier.fillingPool.length) {
      const boot = shuffle([...tier.fillingPool])
      tier.hopper.push(...boot)
    }
  }

  _fillSynthIfNeeded(): void {
    if (this._synthFillingPool.length === 0) return
    while (this._synthHopper.length < this._synthFillingPool.length) {
      const boot = shuffle([...this._synthFillingPool])
      this._synthHopper.push(...boot)
    }
  }

  _drawFromTier(tierKey: string): RawCard | null {
    const tier = this.tiers[tierKey]
    if (!tier) return null
    this._fillTierIfNeeded(tierKey)
    return tier.hopper.shift() || null
  }

  _drawSynthesized(tierKey: string): RawCard | null {
    this._fillSynthIfNeeded()
    const card = this._synthHopper.shift()
    if (!card) return null
    return {
      ...card,
      variantType: TIER_VARIANT_MAP[tierKey] || 'Standard Prestige',
      isPrestige: true,
      prestigeTier: tierKey,
    }
  }

  /**
   * Draw a prestige card with random tier (weighted by CARBONITE_CONSTANTS).
   * Used by carbonite packs.
   */
  next(): RawCard | null {
    const tierKey = rollPrestigeTier(this.tierWeights)

    if (this.useSynthesis) {
      return this._drawSynthesized(tierKey)
    }

    const card = this._drawFromTier(tierKey)
    if (!card) return this._drawSynthesized(tierKey) // fallback
    return card
  }

  /**
   * Draw a tier1 (Standard Prestige) card.
   * Standard packs pass allowSynthesis=false so unreleased prestige checklists
   * do not invent cards before SWU API publishes the real variants.
   */
  nextTier1(options: { allowSynthesis?: boolean } = {}): RawCard | null {
    const allowSynthesis = options.allowSynthesis ?? true

    if (this.useSynthesis) {
      return allowSynthesis ? this._drawSynthesized('tier1') : null
    }

    const card = this._drawFromTier('tier1')
    if (!card) return allowSynthesis ? this._drawSynthesized('tier1') : null
    return card
  }

  peek(count = 1): RawCard[] {
    if (this.useSynthesis) {
      this._fillSynthIfNeeded()
      return this._synthHopper.slice(0, count).map(c => ({
        ...c,
        variantType: 'Standard Prestige',
        isPrestige: true,
        prestigeTier: 'tier1',
      }))
    }

    const tier = this.tiers['tier1']
    if (!tier) return []
    this._fillTierIfNeeded('tier1')
    return tier.hopper.slice(0, count)
  }

  get size(): number {
    if (this.useSynthesis) {
      return this._synthHopper.length
    }
    return Object.values(this.tiers).reduce((sum, t) => sum + t.hopper.length, 0)
  }
}

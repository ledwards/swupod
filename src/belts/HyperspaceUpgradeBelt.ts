// @ts-nocheck
/**
 * HyperspaceUpgradeBelt
 *
 * A "budget belt" that pre-determines how many HS upgrades each pack receives,
 * then distributes those upgrades across slots. This replaces independent
 * coin flips (shouldUpgrade) with controlled collation, achieving tighter
 * variance like real TCG print sheet collation.
 *
 * Cycle of 60 packs:
 *   - 20 packs get 0 HS upgrades (33.3%)
 *   - 29 packs get 1 HS upgrade  (48.3%)
 *   - 11 packs get 2 HS upgrades (18.3%)
 *   Total: 51 upgrades → μ = 0.85, σ = 0.703
 *
 * Constraints:
 *   - Leader + Base never co-occur in same plan
 *   - Per-slot rates match target probabilities
 *   - Budget never exceeds 2
 */

import { HS_BELT_CONFIGS, type HSBeltConfig } from '../utils/packConstants'

export interface UpgradePlan {
  leader: boolean
  base: boolean
  common: boolean
  uc1: boolean
  uc2: boolean
  uc3: boolean
  // NOTE: Rare slot NEVER upgrades to HS. HS rares only appear via UC3 upgrade.
}

type SlotKey = keyof UpgradePlan

const ALL_SLOTS: SlotKey[] = ['leader', 'base', 'common', 'uc1', 'uc2', 'uc3']

function emptyPlan(): UpgradePlan {
  return { leader: false, base: false, common: false, uc1: false, uc2: false, uc3: false }
}

function countTrue(plan: UpgradePlan): number {
  return ALL_SLOTS.filter(s => plan[s]).length
}

/** Fisher-Yates shuffle */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export class HyperspaceUpgradeBelt {
  hopper: UpgradePlan[]
  config: HSBeltConfig

  constructor(setGroup: string = '1-3') {
    this.config = HS_BELT_CONFIGS[setGroup] || HS_BELT_CONFIGS['1-3']
    this.hopper = []
    this._fill()
  }

  next(): UpgradePlan {
    if (this.hopper.length === 0) {
      this._fill()
    }
    return this.hopper.shift()!
  }

  _fill(): void {
    const { cycleSize, budgetDistribution, slotCounts } = this.config

    // Step 1: Create plans with assigned budgets
    const plans: UpgradePlan[] = []

    // Budget-0 plans (no HS)
    for (let i = 0; i < budgetDistribution[0]; i++) {
      plans.push(emptyPlan())
    }
    // Budget-1 plans (1 HS slot)
    for (let i = 0; i < budgetDistribution[1]; i++) {
      plans.push(emptyPlan())
    }
    // Budget-2 plans (2 HS slots)
    for (let i = 0; i < budgetDistribution[2]; i++) {
      plans.push(emptyPlan())
    }

    // Track budget for each plan
    const budgets: number[] = [
      ...Array(budgetDistribution[0]).fill(0),
      ...Array(budgetDistribution[1]).fill(1),
      ...Array(budgetDistribution[2]).fill(2),
    ]

    // Step 2: Distribute slot assignments
    // We need to assign N upgrades of each slot type across the plans,
    // respecting budget limits and co-occurrence constraints.

    // Build list of eligible plan indices for each slot
    // Budget-0 plans get no slots at all
    const budget1Start = budgetDistribution[0]
    const budget2Start = budget1Start + budgetDistribution[1]

    // All plans that can receive at least one upgrade
    const eligibleIndices = []
    for (let i = budget1Start; i < cycleSize; i++) {
      eligibleIndices.push(i)
    }

    // Assign leader upgrades — only to plans that don't already have base
    this._assignSlot(plans, budgets, 'leader', slotCounts.leader, budget1Start, cycleSize)

    // Assign base upgrades — only to plans that don't already have leader
    this._assignSlot(plans, budgets, 'base', slotCounts.base, budget1Start, cycleSize)

    // Assign remaining slots (no co-occurrence constraints between these)
    // NOTE: Rare slot NEVER upgrades to HS. HS rares only appear via UC3 upgrade.
    this._assignSlot(plans, budgets, 'common', slotCounts.common, budget1Start, cycleSize)
    this._assignSlot(plans, budgets, 'uc3', slotCounts.uc3, budget1Start, cycleSize)
    this._assignSlot(plans, budgets, 'uc1', slotCounts.uc1, budget1Start, cycleSize)
    this._assignSlot(plans, budgets, 'uc2', slotCounts.uc2, budget1Start, cycleSize)

    // Step 3: Shuffle the plans (but only the non-zero plans — zeros stay as zeros mixed in)
    shuffle(plans)

    // Step 4: Push to hopper
    this.hopper.push(...plans)
  }

  /**
   * Assign `count` upgrades of `slot` across plans.
   * Respects budget limits and leader/base co-occurrence constraint.
   */
  _assignSlot(
    plans: UpgradePlan[],
    budgets: number[],
    slot: SlotKey,
    count: number,
    startIdx: number,
    endIdx: number
  ): void {
    // Build list of eligible plan indices for this slot
    const eligible: number[] = []
    for (let i = startIdx; i < endIdx; i++) {
      // Skip if plan already has this slot
      if (plans[i][slot]) continue

      // Check budget: can this plan accept another upgrade?
      const currentCount = countTrue(plans[i])
      if (currentCount >= budgets[i]) continue

      // Co-occurrence constraint: leader and base must not co-occur
      if (slot === 'leader' && plans[i].base) continue
      if (slot === 'base' && plans[i].leader) continue

      eligible.push(i)
    }

    // Shuffle eligible and pick first `count`
    shuffle(eligible)
    const selected = eligible.slice(0, count)

    for (const idx of selected) {
      plans[idx][slot] = true
    }
  }
}

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
 *   - Per-slot rates match target probabilities
 *   - Budget never exceeds 2
 *
 * NOTE: Leader and Base CAN co-occur in the same plan. Real data falsified the
 * old exclusivity rule — ASH pool-002 pack06 held both a hyperspace leader and
 * hyperspace base, at a rate consistent with independent 1/6 × 1/6 draws. Under
 * the budget structure a leader+base pair can only land in a budget-2 plan, so
 * co-occurrence is rare (roughly 0-4 per 60-pack LAW cycle) but permitted.
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
    const targetTotal =
      slotCounts.leader + slotCounts.base + slotCounts.common +
      slotCounts.uc1 + slotCounts.uc2 + slotCounts.uc3

    // Random assignment can strand budget capacity when the config is tight
    // (e.g. LAW: budget-2 plans draw from {leader, base, uc3} since uc1/uc2/common
    // are 0). Repair any shortfall with augmenting swaps so every cycle carries
    // its full quota.
    const budgets: number[] = [
      ...Array(budgetDistribution[0]).fill(0),
      ...Array(budgetDistribution[1]).fill(1),
      ...Array(budgetDistribution[2]).fill(2),
    ]
    const plans = this._buildPlans(cycleSize, budgetDistribution, slotCounts, budgets)
    const assigned = plans.reduce((sum, p) => sum + countTrue(p), 0)
    if (assigned < targetTotal) {
      this._repairAssignment(plans, budgets, slotCounts)
      const repaired = plans.reduce((sum, p) => sum + countTrue(p), 0)
      if (repaired < targetTotal) {
        console.warn(`HyperspaceUpgradeBelt: could not place all ${targetTotal} upgrades (placed ${repaired})`)
      }
    }

    // Shuffle the plans (but only the non-zero plans — zeros stay as zeros mixed in)
    shuffle(plans)

    // Push to hopper
    this.hopper.push(...plans)
  }

  _buildPlans(
    cycleSize: number,
    budgetDistribution: { 0: number, 1: number, 2: number },
    slotCounts: HSBeltConfig['slotCounts'],
    budgets: number[]
  ): UpgradePlan[] {
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

    // Step 2: Distribute slot assignments
    // We need to assign N upgrades of each slot type across the plans,
    // respecting budget limits. There are no co-occurrence constraints between
    // slots — leader and base may share a (budget-2) plan.
    // Budget-0 plans get no slots at all.
    const budget1Start = budgetDistribution[0]

    // Assign leader and base upgrades (may co-occur in budget-2 plans)
    this._assignSlot(plans, budgets, 'leader', slotCounts.leader, budget1Start, cycleSize)
    this._assignSlot(plans, budgets, 'base', slotCounts.base, budget1Start, cycleSize)

    // Assign remaining slots
    // NOTE: Rare slot NEVER upgrades to HS. HS rares only appear via UC3 upgrade.
    this._assignSlot(plans, budgets, 'common', slotCounts.common, budget1Start, cycleSize)
    this._assignSlot(plans, budgets, 'uc3', slotCounts.uc3, budget1Start, cycleSize)
    this._assignSlot(plans, budgets, 'uc1', slotCounts.uc1, budget1Start, cycleSize)
    this._assignSlot(plans, budgets, 'uc2', slotCounts.uc2, budget1Start, cycleSize)

    return plans
  }

  /**
   * Place any unassigned slot quota via one-step augmenting swaps.
   *
   * A slot type T can be unplaced when every plan with spare budget already
   * holds T. Fix: find a plan P with spare budget and a donor plan Q holding a
   * slot type S that P can accept, where Q can accept T after giving up S. Move
   * S from Q to P, place T on Q.
   */
  _repairAssignment(
    plans: UpgradePlan[],
    budgets: number[],
    slotCounts: HSBeltConfig['slotCounts']
  ): void {
    const canAccept = (plan: UpgradePlan, budget: number, slot: SlotKey): boolean => {
      if (plan[slot]) return false
      if (countTrue(plan) >= budget) return false
      return true
    }

    for (const slot of ALL_SLOTS) {
      const target = slotCounts[slot] || 0
      let placed = plans.filter(p => p[slot]).length

      let guard = plans.length * ALL_SLOTS.length
      while (placed < target && guard-- > 0) {
        // Direct placement if some plan can take it
        const direct = plans.findIndex((p, i) => canAccept(p, budgets[i], slot))
        if (direct >= 0) {
          plans[direct][slot] = true
          placed++
          continue
        }

        // Augmenting swap: P has spare budget, Q donates S to P and takes `slot`
        let swapped = false
        outer:
        for (let pi = 0; pi < plans.length && !swapped; pi++) {
          if (countTrue(plans[pi]) >= budgets[pi]) continue
          for (const s of ALL_SLOTS) {
            if (s === slot || !canAccept(plans[pi], budgets[pi], s)) continue
            for (let qi = 0; qi < plans.length; qi++) {
              if (qi === pi || !plans[qi][s]) continue
              plans[qi][s] = false
              if (canAccept(plans[qi], budgets[qi], slot)) {
                plans[qi][slot] = true
                plans[pi][s] = true
                placed++
                swapped = true
                break outer
              }
              plans[qi][s] = true // revert
            }
          }
        }
        if (!swapped) break // no augmenting path — give up on this slot type
      }
    }
  }

  /**
   * Assign `count` upgrades of `slot` across plans.
   * Respects budget limits only (leader and base may co-occur).
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

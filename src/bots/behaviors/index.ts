// @ts-nocheck
/**
 * Bot Behavior System
 *
 * Behaviors define how bots make draft picks.
 * Each behavior implements selectLeader() and selectCard() methods.
 *
 * Strategy assignment:
 * - 7 bots (solo mode): One of each strategy (1-7), including Nemesis
 * - 1-6 bots (multiplayer): No Nemesis, from strategies 1-3, 5-7, no duplicates
 * - Each bot gets a random mixin (A, B, or C)
 */

import { RandomBehavior } from './RandomBehavior'
import { PopularLeaderBehavior } from './PopularLeaderBehavior'
import { DataDrivenBehavior } from './DataDrivenBehavior'
import { BaseStrategy } from './BaseStrategy'
import { TopPlayerStrategy } from './strategies/TopPlayerStrategy'
import { TournamentPlayerStrategy } from './strategies/TournamentPlayerStrategy'
import { AllPlayerStrategy } from './strategies/AllPlayerStrategy'
import { NemesisStrategy } from './strategies/NemesisStrategy'
import { DiversityStrategy } from './strategies/DiversityStrategy'
import { PrimaryColorCornerStrategy } from './strategies/PrimaryColorCornerStrategy'
import { SecondaryAspectCornerStrategy } from './strategies/SecondaryAspectCornerStrategy'
import { getRandomMixin } from './mixins'
import type { MixinModifier } from './mixins'

// Behavior class type
type BehaviorClass = typeof RandomBehavior | typeof PopularLeaderBehavior | typeof DataDrivenBehavior

// Behavior instance type — includes both legacy behaviors and new strategies
type BehaviorInstance = RandomBehavior | PopularLeaderBehavior | DataDrivenBehavior | BaseStrategy

// Registry of available legacy behaviors
export const behaviors: Record<string, BehaviorClass> = {
  random: RandomBehavior,
  popularLeader: PopularLeaderBehavior,
  dataDriven: DataDrivenBehavior,
}

// Default behavior for all bots
export const DEFAULT_BEHAVIOR = 'dataDriven'

// Strategy constructors indexed by strategy number
const STRATEGY_CONSTRUCTORS: Record<number, (mixin: MixinModifier | null) => BaseStrategy> = {
  1: (m) => new TopPlayerStrategy(m),
  2: (m) => new TournamentPlayerStrategy(m),
  3: (m) => new AllPlayerStrategy(m),
  4: (m) => new NemesisStrategy(m),
  5: (m) => new DiversityStrategy(m),
  6: (m) => new PrimaryColorCornerStrategy(m),
  7: (m) => new SecondaryAspectCornerStrategy(m),
}

// Solo strategies: all 7
const SOLO_STRATEGIES = [1, 2, 3, 4, 5, 6, 7]

// Multiplayer strategies: no Nemesis (4)
const MULTIPLAYER_STRATEGIES = [1, 2, 3, 5, 6, 7]

/**
 * Get a legacy behavior instance by name.
 * Used for backward compatibility.
 */
export function getBehavior(name: string = DEFAULT_BEHAVIOR): BehaviorInstance {
  const BehaviorClass = behaviors[name]
  if (!BehaviorClass) {
    console.warn(`[BOT] Unknown behavior "${name}", falling back to random`)
    return new RandomBehavior()
  }
  return new BehaviorClass()
}

/**
 * Assign strategies to a group of bots for a draft.
 * Returns a map of botId -> strategy instance.
 *
 * @param botIds - Array of bot player IDs
 * @param isSolo - Whether this is a solo draft (enables Nemesis)
 * @returns Map of botId to strategy instance
 */
export function assignStrategies(botIds: string[], isSolo: boolean = false): Map<string, BaseStrategy> {
  const assignments = new Map<string, BaseStrategy>()

  if (botIds.length === 0) return assignments

  const availableStrategies = isSolo ? [...SOLO_STRATEGIES] : [...MULTIPLAYER_STRATEGIES]

  // Shuffle available strategies
  shuffleArray(availableStrategies)

  for (let i = 0; i < botIds.length; i++) {
    const botId = botIds[i]!
    let strategyNum: number

    if (i < availableStrategies.length) {
      // Assign unique strategy
      strategyNum = availableStrategies[i]!
    } else {
      // More bots than strategies — allow duplicates from non-Nemesis pool
      const pool = isSolo ? MULTIPLAYER_STRATEGIES : MULTIPLAYER_STRATEGIES
      strategyNum = pool[Math.floor(Math.random() * pool.length)]!
    }

    const mixin = getRandomMixin()
    const strategy = STRATEGY_CONSTRUCTORS[strategyNum]!(mixin)

    console.log(`[BOT] Bot ${botId.slice(0, 8)} assigned strategy: ${strategy.strategyName} + mixin: ${mixin.name}`)
    assignments.set(botId, strategy)
  }

  return assignments
}

/**
 * Create a single strategy instance for a bot.
 * Used when a bot is added mid-draft or for deck building.
 */
export function createStrategy(strategyName?: string, mixin?: MixinModifier | null): BaseStrategy {
  const m = mixin ?? getRandomMixin()

  switch (strategyName) {
    case 'topPlayer': return new TopPlayerStrategy(m)
    case 'tournamentPlayer': return new TournamentPlayerStrategy(m)
    case 'allPlayer': return new AllPlayerStrategy(m)
    case 'nemesis': return new NemesisStrategy(m)
    case 'diversity': return new DiversityStrategy(m)
    case 'primaryColorCorner': return new PrimaryColorCornerStrategy(m)
    case 'secondaryAspectCorner': return new SecondaryAspectCornerStrategy(m)
    default: return new AllPlayerStrategy(m)  // Default to AllPlayer
  }
}

// --- Utility ---

function shuffleArray<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
}

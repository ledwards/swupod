// @ts-nocheck
/**
 * LeaderBelt
 *
 * A belt that provides leader cards for booster packs.
 *
 * Design: Builds a physical leader sheet boot, then serves it in order.
 * Each boot prints every common leader 6 times and every rare leader 1 time,
 * with placement rules for duplicate spacing, aspect variety, and seams.
 */

import { getCachedCards } from '../utils/cardCache'
import { getSetConfig } from '../utils/setConfigs/index'
import type { RawCard } from '../utils/cardData'
import type { SetCode } from '../types'
import {
  buildLeaderSheetBoot,
  LEADER_COMMON_PRINTS_PER_BOOT,
  LEADER_DEDUP_WINDOW,
  LEADER_RARE_PRINTS_PER_BOOT,
} from './leaderSheet'

// Set 7+ prints common-leader pairs at the distances measured on the opened
// boxes. Sets 1-6 keep the spacing solver.

export class LeaderBelt {
  setCode: SetCode
  hopper: RawCard[]
  fillingPool: RawCard[]
  commonLeaders: RawCard[]
  rareLeaders: RawCard[]
  recentCards: RawCard[]
  dedupWindowCap: number

  constructor(setCode: SetCode | string) {
    this.setCode = setCode as SetCode
    this.hopper = []
    this.fillingPool = []
    this.commonLeaders = []
    this.rareLeaders = []
    this.recentCards = []

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config = getSetConfig(this.setCode) as any
    this.dedupWindowCap = config?.dedupWindows?.leaderCap ?? LEADER_DEDUP_WINDOW

    this._initialize()
  }

  _initialize(): void {
    const cards = getCachedCards(this.setCode)

    const allLeaders = cards.filter(c =>
      c.isLeader &&
      c.variantType === 'Normal' &&
      (c.rarity === 'Common' || c.rarity === 'Rare')
    )

    this.commonLeaders = allLeaders.filter(c => c.rarity === 'Common')
    this.rareLeaders = allLeaders.filter(c => c.rarity === 'Rare')
    this.fillingPool = [...this.commonLeaders, ...this.rareLeaders]

    this._fillIfNeeded()
  }

  get bootSize(): number {
    return (
      this.commonLeaders.length * LEADER_COMMON_PRINTS_PER_BOOT +
      this.rareLeaders.length * LEADER_RARE_PRINTS_PER_BOOT
    )
  }

  _fillIfNeeded(): void {
    if (this.fillingPool.length === 0) return

    while (this.hopper.length < this.bootSize) {
      this._fill()
    }
  }

  _fill(): void {
    const priorCards = [...this.recentCards, ...this.hopper].slice(-LEADER_DEDUP_WINDOW)
    const wovenSheet = getSetConfig(this.setCode)?.packRules?.lineStackingCollation === true
    const boot = buildLeaderSheetBoot({
      commonLeaders: this.commonLeaders,
      rareLeaders: this.rareLeaders,
      priorCards,
      dedupWindowCap: this.dedupWindowCap,
      wovenSheet,
    })

    this.hopper.push(...boot)
  }

  next(): RawCard | null {
    this._fillIfNeeded()
    const leader = this.hopper.shift()

    if (!leader) return null

    this.recentCards.push(leader)
    if (this.recentCards.length > LEADER_DEDUP_WINDOW) {
      this.recentCards.shift()
    }

    return { ...leader }
  }

  peek(count = 1): RawCard[] {
    this._fillIfNeeded()
    return this.hopper.slice(0, count).map(c => ({ ...c }))
  }

  get size(): number {
    return this.hopper.length
  }
}

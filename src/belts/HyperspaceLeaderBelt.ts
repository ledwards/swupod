// @ts-nocheck
/**
 * HyperspaceLeaderBelt
 *
 * Same leader sheet model as LeaderBelt, but using Hyperspace variant leaders.
 * The upgrade decision is made elsewhere; when the leader slot is upgraded,
 * that pack pulls from this independent physical belt.
 */

import { getCachedCards } from '../utils/cardCache'
import { getSetConfig } from '../utils/setConfigs'
import type { RawCard } from '../utils/cardData'
import type { SetCode } from '../types'
import {
  buildLeaderSheetBoot,
  LEADER_COMMON_PRINTS_PER_BOOT,
  LEADER_DEDUP_WINDOW,
  LEADER_RARE_PRINTS_PER_BOOT,
} from './leaderSheet'

export class HyperspaceLeaderBelt {
  setCode: SetCode
  hopper: RawCard[]
  fillingPool: RawCard[]
  commonLeaders: RawCard[]
  rareLeaders: RawCard[]
  recentCards: RawCard[]

  constructor(setCode: SetCode | string) {
    this.setCode = setCode as SetCode
    this.hopper = []
    this.fillingPool = []
    this.commonLeaders = []
    this.rareLeaders = []
    this.recentCards = []

    this._initialize()
  }

  _initialize(): void {
    const cards = getCachedCards(this.setCode)

    this.fillingPool = cards.filter(c =>
      c.isLeader &&
      c.variantType === 'Hyperspace' &&
      (c.rarity === 'Common' || c.rarity === 'Rare')
    )

    if (this.fillingPool.length === 0) {
      this.fillingPool = cards.filter(c =>
        c.isLeader &&
        c.variantType === 'Normal' &&
        (c.rarity === 'Common' || c.rarity === 'Rare')
      )
    }

    this.commonLeaders = this.fillingPool.filter(c => c.rarity === 'Common')
    this.rareLeaders = this.fillingPool.filter(c => c.rarity === 'Rare')

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
    // Loosened dedup cap comes from the set config (dedupWindows.hyperspaceLeaderCap)
    const hsCap = getSetConfig(this.setCode)?.dedupWindows?.hyperspaceLeaderCap
    const boot = buildLeaderSheetBoot({
      commonLeaders: this.commonLeaders,
      rareLeaders: this.rareLeaders,
      priorCards,
      ...(hsCap != null ? { dedupWindowCap: hsCap } : {}),
    })

    this.hopper.push(...boot)
  }

  next(): RawCard | null {
    this._fillIfNeeded()
    const card = this.hopper.shift()
    if (!card) return null

    this.recentCards.push(card)
    if (this.recentCards.length > LEADER_DEDUP_WINDOW) {
      this.recentCards.shift()
    }

    return { ...card, isHyperspace: true }
  }

  peek(count = 1): RawCard[] {
    this._fillIfNeeded()
    return this.hopper.slice(0, count).map(c => ({ ...c, isHyperspace: true }))
  }

  get size(): number {
    return this.hopper.length
  }
}

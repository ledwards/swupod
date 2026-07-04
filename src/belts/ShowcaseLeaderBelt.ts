// @ts-nocheck
/**
 * ShowcaseLeaderBelt
 *
 * Showcase leaders are an independent physical belt. Unlike the standard and
 * hyperspace leader sheets, every showcase leader has equal weight.
 */

import { getCachedCards } from '../utils/cardCache'
import type { RawCard } from '../utils/cardData'
import type { SetCode } from '../types'
import { getSetConfig } from '../utils/setConfigs/index'
import { buildLeaderSheetBoot, LEADER_DEDUP_WINDOW } from './leaderSheet'

export class ShowcaseLeaderBelt {
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
    const config = getSetConfig(this.setCode) as any
    const setNumber = config?.setNumber || 1
    const includeSpecial = setNumber >= 2

    this.fillingPool = cards.filter(c =>
      c.isLeader &&
      c.variantType === 'Showcase' &&
      (c.rarity === 'Common' || c.rarity === 'Rare' || (includeSpecial && c.rarity === 'Special'))
    )

    if (this.fillingPool.length === 0) {
      this.fillingPool = cards.filter(c =>
        c.isLeader &&
        c.variantType === 'Normal' &&
        (c.rarity === 'Common' || c.rarity === 'Rare' || (includeSpecial && c.rarity === 'Special'))
      )
    }

    this.commonLeaders = this.fillingPool.filter(c => c.rarity === 'Common')
    this.rareLeaders = this.fillingPool.filter(c => c.rarity === 'Rare' || c.rarity === 'Special')

    this._fillIfNeeded()
  }

  get bootSize(): number {
    return this.fillingPool.length
  }

  _fillIfNeeded(): void {
    if (this.fillingPool.length === 0) return

    while (this.hopper.length < this.bootSize) {
      this._fill()
    }
  }

  _fill(): void {
    const priorCards = [...this.recentCards, ...this.hopper].slice(-LEADER_DEDUP_WINDOW)
    const boot = buildLeaderSheetBoot({
      commonLeaders: this.commonLeaders,
      rareLeaders: this.rareLeaders,
      priorCards,
      equalWeight: true,
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

    return { ...card }
  }

  peek(count = 1): RawCard[] {
    this._fillIfNeeded()
    return this.hopper.slice(0, count).map(c => ({ ...c }))
  }

  get size(): number {
    return this.hopper.length
  }
}

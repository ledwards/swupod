// @ts-nocheck
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_STATS_SET_TAB,
  getStatsSetTabs,
  getStatsTabs,
  PERSONAL_STATS_TAB,
  STATS_SET_COLORS,
} from './statsSetTabs'
import { getSetConfig, isBeta } from './setConfigs/index'

describe('stats set tabs', () => {
  it('keeps LAW as the default stats set tab', () => {
    assert.strictEqual(DEFAULT_STATS_SET_TAB, 'LAW')
  })

  it('includes ASH for beta-access users', () => {
    const tabs = getStatsSetTabs(true)
    assert.strictEqual(tabs[0], 'ASH')
    assert.ok(tabs.includes('ASH'))
  })

  it('filters ASH for non-beta users only while ASH is beta', () => {
    const tabs = getStatsSetTabs(false)
    const ashConfig = getSetConfig('ASH')

    if (ashConfig && isBeta(ashConfig)) {
      assert.ok(!tabs.includes('ASH'))
    } else {
      assert.ok(tabs.includes('ASH'))
    }
  })

  it('keeps the personal You tab after every set tab', () => {
    const tabs = getStatsTabs(true)
    assert.strictEqual(tabs.at(-1), PERSONAL_STATS_TAB)
    assert.ok(tabs.indexOf('ASH') < tabs.indexOf(PERSONAL_STATS_TAB))
  })

  it('provides a tab color for ASH', () => {
    assert.strictEqual(STATS_SET_COLORS.ASH, '#8B0000')
  })
})

// @ts-nocheck
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_STATS_SET_TAB,
  getStatsSetTabs,
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

  it('returns only set tabs; personal stats live on /me', () => {
    const tabs = getStatsSetTabs(true)
    assert.ok(!tabs.includes('you'))
    assert.ok(tabs.includes('ASH'))
  })

  it('provides a tab color for ASH', () => {
    assert.strictEqual(STATS_SET_COLORS.ASH, '#8B0000')
  })
})

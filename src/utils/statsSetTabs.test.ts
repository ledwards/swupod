// @ts-nocheck
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_STATS_SET_TAB,
  getStatsSetTabs,
  getDefaultStatsSetTab,
  STATS_SET_COLORS,
} from './statsSetTabs'
import { getSetConfig, isBeta } from './setConfigs/index'

describe('stats set tabs', () => {
  it('uses ASH (newest set) as the static default stats set tab', () => {
    assert.strictEqual(DEFAULT_STATS_SET_TAB, 'ASH')
  })

  it('includes HMW and ASH, with HMW first once it is public', () => {
    const tabs = getStatsSetTabs(true)
    assert.ok(tabs.includes('HMW'))
    assert.ok(tabs.includes('ASH'))
    const hmw = getSetConfig('HMW')
    if (hmw && !isBeta(hmw)) assert.strictEqual(tabs[0], 'HMW')
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

  it('defaults to the newest set a viewer can see', () => {
    assert.strictEqual(getDefaultStatsSetTab(true), getStatsSetTabs(true)[0])
  })

  it('defaults to the newest available set for non-beta users', () => {
    assert.strictEqual(getDefaultStatsSetTab(false), getStatsSetTabs(false)[0])
  })
})

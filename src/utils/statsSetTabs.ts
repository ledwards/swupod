// @ts-nocheck
import { getSetConfig, isBeta } from './setConfigs/index'

// Latest set. Beta sets (e.g. ASH pre-release) only show for users with beta access;
// the stats page falls back to the newest visible set (tabs[0]) for everyone else.
export const DEFAULT_STATS_SET_TAB = 'ASH'

export const STATS_SET_ORDER = [
  'ASH',
  'LAW',
  'SEC',
  'LOF',
  'JTL',
  'TWI',
  'SHD',
  'SOR',
] as const

export const STATS_SET_COLORS: Record<string, string> = {
  ASH: '#8B0000',
  SOR: '#CC0000',
  SHD: '#6B21A8',
  TWI: '#0891B2',
  JTL: '#EA580C',
  LOF: '#16A34A',
  SEC: '#7C3AED',
  LAW: '#D93600',
}

function isBetaSet(setCode: string): boolean {
  const config = getSetConfig(setCode)
  return config ? isBeta(config) : false
}

export function getStatsSetTabs(includeBetaSets = false): string[] {
  return STATS_SET_ORDER.filter((setCode) => includeBetaSets || !isBetaSet(setCode))
}

/**
 * The set a stats surface should default to: the NEWEST set the viewer can
 * actually see — i.e. the first available tab. Beta-access users get the newest
 * set even while it's still beta (ASH today); everyone else gets the newest
 * released set. Use this instead of the static DEFAULT_STATS_SET_TAB so the
 * default tracks the newest set automatically as sets ship.
 */
export function getDefaultStatsSetTab(includeBetaSets = false): string {
  return getStatsSetTabs(includeBetaSets)[0] || DEFAULT_STATS_SET_TAB
}

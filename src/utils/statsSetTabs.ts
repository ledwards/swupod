// @ts-nocheck
import { getSetConfig, isBeta } from './setConfigs/index'

export const PERSONAL_STATS_TAB = 'you'
export const DEFAULT_STATS_SET_TAB = 'LAW'

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

export function getStatsTabs(includeBetaSets = false): string[] {
  return [...getStatsSetTabs(includeBetaSets), PERSONAL_STATS_TAB]
}

import { PtpPlayError } from '../playState'

export const AI_STYLES = ['aggro', 'balanced', 'control'] as const
export type AiStyle = typeof AI_STYLES[number]
export const AI_STYLE_POLICIES = {
  aggro: 'cal-aggro-v2', balanced: 'cal-balanced-v2', control: 'cal-control-v2',
} as const
export type AiPolicy = typeof AI_STYLE_POLICIES[AiStyle] | 'wip-search-v1' | 'cal-aggro-v1' | 'cal-balanced-v1' | 'cal-control-v1'
export const AI_STYLE_LABELS = { aggro: 'Aggro', balanced: 'Balanced', control: 'Control' } as const
export const AI_STYLE_DESCRIPTIONS = {
  aggro: 'Prioritizes attacking your base.',
  balanced: 'Balances attacking the base and controlling the board.',
  control: 'Prioritizes attacking your units.',
} as const
export function parseAiStyle(value: unknown): AiStyle {
  if (value === undefined) return 'balanced'
  if (AI_STYLES.includes(value as AiStyle)) return value as AiStyle
  throw new PtpPlayError(400, 'invalid_ai_style', 'Choose Aggro, Balanced, or Control.')
}
export function styleForPolicy(policy: unknown): AiStyle {
  return policy === AI_STYLE_POLICIES.aggro || policy === 'cal-aggro-v1' ? 'aggro' : policy === AI_STYLE_POLICIES.control || policy === 'cal-control-v1' ? 'control' : 'balanced'
}

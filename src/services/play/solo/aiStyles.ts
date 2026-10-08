import { PtpPlayError } from '../playState'

export const AI_STYLES = ['aggro', 'balanced', 'control'] as const
export type AiStyle = typeof AI_STYLES[number]
export const AI_STYLE_POLICIES = {
  aggro: 'cal-aggro-v2', balanced: 'policy-champion-v3', control: 'cal-control-v2',
} as const
export type AiPolicy = typeof AI_STYLE_POLICIES[AiStyle] | 'cal-balanced-v2' | 'wip-search-v1' | 'cal-aggro-v1' | 'cal-balanced-v1' | 'cal-control-v1'
export function parseAiStyle(value: unknown): AiStyle {
  if (value === undefined) return 'balanced'
  if (AI_STYLES.includes(value as AiStyle)) return 'balanced'
  throw new PtpPlayError(400, 'invalid_ai_style', 'Invalid AI selection.')
}
export function styleForPolicy(policy: unknown): AiStyle {
  return policy === AI_STYLE_POLICIES.aggro || policy === 'cal-aggro-v1' ? 'aggro' : policy === AI_STYLE_POLICIES.control || policy === 'cal-control-v1' ? 'control' : 'balanced'
}

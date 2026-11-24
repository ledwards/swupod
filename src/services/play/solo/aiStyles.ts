import { PtpPlayError } from '../playState'

/** How long the AI thinks per move. Same model at every level; only the search budget changes. */
export const AI_STYLES = ['normal', 'thinking', 'ultrathink'] as const
export type AiStyle = typeof AI_STYLES[number]
/** Purrgil preset ids: the model, then its thinking level (200, 1000 and 5000 search iterations). */
export const AI_STYLE_POLICIES = {
  normal: 'swu-ts3-b-v16-normal', thinking: 'swu-ts3-b-v16-thinking', ultrathink: 'swu-ts3-b-v16-ultrathink',
} as const
/** Policies saved runs may still carry. They read as Normal. */
export type AiPolicy = typeof AI_STYLE_POLICIES[AiStyle] | 'swu-ts3-b-v16' | 'attn-meta-v12' | 'policy-champion-v3' | 'cal-aggro-v2' | 'cal-balanced-v2' | 'cal-control-v2' | 'wip-search-v1' | 'cal-aggro-v1' | 'cal-balanced-v1' | 'cal-control-v1'
export const AI_STYLE_LABELS = { normal: 'Normal', thinking: 'Thinking', ultrathink: 'Ultra-think' } as const
export const AI_STYLE_DESCRIPTIONS = {
  normal: 'Explores 200 lines of play per move. The quickest opponent.',
  thinking: 'Explores 1,000 lines of play per move. Takes a little longer.',
  ultrathink: 'Explores 5,000 lines of play per move. Expect a wait on every move.',
} as const
/** Styles older clients may still send or remember; there is no such choice any more. */
const RETIRED_STYLES = ['aggro', 'balanced', 'control']
export function parseAiStyle(value: unknown): AiStyle {
  if (value === undefined || RETIRED_STYLES.includes(value as string)) return 'normal'
  if (AI_STYLES.includes(value as AiStyle)) return value as AiStyle
  throw new PtpPlayError(400, 'invalid_ai_style', 'Choose Normal, Thinking, or Ultra-think.')
}
export function styleForPolicy(policy: unknown): AiStyle {
  return policy === AI_STYLE_POLICIES.ultrathink ? 'ultrathink' : policy === AI_STYLE_POLICIES.thinking ? 'thinking' : 'normal'
}

/**
 * Status tones for the themed /comps page. The colours are the theme's
 * status roles, and every tone has a word, so colour never travels alone.
 */

export type Tone = 'success' | 'warning' | 'danger'

export const TONE_WORDS: Record<Tone, string> = {
  success: 'Matches the boxes',
  warning: 'Close',
  danger: 'Off',
}

/** Overall score: 90% and up matches, 50% and up is close, anything lower is off. */
export function scoreTone(value: number): Tone {
  return value >= 90 ? 'success' : value >= 50 ? 'warning' : 'danger'
}

/**
 * A measured number, by its distance from the real boxes in standard errors:
 * within 1σ matches, within 2σ is close, further is off. No distance, no tone.
 */
export function zTone(z: number | undefined): Tone | null {
  if (z === undefined || Number.isNaN(z)) return null
  return z <= 1 ? 'success' : z <= 2 ? 'warning' : 'danger'
}

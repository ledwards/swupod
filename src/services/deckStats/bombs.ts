/**
 * Bombs: cards graded A- or better in the set's published Limited ratings.
 * Returns null when the set has no published ratings, so the UI can hide the
 * number rather than show a misleading zero.
 */

import { activeEntryFor, type ActiveRatingSet } from '../cardDataContract'
import type { StatsCard } from './composition'

export const BOMB_GRADES = new Set(['A+', 'A', 'A-'])

export function bombNames(
  cards: StatsCard[],
  setCode: string | null | undefined,
  manifest: Record<string, ActiveRatingSet>,
): string[] | null {
  if (!setCode || manifest[setCode]?.status !== 'published') return null
  const names = cards
    .filter(card => {
      const grade = activeEntryFor(manifest, card.set || setCode, card.name, card.subtitle, 'card')?.grade
      return !!grade && BOMB_GRADES.has(grade)
    })
    .map(card => card.name)
  return names
}

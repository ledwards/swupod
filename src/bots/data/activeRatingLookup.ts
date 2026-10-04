/**
 * Published limited ratings outrank live average-pick stats and the legacy
 * name-only maps. A set that is not published leaves both fallbacks in place.
 */

import manifest from '../../data/activeLimitedRatings.json'
import { activeEntryFor, type ActiveRatingSet } from '../../services/cardDataContract'

const ratings = manifest as Record<string, ActiveRatingSet>

export function publishedCardScore(setCode: string | null | undefined, name: string | null | undefined, subtitle: string | null | undefined): number | null {
  return activeEntryFor(ratings, setCode, name, subtitle, 'card')?.score ?? null
}

export function publishedLeaderScore(setCode: string | null | undefined, name: string | null | undefined, subtitle: string | null | undefined): number | null {
  return activeEntryFor(ratings, setCode, name, subtitle, 'leader')?.score ?? null
}

/** Higher is a better card. Active score wins; then live pick position; then the name map. */
export function cardQualityScore(input: {
  activeScore: number | null
  liveAvgPickPosition: number | null
  nameRanking: number | null
  rarityScore: number
}): number {
  if (input.activeScore != null) return input.activeScore
  if (input.liveAvgPickPosition != null) {
    return Math.max(0, 100 - (input.liveAvgPickPosition - 1) * (100 / 13))
  }
  if (input.nameRanking != null) return input.nameRanking
  return input.rarityScore
}

export function orderByPublishedLeaderRating<T extends { name?: string | null; subtitle?: string | null }>(
  setCode: string,
  leaders: T[],
  rankIndex: (leader: T) => number = () => -1,
): T[] | null {
  if (!leaders.some((leader) => publishedLeaderScore(setCode, leader.name, leader.subtitle) != null)) return null
  return [...leaders].sort((a, b) => leaderPreferenceScore({
    activeScore: publishedLeaderScore(setCode, b.name, b.subtitle),
    livePicks: null,
    rankIndex: rankIndex(b),
  }) - leaderPreferenceScore({
    activeScore: publishedLeaderScore(setCode, a.name, a.subtitle),
    livePicks: null,
    rankIndex: rankIndex(a),
  }))
}

/** Higher is a better leader. */
export function leaderPreferenceScore(input: {
  activeScore: number | null
  livePicks: number | null
  rankIndex: number | null
}): number {
  if (input.activeScore != null) return 1000 + input.activeScore
  if (input.livePicks != null) return input.livePicks
  if (input.rankIndex != null && input.rankIndex >= 0) return 500 - input.rankIndex
  return -1
}

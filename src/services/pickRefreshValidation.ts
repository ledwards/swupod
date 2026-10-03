import type { PickPreferenceSetStats } from './pickPreferenceGrades'

/** Pick-preference validation only. These checks never promote game-performance ratings. */
export function validatePickRefresh(set: string, candidate: PickPreferenceSetStats, previous: PickPreferenceSetStats | null): string[] {
  const errors: string[] = []
  if (candidate.set !== set) errors.push('wrong-set')
  const generated = Date.parse(candidate.generatedAt ?? '')
  if (!Number.isFinite(generated) || generated < Date.now() - 2 * 86400_000 || generated > Date.now() + 60_000) errors.push('stale-candidate')
  const cards = Array.isArray(candidate.cards) ? candidate.cards : []
  if (cards.filter(c => c.aSeen >= 20 && c.bt != null && c.bt > 0).length < 25) errors.push('insufficient-card-support')
  if (cards.some(c => !c.name || !Number.isFinite(c.aSeen) || c.aSeen < 20 || c.bt == null || !Number.isFinite(c.bt) || c.bt < 0
    || c.aRate == null || !Number.isFinite(c.aRate) || c.aRate < 0 || c.aRate > 1
    || c.rating == null || !Number.isFinite(c.rating) || c.rating < 0 || c.rating > 100)) errors.push('invalid-card-values')
  const keys = cards.map(c => `${c.name}|${c.subtitle}`)
  if (new Set(keys).size !== keys.length) errors.push('duplicate-card-identity')
  if ((candidate.leaders ?? []).some(c => !Number.isFinite(c.seen) || c.seen < 0 || !Number.isFinite(c.picked) || c.picked < 0 || c.picked > c.seen
    || (c.strength != null && (!Number.isFinite(c.strength) || c.strength < 0)))) errors.push('invalid-leader-values')
  if (previous && ((candidate.humanSeats ?? 0) < (previous.humanSeats ?? 0) || (candidate.contests ?? 0) < (previous.contests ?? 0)
    || (candidate.leaderContests ?? 0) < (previous.leaderContests ?? 0))) errors.push('population-regressed')
  if (previous && cards.length < previous.cards.length * 0.9) errors.push('card-coverage-regressed')
  return errors
}

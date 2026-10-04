/**
 * Per-set pick-preference aggregates. A set appears here only after a
 * read-only regeneration wrote its JSON. Missing sets stay on the legacy
 * win-rate grade. These snapshots are the pick signal, not the active rating.
 */

import type { PickPreferenceSetStats } from '@/src/services/pickPreferenceGrades'
import ASH from './ASH.json'
import HMW from './HMW.json'
import JTL from './JTL.json'
import LAW from './LAW.json'
import LOF from './LOF.json'
import SEC from './SEC.json'
import SHD from './SHD.json'
import SOR from './SOR.json'
import TWI from './TWI.json'

export const PICK_PREFERENCE_STATS: Record<string, PickPreferenceSetStats> = {
  ASH: ASH as PickPreferenceSetStats,
  HMW: HMW as PickPreferenceSetStats,
  JTL: JTL as PickPreferenceSetStats,
  LAW: LAW as PickPreferenceSetStats,
  LOF: LOF as PickPreferenceSetStats,
  SEC: SEC as PickPreferenceSetStats,
  SHD: SHD as PickPreferenceSetStats,
  SOR: SOR as PickPreferenceSetStats,
  TWI: TWI as PickPreferenceSetStats,
}

export function pickPreferenceStatsForSet(setCode: string | null | undefined): PickPreferenceSetStats | null {
  if (!setCode) return null
  return PICK_PREFERENCE_STATS[setCode] || null
}

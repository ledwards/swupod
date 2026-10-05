// Seed before anything runs.
//
// The stats aggregates are cached server-side for five minutes, keyed by query
// string. So whichever spec loads /stats first decides what every later one
// sees: if the database is empty at that moment, the empty answer is pinned for
// the next five minutes and the stats specs fail against data that exists.
//
// Both stats-page.spec.ts and your-stats.spec.ts load that page, and worker
// order is not guaranteed, so seeding from inside either file is a race. Do it
// here, before the first test exists.
import { seedSealedStats, cleanupSeededStats } from './seed-stats.ts'
import { closeDb } from './test-utils.ts'
import { getDefaultStatsSetTab } from '../../src/utils/statsSetTabs.ts'

export default async function globalSetup(): Promise<void> {
  await cleanupSeededStats()
  await seedSealedStats('ASH', 8)
  const defaultSet = getDefaultStatsSetTab(false)
  if (defaultSet !== 'ASH') await seedSealedStats(defaultSet, 8)
  await closeDb()
}

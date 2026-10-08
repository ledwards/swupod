// Remove the rows global-setup added, so a run leaves the database as it found it.
import { cleanupSeededStats } from './seed-stats.ts'
import { closeDb } from './test-utils.ts'

export default async function globalTeardown(): Promise<void> {
  await cleanupSeededStats()
  await closeDb()
}

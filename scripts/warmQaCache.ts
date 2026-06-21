/**
 * Warm the in-process QA stat caches (lib/statCache) by hitting the heavy endpoints
 * for every set, so no real user ever pays the cold ~60s computation.
 *
 * The endpoints cache results for 30 min, so run this a little more often than that
 * (e.g. every 25 min via cron / a scheduled job) to keep them continuously warm.
 *
 *   npm run qa-warm                              # localhost:3000
 *   QA_WARM_BASE=https://protectthepod.com npm run qa-warm   # production
 *
 * New sets are picked up automatically (set list from the config registry).
 */
import { getAllSetCodes } from '../src/utils/setConfigs/index'

const BASE = process.env.QA_WARM_BASE || 'http://localhost:3000'
const SINCE = process.env.NEXT_PUBLIC_STATS_START_DATE || '2026-02-12'
const ENDPOINTS = ['/api/stats/generations', '/api/public/pack-quality']

async function warm() {
  const sets = getAllSetCodes()
  console.log(`Warming QA caches at ${BASE} for: ${sets.join(', ')}`)
  for (const set of sets) {
    for (const ep of ENDPOINTS) {
      const url = `${BASE}${ep}?setCode=${set}&since=${SINCE}`
      const t = Date.now()
      try {
        const r = await fetch(url)
        console.log(`  ${r.ok ? 'ok ' : 'ERR'} ${((Date.now() - t) / 1000).toFixed(1)}s  ${ep}  ${set}`)
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        console.log(`  ERR ${ep} ${set}: ${message}`)
      }
    }
  }
  console.log('Done.')
}

warm().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })

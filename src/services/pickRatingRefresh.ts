import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import { query, queryRow, withTransaction } from '../../lib/db'
import { PICK_PREFERENCE_STATS, pickPreferenceStatsForSet } from '../data/pickPreferences'
import type { PickPreferenceSetStats } from './pickPreferenceGrades'
import { validatePickRefresh } from './pickRefreshValidation'

const run = promisify(execFile)
export async function publishedPickStats(setCode: string): Promise<PickPreferenceSetStats | null> {
  const row = await queryRow(`SELECT v.payload FROM limited_pick_rating_refresh r
    JOIN limited_pick_rating_versions v ON v.id=r.published_version_id WHERE r.set_code=$1 AND v.status='published'`, [setCode])
  return (row?.payload as PickPreferenceSetStats | undefined) ?? pickPreferenceStatsForSet(setCode)
}

export async function publishPickCandidate(set: string, token: string, candidate: PickPreferenceSetStats) {
  return withTransaction(async tx => {
    const lease = await tx.queryRow('SELECT * FROM limited_pick_rating_refresh WHERE set_code=$1 AND lease_token=$2 AND lease_until>NOW() FOR UPDATE', [set, token])
    if (!lease) throw new Error('Rating refresh lease expired')
    const prior = lease.published_version_id ? await tx.queryRow('SELECT payload FROM limited_pick_rating_versions WHERE id=$1', [lease.published_version_id]) : null
    const errors = validatePickRefresh(set, candidate, (prior?.payload as PickPreferenceSetStats | undefined) ?? pickPreferenceStatsForSet(set))
    const status = errors.length ? 'rejected' : 'published'
    const version = await tx.queryRow(`INSERT INTO limited_pick_rating_versions(set_code,status,diagnostics,payload)
      VALUES($1,$2,$3,$4) RETURNING id`, [set, status, JSON.stringify({ errors, policy:'pick-support-v1' }), JSON.stringify(candidate)])
    await tx.query(`UPDATE limited_pick_rating_refresh SET
      published_version_id=CASE WHEN $3::boolean THEN $4::uuid ELSE published_version_id END,
      next_attempt_at=NOW()+INTERVAL '1 day', lease_token=NULL, lease_until=NULL, last_error=$5
      WHERE set_code=$1 AND lease_token=$2`, [set, token, !errors.length, version!.id, errors.length ? errors.join(', ') : null])
    return { status, errors }
  })
}

/** One set per tick; a DB lease prevents concurrent replicas from fitting it twice. */
export async function refreshNextPickRating(): Promise<void> {
  for (const set of Object.keys(PICK_PREFERENCE_STATS)) {
    await query('INSERT INTO limited_pick_rating_refresh(set_code) VALUES($1) ON CONFLICT(set_code) DO NOTHING', [set])
  }
  // Discover new draft environments from domain data as they become available.
  await query(`INSERT INTO limited_pick_rating_refresh(set_code)
    SELECT DISTINCT set_code FROM pods WHERE status='complete' AND set_code ~ '^[A-Z0-9]{3}$'
    ON CONFLICT(set_code) DO NOTHING`)
  const token = randomUUID()
  const job = await withTransaction(tx => tx.queryRow(`UPDATE limited_pick_rating_refresh SET lease_token=$1,
    lease_until=NOW()+INTERVAL '30 minutes', last_attempt_at=NOW()
    WHERE set_code=(SELECT set_code FROM limited_pick_rating_refresh WHERE next_attempt_at<=NOW()
      AND (lease_until IS NULL OR lease_until<NOW()) ORDER BY next_attempt_at,set_code FOR UPDATE SKIP LOCKED LIMIT 1)
    RETURNING set_code`, [token]))
  if (!job) return
  const set = String(job.set_code)
  let directory: string | undefined
  try {
    directory = await mkdtemp(join(tmpdir(), 'ptp-pick-refresh-'))
    const output = join(directory, 'candidate.json')
    await run(process.execPath, ['--import', 'tsx', 'scripts/analyze-pick-preferences.ts', `--set=${set}`, `--emit-stats=${output}`],
      { cwd:process.cwd(), timeout:15*60_000, maxBuffer:4*1024*1024, env:process.env })
    const candidate = JSON.parse(await readFile(output, 'utf8')) as PickPreferenceSetStats
    const result = await publishPickCandidate(set, token, candidate)
    console.info(`[PickRatings] ${set}: ${result.status}${result.errors.length ? ` (${result.errors.join(', ')})` : ''}`)
  } catch {
    await query(`UPDATE limited_pick_rating_refresh SET last_error='generation_failed',
      next_attempt_at=NOW()+INTERVAL '1 hour', lease_token=NULL, lease_until=NULL WHERE set_code=$1 AND lease_token=$2`, [set, token])
    console.warn(`[PickRatings] ${set}: refresh failed; published version retained`)
  } finally {
    if (directory) await rm(directory, { recursive:true, force:true })
  }
}

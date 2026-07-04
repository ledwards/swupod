#!/usr/bin/env npx tsx
import 'dotenv/config'
import { closePool, queryRows, withTransaction, type TxClient } from '../lib/db'
import { isLeaderMirrorMatch } from '../src/utils/mirrorMatch'

interface PoolState {
  id: string
  shareId: string
  currentWins: number
  currentLosses: number
  currentDraws: number
  currentMatchIds: string[]
  wins: number
  losses: number
  draws: number
  matchIds: Set<string>
  sourceRows: number
  countedRows: number
  excludedMirrorRows: number
  missingIdentityRows: number
}

interface Delta {
  wins: number
  losses: number
  draws: number
}

interface Stats {
  practiceRows: number
  practicePoolRows: number
  practiceMirrors: number
  practiceMissingIdentity: number
  casualRows: number
  casualMirrors: number
  casualMissingIdentity: number
}

const args = new Set(process.argv.slice(2))
const allowedArgs = new Set(['--apply', '--dry-run', '--reset-unmatched', '--help'])
const unknownArgs = [...args].filter((arg) => !allowedArgs.has(arg))

function usage(): void {
  console.log(`Recalculate card_pools W/L/D from Wayfinder match ledgers, excluding leader mirrors.

Usage:
  npx tsx scripts/recalculate-pool-records-excluding-mirrors.ts [--dry-run]
  npx tsx scripts/recalculate-pool-records-excluding-mirrors.ts --apply
  npx tsx scripts/recalculate-pool-records-excluding-mirrors.ts --apply --reset-unmatched

Options:
  --apply             Write changes. Without this, the script only prints a plan.
  --dry-run           Print a plan. This is the default.
  --reset-unmatched   Also zero current W/L/D for pools with no practice/casual ledger rows.
                      Leave this off unless you intentionally want to discard legacy pool-only records.`)
}

if (args.has('--help')) {
  usage()
  process.exit(0)
}

if (unknownArgs.length > 0) {
  console.error(`Unknown argument(s): ${unknownArgs.join(', ')}`)
  usage()
  process.exit(1)
}

const apply = args.has('--apply')
const resetUnmatched = args.has('--reset-unmatched')

function toInt(value: unknown): number {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? '0'), 10)
  return Number.isFinite(n) ? n : 0
}

function text(value: unknown): string | null {
  if (value == null) return null
  const trimmed = String(value).trim()
  return trimmed || null
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map(text).filter((item): item is string => Boolean(item))
}

function sameStringSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false
  const rightSet = new Set(right)
  return left.every((item) => rightSet.has(item))
}

function recordForSide(winner: string | null, side: 'player1' | 'player2'): Delta {
  if (winner === 'draw') return { wins: 0, losses: 0, draws: 1 }
  if (winner !== 'player1' && winner !== 'player2') return { wins: 0, losses: 0, draws: 0 }
  return winner === side
    ? { wins: 1, losses: 0, draws: 0 }
    : { wins: 0, losses: 1, draws: 0 }
}

function casualRecord(result: string | null): Delta {
  if (result === 'win') return { wins: 1, losses: 0, draws: 0 }
  if (result === 'loss') return { wins: 0, losses: 1, draws: 0 }
  if (result === 'draw') return { wins: 0, losses: 0, draws: 1 }
  return { wins: 0, losses: 0, draws: 0 }
}

function addSourceRow(
  pools: Map<string, PoolState>,
  poolId: string | null,
  delta: Delta,
  options: {
    matchId: string | null
    mirror: boolean
    missingIdentity: boolean
  }
): void {
  if (!poolId) return
  const pool = pools.get(poolId)
  if (!pool) return

  pool.sourceRows += 1
  if (options.matchId) pool.matchIds.add(options.matchId)
  if (options.missingIdentity) pool.missingIdentityRows += 1

  if (options.mirror) {
    pool.excludedMirrorRows += 1
    return
  }

  pool.countedRows += 1
  pool.wins += delta.wins
  pool.losses += delta.losses
  pool.draws += delta.draws
}

function changed(pool: PoolState): boolean {
  return (
    pool.currentWins !== pool.wins ||
    pool.currentLosses !== pool.losses ||
    pool.currentDraws !== pool.draws ||
    !sameStringSet(pool.currentMatchIds, [...pool.matchIds])
  )
}

async function loadPools(): Promise<Map<string, PoolState>> {
  const rows = await queryRows(
    `SELECT id, share_id, wins, losses, draws, wayfinder_match_ids
     FROM card_pools
     ORDER BY updated_at DESC`
  )
  const pools = new Map<string, PoolState>()

  for (const row of rows) {
    const id = String(row['id'])
    const currentMatchIds = stringArray(row['wayfinder_match_ids'])
    pools.set(id, {
      id,
      shareId: text(row['share_id']) || id,
      currentWins: toInt(row['wins']),
      currentLosses: toInt(row['losses']),
      currentDraws: toInt(row['draws']),
      currentMatchIds,
      wins: 0,
      losses: 0,
      draws: 0,
      matchIds: new Set(currentMatchIds),
      sourceRows: 0,
      countedRows: 0,
      excludedMirrorRows: 0,
      missingIdentityRows: 0,
    })
  }

  return pools
}

async function accumulatePracticeMatches(pools: Map<string, PoolState>, stats: Stats): Promise<void> {
  const rows = await queryRows(
    `SELECT
       pm.id,
       pm.match_winner,
       pm.wayfinder_match_id,
       pm.player1_leader,
       pm.player2_leader,
       cp.id AS pool_id,
       CASE
         WHEN cp.user_id = pm.player1_id THEN 'player1'
         WHEN cp.user_id = pm.player2_id THEN 'player2'
         ELSE NULL
       END AS pool_side
     FROM practice_matches pm
     JOIN card_pools cp
       ON cp.pod_id = pm.pod_id
      AND (cp.user_id = pm.player1_id OR cp.user_id = pm.player2_id)
     WHERE pm.final_confirmed = true
       AND pm.is_bye = false
       AND pm.wayfinder_match_id IS NOT NULL
       AND pm.match_winner IN ('player1', 'player2', 'draw')`
  )

  const matchIds = new Set<string>()
  for (const row of rows) {
    const winner = text(row['match_winner'])
    const side = text(row['pool_side'])
    if (side !== 'player1' && side !== 'player2') continue

    const player1Leader = text(row['player1_leader'])
    const player2Leader = text(row['player2_leader'])
    const missingIdentity = !player1Leader || !player2Leader
    const mirror = isLeaderMirrorMatch(player1Leader, player2Leader)

    matchIds.add(String(row['id']))
    stats.practicePoolRows += 1
    if (missingIdentity) stats.practiceMissingIdentity += 1
    if (mirror) stats.practiceMirrors += 1

    addSourceRow(pools, text(row['pool_id']), recordForSide(winner, side), {
      matchId: text(row['wayfinder_match_id']),
      mirror,
      missingIdentity,
    })
  }

  stats.practiceRows = matchIds.size
}

async function accumulateCasualMatches(pools: Map<string, PoolState>, stats: Stats): Promise<void> {
  const rows = await queryRows(
    `SELECT
       id,
       card_pool_id,
       wayfinder_match_id,
       result,
       player_leader,
       opponent_leader
     FROM casual_matches
     WHERE card_pool_id IS NOT NULL
       AND wayfinder_match_id IS NOT NULL
       AND result IN ('win', 'loss', 'draw')`
  )

  stats.casualRows = rows.length
  for (const row of rows) {
    const playerLeader = text(row['player_leader'])
    const opponentLeader = text(row['opponent_leader'])
    const missingIdentity = !playerLeader || !opponentLeader
    const mirror = isLeaderMirrorMatch(playerLeader, opponentLeader)

    if (missingIdentity) stats.casualMissingIdentity += 1
    if (mirror) stats.casualMirrors += 1

    addSourceRow(pools, text(row['card_pool_id']), casualRecord(text(row['result'])), {
      matchId: text(row['wayfinder_match_id']),
      mirror,
      missingIdentity,
    })
  }
}

function formatRecord(wins: number, losses: number, draws: number): string {
  return `${wins}W-${losses}L-${draws}D`
}

function printSummary(pools: PoolState[], changedPools: PoolState[], skippedUnmatched: PoolState[], stats: Stats): void {
  const ledgerPools = pools.filter((pool) => pool.sourceRows > 0)
  const excludedMirrorPoolRows = pools.reduce((sum, pool) => sum + pool.excludedMirrorRows, 0)
  const missingIdentityPoolRows = pools.reduce((sum, pool) => sum + pool.missingIdentityRows, 0)

  console.log(`Mode: ${apply ? 'APPLY' : 'DRY RUN'}`)
  console.log(`Reset unmatched pools: ${resetUnmatched ? 'yes' : 'no'}`)
  console.log('')
  console.log('Sources:')
  console.log(`  practice matches: ${stats.practiceRows} matches, ${stats.practicePoolRows} pool rows`)
  console.log(`  casual matches:   ${stats.casualRows} rows`)
  console.log('')
  console.log('Mirror exclusion:')
  console.log(`  practice mirror pool rows excluded: ${stats.practiceMirrors}`)
  console.log(`  casual mirror rows excluded:        ${stats.casualMirrors}`)
  console.log(`  total mirror pool rows excluded:    ${excludedMirrorPoolRows}`)
  console.log(`  missing-identity pool rows counted: ${missingIdentityPoolRows}`)
  console.log('')
  console.log('Pools:')
  console.log(`  source-backed pools: ${ledgerPools.length}`)
  console.log(`  changed pools:       ${changedPools.length}`)
  console.log(`  skipped unmatched:   ${skippedUnmatched.length}`)

  if (changedPools.length > 0) {
    console.log('')
    console.log('First 20 changes:')
    for (const pool of changedPools.slice(0, 20)) {
      console.log(
        `  ${pool.shareId}: ${formatRecord(pool.currentWins, pool.currentLosses, pool.currentDraws)} -> ${formatRecord(pool.wins, pool.losses, pool.draws)}` +
        ` (${pool.excludedMirrorRows} mirror row(s) excluded)`
      )
    }
  }

  if (skippedUnmatched.length > 0) {
    console.log('')
    console.log('Unmatched pools with existing W/L/D were left unchanged:')
    for (const pool of skippedUnmatched.slice(0, 20)) {
      console.log(`  ${pool.shareId}: ${formatRecord(pool.currentWins, pool.currentLosses, pool.currentDraws)}`)
    }
    console.log('  Re-run with --reset-unmatched only if those legacy pool-only records should be zeroed.')
  }
}

async function applyUpdates(tx: TxClient, pools: PoolState[]): Promise<void> {
  for (const pool of pools) {
    await tx.query(
      `UPDATE card_pools
       SET wins = $2,
           losses = $3,
           draws = $4,
           wayfinder_match_ids = $5::text[],
           updated_at = NOW()
       WHERE id = $1`,
      [pool.id, pool.wins, pool.losses, pool.draws, [...pool.matchIds]]
    )
  }
}

async function main(): Promise<void> {
  const stats: Stats = {
    practiceRows: 0,
    practicePoolRows: 0,
    practiceMirrors: 0,
    practiceMissingIdentity: 0,
    casualRows: 0,
    casualMirrors: 0,
    casualMissingIdentity: 0,
  }

  const poolMap = await loadPools()
  await accumulatePracticeMatches(poolMap, stats)
  await accumulateCasualMatches(poolMap, stats)

  const pools = [...poolMap.values()]
  const skippedUnmatched = pools.filter((pool) =>
    pool.sourceRows === 0 &&
    (pool.currentWins + pool.currentLosses + pool.currentDraws > 0)
  )
  const updatablePools = pools.filter((pool) => pool.sourceRows > 0 || resetUnmatched)
  const changedPools = updatablePools.filter(changed)

  printSummary(pools, changedPools, skippedUnmatched, stats)

  if (!apply) {
    console.log('')
    console.log('Dry run only. Re-run with --apply to write these recalculated records.')
    return
  }

  if (changedPools.length === 0) {
    console.log('')
    console.log('No changes to apply.')
    return
  }

  await withTransaction(async (tx) => {
    await applyUpdates(tx, changedPools)
  })

  console.log('')
  console.log(`Applied ${changedPools.length} pool update(s).`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await closePool().catch(() => {})
  })

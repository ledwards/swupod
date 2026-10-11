#!/usr/bin/env npx tsx
/**
 * Repair finished drafts where a drafter left the leader draft with fewer than
 * three leaders (a bot pick staged against its pack before the packs rotated
 * was dropped; fixed in src/utils/leaderPick.ts). The lost pick's pack went on
 * around the table, so its last leader is still sitting in someone's `leaders`:
 * give it to the drafter who is short, in the round they missed.
 *
 * LOCAL dev database only. Dry run unless --apply.
 *   DATABASE_URL=postgresql://lee@localhost:5432/protectthepod npx tsx scripts/dev/repair-leader-picks.ts [podShareId ...] [--apply]
 * With pod share ids, only those pods are repaired.
 */
import { isLocalDatabaseUrl } from './seed-pod-flows'

const parse = <T>(v: unknown, fallback: T): T => (typeof v === 'string' ? JSON.parse(v) : (v ?? fallback)) as T
type Leader = { name: string; instanceId?: string; leaderRound?: number; pickNumber?: number }

async function main() {
  const url = process.env['DATABASE_URL']
  if (!isLocalDatabaseUrl(url) || (process.env['POSTGRES_URL'] && process.env['POSTGRES_URL'] !== url)) {
    console.error('Refusing to run: DATABASE_URL must be a local database (localhost or a /tmp socket), and POSTGRES_URL unset.')
    process.exit(1)
  }
  const apply = process.argv.includes('--apply')
  const only = process.argv.slice(2).filter(a => !a.startsWith('--'))
  const { queryRows, withTransaction, closePool } = await import('../../lib/db')
  const pods = await queryRows(`SELECT DISTINCT p.id, p.share_id FROM pods p JOIN pod_players pp ON pp.pod_id=p.id
    WHERE p.status='complete' AND COALESCE(p.pod_type,'draft')='draft'
      AND jsonb_array_length(COALESCE(pp.drafted_leaders,'[]'::jsonb)) BETWEEN 1 AND 2
      AND (cardinality($1::text[]) = 0 OR p.share_id = ANY($1::text[])) ORDER BY p.share_id`, [only])
  console.log(`${pods.length} finished draft pod(s) with a drafter short of three leaders${apply ? '' : ' (dry run; --apply to write)'}`)
  for (const pod of pods) {
    await withTransaction(async tx => {
      const players = await tx.queryRows(`SELECT pp.id, pp.seat_number, u.username, pp.leaders, pp.drafted_leaders FROM pod_players pp JOIN users u ON u.id=pp.user_id
        WHERE pp.pod_id=$1 ORDER BY pp.seat_number FOR UPDATE OF pp`, [pod.id])
      const leftovers = players.flatMap(p => parse<Leader[]>(p.leaders, []).map(l => ({ holder: p, leader: l })))
      for (const short of players.filter(p => { const n = parse<Leader[]>(p.drafted_leaders, []).length; return n > 0 && n < 3 })) {
        const drafted = parse<Leader[]>(short.drafted_leaders, [])
        const rounds = new Set(drafted.map(l => l.leaderRound))
        const missing = [1, 2, 3].filter(r => !rounds.has(r))
        for (const round of missing) {
          const next = leftovers.shift()
          if (!next) { console.log(`  ${pod.share_id} seat ${short.seat_number} (${short.username}): no leftover leader for round ${round}; left as is`); continue }
          const given = { ...next.leader, leaderRound: round }
          drafted.push(given)
          drafted.sort((a, b) => (a.leaderRound ?? 0) - (b.leaderRound ?? 0)).forEach((l, i) => { l.pickNumber = i + 1 })
          const rest = parse<Leader[]>(next.holder.leaders, []).filter(l => l.instanceId !== next.leader.instanceId)
          next.holder.leaders = JSON.stringify(rest)
          console.log(`  ${pod.share_id} seat ${short.seat_number} (${short.username}): + ${next.leader.name} (${next.leader.instanceId}) as its round ${round} pick, from the pack left with seat ${next.holder.seat_number}`)
          if (apply) await tx.query('UPDATE pod_players SET leaders=$2 WHERE id=$1', [next.holder.id, next.holder.leaders])
        }
        short.drafted_leaders = JSON.stringify(drafted)
        if (apply) await tx.query('UPDATE pod_players SET drafted_leaders=$2 WHERE id=$1', [short.id, short.drafted_leaders])
      }
    })
  }
  await closePool()
}

main().catch(error => { console.error('Repair failed:', error instanceof Error ? error.message : error); process.exit(1) })

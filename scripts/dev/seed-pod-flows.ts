#!/usr/bin/env npx tsx
/**
 * Seed three finished draft pods for Lee (terronk) and seven bots in the LOCAL
 * dev database, one per After-the-draft choice: Swiss, Bracket and None.
 *
 * Each run clones a real finished pod's packs and picks (default oCFdREn8) into
 * fresh pods, copies Lee's built deck, and has the bots build theirs with the
 * real bot deck builder. Then hit Play after deckbuilding:
 *   Swiss   → the pod page with Swiss rounds
 *   Bracket → the pod page with the bracket
 *   None    → the Play page's Draft tab with Lee's deck selected
 *
 *   DATABASE_URL=postgresql://lee@localhost:5432/protectthepod npx tsx scripts/dev/seed-pod-flows.ts [sourcePodShareId] [baseUrl]
 *
 * Refuses any database that is not on this machine.
 */
import { nanoid } from 'nanoid'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])
const LEE = 'cd21932e-855e-4e01-ad18-0c76245df6de'

/** True only for a Postgres URL on this machine (TCP to localhost, or a Unix socket). */
export function isLocalDatabaseUrl(url: string | undefined): boolean {
  if (!url) return false
  let parsed: URL
  try { parsed = new URL(url) } catch { return false }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) return false
  const socket = parsed.searchParams.get('host')
  if (socket) return socket.startsWith('/')
  return LOCAL_HOSTS.has(parsed.hostname)
}

async function main() {
  const url = process.env['DATABASE_URL']
  if (!isLocalDatabaseUrl(url)) {
    console.error('Refusing to run: DATABASE_URL must be a local database (localhost or a /tmp socket).')
    process.exit(1)
  }
  if (process.env['POSTGRES_URL'] && process.env['POSTGRES_URL'] !== url) {
    console.error('Refusing to run: POSTGRES_URL points somewhere else. Unset it.')
    process.exit(1)
  }
  const sourceShareId = process.argv[2] || 'oCFdREn8'
  const baseUrl = (process.argv[3] || 'http://localhost:3000').replace(/\/$/, '')
  console.log(`Seeding pod flows into ${new URL(url!).pathname.slice(1)} on ${new URL(url!).hostname || 'socket'} from pod ${sourceShareId}…`)

  // lib/db reads the URL on import, so import it only after the check.
  const { query, queryRow, closePool } = await import('../../lib/db')
  const { buildBotDecks } = await import('../../src/utils/botDeckBuilder')

  const source = await queryRow(`SELECT id,set_code,status,host_id FROM pods WHERE share_id=$1`, [sourceShareId])
  if (!source || source.status !== 'complete') throw new Error(`Pod ${sourceShareId} is not a finished pod in this database.`)
  const seats = await queryRow(`SELECT COUNT(*) FILTER (WHERE is_bot)::int AS bots, COUNT(*) FILTER (WHERE user_id=$2)::int AS lee FROM pod_players WHERE pod_id=$1`, [source.id, LEE])
  if (seats?.lee !== 1) throw new Error(`Lee did not draft in ${sourceShareId}.`)
  const leePool = await queryRow(`SELECT cp.id FROM card_pools cp JOIN built_decks b ON b.card_pool_id=cp.id
    WHERE cp.pod_id=$1 AND cp.user_id=$2 AND cp.parent_pool_id IS NULL ORDER BY cp.created_at LIMIT 1`, [source.id, LEE])
  if (!leePool) throw new Error(`Lee has no built deck in ${sourceShareId}.`)

  const stamp = new Date().toLocaleString('en-US', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  const flows = [
    { afterDraft: 'swiss', label: 'Swiss', lands: 'the Swiss pod page' },
    { afterDraft: 'elimination', label: 'Bracket', lands: 'the Bracket pod page' },
    { afterDraft: 'none', label: 'None', lands: 'the Play page Draft tab with your deck selected' },
  ] as const
  const results: { label: string; lands: string; pod: string; pool: string }[] = []

  for (const flow of flows) {
    const podId = (await queryRow('SELECT gen_random_uuid() AS id'))!.id as string
    const podShareId = nanoid(8)
    const name = `Seeded ${flow.label} · ${stamp}`
    console.log(`  ${flow.label}: cloning the draft…`)
    await query(`INSERT INTO pods SELECT (jsonb_populate_record(NULL::pods, to_jsonb(p) || jsonb_build_object(
        'id', $2::uuid, 'share_id', $3::text, 'name', $4::text, 'host_id', $5::uuid, 'status', 'complete', 'competitive', false,
        'settings', COALESCE(p.settings, '{}'::jsonb) || jsonb_build_object('afterDraft', $6::text),
        'is_public', false, 'discord_message_id', NULL, 'discord_thread_id', NULL, 'discord_webhook_id', NULL, 'discord_webhook_token', NULL,
        'created_at', NOW(), 'updated_at', NOW(), 'started_at', NOW() - INTERVAL '30 minutes', 'completed_at', NOW()))).*
      FROM pods p WHERE p.id=$1`, [source.id, podId, podShareId, name, LEE, flow.afterDraft])
    await query(`INSERT INTO pod_players SELECT (jsonb_populate_record(NULL::pod_players, to_jsonb(pp) || jsonb_build_object(
        'id', gen_random_uuid(), 'pod_id', $2::uuid, 'card_pool_id', NULL, 'dropped', false, 'dropped_at', NULL))).*
      FROM pod_players pp WHERE pp.pod_id=$1`, [source.id, podId])

    const poolId = (await queryRow('SELECT gen_random_uuid() AS id'))!.id as string
    const poolShareId = nanoid(8)
    await query(`INSERT INTO card_pools SELECT (jsonb_populate_record(NULL::card_pools, to_jsonb(cp) || jsonb_build_object(
        'id', $2::uuid, 'share_id', $3::text, 'pod_id', $4::uuid, 'name', $5::text, 'wins', 0, 'losses', 0, 'draws', 0,
        'deck_builder_state', cp.deck_builder_state || jsonb_build_object('poolName', $5::text),
        'created_at', NOW(), 'updated_at', NOW()))).*
      FROM card_pools cp WHERE cp.id=$1`, [leePool.id, poolId, poolShareId, podId, `${flow.label} draft`])
    await query(`INSERT INTO built_decks (card_pool_id,user_id,set_code,pool_type,leader,base,deck,sideboard)
      SELECT $2,user_id,set_code,pool_type,leader,base,deck,sideboard FROM built_decks WHERE card_pool_id=$1`, [leePool.id, poolId])

    console.log(`  ${flow.label}: bots building their decks…`)
    const built = await buildBotDecks(podId, String(source.set_code), { afterDraft: flow.afterDraft }, { announce: false })
    console.log(`  ${flow.label}: ${built} bot decks built`)
    results.push({ label: flow.label, lands: flow.lands, pod: podShareId, pool: poolShareId })
  }

  console.log('\nDone. Build (or keep) your deck, then hit Play:\n')
  for (const r of results) {
    console.log(`${r.label} → ${r.lands}`)
    console.log(`  Deck:  ${baseUrl}/pools/${r.pool}/deck`)
    console.log(`  Play:  ${baseUrl}/pools/${r.pool}/deck/play`)
    if (r.label !== 'None') console.log(`  Pod:   ${baseUrl}/draft/${r.pod}/pod`)
    console.log('')
  }
  await closePool()
}

if (process.argv[1] && /seed-pod-flows\.ts$/.test(process.argv[1])) {
  main().catch(error => { console.error('Seeding failed:', error instanceof Error ? error.message : error); process.exit(1) })
}

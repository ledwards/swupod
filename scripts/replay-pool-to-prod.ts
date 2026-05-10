/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Replay a verified local pool to production.
 *
 * Reads /tmp/eval-captures/<sessionId>/ground-truth.json (saved when the
 * wizard's Create Pool succeeds), looks each row up in the bundled
 * cards.json, runs buildPool() to assemble the pool/deck shapes, and
 * INSERTs directly into the card_pools table on the prod DB.
 *
 * Bypasses the HTTP API entirely (no cookie needed). Run via Railway so
 * POSTGRES_URL points at prod:
 *
 *   railway run -e production \
 *     npx tsx scripts/replay-pool-to-prod.ts <sessionId> [user_id]
 *
 * user_id defaults to the userId stored in the ground-truth's meta — i.e.
 * the same person who created it locally. Override only if you want the
 * pool to land under a different user (e.g. for testing).
 */
import * as fs from 'fs'
import * as path from 'path'

interface TruthRow {
  name: string
  subtitle: string | null
  type: string
  poolQty: number
  deckQty: number
}

interface TruthFile {
  meta: {
    setCode: string
    activeLeaderId: string
    activeBaseId: string
    title: string
    userId?: string
  }
  rows: TruthRow[]
}

async function main() {
  const sessionId = process.argv[2]
  const userIdOverride = process.argv[3]
  if (!sessionId) {
    console.error('Usage: railway run -e production npx tsx scripts/replay-pool-to-prod.ts <sessionId> [user_id]')
    process.exit(1)
  }

  const truthPath = `/tmp/eval-captures/${sessionId}/ground-truth.json`
  if (!fs.existsSync(truthPath)) {
    console.error(`ground-truth.json not found at ${truthPath}`)
    process.exit(1)
  }
  const truth: TruthFile = JSON.parse(fs.readFileSync(truthPath, 'utf8'))
  const setCode = truth.meta.setCode
  const userId = userIdOverride || truth.meta.userId
  if (!userId) {
    console.error('No user_id available — pass as 2nd arg or ensure ground-truth.json meta has userId')
    process.exit(1)
  }
  console.log(`Loaded truth: ${truth.rows.length} rows, set=${setCode}, user=${userId}`)

  // Verify we're on prod (POSTGRES_URL must be set; print host for safety)
  const dbUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL
  if (!dbUrl) {
    console.error('No POSTGRES_URL/DATABASE_URL — wrap with `railway run -e production` to inject prod creds')
    process.exit(1)
  }
  const dbHost = (() => {
    try { return new URL(dbUrl).hostname } catch { return '<unparseable>' }
  })()
  console.log(`DB host: ${dbHost}`)

  // Lookup cards via the bundled cards.json
  const cardsPath = path.join(process.cwd(), 'src', 'data', 'cards.json')
  const cardsFile = JSON.parse(fs.readFileSync(cardsPath, 'utf8'))
  const setCards = (cardsFile.cards || []).filter(
    (c: any) => c.set === setCode && c.variantType === 'Normal',
  )
  const lookupByNameSubtitle = new Map<string, any>()
  for (const c of setCards) {
    const k = `${(c.name || '').toLowerCase()}|${(c.subtitle || '').toLowerCase()}`
    lookupByNameSubtitle.set(k, c)
  }

  const resolvedRows: Array<{ card: any; poolQty: number; deckQty: number }> = []
  const unmatched: TruthRow[] = []
  for (const r of truth.rows) {
    if (r.poolQty < 1) continue
    const k = `${r.name.toLowerCase()}|${(r.subtitle || '').toLowerCase()}`
    const card = lookupByNameSubtitle.get(k)
    if (!card) {
      unmatched.push(r)
      continue
    }
    resolvedRows.push({ card, poolQty: r.poolQty, deckQty: r.deckQty })
  }
  if (unmatched.length > 0) {
    console.warn(`WARNING: ${unmatched.length} rows did not match cards.json:`)
    unmatched.forEach((r) => console.warn(`  - ${r.name}${r.subtitle ? ' / ' + r.subtitle : ''}`))
    process.exit(1)
  }
  console.log(`Resolved ${resolvedRows.length} rows`)

  // Build the pool/deck shape
  const { buildPool } = await import('../src/services/importPool/buildPool')
  const built = buildPool({
    resolvedRows,
    activeLeaderId: truth.meta.activeLeaderId,
    activeBaseId: truth.meta.activeBaseId,
    setCode,
    poolName: truth.meta.title,
    isDefaultName: false,
  })
  if (built.validationErrors.length > 0) {
    console.error('buildPool validation errors:')
    for (const e of built.validationErrors) console.error(`  - [${e.code}] ${e.message}`)
    process.exit(1)
  }

  // Resolve set name
  const { getSetConfig } = await import('../src/utils/setConfigs/index')
  const setConfig = getSetConfig(setCode)
  const setName = setConfig?.setName || setCode

  // INSERT into card_pools (mirroring app/api/import/create/route.ts)
  const { query } = await import('../lib/db')
  const { generateShareId } = await import('../lib/utils')

  let shareId = generateShareId(8)
  let attempts = 0
  let inserted: any = null
  while (attempts < 10) {
    try {
      const result = await query(
        `INSERT INTO card_pools (
           user_id, share_id, set_code, set_name, pool_type, name,
           cards, packs, deck_builder_state, is_public, hidden
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id, share_id, created_at`,
        [
          userId,
          shareId,
          setCode,
          setName,
          'imported',
          truth.meta.title,
          JSON.stringify(built.cards),
          null,
          JSON.stringify(built.deckBuilderState),
          false,
          false,
        ],
      )
      inserted = result.rows[0]
      break
    } catch (err: any) {
      if (err?.code === '23505' || (err?.message || '').includes('duplicate key')) {
        shareId = generateShareId(8)
        attempts++
        continue
      }
      throw err
    }
  }

  if (!inserted) {
    console.error('Failed to insert after 10 share-id collisions')
    process.exit(1)
  }

  const APP_URL = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://protectthepod.com'
  console.log(`\nSUCCESS`)
  console.log(`  shareId:  ${inserted.share_id}`)
  console.log(`  URL:      ${APP_URL}/pool/${inserted.share_id}/deck`)
  console.log(`  poolId:   ${inserted.id}`)
  console.log(`  user:     ${userId}`)
  process.exit(0)
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})

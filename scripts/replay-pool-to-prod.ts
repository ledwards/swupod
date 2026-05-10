/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Replay a verified local pool to production.
 *
 * Reads a local /tmp/eval-captures/<sessionId>/ground-truth.json (the file
 * the wizard saves on Create Pool), maps its rows to cardIds via the
 * bundled cards.json, and POSTs the same payload to prod's
 * /api/import/create. Lets Lee mess with a known-good local pool on
 * production without re-uploading photos and re-extracting (which Opus
 * variance would muddy).
 *
 * Usage:
 *   PROD_COOKIE='ptp_session=...; otherCookie=...' \
 *     npx tsx scripts/replay-pool-to-prod.ts <sessionId> [prodHost]
 *
 * Get PROD_COOKIE: open protectthepod.com in browser, devtools → Application
 * → Cookies, copy the whole "Cookie" header value.
 *
 * prodHost defaults to https://protectthepod.com.
 */
import * as fs from 'fs'
import * as path from 'path'

const PROD_COOKIE = process.env.PROD_COOKIE || ''
if (!PROD_COOKIE) {
  console.error('PROD_COOKIE env var required. See script header.')
  process.exit(1)
}

const sessionId = process.argv[2]
const prodHost = process.argv[3] || 'https://protectthepod.com'
if (!sessionId) {
  console.error('Usage: PROD_COOKIE=... npx tsx scripts/replay-pool-to-prod.ts <sessionId> [prodHost]')
  process.exit(1)
}

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
  }
  rows: TruthRow[]
}

async function main() {
  const truthPath = `/tmp/eval-captures/${sessionId}/ground-truth.json`
  if (!fs.existsSync(truthPath)) {
    console.error(`ground-truth.json not found at ${truthPath}`)
    process.exit(1)
  }
  const truth: TruthFile = JSON.parse(fs.readFileSync(truthPath, 'utf8'))
  const setCode = truth.meta.setCode
  console.log(`Loaded truth: ${truth.rows.length} rows, set=${setCode}`)

  // Load bundled cards.json and build name+subtitle → id index for the set
  const cardsPath = path.join(process.cwd(), 'src', 'data', 'cards.json')
  const cards = JSON.parse(fs.readFileSync(cardsPath, 'utf8'))
  const setCards = (cards.cards || []).filter(
    (c: any) => c.set === setCode && c.variantType === 'Normal',
  )
  const lookup = new Map<string, any>()
  for (const c of setCards) {
    const k = `${(c.name || '').toLowerCase()}|${(c.subtitle || '').toLowerCase()}`
    lookup.set(k, c)
  }
  console.log(`Loaded ${setCards.length} ${setCode} cards from cards.json`)

  const resolvedRows: Array<{ cardId: string; poolQty: number; deckQty: number }> = []
  const unmatched: TruthRow[] = []
  for (const r of truth.rows) {
    if (r.poolQty < 1) continue
    const k = `${r.name.toLowerCase()}|${(r.subtitle || '').toLowerCase()}`
    const card = lookup.get(k)
    if (!card) {
      unmatched.push(r)
      continue
    }
    resolvedRows.push({ cardId: card.id, poolQty: r.poolQty, deckQty: r.deckQty })
  }
  if (unmatched.length > 0) {
    console.warn(`WARNING: ${unmatched.length} rows did not match cards.json:`)
    unmatched.forEach((r) => console.warn(`  - ${r.name}${r.subtitle ? ' / ' + r.subtitle : ''}`))
  }

  const payload = {
    setCode,
    resolvedRows,
    activeLeaderId: truth.meta.activeLeaderId,
    activeBaseId: truth.meta.activeBaseId,
    title: truth.meta.title,
    isDefaultName: false,
    sessionId, // server uses this for eval-capture pairing
  }

  console.log(`POSTing ${resolvedRows.length} rows to ${prodHost}/api/import/create ...`)
  const res = await fetch(`${prodHost}/api/import/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: PROD_COOKIE,
    },
    body: JSON.stringify(payload),
  })
  const body = await res.text()
  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${body.slice(0, 1000)}`)
    process.exit(1)
  }
  let parsed: any
  try {
    parsed = JSON.parse(body)
  } catch {
    console.error('Response not JSON:', body.slice(0, 500))
    process.exit(1)
  }
  const data = parsed.data ?? parsed
  console.log('SUCCESS')
  console.log('  shareId:', data.shareId)
  if (data.shareId) {
    console.log(`  URL: ${prodHost}/pool/${data.shareId}/deck`)
  }
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})

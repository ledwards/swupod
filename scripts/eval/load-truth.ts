/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Parse a hand-typed ground-truth list and write it to a fixture's
 * ground-truth.json.
 *
 * Input format (stdin OR --input <path>) — matches the visual column
 * order on the sheet (PLAYED | TOTAL | NO. #):
 *   <deckQty> <poolQty> <card_number>
 *   ... one per line, # comments OK, blanks OK ...
 *
 * Writes a complete ground-truth.json for the named fixture, with rows
 * resolved against the cardCache. Validates pool/deck sums against
 * expected totals and warns on anomalies.
 *
 * Usage:
 *   FIXTURE=sq-tom-law cat list.txt | npx tsx scripts/eval/load-truth.ts
 *   FIXTURE=sq-tom-law INPUT=/tmp/perfect.txt npx tsx scripts/eval/load-truth.ts
 */
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const REPO_ROOT = '/Users/lee/Repos/ledwards/swupod'
const FIXTURE = process.env.FIXTURE
if (!FIXTURE) {
  console.error('Set FIXTURE=<name>')
  process.exit(1)
}

interface ParsedRow {
  cardNumber: number
  poolQty: number
  deckQty: number
}

function parseInput(text: string): ParsedRow[] {
  const out: ParsedRow[] = []
  let lineNum = 0
  for (const rawLine of text.split('\n')) {
    lineNum++
    // Strip inline comments
    const noComment = rawLine.replace(/#.*$/, '').trim()
    if (!noComment) continue
    // Strip any "*" change-marker the human might've put on edited values.
    const tokens = noComment.split(/\s+/).map((t) => t.replace(/\*+/g, ''))
    if (tokens.length < 3) {
      console.error(`Line ${lineNum}: expected "<deck> <pool> <num>" (sheet order: PLAYED TOTAL NO.#) got ${JSON.stringify(rawLine)}`)
      process.exit(1)
    }
    // Sheet column order, left to right: PLAYED (deck) | TOTAL (pool) | NO. # (number)
    const deck = parseInt(tokens[0], 10)
    const pool = parseInt(tokens[1], 10)
    const num = parseInt(tokens[2], 10)
    if (!Number.isFinite(num) || !Number.isFinite(pool) || !Number.isFinite(deck)) {
      console.error(`Line ${lineNum}: parse error ${JSON.stringify(rawLine)}`)
      process.exit(1)
    }
    if (deck > pool) {
      console.error(`Line ${lineNum}: card ${num} has deck=${deck} > pool=${pool} (deck⊆pool violation)`)
      process.exit(1)
    }
    if (pool === 0) continue // skip blanks
    out.push({ cardNumber: num, poolQty: pool, deckQty: deck })
  }
  return out
}

async function main() {
  const inputPath = process.env.INPUT
  const text = inputPath ? readFileSync(inputPath, 'utf8') : readFileSync(0, 'utf8')
  const parsed = parseInput(text)

  const fixtureDir = join(REPO_ROOT, 'scripts/eval/fixtures', FIXTURE!)
  const truthPath = join(fixtureDir, 'ground-truth.json')
  const existing = JSON.parse(readFileSync(truthPath, 'utf8'))
  const setCode = existing.setCode

  const cards = JSON.parse(
    readFileSync(join(REPO_ROOT, 'src/data/cards.json'), 'utf8'),
  ).cards.filter((c: any) => c.set === setCode && c.variantType === 'Normal')

  const cardByNumber = new Map<number, any>()
  for (const c of cards) {
    const m = (c.cardId || '').match(/[-_](\d+)$/)
    if (m) cardByNumber.set(parseInt(m[1], 10), c)
  }

  const rows: any[] = []
  let leaderPool = 0,
    leaderDeck = 0,
    basePool = 0,
    baseDeck = 0,
    poolSum = 0,
    deckSum = 0
  for (const p of parsed) {
    const card = cardByNumber.get(p.cardNumber)
    if (!card) {
      console.error(`Card number ${p.cardNumber} not found in set ${setCode}`)
      process.exit(1)
    }
    rows.push({
      name: card.name,
      subtitle: card.subtitle,
      type: card.type,
      poolQty: p.poolQty,
      deckQty: p.deckQty,
    })
    poolSum += p.poolQty
    deckSum += p.deckQty
    if (card.isLeader) {
      leaderPool += p.poolQty
      leaderDeck += p.deckQty
    }
    if (card.isBase) {
      basePool += p.poolQty
      baseDeck += p.deckQty
    }
  }

  // Sanity warnings (don't block — user has the final say). Structural
  // rules: pool=96 hard, leader pool=6 exact, base pool ≥6 (6 commons +
  // rare bases), leader/base deck 0 or 1 (player may skip selection).
  const warns: string[] = []
  if (poolSum !== 96) warns.push(`poolSum=${poolSum} (expected 96)`)
  if (leaderPool !== 6) warns.push(`leaderPool=${leaderPool} (expected 6)`)
  if (leaderDeck > 1) warns.push(`leaderDeck=${leaderDeck} (expected 0 or 1)`)
  if (basePool < 6) warns.push(`basePool=${basePool} (expected ≥6, 6 commons + rare bases)`)
  if (baseDeck > 1) warns.push(`baseDeck=${baseDeck} (expected 0 or 1)`)

  const out = {
    fixtureName: FIXTURE,
    setCode,
    expectedTotals: {
      pool: 96,
      deck: deckSum,
      leaders: 6,
      bases: 6,
    },
    rows,
  }
  writeFileSync(truthPath, JSON.stringify(out, null, 2))

  console.log(`wrote ${truthPath}`)
  console.log(`  rows=${rows.length} pool=${poolSum} deck=${deckSum}`)
  console.log(`  leaders pool=${leaderPool}/6 deck=${leaderDeck}/1`)
  console.log(`  bases pool=${basePool}/6 deck=${baseDeck}/1`)
  if (warns.length) console.log(`  warnings: ${warns.join(' | ')}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

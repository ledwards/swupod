// @ts-nocheck
/**
 * OMR-based whole-table extraction.
 *
 * Pipeline:
 *   1. Spawn a Python sidecar (`scripts/omr/extract_for_node.py`) that:
 *      - Loads + auto-orients each photo
 *      - Detects the printed-table fiducials and warps the photo to a
 *        canonical pixel space
 *      - Identifies each printed table (LEADER, BASE, etc.) and crops it
 *      - Returns a JSON array of {name, page, photo_index, image_b64, bounds}
 *   2. For each detected table, send the cropped image to Claude Opus 4.7
 *      via a single whole-table call. Claude reads the cells visually
 *      against a closed-vocabulary list of expected card numbers.
 *   3. Combine per-table results into ExtractedRow[].
 *
 * Replaces the prior `runPhase2` multi-sample sub-aspect architecture
 * in `lib/anthropic.ts`. Validated to ~97% per-cell accuracy at
 * ~$0.55-0.69/import (vs ~84% / $1-2 with the old multi-sample
 * approach); see `plans/IMPORT_POOL_OMR_REPORT.md` for full eval data.
 *
 * Why whole-table instead of per-cell:
 *   - Pixel-precise per-cell ROIs are unreliable; the warp has ~5-15px
 *     residual variance which collides with 25-30px cell heights.
 *   - Claude reads the printed column structure visually and is more
 *     accurate when given a whole table image vs tightly-cropped cells.
 *   - One API call per table = 10 calls/import vs ~250 cells/import.
 */

import type Anthropic from '@anthropic-ai/sdk'
import { spawn, spawnSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import type { TableName } from './tableGrouping'
import { addResponseUsage, type ExtractUsage } from './extractUsage'

// Keep in sync with lib/anthropic.ts — IMPORT_EXTRACT_MODEL overrides ALL
// extraction phases (a hardcoded copy here once silently pinned the
// whole-table Phase 2 to opus while Phase 1 A/B'd other models).
const MODEL = process.env.IMPORT_EXTRACT_MODEL || 'claude-opus-4-7'
// 16K, not 6K: thinking-enabled models (Claude 5 family) spend output budget
// on thinking blocks before the JSON. A cap, not a spend, for opus.
const MAX_TOKENS = 16000

// ----- Sidecar invocation -----

/** One detected row band of a table, from the sidecar's --cells mode.
 *  Ink fractions are measured on the marks-only mask (printed grid
 *  subtracted); strip_b64 is only present when the band looks inked. */
export interface SidecarCellRow {
  index: number
  y0: number
  y1: number
  played_ink: number
  total_ink: number
  strip_b64?: string
}

export interface SidecarTable {
  name: TableName
  page: 1 | 2
  photo_index: number
  image_b64: string
  bounds_canonical: { x: number; y: number; w: number; h: number }
  canonical_size: [number, number]
  /** NORMALIZED [0,1] AABB of this table in the ORIGINAL photo (post
   *  auto-orient). Lets the front-end crop the user's original upload
   *  to just this section without re-warping. */
  bounds_original: { x0: number; y0: number; x1: number; y1: number }
  original_size: [number, number]
  /** Present only when the sidecar ran with cells: true. */
  rows?: SidecarCellRow[]
}

interface SidecarResponse {
  tables: SidecarTable[]
  warnings: string[]
}

const SIDECAR_SCRIPT = path.join(process.cwd(), 'scripts', 'omr', 'extract_for_node.py')
const SIDECAR_TIMEOUT_MS = Number(process.env.OMR_SIDECAR_TIMEOUT_MS || 60_000)

// Resolve a usable python interpreter once at module load. Try the explicit
// PYTHON_BINARY env var first, then common names. Caches the resolved path so
// every spawn doesn't re-search. Throws if nothing's installed — caller is
// expected to translate that into a user-facing error.
let _resolvedPython: string | null = null
let _resolvedPythonError: string | null = null
function resolvePythonBinary(): string {
  if (_resolvedPython) return _resolvedPython
  if (_resolvedPythonError) throw new Error(_resolvedPythonError)
  const candidates: string[] = []
  if (process.env.PYTHON_BINARY) candidates.push(process.env.PYTHON_BINARY)
  candidates.push('python3', 'python3.11', 'python3.10', 'python', '/usr/bin/python3', '/usr/local/bin/python3')
  // Use spawnSync to test each — `which` is too platform-specific.
  for (const cmd of candidates) {
    try {
      const r = spawnSync(cmd, ['--version'], { stdio: 'ignore' })
      if (r.status === 0) {
        _resolvedPython = cmd
        return cmd
      }
    } catch {
      // ENOENT / other — try next candidate
    }
  }
  _resolvedPythonError = `No Python 3 interpreter found (tried: ${candidates.join(', ')}). PATH=${process.env.PATH || ''}`
  throw new Error(_resolvedPythonError)
}

/**
 * Run the Python OMR sidecar on a list of in-memory image buffers.
 * Writes each buffer to a tmp file, invokes the sidecar with the file
 * paths, parses stdout JSON, and cleans up.
 */
export async function runOmrSidecar(
  images: Buffer[],
  opts: { cells?: boolean } = {},
): Promise<SidecarResponse> {
  // Write images to tmp dir
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'omr-'))
  const paths: string[] = []
  try {
    for (let i = 0; i < images.length; i++) {
      const p = path.join(tmpDir, `photo${i}.jpg`)
      await fs.promises.writeFile(p, images[i])
      paths.push(p)
    }
    const pythonBin = resolvePythonBinary()
    return await new Promise<SidecarResponse>((resolve, reject) => {
      const proc = spawn(pythonBin, [SIDECAR_SCRIPT, ...(opts.cells ? ['--cells'] : []), ...paths], {
        cwd: process.cwd(),
        env: process.env,
      })
      let stdout = ''
      let stderr = ''
      const timeout = setTimeout(() => {
        proc.kill('SIGKILL')
        reject(new Error(`OMR sidecar timed out after ${SIDECAR_TIMEOUT_MS}ms`))
      }, SIDECAR_TIMEOUT_MS)
      proc.stdout.on('data', (d) => { stdout += d.toString() })
      proc.stderr.on('data', (d) => { stderr += d.toString() })
      proc.on('error', (err) => {
        clearTimeout(timeout)
        reject(new Error(`OMR sidecar spawn failed: ${err.message}`))
      })
      proc.on('close', (code) => {
        clearTimeout(timeout)
        if (code !== 0) {
          reject(new Error(`OMR sidecar exited with code ${code}. stderr: ${stderr.slice(0, 500)}`))
          return
        }
        try {
          const parsed: SidecarResponse = JSON.parse(stdout)
          resolve(parsed)
        } catch (err) {
          reject(new Error(`OMR sidecar produced invalid JSON: ${(err as Error).message}. stdout: ${stdout.slice(0, 500)}`))
        }
      })
    })
  } finally {
    // Cleanup tmp files (best effort)
    fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}

// ----- Per-table Claude call -----

const SYSTEM_PROMPT_WHOLE_TABLE = `You read tally counts from a Star Wars: Unlimited sealed deck registration sheet table.

The image is a cropped portion of one table.

# COLUMN LAYOUT (CRITICAL — read carefully)

Each row has 4 columns. Read STRICTLY left to right:
  Column 1 (LEFTMOST): PLAYED — copies in the deck (0 or 1 typical, up to 4)
  Column 2: TOTAL — copies the player owns (0-3 typical)
  Column 3: NO. # — printed card number (DO NOT confuse digit content here with player marks)
  Column 4 (RIGHTMOST): card name + subtitle

The TOP of the table has a HEADER ROW with the literal text "PLAYED  TOTAL  NO. #" — verify your column ordering against this header before counting any data row.

# READING MARKS

- Empty cell = 0
- Single tally mark "|" or check "✓" or digit "1" written by hand = 1
- "||" or "2" = 2; "|||" or "3" = 3; etc.
- The PRINTED card number (column 3) is NOT a mark. Ignore it for counting purposes — it just identifies the row.
- Smudges or eraser marks: report your best read of the visible value.
- If a number is corrected (one crossed out, another written), report the visible CURRENT value.

# COMMON MISTAKES TO AVOID

1. DO NOT swap PLAYED and TOTAL. PLAYED is leftmost. TOTAL is second from left.
2. DO NOT count the printed card number as a mark in TOTAL.
3. SCAN every row even though most are 0/0 — a marked row you never looked at is an unrecoverable miss.

# HARD INVARIANT (CRITICAL)

For ANY row: PLAYED ≤ TOTAL. The deck (PLAYED) is a subset of the player's pool (TOTAL). If you read PLAYED=1 and TOTAL=0 you have SWAPPED them — re-check carefully which column is leftmost. The leftmost column with marks is PLAYED.

# UNCLEAR FLAG (additional output)

Set \`p_unclear\` or \`t_unclear\` to true ONLY when the cell shows visible signs of correction:
  - Crossed-out mark
  - Judge signature / initial in the cell
  - Two values overwritten on each other
  - Clear eraser smudges indicating an edit

Otherwise both flags should be false. Always report your best-read count regardless.

# OUTPUT (compact tuples — one per row, EVERY row)

Output ONE JSON object with a tuple per expected card number, in numerical order:
{"rows": [[<card_number>, <played_qty_LEFTMOST_column>, <total_qty_SECOND_column>, <p_unclear 0|1>, <t_unclear 0|1>], ...]}

Example: a blank row 143 is [143,0,0,0,0]; row 156 with TOTAL "||" and nothing in PLAYED is [156,0,2,0,0].

Include EVERY expected card number — emitting each row is how you prove you scanned it. No other text outside the JSON.`

interface WholeTableResult {
  cardNumber: number
  poolQty: number
  deckQty: number
  poolUnclear: boolean
  deckUnclear: boolean
}

/**
 * Send one table image to Claude and parse the per-card-number JSON.
 *
 * Cards is the closed vocabulary for this table — Claude will only
 * report counts for cards in this list.
 */
export async function classifyTableWithClaude(
  client: Anthropic,
  tableName: TableName,
  cards: any[],
  imageB64: string,
  usage?: ExtractUsage,
): Promise<WholeTableResult[]> {
  const sortedCards = [...cards].sort((a, b) => Number(a.number) - Number(b.number))
  const nameList = sortedCards
    .map((c) => `  #${String(c.number).padStart(3)} ${c.name}${c.subtitle ? ` — ${c.subtitle}` : ''}`)
    .join('\n')
  const userText = `Table: ${tableName}\nExpected cards in this table:\n${nameList}\n\nOutput one tuple for ALL of these card numbers in numerical order.`

  let response: any
  let lastErr: any
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: [
          {
            type: 'text',
            text: SYSTEM_PROMPT_WHOLE_TABLE,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: 'image/png', data: imageB64 },
              },
              { type: 'text', text: userText },
            ],
          },
        ],
      })
      break
    } catch (err: any) {
      lastErr = err
      const status = err?.status || err?.response?.status
      // Retry on overload/server errors and transient connection issues.
      if (status === 529 || status === 500 || err?.code === 'ECONNRESET') {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)))
        continue
      }
      throw err
    }
  }
  if (!response) throw lastErr ?? new Error('Claude call failed (no response)')
  addResponseUsage(usage, response.usage)

  // Find the text block explicitly — on thinking-enabled models (Claude 5
  // family) content[0] is the thinking block, and reading it as text made
  // every table "fail" with no JSON.
  const textBlock = response.content?.find((b: any) => b.type === 'text')
  const text = textBlock?.text || ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error(
      `classifyTableWithClaude(${tableName}): no JSON in response: ${text.slice(0, 200)}`,
    )
  }
  let parsed: any
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch (err) {
    throw new Error(
      `classifyTableWithClaude(${tableName}): bad JSON: ${(err as Error).message}. raw=${jsonMatch[0].slice(0, 200)}`,
    )
  }
  // Output diet: rows arrive as compact tuples [n,p,t,pu,tu] (~9 tokens
  // vs ~25 for the old verbose objects — a 60%+ output cut at $75/MTok)
  // while STILL enumerating every expected number: emitting each row is
  // what forces per-row attention (a marked-rows-only variant measurably
  // cost 7.7 points of recall). Both encodings are accepted; the vocab is
  // reconstructed with explicit zeros so callers see the pre-diet shape.
  const reported = new Map<number, { p: number; t: number; pu: boolean; tu: boolean }>()
  for (const row of parsed.rows || []) {
    if (Array.isArray(row)) {
      reported.set(Number(row[0]), {
        p: Number(row[1] || 0),
        t: Number(row[2] || 0),
        pu: Boolean(row[3]),
        tu: Boolean(row[4]),
      })
    } else if (row && typeof row === 'object') {
      reported.set(Number(row.n), {
        p: Number(row.p || 0),
        t: Number(row.t || 0),
        pu: Boolean(row.p_unclear),
        tu: Boolean(row.t_unclear),
      })
    }
  }
  return sortedCards.map((c: any) => {
    const row = reported.get(Number(c.number))
    return {
      cardNumber: Number(c.number),
      poolQty: row?.t ?? 0,
      deckQty: row?.p ?? 0,
      poolUnclear: row?.tu ?? false,
      deckUnclear: row?.pu ?? false,
    }
  })
}

// ----- Cell-strip classification (cells architecture) -----

const SYSTEM_PROMPT_STRIPS = `You are reading row-strips cut from a Star Wars: Unlimited limited-event registration sheet. Each image shows ONE target table row plus a little context above/below.

TWO HORIZONTAL RED LINES mark the TARGET ROW band on every strip. Read the row between them; marks clearly above/below the band belong to neighboring rows.

Row layout, left to right: [PLAYED cell][TOTAL cell][printed NO. # card number][card name]. Strips labeled "table Bases" have no printed number — they show the base's printed NAME instead.

Handwriting rules:
- An empty cell = 0. One stroke "|" / "/" / a check, or digit "1" = 1. "||" or "2" = 2. "|||" or "3" = 3, etc.
- The printed card number is NOT a tally — it identifies the row.
- p and t are SEPARATE cells. On most sheets the majority of marked rows have ONLY t marked and p empty — never copy t's value into p. Report p>0 only when a distinct mark sits in the leftmost (PLAYED) cell itself.

For EVERY strip, in the order given, output one entry:
{"s": <strip id from its label>, "n": <printed card number, or null for Bases strips>, "b": <printed base name for Bases strips, else null>, "p": <PLAYED qty>, "t": <TOTAL qty>, "u": <true if the handwriting is ambiguous>, "skip": <true if the band contains a section divider, column header, or otherwise no card row>}

Output ONLY: {"strips": [ ... ]} — no other text.`

export interface CellStripInput {
  id: number
  table: TableName
  b64: string
}

export interface CellStripRead {
  s: number
  n: number | null
  b: string | null
  p: number
  t: number
  u: boolean
  skip?: boolean
}

/**
 * Read a batch of row strips in one call. Strips are tiny (one row each),
 * so a single call covers ~40 of them — this is the whole-sheet cost
 * reducer: classical CV decides WHERE the ink is; the model only reads
 * the handful of inked cells.
 */
export async function classifyCellStrips(
  client: Anthropic,
  strips: CellStripInput[],
  usage?: ExtractUsage,
): Promise<CellStripRead[]> {
  if (strips.length === 0) return []
  const content: any[] = []
  for (const s of strips) {
    content.push({ type: 'text', text: `STRIP ${s.id} (table ${s.table}):` })
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: s.b64 } })
  }
  content.push({ type: 'text', text: `Read all ${strips.length} strips above and output the JSON.` })

  let response: any
  let lastErr: any
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: [
          { type: 'text', text: SYSTEM_PROMPT_STRIPS, cache_control: { type: 'ephemeral' } },
        ],
        messages: [{ role: 'user', content }],
      })
      break
    } catch (err: any) {
      lastErr = err
      const status = err?.status || err?.response?.status
      if (status === 429 || status === 529 || status === 500 || err?.code === 'ECONNRESET') {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)))
        continue
      }
      throw err
    }
  }
  if (!response) throw lastErr ?? new Error('Claude call failed (no response)')
  addResponseUsage(usage, response.usage)

  const textBlock = response.content?.find((b: any) => b.type === 'text')
  const text = textBlock?.text || ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error(`classifyCellStrips: no JSON in response: ${text.slice(0, 200)}`)
  }
  let parsed: any
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch (err) {
    throw new Error(`classifyCellStrips: bad JSON: ${(err as Error).message}`)
  }
  return (parsed.strips || []).map((r: any) => ({
    s: Number(r.s),
    n: r.n == null ? null : Number(r.n),
    b: r.b == null ? null : String(r.b),
    p: Number(r.p || 0),
    t: Number(r.t || 0),
    u: Boolean(r.u),
    skip: Boolean(r.skip),
  }))
}

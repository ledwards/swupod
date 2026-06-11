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

const MODEL = 'claude-opus-4-7'
const MAX_TOKENS = 6000

// ----- Sidecar invocation -----

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
export async function runOmrSidecar(images: Buffer[]): Promise<SidecarResponse> {
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
      const proc = spawn(pythonBin, [SIDECAR_SCRIPT, ...paths], {
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
3. Process every row even if many are 0/0 (most rows ARE 0/0).

# HARD INVARIANT (CRITICAL)

For ANY row: PLAYED ≤ TOTAL. The deck (PLAYED) is a subset of the player's pool (TOTAL). If you read PLAYED=1 and TOTAL=0 you have SWAPPED them — re-check carefully which column is leftmost. The leftmost column with marks is PLAYED.

# UNCLEAR FLAG (additional output)

Set \`p_unclear\` or \`t_unclear\` to true ONLY when the cell shows visible signs of correction:
  - Crossed-out mark
  - Judge signature / initial in the cell
  - Two values overwritten on each other
  - Clear eraser smudges indicating an edit

Otherwise both flags should be false. Always report your best-read count regardless.

# OUTPUT

Output ONE JSON object with the exact form:
{"rows": [{"n": <card_number>, "p": <played_qty_LEFTMOST_column>, "t": <total_qty_SECOND_column>, "p_unclear": <bool>, "t_unclear": <bool>}, ...]}

Include EVERY expected card number. Use lowercase keys exactly. No other text outside the JSON.`

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
): Promise<WholeTableResult[]> {
  const sortedCards = [...cards].sort((a, b) => Number(a.number) - Number(b.number))
  const nameList = sortedCards
    .map((c) => `  #${String(c.number).padStart(3)} ${c.name}${c.subtitle ? ` — ${c.subtitle}` : ''}`)
    .join('\n')
  const userText = `Table: ${tableName}\nExpected cards in this table:\n${nameList}\n\nOutput JSON for ALL of these card numbers in numerical order, including unclear flags.`

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

  const text = response.content?.[0]?.text || ''
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
  const rows = parsed.rows || []
  return rows.map((row: any) => ({
    cardNumber: Number(row.n),
    poolQty: Number(row.t || 0),
    deckQty: Number(row.p || 0),
    poolUnclear: Boolean(row.t_unclear),
    deckUnclear: Boolean(row.p_unclear),
  }))
}

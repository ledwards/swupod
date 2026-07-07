#!/usr/bin/env npx tsx
/**
 * Monotonic @ts-nocheck ratchet (U6, foundations hardening plan).
 *
 * Counts files carrying `@ts-nocheck` across the repo's TS/TSX sources and
 * compares against the committed baseline (.ts-nocheck-baseline):
 *
 * - any @ts-nocheck file NOT in the baseline → FAIL naming it (even if the
 *   total count is unchanged — a new file can't hide behind a removal).
 * - count < baseline → FAIL with "lower the baseline" (forces the win to be
 *   committed so the ratchet can never silently loosen again).
 * - exact match → PASS.
 *
 * Ratchet v2 (N2, 2026-07-07 arch refresh): `--update` is MONOTONIC — it only
 * accepts removals. Adding a file requires the explicit escape hatch
 *   RATCHET_ALLOW_NEW=1 npx tsx scripts/check-ts-nocheck.ts --update --reason "why"
 * which permanently records the date/files/reason in the baseline header.
 *
 * Update the baseline after removing headers:
 *   npx tsx scripts/check-ts-nocheck.ts --update
 *
 * The counting logic is exported for unit tests (scripts/check-ts-nocheck.test.ts).
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = join(__dirname, '..')
export const BASELINE_PATH = join(REPO_ROOT, '.ts-nocheck-baseline')

const SCAN_DIRS = ['app', 'src', 'lib', 'scripts', 'tests', 'migrations']
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'test-results', 'playwright-report'])

export function listSourceFiles(root: string = REPO_ROOT): string[] {
  const files: string[] = []
  const walk = (dir: string): void => {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry)) continue
      const full = join(dir, entry)
      const stats = statSync(full)
      if (stats.isDirectory()) {
        walk(full)
      } else if (/\.(ts|tsx)$/.test(entry)) {
        files.push(full)
      }
    }
  }
  for (const dir of SCAN_DIRS) {
    walk(join(root, dir))
  }
  // Root-level ts files (server.ts, middleware.ts, playwright.config.ts, ...)
  for (const entry of readdirSync(root)) {
    if (/\.(ts|tsx)$/.test(entry)) {
      files.push(join(root, entry))
    }
  }
  return files.sort()
}

export function hasTsNocheck(source: string): boolean {
  return /^\s*\/\/\s*@ts-nocheck/m.test(source)
}

export function countNocheckFiles(root: string = REPO_ROOT): { count: number; files: string[] } {
  const offenders: string[] = []
  for (const file of listSourceFiles(root)) {
    if (hasTsNocheck(readFileSync(file, 'utf8'))) {
      offenders.push(relative(root, file))
    }
  }
  return { count: offenders.length, files: offenders }
}

export interface Baseline {
  count: number
  files: Set<string>
  /** Audit trail of RATCHET_ALLOW_NEW escapes (`# `-prefixed lines in the file). */
  header: string[]
}

/**
 * Baseline format: first line is the count, then optional `# `-prefixed
 * header lines (the audit trail of RATCHET_ALLOW_NEW escapes), then the file
 * list (so a violation can name exactly the NEW files, not all 550+).
 */
export function parseBaseline(raw: string, path: string = BASELINE_PATH): Baseline {
  const lines = raw.trim().split('\n')
  const value = Number.parseInt(lines[0] ?? '', 10)
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid baseline in ${path}: ${JSON.stringify(lines[0])}`)
  }
  const header: string[] = []
  const files = new Set<string>()
  for (const line of lines.slice(1)) {
    if (line.startsWith('#')) {
      header.push(line.replace(/^#\s?/, ''))
    } else if (line.trim() !== '') {
      files.add(line)
    }
  }
  return { count: value, files, header }
}

export function readBaseline(path: string = BASELINE_PATH): Baseline {
  return parseBaseline(readFileSync(path, 'utf8'), path)
}

export function formatBaseline(files: string[], header: string[]): string {
  const sorted = [...files].sort()
  const headerLines = header.map((line) => `# ${line}`)
  return [`${sorted.length}`, ...headerLines, ...sorted].join('\n') + '\n'
}

export interface RatchetResult {
  ok: boolean
  message: string
}

export function evaluateRatchet(count: number, baseline: number, newFiles: string[] = []): RatchetResult {
  if (count > baseline) {
    return {
      ok: false,
      message:
        `❌ @ts-nocheck ratchet FAILED: ${count} files carry @ts-nocheck, baseline is ${baseline}.\n` +
        `New TypeScript files must typecheck — do not add @ts-nocheck.\n` +
        (newFiles.length > 0 ? `Offending files (not in baseline run):\n  ${newFiles.join('\n  ')}` : ''),
    }
  }
  if (count < baseline) {
    return {
      ok: false,
      message:
        `❌ @ts-nocheck count (${count}) is BELOW the baseline (${baseline}) — nice work!\n` +
        `Commit the win: run \`npx tsx scripts/check-ts-nocheck.ts --update\` and commit .ts-nocheck-baseline.`,
    }
  }
  return { ok: true, message: `✅ @ts-nocheck ratchet OK: ${count} files (baseline ${baseline}).` }
}

/**
 * Ratchet v2 (N2, arch refresh plan): file-list-aware evaluation. A file not
 * in the baseline fails even when the total count is unchanged, so a new
 * `@ts-nocheck` file can never hide behind a simultaneous removal.
 */
export function evaluateRatchetFiles(currentFiles: string[], baseline: Baseline): RatchetResult {
  const newFiles = currentFiles.filter((file) => !baseline.files.has(file))
  if (newFiles.length > 0) {
    return {
      ok: false,
      message:
        `❌ @ts-nocheck ratchet FAILED: ${newFiles.length} file(s) carry @ts-nocheck but are not in the baseline.\n` +
        `New TypeScript files must typecheck — do not add @ts-nocheck.\n` +
        `Offending files:\n  ${newFiles.join('\n  ')}`,
    }
  }
  if (currentFiles.length < baseline.count) {
    return {
      ok: false,
      message:
        `❌ @ts-nocheck count (${currentFiles.length}) is BELOW the baseline (${baseline.count}) — nice work!\n` +
        `Commit the win: run \`npx tsx scripts/check-ts-nocheck.ts --update\` and commit .ts-nocheck-baseline.`,
    }
  }
  return {
    ok: true,
    message: `✅ @ts-nocheck ratchet OK: ${currentFiles.length} files (baseline ${baseline.count}).`,
  }
}

export interface UpdateOptions {
  /** RATCHET_ALLOW_NEW=1 — the explicit escape hatch for adding files. */
  allowNew: boolean
  /** --reason "..." — required with allowNew; recorded in the baseline header. */
  reason?: string
  now?: Date
}

export interface UpdatePlan {
  ok: boolean
  message: string
  /** The new baseline file content — only present when ok. */
  content?: string
}

/**
 * Ratchet v2 (N2): `--update` is monotonic. Removals are always permitted;
 * additions are refused unless RATCHET_ALLOW_NEW=1 and a --reason are given,
 * in which case the escape is recorded permanently in the baseline header.
 */
export function planBaselineUpdate(
  currentFiles: string[],
  baseline: Baseline,
  options: UpdateOptions
): UpdatePlan {
  const additions = currentFiles.filter((file) => !baseline.files.has(file))
  const removals = [...baseline.files].filter((file) => !currentFiles.includes(file))

  if (additions.length > 0 && !options.allowNew) {
    return {
      ok: false,
      message:
        `❌ --update refused: it would ADD ${additions.length} file(s) to the @ts-nocheck baseline.\n` +
        `The baseline is monotonic — new files must ship typed. Remove @ts-nocheck from:\n` +
        `  ${additions.join('\n  ')}\n` +
        `If this addition is genuinely justified (e.g. vendored/generated code), run:\n` +
        `  RATCHET_ALLOW_NEW=1 npx tsx scripts/check-ts-nocheck.ts --update --reason "why"`,
    }
  }
  if (additions.length > 0 && !options.reason) {
    return {
      ok: false,
      message:
        `❌ --update refused: RATCHET_ALLOW_NEW=1 requires --reason "..." so the escape is recorded in the baseline header.`,
    }
  }

  const header = [...baseline.header]
  if (additions.length > 0) {
    const date = (options.now ?? new Date()).toISOString().slice(0, 10)
    header.push(`${date}: +${additions.length} (${additions.join(', ')}) — ${options.reason}`)
  }

  const parts: string[] = []
  if (additions.length > 0) parts.push(`+${additions.length} added (escape recorded)`)
  if (removals.length > 0) parts.push(`-${removals.length} removed`)
  return {
    ok: true,
    message: `Baseline updated: ${currentFiles.length} files${parts.length > 0 ? ` (${parts.join(', ')})` : ''}`,
    content: formatBaseline(currentFiles, header),
  }
}

function main(): void {
  const { count, files } = countNocheckFiles()

  if (process.argv.includes('--update')) {
    let baseline: Baseline
    try {
      baseline = readBaseline()
    } catch {
      // First-time creation: nothing to ratchet against yet.
      baseline = { count: 0, files: new Set(files), header: [] }
    }
    const reasonIndex = process.argv.indexOf('--reason')
    const plan = planBaselineUpdate(files, baseline, {
      allowNew: process.env['RATCHET_ALLOW_NEW'] === '1',
      reason: reasonIndex !== -1 ? process.argv[reasonIndex + 1] : undefined,
    })
    if (!plan.ok) {
      console.error(plan.message)
      process.exit(1)
    }
    writeFileSync(BASELINE_PATH, plan.content!)
    console.log(plan.message)
    return
  }

  if (process.argv.includes('--list')) {
    console.log(files.join('\n'))
    return
  }

  let baseline: Baseline
  try {
    baseline = readBaseline()
  } catch (err) {
    console.error(`❌ Could not read baseline (${BASELINE_PATH}): ${(err as Error).message}`)
    console.error('Create it with: npx tsx scripts/check-ts-nocheck.ts --update')
    process.exit(1)
  }

  const result = evaluateRatchetFiles(files, baseline)
  console.log(result.message)
  process.exit(result.ok ? 0 : 1)
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url)
if (isDirectRun) {
  main()
}

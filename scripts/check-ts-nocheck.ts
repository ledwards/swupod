#!/usr/bin/env npx tsx
/**
 * Monotonic @ts-nocheck ratchet (U6, foundations hardening plan).
 *
 * Counts files carrying `@ts-nocheck` across the repo's TS/TSX sources and
 * compares against the committed baseline (.ts-nocheck-baseline):
 *
 * - count > baseline → FAIL, listing the newly-opted-out files.
 * - count < baseline → FAIL with "lower the baseline" (forces the win to be
 *   committed so the ratchet can never silently loosen again).
 * - count = baseline → PASS.
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
}

/**
 * Baseline format: first line is the count, remaining lines are the file
 * list (so a violation can name exactly the NEW files, not all 550+).
 */
export function readBaseline(path: string = BASELINE_PATH): Baseline {
  const lines = readFileSync(path, 'utf8').trim().split('\n')
  const value = Number.parseInt(lines[0] ?? '', 10)
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid baseline in ${path}: ${JSON.stringify(lines[0])}`)
  }
  return { count: value, files: new Set(lines.slice(1)) }
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

function main(): void {
  const { count, files } = countNocheckFiles()

  if (process.argv.includes('--update')) {
    writeFileSync(BASELINE_PATH, `${count}\n${files.join('\n')}\n`)
    console.log(`Baseline updated: ${count}`)
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

  const newFiles = files.filter((file) => !baseline.files.has(file))
  const result = evaluateRatchet(count, baseline.count, count > baseline.count ? newFiles : [])
  console.log(result.message)
  process.exit(result.ok ? 0 : 1)
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url)
if (isDirectRun) {
  main()
}

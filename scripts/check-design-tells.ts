#!/usr/bin/env npx tsx
/**
 * Banned design tells checker (D2, 2026-07-07 design refresh plan).
 *
 * Scans component/app CSS for the drift classes DESIGN.md bans and compares
 * per-file counts against the committed baseline (.design-tells-baseline.json).
 * Same monotonic shape as the @ts-nocheck ratchet:
 *
 * - a file's count above its baseline (or a new file with violations) → FAIL,
 *   naming file/rule/lines.
 * - a file's count below its baseline → FAIL with "commit the win": run
 *   `npx tsx scripts/check-design-tells.ts --update`.
 * - `--update` only accepts decreases. There is no env escape — the escape is
 *   a same-line CSS comment of the form "design-ok: <reason>", which is
 *   visible in code review where it belongs.
 *
 * Rules:
 *   side-stripe     border-left/right Npx solid <color> accents (baseline 0)
 *   uppercase       text-transform: uppercase (Title-Case Rule)
 *   raw-hex         6/8-digit hex colors outside tokens.css (palette is code)
 *   bounce-easing   cubic-bezier with y outside [0,1] (no overshoot)
 *   gradient-fill   linear-gradient resting fills (Flat-At-Rest; Modal is baselined)
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = join(__dirname, '..')
export const BASELINE_PATH = join(REPO_ROOT, '.design-tells-baseline.json')

const SCAN_DIRS = ['src', 'app']
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'test-results', 'playwright-report'])
/** tokens.css is the one sanctioned home for hex values. */
const TOKEN_FILES = new Set(['src/styles/tokens.css'])

export interface Violation {
  rule: string
  line: number
  text: string
}

export interface RuleDef {
  id: string
  /** Returns the number of violations on one (comment-stripped) CSS line. */
  count: (line: string) => number
}

function isBounceBezier(line: string): number {
  let hits = 0
  const re = /cubic-bezier\(\s*([^)]+)\)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(line)) !== null) {
    const params = match[1]!.split(',').map((p) => Number.parseFloat(p.trim()))
    if (params.length === 4) {
      const [, y1, , y2] = params
      if (y1! < 0 || y1! > 1 || y2! < 0 || y2! > 1) hits++
    }
  }
  return hits
}

export const RULES: RuleDef[] = [
  {
    // ≥2px colored left/right borders — the accent-stripe idiom the June
    // critique removed (15 → 0). 1px white-alpha dividers are legitimate
    // borders, not stripes.
    id: 'side-stripe',
    count: (line) =>
      /border-(left|right)\s*:\s*([2-9](\.\d+)?|\d{2,}(\.\d+)?)px\s+solid\s+(?!transparent)/.test(line)
        ? 1
        : 0,
  },
  {
    id: 'uppercase',
    count: (line) => (/text-transform\s*:\s*uppercase/.test(line) ? 1 : 0),
  },
  {
    id: 'raw-hex',
    count: (line) => (line.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{8}\b/g) ?? []).length,
  },
  {
    id: 'bounce-easing',
    count: isBounceBezier,
  },
  {
    id: 'gradient-fill',
    count: (line) => (line.match(/linear-gradient\(/g) ?? []).length,
  },
]

/**
 * Blank out CSS comments while preserving line structure, and report which
 * lines carry a `design-ok:` escape (those lines are exempt from all rules).
 */
export function prepareCss(source: string): { lines: string[]; escaped: Set<number> } {
  const escaped = new Set<number>()
  const rawLines = source.split('\n')
  rawLines.forEach((line, index) => {
    if (line.includes('design-ok:')) escaped.add(index + 1)
  })

  const blanked = source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
  return { lines: blanked.split('\n'), escaped }
}

export function scanCss(source: string): Violation[] {
  const { lines, escaped } = prepareCss(source)
  const violations: Violation[] = []
  lines.forEach((line, index) => {
    const lineNo = index + 1
    if (escaped.has(lineNo)) return
    for (const rule of RULES) {
      const hits = rule.count(line)
      for (let i = 0; i < hits; i++) {
        violations.push({ rule: rule.id, line: lineNo, text: line.trim() })
      }
    }
  })
  return violations
}

export function listCssFiles(root: string = REPO_ROOT): string[] {
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
      if (statSync(full).isDirectory()) {
        walk(full)
      } else if (entry.endsWith('.css')) {
        files.push(full)
      }
    }
  }
  for (const dir of SCAN_DIRS) walk(join(root, dir))
  return files.sort()
}

/** rule id → file → count. Files/rules with zero counts are omitted. */
export type Baseline = Record<string, Record<string, number>>

export function scanTree(root: string = REPO_ROOT): { counts: Baseline; details: Map<string, Violation[]> } {
  const counts: Baseline = {}
  const details = new Map<string, Violation[]>()
  for (const file of listCssFiles(root)) {
    const rel = relative(root, file)
    if (TOKEN_FILES.has(rel)) continue
    const violations = scanCss(readFileSync(file, 'utf8'))
    if (violations.length > 0) details.set(rel, violations)
    for (const violation of violations) {
      counts[violation.rule] ??= {}
      counts[violation.rule]![rel] = (counts[violation.rule]![rel] ?? 0) + 1
    }
  }
  return { counts, details }
}

export interface CheckResult {
  ok: boolean
  messages: string[]
  regressions: number
  improvements: number
}

export function evaluate(current: Baseline, baseline: Baseline): CheckResult {
  const messages: string[] = []
  let regressions = 0
  let improvements = 0

  const ruleIds = new Set([...Object.keys(current), ...Object.keys(baseline)])
  for (const rule of ruleIds) {
    const files = new Set([
      ...Object.keys(current[rule] ?? {}),
      ...Object.keys(baseline[rule] ?? {}),
    ])
    for (const file of files) {
      const now = current[rule]?.[file] ?? 0
      const was = baseline[rule]?.[file] ?? 0
      if (now > was) {
        regressions++
        messages.push(
          `❌ [${rule}] ${file}: ${now} violation(s), baseline ${was}. New design debt is blocked — ` +
            `use tokens.css / the design system, or (only when genuinely justified) a same-line ` +
            `/* design-ok: <reason> */ escape.`
        )
      } else if (now < was) {
        improvements++
        messages.push(`⬇️  [${rule}] ${file}: ${now} violation(s), baseline ${was} — commit the win.`)
      }
    }
  }

  if (regressions > 0) {
    return { ok: false, messages, regressions, improvements }
  }
  if (improvements > 0) {
    messages.push(
      'Counts dropped below the baseline — run `npx tsx scripts/check-design-tells.ts --update` and commit .design-tells-baseline.json so the ratchet can never loosen again.'
    )
    return { ok: false, messages, regressions, improvements }
  }
  return { ok: true, messages: ['✅ design-tells OK: no file exceeds its baseline.'], regressions, improvements }
}

export interface UpdatePlan {
  ok: boolean
  message: string
  content?: string
}

/** `--update` is monotonic: it refuses to record any per-file increase. */
export function planUpdate(current: Baseline, baseline: Baseline): UpdatePlan {
  const increases: string[] = []
  for (const rule of Object.keys(current)) {
    for (const [file, now] of Object.entries(current[rule]!)) {
      const was = baseline[rule]?.[file] ?? 0
      if (now > was) increases.push(`[${rule}] ${file}: ${was} → ${now}`)
    }
  }
  if (increases.length > 0) {
    return {
      ok: false,
      message:
        `❌ --update refused: it would RAISE the design-tells baseline:\n  ${increases.join('\n  ')}\n` +
        `The baseline is monotonic. Fix the CSS (tokens.css, Title Case, flat fills) or use a same-line /* design-ok: <reason> */ escape.`,
    }
  }
  return {
    ok: true,
    message: 'Baseline updated.',
    content: JSON.stringify({ version: 1, rules: sortBaseline(current) }, null, 2) + '\n',
  }
}

function sortBaseline(baseline: Baseline): Baseline {
  const sorted: Baseline = {}
  for (const rule of Object.keys(baseline).sort()) {
    sorted[rule] = {}
    for (const file of Object.keys(baseline[rule]!).sort()) {
      sorted[rule]![file] = baseline[rule]![file]!
    }
  }
  return sorted
}

export function readBaseline(path: string = BASELINE_PATH): Baseline {
  const parsed = JSON.parse(readFileSync(path, 'utf8'))
  if (!parsed || typeof parsed !== 'object' || !parsed.rules) {
    throw new Error(`Invalid baseline at ${path}`)
  }
  return parsed.rules as Baseline
}

function main(): void {
  const { counts, details } = scanTree()

  if (process.argv.includes('--list')) {
    for (const [file, violations] of details) {
      for (const violation of violations) {
        console.log(`${file}:${violation.line} [${violation.rule}] ${violation.text}`)
      }
    }
    return
  }

  if (process.argv.includes('--update')) {
    let baseline: Baseline | null = null
    try {
      baseline = readBaseline()
    } catch {
      // First-time creation: nothing to ratchet against yet — record the
      // current counts as the initial baseline.
    }
    const plan = baseline === null
      ? {
          ok: true as const,
          message: 'Initial baseline created.',
          content: JSON.stringify({ version: 1, rules: sortBaseline(counts) }, null, 2) + '\n',
        }
      : planUpdate(counts, baseline)
    if (!plan.ok) {
      console.error(plan.message)
      process.exit(1)
    }
    writeFileSync(BASELINE_PATH, plan.content!)
    console.log(plan.message)
    return
  }

  let baseline: Baseline
  try {
    baseline = readBaseline()
  } catch (err) {
    console.error(`❌ Could not read baseline (${BASELINE_PATH}): ${(err as Error).message}`)
    console.error('Create it with: npx tsx scripts/check-design-tells.ts --update')
    process.exit(1)
  }

  const result = evaluate(counts, baseline)
  for (const message of result.messages) console.log(message)
  process.exit(result.ok ? 0 : 1)
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url)
if (isDirectRun) {
  main()
}

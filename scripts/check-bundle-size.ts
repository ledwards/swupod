#!/usr/bin/env npx tsx
/**
 * Bundle-size guard (U5, foundations hardening plan).
 *
 * Run AFTER `next build`. Walks the prerendered route HTML in
 * .next/server/app/ and collects every eagerly-loaded client chunk
 * (`/_next/static/chunks/*.js` script references = the route's first-load
 * JS). Two checks:
 *
 *   1. No single first-load chunk may exceed MAX_CHUNK_BYTES (2 MB).
 *      This is the structural backstop against re-importing the ~8 MB
 *      cards.json (or any comparable dataset) into client code — the card
 *      database chunk was 5.4 MB before U5.
 *   2. No route's total first-load JS may exceed MAX_ROUTE_TOTAL_BYTES.
 *
 * Lazily-loaded (dynamic-import) chunks are intentionally NOT counted —
 * they don't ship on first paint.
 *
 * Exported helpers are unit-tested in scripts/check-bundle-size.test.ts.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..')
const NEXT_DIR = join(REPO_ROOT, '.next')

/** Hard cap for any single eagerly-loaded client chunk. */
export const MAX_CHUNK_BYTES = 2 * 1024 * 1024 // 2 MB
/** Budget for a route's total first-load JS (uncompressed). */
export const MAX_ROUTE_TOTAL_BYTES = 3 * 1024 * 1024 // 3 MB

/**
 * KNOWN OVERWEIGHT ROUTE (temporary exemption, ratcheted):
 * /deckbuilder/build still embeds cards.json because src/components/
 * DeckBuilder.tsx imports getAllCards from src/utils/cardData directly, and
 * that file is mid-refactor in a parallel branch (plans/REFACTORING_PLAN.md)
 * — it could not be modified as part of U5. The exemption is NOT open-ended:
 * the route is capped at its current weight (7 MB), so it can only shrink.
 * Remove this entry when DeckBuilder switches to cardDataClient/cardCache.
 */
export const ROUTE_EXEMPTIONS: Record<string, { maxTotalBytes: number; reason: string }> = {
  '/deckbuilder/build': {
    maxTotalBytes: 7 * 1024 * 1024,
    reason: 'DeckBuilder.tsx imports cardData directly (frozen during parallel refactor)',
  },
}

export function extractChunkRefs(html: string): string[] {
  const refs = new Set<string>()
  const re = /\/_next\/(static\/chunks\/[A-Za-z0-9._\-/[\]%]+?\.js)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(html)) !== null) {
    refs.add(match[1])
  }
  return [...refs]
}

function walkHtmlFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...walkHtmlFiles(full))
    } else if (entry.endsWith('.html')) {
      out.push(full)
    }
  }
  return out
}

export interface RouteReport {
  route: string
  totalBytes: number
  chunks: Array<{ file: string; bytes: number }>
}

export function analyzeBuild(nextDir: string = NEXT_DIR): RouteReport[] {
  const appDir = join(nextDir, 'server', 'app')
  if (!existsSync(appDir)) {
    throw new Error(`No prerendered app output at ${appDir} — run \`next build\` first`)
  }

  const sizeCache = new Map<string, number>()
  const sizeOf = (chunkRel: string): number => {
    let size = sizeCache.get(chunkRel)
    if (size === undefined) {
      const full = join(nextDir, chunkRel)
      size = existsSync(full) ? statSync(full).size : 0
      sizeCache.set(chunkRel, size)
    }
    return size
  }

  const reports: RouteReport[] = []
  for (const htmlFile of walkHtmlFiles(appDir)) {
    const route = '/' + relative(appDir, htmlFile).replace(/\.html$/, '').replace(/(^|\/)index$/, '')
    const refs = extractChunkRefs(readFileSync(htmlFile, 'utf8'))
    const chunks = refs.map((file) => ({ file, bytes: sizeOf(file) }))
    reports.push({
      route: route || '/',
      totalBytes: chunks.reduce((sum, c) => sum + c.bytes, 0),
      chunks,
    })
  }
  return reports
}

export interface Violation {
  kind: 'chunk' | 'route-total'
  route: string
  detail: string
}

export function findViolations(
  reports: RouteReport[],
  maxChunkBytes: number = MAX_CHUNK_BYTES,
  maxRouteTotalBytes: number = MAX_ROUTE_TOTAL_BYTES
): Violation[] {
  const violations: Violation[] = []
  const flaggedChunks = new Set<string>()

  for (const report of reports) {
    const exemption = ROUTE_EXEMPTIONS[report.route]

    if (!exemption) {
      for (const chunk of report.chunks) {
        if (chunk.bytes > maxChunkBytes && !flaggedChunks.has(chunk.file)) {
          flaggedChunks.add(chunk.file)
          violations.push({
            kind: 'chunk',
            route: report.route,
            detail: `${chunk.file} is ${(chunk.bytes / 1024 / 1024).toFixed(2)} MB (limit ${(maxChunkBytes / 1024 / 1024).toFixed(2)} MB) — did a client module import src/utils/cardData (cards.json)? Use /api/cards + src/utils/cardDataClient or src/utils/cardSummary instead.`,
          })
        }
      }
    }

    const totalCap = exemption ? exemption.maxTotalBytes : maxRouteTotalBytes
    if (report.totalBytes > totalCap) {
      violations.push({
        kind: 'route-total',
        route: report.route,
        detail: `first-load JS is ${(report.totalBytes / 1024 / 1024).toFixed(2)} MB (budget ${(totalCap / 1024 / 1024).toFixed(2)} MB${exemption ? `, exempted: ${exemption.reason}` : ''})`,
      })
    }
  }
  return violations
}

function main(): void {
  const reports = analyzeBuild()
  if (reports.length === 0) {
    console.error('❌ Bundle guard: no prerendered routes found — was the build complete?')
    process.exit(1)
  }

  const worst = [...reports].sort((a, b) => b.totalBytes - a.totalBytes)[0]
  console.log(`Bundle guard: ${reports.length} routes analyzed; largest first-load: ${worst.route} at ${(worst.totalBytes / 1024 / 1024).toFixed(2)} MB`)

  const violations = findViolations(reports)
  if (violations.length > 0) {
    console.error(`❌ Bundle guard FAILED (${violations.length} violation(s)):`)
    for (const violation of violations) {
      console.error(`  [${violation.kind}] ${violation.route}: ${violation.detail}`)
    }
    process.exit(1)
  }

  console.log('✅ Bundle guard OK: no first-load chunk exceeds the caps.')
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url)
if (isDirectRun) {
  main()
}

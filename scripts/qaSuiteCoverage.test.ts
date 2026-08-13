/**
 * QA suite coverage guard.
 *
 * `npm run test` deliberately excludes `src/qa/**` (those suites are slow and
 * statistical), and `npm run qa` names each suite explicitly. That combination
 * means a new or renamed suite in src/qa can be committed and then never run by
 * anything — which is exactly what happened to foilDistribution.test.ts and
 * hyperspaceDistribution.test.ts. The latter sat with 3 failing assertions
 * (stale Sets 1-6 slot indices applied to LAW+ packs) until 2026-08-13.
 *
 * This test fails if any `src/qa/*.test.ts` is missing from the `qa` script.
 * Analysis scripts that make no assertions must NOT be named `*.test.ts`
 * (see src/qa/shuffleComparison.ts, src/qa/duplicateAnalysis.ts).
 */

import { test } from 'node:test'
import assert from 'node:assert'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')

test('SPEC: every src/qa/*.test.ts suite is wired into the `npm run qa` script', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  const qaScript: string = pkg.scripts?.qa ?? ''
  assert.ok(qaScript, 'package.json must define a `qa` script')

  const suites = readdirSync(join(ROOT, 'src/qa'))
    .filter(f => f.endsWith('.test.ts'))
    .sort()

  assert.ok(suites.length > 0, 'expected at least one QA suite in src/qa')

  const orphaned = suites.filter(f => !qaScript.includes(`src/qa/${f}`))

  assert.deepStrictEqual(
    orphaned,
    [],
    `QA suite(s) not referenced by the \`qa\` script and therefore never run: ${orphaned.join(', ')}. ` +
    `Add them to the "qa" script in package.json, or rename to drop the ".test.ts" suffix if the ` +
    `file is an analysis script with no assertions.`
  )
})

// Unit tests for the @ts-nocheck monotonic ratchet (U6 + ratchet v2, N2).
import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  evaluateRatchet,
  evaluateRatchetFiles,
  planBaselineUpdate,
  parseBaseline,
  hasTsNocheck,
  countNocheckFiles,
  readBaseline,
  type Baseline,
} from './check-ts-nocheck'

function makeBaseline(files: string[], header: string[] = []): Baseline {
  return { count: files.length, files: new Set(files), header }
}

describe('ts-nocheck ratchet', () => {
  describe('evaluateRatchet', () => {
    it('passes when count equals baseline', () => {
      const result = evaluateRatchet(10, 10)
      assert.strictEqual(result.ok, true)
    })

    it('fails when count exceeds baseline, naming the offenders', () => {
      const result = evaluateRatchet(11, 10, ['src/new-file.ts'])
      assert.strictEqual(result.ok, false)
      assert.match(result.message, /11 files/)
      assert.match(result.message, /src\/new-file\.ts/)
    })

    it('fails when count drops below baseline, demanding a baseline update', () => {
      const result = evaluateRatchet(9, 10)
      assert.strictEqual(result.ok, false)
      assert.match(result.message, /BELOW the baseline/)
      assert.match(result.message, /--update/)
    })
  })

  describe('hasTsNocheck', () => {
    it('detects the header comment in its common forms', () => {
      assert.strictEqual(hasTsNocheck('// @ts-nocheck\nconst x = 1'), true)
      assert.strictEqual(hasTsNocheck('// @ts-nocheck - Gradual migration\nlet y'), true)
      assert.strictEqual(hasTsNocheck("'use client'\n// @ts-nocheck\nlet z"), true)
    })

    it('does not flag files that merely mention the string in prose or code', () => {
      assert.strictEqual(hasTsNocheck("const s = 'has @ts-nocheck in a string'"), false)
      assert.strictEqual(hasTsNocheck('// the @ts-nocheck ratchet counts headers'), false)
    })
  })

  describe('evaluateRatchetFiles (ratchet v2 — file-list aware)', () => {
    it('passes when the current files exactly match the baseline', () => {
      const baseline = makeBaseline(['src/a.ts', 'src/b.ts'])
      const result = evaluateRatchetFiles(['src/a.ts', 'src/b.ts'], baseline)
      assert.strictEqual(result.ok, true)
    })

    it('fails on a NEW file even when the count is unchanged (swap detection)', () => {
      const baseline = makeBaseline(['src/a.ts', 'src/b.ts'])
      const result = evaluateRatchetFiles(['src/a.ts', 'src/new.ts'], baseline)
      assert.strictEqual(result.ok, false)
      assert.match(result.message, /src\/new\.ts/)
      assert.match(result.message, /must typecheck/)
    })

    it('fails when files were removed, demanding the win be committed via --update', () => {
      const baseline = makeBaseline(['src/a.ts', 'src/b.ts'])
      const result = evaluateRatchetFiles(['src/a.ts'], baseline)
      assert.strictEqual(result.ok, false)
      assert.match(result.message, /--update/)
    })
  })

  describe('planBaselineUpdate (ratchet v2 — monotonic --update)', () => {
    it('permits removals without any escape hatch', () => {
      const baseline = makeBaseline(['src/a.ts', 'src/b.ts'])
      const plan = planBaselineUpdate(['src/a.ts'], baseline, { allowNew: false })
      assert.strictEqual(plan.ok, true)
      assert.ok(plan.content !== undefined)
      const written = parseBaseline(plan.content!)
      assert.strictEqual(written.count, 1)
      assert.deepStrictEqual([...written.files], ['src/a.ts'])
    })

    it('REFUSES to add files without RATCHET_ALLOW_NEW=1', () => {
      const baseline = makeBaseline(['src/a.ts'])
      const plan = planBaselineUpdate(['src/a.ts', 'src/new.ts'], baseline, { allowNew: false })
      assert.strictEqual(plan.ok, false)
      assert.strictEqual(plan.content, undefined)
      assert.match(plan.message, /src\/new\.ts/)
      assert.match(plan.message, /RATCHET_ALLOW_NEW=1/)
    })

    it('refuses additions even when combined with removals (no net-zero laundering)', () => {
      const baseline = makeBaseline(['src/a.ts', 'src/b.ts'])
      const plan = planBaselineUpdate(['src/a.ts', 'src/new.ts'], baseline, { allowNew: false })
      assert.strictEqual(plan.ok, false)
      assert.match(plan.message, /src\/new\.ts/)
    })

    it('requires a --reason when RATCHET_ALLOW_NEW=1 is set', () => {
      const baseline = makeBaseline(['src/a.ts'])
      const plan = planBaselineUpdate(['src/a.ts', 'src/new.ts'], baseline, { allowNew: true })
      assert.strictEqual(plan.ok, false)
      assert.match(plan.message, /--reason/)
    })

    it('records the reason and the added files into the baseline header when escaped', () => {
      const baseline = makeBaseline(['src/a.ts'])
      const plan = planBaselineUpdate(['src/a.ts', 'src/new.ts'], baseline, {
        allowNew: true,
        reason: 'vendored generated code',
        now: new Date('2026-07-08T00:00:00Z'),
      })
      assert.strictEqual(plan.ok, true)
      const written = parseBaseline(plan.content!)
      assert.strictEqual(written.count, 2)
      assert.ok(written.files.has('src/new.ts'))
      const header = written.header.join('\n')
      assert.match(header, /2026-07-08/)
      assert.match(header, /vendored generated code/)
      assert.match(header, /src\/new\.ts/)
    })

    it('preserves prior header entries across subsequent updates', () => {
      const baseline: Baseline = {
        count: 2,
        files: new Set(['src/a.ts', 'src/new.ts']),
        header: ['2026-07-08: +1 (src/new.ts) — vendored generated code'],
      }
      const plan = planBaselineUpdate(['src/a.ts'], baseline, { allowNew: false })
      assert.strictEqual(plan.ok, true)
      const written = parseBaseline(plan.content!)
      assert.match(written.header.join('\n'), /vendored generated code/)
    })
  })

  describe('parseBaseline', () => {
    it('round-trips the legacy format (count + file list, no header)', () => {
      const parsed = parseBaseline('2\nsrc/a.ts\nsrc/b.ts\n')
      assert.strictEqual(parsed.count, 2)
      assert.deepStrictEqual([...parsed.files].sort(), ['src/a.ts', 'src/b.ts'])
      assert.deepStrictEqual(parsed.header, [])
    })

    it('skips # header lines when building the file set', () => {
      const parsed = parseBaseline('1\n# 2026-07-08: escape used\nsrc/a.ts\n')
      assert.strictEqual(parsed.count, 1)
      assert.deepStrictEqual([...parsed.files], ['src/a.ts'])
      assert.deepStrictEqual(parsed.header, ['2026-07-08: escape used'])
    })
  })

  describe('repo state', () => {
    it('current count matches the committed baseline (the actual ratchet)', () => {
      const { count } = countNocheckFiles()
      const baseline = readBaseline()
      assert.strictEqual(
        count,
        baseline.count,
        count > baseline.count
          ? `@ts-nocheck count (${count}) rose above the baseline (${baseline.count}) — remove the header from new files`
          : `@ts-nocheck count (${count}) fell below the baseline (${baseline.count}) — run: npx tsx scripts/check-ts-nocheck.ts --update`
      )
    })

    it('baseline carries the file list so violations name only NEW files', () => {
      const baseline = readBaseline()
      assert.strictEqual(baseline.files.size, baseline.count, 'one file entry per counted file')
    })
  })
})

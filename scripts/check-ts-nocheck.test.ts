// Unit tests for the @ts-nocheck monotonic ratchet (U6).
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { evaluateRatchet, hasTsNocheck, countNocheckFiles, readBaseline } from './check-ts-nocheck'

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

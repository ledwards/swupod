// @ts-nocheck
/**
 * Smoke tests for the OMR sidecar wrapper.
 *
 * These tests don't make real API calls — they verify the sidecar
 * spawn/parse logic and the prompt-construction logic. End-to-end
 * verification is done in scripts/test-omr-integration.ts (live).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as path from 'path'
import { runOmrSidecar } from './omrExtraction'

const FIXTURES_DIR = path.join(process.cwd(), 'scripts', 'eval', 'fixtures')

test('runOmrSidecar returns 10 tables for sq-tom-law', async () => {
  const photo1 = fs.readFileSync(path.join(FIXTURES_DIR, 'sq-tom-law', 'photo1.jpg'))
  const photo2 = fs.readFileSync(path.join(FIXTURES_DIR, 'sq-tom-law', 'photo2.jpg'))
  const result = await runOmrSidecar([photo1, photo2])
  assert.equal(result.warnings.length, 0, 'no warnings')
  assert.equal(result.tables.length, 10, 'expected 10 tables (4 page-1 + 6 page-2)')
  // Verify all expected tables are present
  const expected = [
    'Leaders', 'Bases', 'Vigilance', 'Command',
    'Aggression', 'Cunning', 'Multicolor',
    'Villainy', 'Heroism', 'NoAspect',
  ]
  const found = new Set(result.tables.map((t) => t.name))
  for (const tn of expected) {
    assert.ok(found.has(tn), `expected table ${tn} not found`)
  }
})

test('runOmrSidecar bounds + image_b64 are sensible', async () => {
  const photo1 = fs.readFileSync(path.join(FIXTURES_DIR, 'sq-tom-law', 'photo1.jpg'))
  const result = await runOmrSidecar([photo1])
  assert.ok(result.tables.length >= 4, 'page 1 should have at least 4 tables')
  for (const t of result.tables) {
    assert.ok(t.bounds_canonical.w > 0 && t.bounds_canonical.h > 0, `canonical bounds positive for ${t.name}`)
    assert.ok(t.image_b64.length > 1000, `non-trivial image_b64 for ${t.name}`)
    assert.ok(t.canonical_size[0] > 0 && t.canonical_size[1] > 0, `canonical_size set for ${t.name}`)
    assert.ok(t.page === 1 || t.page === 2, `page is 1 or 2 for ${t.name}`)
    // bounds_original normalized [0,1]
    const bo = t.bounds_original
    assert.ok(bo.x0 >= 0 && bo.x0 <= 1, `bounds_original.x0 in [0,1] for ${t.name}`)
    assert.ok(bo.x1 > bo.x0 && bo.x1 <= 1, `bounds_original.x1 > x0 and <= 1 for ${t.name}`)
    assert.ok(bo.y0 >= 0 && bo.y0 <= 1, `bounds_original.y0 in [0,1] for ${t.name}`)
    assert.ok(bo.y1 > bo.y0 && bo.y1 <= 1, `bounds_original.y1 > y0 and <= 1 for ${t.name}`)
    assert.ok(t.original_size[0] > 0 && t.original_size[1] > 0, `original_size set for ${t.name}`)
  }
})

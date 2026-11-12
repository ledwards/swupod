/**
 * Guard: the Import Pool pipeline picks models in ONE place.
 *
 * SPEC: every Claude call in the import path names its model through
 * importModel('<operation>') (importModels.ts) and goes through the one
 * client from lib/anthropic.ts getImportClient(). A call site that names a
 * model literal, reads IMPORT_EXTRACT_MODEL itself, or builds its own
 * Anthropic client fails here.
 *
 * Before 2026-11-12 the model was copied into three files and
 * lib/importSection.ts built its own client — a copy once silently pinned
 * Phase 2 to opus while Phase 1 was being A/B'd.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as path from 'path'
import { importModel, IMPORT_MODEL_DEFAULTS } from './importModels'

const ROOT = process.cwd()
const MODELS_FILE = 'src/services/importPool/importModels.ts'
const CLIENT_FILE = 'lib/anthropic.ts'

function walk(dir: string): string[] {
  const abs = path.join(ROOT, dir)
  if (!fs.existsSync(abs)) return []
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name)
    if (e.isDirectory()) return walk(rel)
    return /\.(ts|tsx|js|mjs)$/.test(e.name) && !/\.test\./.test(e.name) ? [rel] : []
  })
}

const IMPORT_FILES = [
  ...walk('src/services/importPool'),
  ...walk('app/api/import'),
  ...fs
    .readdirSync(path.join(ROOT, 'lib'))
    .filter((f) => f === 'anthropic.ts' || /^import.*\.ts$/.test(f))
    .filter((f) => !/\.test\./.test(f))
    .map((f) => path.join('lib', f)),
]

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

test('the guard actually scans the import call sites', () => {
  for (const f of [CLIENT_FILE, 'lib/importSection.ts', 'src/services/importPool/omrExtraction.ts', 'src/services/importPool/sectionExtraction.ts']) {
    assert.ok(IMPORT_FILES.includes(f), `${f} must be in the scanned set`)
  }
})

test('no import call site names a Claude model literal', () => {
  const offenders: string[] = []
  for (const f of IMPORT_FILES) {
    if (f === MODELS_FILE) continue
    read(f)
      .split('\n')
      .forEach((line, i) => {
        if (/['"`]claude-[a-z]+-\d/.test(line)) offenders.push(`${f}:${i + 1}: ${line.trim()}`)
      })
  }
  assert.deepEqual(offenders, [], 'route the model through importModel() in importModels.ts')
})

test('every model: field in the import path comes from importModel()', () => {
  const offenders: string[] = []
  for (const f of IMPORT_FILES) {
    read(f)
      .split('\n')
      .forEach((line, i) => {
        if (/^\s*model:\s/.test(line) && !/model:\s*importModel\(/.test(line)) {
          offenders.push(`${f}:${i + 1}: ${line.trim()}`)
        }
      })
  }
  assert.deepEqual(offenders, [])
})

test('only importModels.ts reads the model env vars', () => {
  const offenders = IMPORT_FILES.filter((f) => f !== MODELS_FILE && /IMPORT_\w*MODEL/.test(read(f)))
  assert.deepEqual(offenders, [])
})

test('only lib/anthropic.ts builds an Anthropic client', () => {
  const offenders = IMPORT_FILES.filter((f) => f !== CLIENT_FILE && /new\s+Anthropic\s*\(/.test(read(f)))
  assert.deepEqual(offenders, [], 'use getImportClient() from lib/anthropic.ts')
})

test('per-operation env override beats the global one, which beats the default', () => {
  const saved = { ...process.env }
  try {
    delete process.env.IMPORT_EXTRACT_MODEL
    delete process.env.IMPORT_OMR_MODEL
    assert.equal(importModel('omr'), IMPORT_MODEL_DEFAULTS.omr)
    process.env.IMPORT_EXTRACT_MODEL = 'global-model'
    assert.equal(importModel('omr'), 'global-model')
    process.env.IMPORT_OMR_MODEL = 'omr-model'
    assert.equal(importModel('omr'), 'omr-model')
    assert.equal(importModel('phase1'), 'global-model', 'an op override touches only its op')
  } finally {
    process.env = saved
  }
})

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const read = (path: string) => readFileSync(join(__dirname, path), 'utf8')

describe('/qa alpha split', () => {
  const page = read('page.tsx')

  it('is a server component that gates the themed report on alpha access', () => {
    assert.doesNotMatch(page, /'use client'/)
    assert.match(page, /viewerHasAlphaAccess\(\)\)\s*\?\s*<QAReportPage\s*\/>\s*:\s*<QALegacy\s*\/>/)
  })

  it('stays public: no sign-in or admin redirect in the wrapper', () => {
    assert.doesNotMatch(page, /redirect|notFound|isAdmin|is_admin/)
  })

  it('keeps the legacy page intact for everyone else', () => {
    const legacy = read('QALegacy.tsx')
    assert.match(legacy, /^\/\/ @ts-nocheck\n'use client'/)
    assert.match(legacy, /export default function QAPage\(\)/)
    assert.match(legacy, /import '\.\/qa\.css'/)
  })

  it('the alpha report reads the same endpoints as the legacy page', () => {
    const dir = join(__dirname, '../../src/components/QAReport')
    const src = ['QASetReport.tsx', 'QAPacks.tsx', 'QADuplicates.tsx'].map((f) => readFileSync(join(dir, f), 'utf8')).join('\n')
    const hook = readFileSync(join(__dirname, '../../src/hooks/useQAResults.ts'), 'utf8')
    assert.match(src, /\/api\/stats\/generations\?/)
    assert.match(src, /\/api\/public\/pack-quality\?/)
    assert.match(src, /\/api\/stats\/packs\?/)
    assert.match(src, /duplicateStats\.json/)
    assert.match(hook, /'\/api\/stats\/qa'/)
  })
})

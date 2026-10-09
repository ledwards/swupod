import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { formatSharedReleaseNotes } from './releaseNotesFormat'

const source = `# Release Notes

## 10.08.2026

- **Review the leaders around your pod.** Draft logs now show drafted leaders.
- **Read both sides.** Enlarged previews.

## 10.01.2026 Part 2

### 🐞 Bug Fixes

- **The lobby lists Draft & Sealed Pods.** The heading now names both.

## 10.01.2026

### 🎨 UI Improvements

- **Homeworlds packs feature all three artworks.** Pack opening cycles.
`

describe('formatSharedReleaseNotes', () => {
  const out = formatSharedReleaseNotes(source)
  const headings = out.split('\n').filter(l => l.startsWith('## '))
  it('rewrites each section as a dated, titled heading the shared parser reads', () => {
    assert.deepEqual(headings, [
      '## 2026-10-08 · Review the leaders around your pod',
      '## 2026-10-01 · The lobby lists Draft & Sealed Pods (Part 2)',
      '## 2026-10-01 · Homeworlds packs feature all three artworks',
    ])
    for (const h of headings) assert.match(h, /^##\s+(\d{4}-\d{2}-\d{2})\s*(?:[·—–-]\s*)?(.*)$/)
  })
  it('keeps bullets and turns category sub-headings into bold lines', () => {
    assert.match(out, /\*\*🐞 Bug Fixes\*\*\n\n- \*\*The lobby lists/)
    assert.ok(!/^###/m.test(out))
    assert.ok(!/^# Release Notes/m.test(out))
  })
})

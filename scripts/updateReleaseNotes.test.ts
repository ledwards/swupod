import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildReleaseHeading,
  determineTargetHeading,
  formatReleaseDate,
  insertReleaseNotes,
} from './updateReleaseNotes'

test('formatReleaseDate uses MM.DD.YYYY', () => {
  assert.equal(formatReleaseDate(new Date('2026-04-23T12:00:00Z')), '04.23.2026')
})

test('determineTargetHeading reuses local unpushed section for same day', () => {
  const base = `# Release Notes\n\n## 04.23.2026\n\n### 🐛 Bug Fixes\n- Base release\n`
  const local = `# Release Notes\n\n## 04.23.2026 Part 2\n\n### 🎮 UI Improvements\n- Local unpushed release\n\n## 04.23.2026\n\n### 🐛 Bug Fixes\n- Base release\n`

  assert.equal(determineTargetHeading(local, base, '04.23.2026'), '## 04.23.2026 Part 2')
})

test('determineTargetHeading creates Part 2 after pushed same-day release', () => {
  const base = `# Release Notes\n\n## 04.23.2026\n\n### 🐛 Bug Fixes\n- Base release\n`
  const local = base

  assert.equal(determineTargetHeading(local, base, '04.23.2026'), '## 04.23.2026 Part 2')
})

test('insertReleaseNotes creates a new top section when needed', () => {
  const original = `# Release Notes\n\n## 04.22.2026\n\n### 🐛 Bug Fixes\n- Yesterday\n`
  const result = insertReleaseNotes(original, buildReleaseHeading('04.23.2026', 1), `### ✨ Limited Deckbuilder\n- Added mode\n`)

  assert.match(result, /^# Release Notes\n\n## 04\.23\.2026\n\n### ✨ Limited Deckbuilder\n- Added mode\n\n## 04\.22\.2026/m)
})

test('insertReleaseNotes appends into an existing section', () => {
  const original = `# Release Notes\n\n## 04.23.2026 Part 2\n\n### 🎮 UI Improvements\n- Existing item\n\n## 04.23.2026\n\n### 🐛 Bug Fixes\n- Earlier release\n`
  const result = insertReleaseNotes(original, '## 04.23.2026 Part 2', `### 🐛 Bug Fixes\n- Follow-up fix\n`)

  assert.match(result, /## 04\.23\.2026 Part 2[\s\S]*- Existing item[\s\S]*### 🐛 Bug Fixes\n- Follow-up fix[\s\S]*## 04\.23\.2026/)
})

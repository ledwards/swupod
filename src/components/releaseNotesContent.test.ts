import { describe, it } from 'node:test'
import assert from 'node:assert'
import { normalizeReleaseNotesContent } from './releaseNotesContent'

describe('normalizeReleaseNotesContent', () => {
  it('replaces the known protecthtepod.com typo with protectthepod.com', () => {
    const input = 'Visit https://www.protecthtepod.com/stats for analytics.'
    const output = normalizeReleaseNotesContent(input)

    assert.ok(output.includes('https://www.protectthepod.com/stats'))
    assert.ok(!output.includes('protecthtepod.com'))
  })
})

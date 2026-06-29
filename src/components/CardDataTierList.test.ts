import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const COMPONENT_SRC = readFileSync(join(__dirname, 'CardDataTierList.tsx'), 'utf8')
const FILTERS_SRC = readFileSync(join(__dirname, 'stats/TableFilters.tsx'), 'utf8')
const STATS_CSS = readFileSync(join(__dirname, '../../app/stats/stats.css'), 'utf8')

describe('<CardDataTierList /> controls', () => {
  it('opens on GP WR so the default tier list has a populated grade basis', () => {
    assert.match(COMPONENT_SRC, /useState<CardMetricKey>\(\s*['"]gpWr['"]\s*\)/)
  })

  it('derives GIH tiers from selected metric samples instead of trusting a missing backend grade', () => {
    assert.match(COMPONENT_SRC, /const inputs = rows\.map\(card => \(\{/)
    assert.doesNotMatch(COMPONENT_SRC, /metric === ['"]gihWr['"] && hasWayfinderReplayMetrics/)
  })

  it('puts Clear beside the Filter label instead of after the aspect icons', () => {
    assert.match(COMPONENT_SRC, /className=['"]card-data-filter-heading['"]/)
    assert.match(COMPONENT_SRC, /className=['"]card-data-filter-clear['"]/)
    assert.match(COMPONENT_SRC, /<AspectFilterButtons activeAspects=\{activeAspects\} toggleAspect=\{toggleAspect\} \/>/)
  })

  it('uses deckbuilder-sized aspect icons', () => {
    assert.match(FILTERS_SRC, /<AspectIcon aspect=\{aspect\} size=['"]lg['"] \/>/)
  })
})

describe('<CardDataTierList /> styling contracts', () => {
  it('sizes segmented controls to their buttons instead of stretching empty chrome', () => {
    assert.match(STATS_CSS, /width:\s*max-content;/)
    assert.match(STATS_CSS, /justify-self:\s*start;/)
  })

  it('uses full-bleed tier art with event and non-event crop positions', () => {
    assert.match(STATS_CSS, /background-size:\s*cover;/)
    assert.match(STATS_CSS, /background-position:\s*right 25%;/)
    assert.match(STATS_CSS, /\.card-data-tier-card-event\s*\{[\s\S]*?background-position:\s*right 86%;/)
  })
})

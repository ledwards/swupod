import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const COMPONENT_SRC = readFileSync(join(__dirname, 'CardDataTierList.tsx'), 'utf8')
const FILTERS_SRC = readFileSync(join(__dirname, 'stats/TableFilters.tsx'), 'utf8')
const MODAL_SRC = readFileSync(join(__dirname, 'Modal.tsx'), 'utf8')
const STATS_CSS = readFileSync(join(__dirname, '../../app/stats/stats.css'), 'utf8')

describe('<CardDataTierList /> controls', () => {
  it('grades deck cards from GIH only and does not render metric toggles', () => {
    assert.match(COMPONENT_SRC, /const GIH_GRADE_METRIC: CardMetricKey = ['"]gihWr['"]/)
    assert.match(COMPONENT_SRC, /const selectedMetric = isLeaderView \? LEADER_GRADE_METRIC : GIH_GRADE_METRIC/)
    assert.doesNotMatch(COMPONENT_SRC, /useState<CardMetricKey>/)
    assert.doesNotMatch(COMPONENT_SRC, /setSelectedMetric/)
    assert.doesNotMatch(COMPONENT_SRC, /aria-label=['"]Grade metric['"]/)
  })

  it('uses API-owned display grades instead of recomputing grade bands in React', () => {
    assert.doesNotMatch(COMPONENT_SRC, /computeCardGrades/)
    // Bucketed grades are API-owned too — the client selects a lens, it never grades.
    assert.doesNotMatch(COMPONENT_SRC, /computeBucketedCardGrades/)
    assert.doesNotMatch(COMPONENT_SRC, /gradeFromZScore/)
    assert.match(COMPONENT_SRC, /: card\.displayGrade \?\? card\.grade \?\? null/)
    assert.match(COMPONENT_SRC, /const schemeGrade = isBucketedScheme \? card\.gradesByScheme\?\.\[activeGradeScheme\] : null/)
    assert.match(COMPONENT_SRC, /groups\.get\(card\.displayGrade \|\| ['"]U['"]\)\?\.push\(card\)/)
    assert.doesNotMatch(COMPONENT_SRC, /const inputs = rows\.map\(card => \(\{/)
  })

  it('grades leaders against the whole pool because they carry no cost', () => {
    assert.match(COMPONENT_SRC, /const activeGradeScheme: CardGradeScheme = isLeaderView \? ['"]global['"] : gradeScheme/)
  })

  it('resets the bucket filter when the grading lens changes', () => {
    assert.match(COMPONENT_SRC, /useEffect\(\(\) => \{ setBucketFilter\(['"]all['"]\) \}, \[activeGradeScheme\]\)/)
  })

  it('shows all requested rates on tier-list cards', () => {
    assert.match(COMPONENT_SRC, /GIH: \$\{formatTierCardPct\(card\.gihWr\)\} · OH: \$\{formatTierCardPct\(card\.ohWr\)\} · GD: \$\{formatTierCardPct\(card\.gdWr\)\} · GP \$\{formatTierCardPct\(card\.gpWr\)\}/)
    assert.doesNotMatch(COMPONENT_SRC, /GIH: \$\{formatTierCardPct\(card\.gihWr\)\} \* OH:/)
  })

  it('normalizes card set numbers to the dot separator on tier cards', () => {
    assert.match(COMPONENT_SRC, /function formatCollectorNumber\(value: string \| null \| undefined\)/)
    assert.match(COMPONENT_SRC, /\[._-\]\(\[0-9\]\[A-Za-z0-9\]\*\)/)
    assert.match(COMPONENT_SRC, /return `\$\{match\[1\]!\.toUpperCase\(\)\}\.\$\{match\[2\]!\}`/)
    assert.match(COMPONENT_SRC, /const collectorNumber = formatCollectorNumber\(card\.collectorNumber\)/)
    assert.doesNotMatch(COMPONENT_SRC, /card\.collectorNumber \? <span>\{card\.collectorNumber\}<\/span>/)
  })

  it('treats leaders as a pure leader win-rate slice', () => {
    assert.match(COMPONENT_SRC, /const LEADER_GRADE_METRIC: CardMetricKey = ['"]gpWr['"]/)
    assert.match(COMPONENT_SRC, /if \(card\.isLeader\) \{[\s\S]*?Leader WR: \$\{formatTierCardPct\(card\.gpWr\)\}/)
    assert.match(COMPONENT_SRC, /const renderLeaderTable = \(\) => \(/)
    assert.match(COMPONENT_SRC, /Leader WR[\s\S]*?Win rate in games played with this leader/)
    assert.match(COMPONENT_SRC, /const metricStats = card\.isLeader \? \[[\s\S]*?label: ['"]Leader WR['"][\s\S]*?\] : \[/)
  })

  it('stacks title, subtitle, aspects, then footer stats on tier cards', () => {
    assert.match(COMPONENT_SRC, /card-data-tier-card-copy[\s\S]*?card-data-tier-card-title[\s\S]*?card-data-tier-card-subtitle[\s\S]*?card-data-tier-card-aspects[\s\S]*?card-data-tier-card-footer[\s\S]*?card-data-tier-card-metric/)
    const metricRule = STATS_CSS.match(/\.card-data-tier-card-metric\s*\{[\s\S]*?\n\}/)?.[0] || ''
    const printingRule = Array.from(STATS_CSS.matchAll(/\.card-data-tier-card-printing\s*\{[\s\S]*?\n\}/g))
      .map(match => match[0])
      .find(rule => /font-size:\s*0\.62rem;/.test(rule)) || ''
    assert.match(metricRule, /font-size:\s*0\.62rem;/)
    assert.match(printingRule, /font-size:\s*0\.62rem;/)
  })

  it('puts the modal grade in the meta row and format plus rarity in the right badge', () => {
    assert.match(COMPONENT_SRC, /className=['"]card-data-stats-modal-meta['"][\s\S]*?className=\{`card-grade/)
    assert.match(COMPONENT_SRC, /className=['"]card-data-stats-modal-context['"][\s\S]*?\{formatLabel\}[\s\S]*?<RarityIcon rarity=\{card\.rarity\}/)
    const contextRule = STATS_CSS.match(/\.card-data-stats-modal-context\s*\{[\s\S]*?\n\}/)?.[0] || ''
    assert.doesNotMatch(contextRule, /background:/)
    assert.doesNotMatch(contextRule, /border:/)
  })

  it('colors modal and tier grades on a shared red-to-green scale', () => {
    assert.match(COMPONENT_SRC, /function gradeClassSuffix\(grade: string\)/)
    assert.match(COMPONENT_SRC, /className=\{`card-data-tier-label card-grade-\$\{gradeClassSuffix\(grade\)\}`\}/)
    assert.match(COMPONENT_SRC, /className=\{`card-grade card-grade-\$\{gradeClassSuffix\(grade\)\}`\}/)
    assert.match(STATS_CSS, /\.card-grade-aplus,[\s\S]*?--grade-rgb:\s*88,\s*214,\s*128;/)
    assert.match(STATS_CSS, /\.card-grade-f,[\s\S]*?--grade-rgb:\s*165,\s*48,\s*64;/)
  })

  it('unlocks card stats from recorded Wayfinder activity or beta access', () => {
    assert.match(COMPONENT_SRC, /setHasBetaStatsAccess\(Boolean\(body\?\.data\?\.hasBetaAccess\)\)/)
    assert.match(COMPONENT_SRC, /const statsAccessGranted = hasRecordedGame \|\| hasBetaStatsAccess/)
    assert.match(COMPONENT_SRC, /const companionReady = hasBetaStatsAccess \|\| wayfinderDetected \|\| hasRecordedGame/)
    assert.match(COMPONENT_SRC, /const companionLoginReady = hasBetaStatsAccess \|\| pluginLoggedIn === true \|\| hasRecordedGame/)
    assert.match(COMPONENT_SRC, /const cardsUnlocked = !presenceLoading && \(hasBetaStatsAccess \|\| \(companionReady && companionLoginReady && hasRecordedGame\)\)/)
  })

  it('can scope card data to a specific user and link back to the meta tier list', () => {
    assert.match(COMPONENT_SRC, /userId\?: string \| null/)
    assert.match(COMPONENT_SRC, /if \(userId\) baseParams\.set\(['"]userId['"], userId\)/)
    assert.match(COMPONENT_SRC, /metaTierListHref\?: string \| null/)
    assert.match(COMPONENT_SRC, /className=['"]card-data-meta-link['"][^>]*>View meta tier list/)
  })

  it('prefers hyperspace art for tier-list card images', () => {
    assert.match(COMPONENT_SRC, /hyperspaceImageUrl\?: string \| null/)
    assert.match(COMPONENT_SRC, /card\.hyperspaceBackImageUrl \|\| card\.backImageUrl \|\| card\.hyperspaceImageUrl \|\| card\.imageUrl/)
    assert.match(COMPONENT_SRC, /card\.hyperspaceImageUrl \|\| card\.imageUrl \|\| card\.hyperspaceBackImageUrl \|\| card\.backImageUrl/)
  })

  it('shows the selected metric sample size beside low-sample warnings', () => {
    assert.match(COMPONENT_SRC, /const sampleWarningLabel = \(card: CardDataCard\) => \{/)
    assert.match(COMPONENT_SRC, /\$\{card\.sampleWarning\} · n=\$\{fmt\(Math\.round\(count\)\)\}/)
    assert.match(COMPONENT_SRC, /sampleWarningLabel=\{sampleWarningLabel\(selectedCard\)\}/)
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

  it('keeps the card stats modal centered and viewport-safe', () => {
    assert.match(MODAL_SRC, /createPortal\(modal,\s*document\.body\)/)
    assert.match(STATS_CSS, /\.modal-overlay:has\(\.card-data-stats-modal\)\s*\{[\s\S]*?align-items:\s*center;[\s\S]*?justify-content:\s*center;/)
    assert.match(STATS_CSS, /\.modal-content\.card-data-stats-modal\s*\{[\s\S]*?max-height:\s*min\(760px,\s*calc\(100dvh - 2rem\)\);[\s\S]*?overflow-y:\s*auto;/)
  })
})

describe('<CardDataTierList /> pick-preference grading', () => {
  it('recognizes pick-graded rows by gradePolicy, never recomputing grades client-side', () => {
    assert.match(COMPONENT_SRC, /card\.gradePolicy === ['"]pick-preference-bt['"] \|\| card\.gradePolicy === ['"]leader-pick-preference-pl['"]/)
  })

  it('labels the tier list with the pick-preference methodology when the API says so', () => {
    assert.match(COMPONENT_SRC, /cardData\?\.gradeMethodology === ['"]pick-preference['"]/)
    assert.match(COMPONENT_SRC, /Draft Pick Preference \(Plackett-Luce\)/)
    assert.match(COMPONENT_SRC, /Draft Pick Preference \(Bradley-Terry\)/)
  })

  it('shows pick metrics on tiles for pick-graded rows and keeps win rates as context', () => {
    assert.match(COMPONENT_SRC, /Pick: \$\{formatTierCardPct\(card\.pickRate\)\} · APR \$\{formatPickAta\(card\.ata\)\} · WR: \$\{formatTierCardPct\(card\.gpWr\)\}/)
    assert.match(COMPONENT_SRC, /Pick: \$\{formatTierCardPct\(card\.pickRate\)\} · ATA \$\{formatPickAta\(card\.ata\)\} · GIH: \$\{formatTierCardPct\(card\.gihWr\)\}/)
  })

  it('titles grade badges with the row-level grade basis so pick and win-rate grades read differently', () => {
    assert.match(COMPONENT_SRC, /title=\{`\$\{card\.gradeBasis \|\| activeMetricLabel\} grade`\}/)
  })

  it('surfaces provisional pick grades in the provisional note detection', () => {
    assert.match(COMPONENT_SRC, /\[card\.gradePolicy, card\.gradeStatus, card\.gradeStatusLabel, card\.sampleWarning\]\.filter\(Boolean\)\.join\(' '\)/)
  })

  it('documents the pick-preference metrics in the definitions panel', () => {
    assert.match(COMPONENT_SRC, /Pick Preference \(decides grades\)/)
    assert.match(COMPONENT_SRC, /showPickPreference=\{isPickMethodology\}/)
  })
})

'use client'

import Button from '@/src/components/Button'
import { SiteTitle } from '@/src/components/SiteTheme'
import { useStickyTab } from '@/src/hooks/useStickyTab'
import { useQAResults } from '@/src/hooks/useQAResults'
import { STATS_SET_ORDER } from '@/src/utils/statsSetTabs'
import { QAStatusBadge } from './QAStatusBadge'
import { QAOverall } from './QAOverall'
import { QASetReport, type QASetView } from './QASetReport'
import { QAMethodology } from './QAMethodology'
import '@/src/components/DeckBuilder/DeckStats/DeckStats.css'
import '@/src/components/Meta/meta.css'
import './qa-report.css'

// Same window as the legacy page: earlier packs predate position-based slot tracking.
const STATS_START = process.env['NEXT_PUBLIC_STATS_START_DATE'] || '2026-07-11'
const SET_TABS = ['Overall', ...STATS_SET_ORDER] as const
const VIEWS = ['quality', 'packs'] as const
const VIEW_LABELS: Record<QASetView, string> = { quality: 'Quality', packs: 'Packs' }

/**
 * The themed QA report (alpha), Meta's sibling: set tabs with Overall first,
 * a health strip, the checks for one set, and the methodology at the bottom.
 * Same data as the legacy page: /api/stats/qa, /api/public/pack-quality,
 * /api/stats/generations, /api/stats/packs and duplicateStats.json.
 */
export default function QAReportPage() {
  const [tab, setTab] = useStickyTab(SET_TABS, 'Overall')
  const [view, setView] = useStickyTab(VIEWS, 'quality', { url: false, storageKey: 'ptp:qa-report-view' })
  const { results, groups, loading } = useQAResults(STATS_SET_ORDER)
  const since = new Date(`${STATS_START}T00:00:00`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const groupFor = (code: string) => groups.find((g) => g.key === code)

  return (
    <div className="mstats-page qar-page">
      <SiteTitle subtitle={`Pack generation quality assurance, since ${since}`}>QA</SiteTitle>

      <div className="mstats-panel mstats-toolbar" role="toolbar" aria-label="QA filters">
        <div className="mstats-toggle-group" role="group" aria-label="Set">
          <span className="mstats-control-label">Set</span>
          {SET_TABS.map((code) => {
            const status = code === 'Overall' ? undefined : groupFor(code)?.status
            return (
              <Button key={code} variant="toggle" size="sm" active={code === tab} aria-pressed={code === tab} onClick={() => setTab(code)}>
                {code}
                {status === 'fail' && <span className="qar-tab-flag"><QAStatusBadge status="fail" /></span>}
              </Button>
            )
          })}
        </div>
      </div>

      {tab !== 'Overall' && (
        <div className="mstats-tabs" role="tablist" aria-label={`${tab} sections`}>
          {VIEWS.map((v) => (
            <Button key={v} variant="toggle" role="tab" aria-selected={view === v} active={view === v} onClick={() => setView(v)}>
              {VIEW_LABELS[v]}
            </Button>
          ))}
        </div>
      )}

      <div role={tab === 'Overall' ? undefined : 'tabpanel'} aria-label={tab === 'Overall' ? 'Overall' : `${tab} ${VIEW_LABELS[view]}`}>
        {tab === 'Overall'
          ? <QAOverall results={results} groups={groups} loading={loading} />
          : <QASetReport key={tab} setCode={tab} since={STATS_START} view={view} tests={groupFor(tab)} />}
      </div>

      <QAMethodology />
    </div>
  )
}

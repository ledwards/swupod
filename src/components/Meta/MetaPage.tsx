'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/src/contexts/AuthContext'
import { useStickyTab } from '@/src/hooks/useStickyTab'
import Button from '@/src/components/Button'
import { SiteTitle } from '@/src/components/SiteTheme'
import CardDataTierList from '@/src/components/CardDataTierList'
import { getDefaultStatsSetTab, getStatsSetTabs, isBetaSet } from '@/src/utils/statsSetTabs'
import MetaOverview from './MetaOverview'
import MetaDrafting from './MetaDrafting'
import MetaSealed from './MetaSealed'
import '@/src/components/YourStats/YourStats.css'
import '@/src/components/DeckBuilder/DeckStats/DeckStats.css'
import './meta.css'

const TABS = ['overview', 'ratings', 'drafting', 'sealed'] as const
type MetaTab = (typeof TABS)[number]
const TAB_LABELS: Record<MetaTab, string> = { overview: 'Overview', ratings: 'Card Ratings', drafting: 'Drafting', sealed: 'Sealed' }

// Pick and build data before this date predates position-based pick tracking.
const STATS_START = process.env['NEXT_PUBLIC_STATS_START_DATE'] || '2026-07-11'
const today = () => new Date().toISOString().slice(0, 10)

/**
 * The themed Meta page (alpha): Overview of what wins, 17Lands-style Card
 * Ratings, Drafting pick order and Sealed build rates, all for one set.
 */
export default function MetaPage() {
  const { user, isPatron } = useAuth() as {
    user: { id?: string; is_beta_tester?: boolean; is_admin?: boolean } | null
    isPatron?: boolean | null
  }
  const canSeeFullStats = Boolean(isPatron === true || user?.is_admin)
  const hasBetaSetAccess = Boolean(user?.is_beta_tester || user?.is_admin)
  const sets = useMemo(() => getStatsSetTabs(hasBetaSetAccess), [hasBetaSetAccess])
  const [setCode, setSetCode] = useState(() => getDefaultStatsSetTab(false))
  const pickedSet = useRef(false)
  const [format, setFormat] = useState<'draft' | 'sealed'>('draft')
  const [tab, setTab] = useStickyTab(TABS, 'overview')
  const userId: string | null = user?.id || null
  const until = useMemo(today, [])

  // Follow the newest set the viewer can see until they choose one.
  useEffect(() => {
    if (!pickedSet.current) setSetCode(getDefaultStatsSetTab(hasBetaSetAccess))
  }, [hasBetaSetAccess])

  const chooseSet = (code: string) => { pickedSet.current = true; setSetCode(code) }

  return (
    <div className="meta-page">
      <SiteTitle subtitle="What the field drafts, builds and wins with">Meta</SiteTitle>

      <div className="meta-panel meta-toolbar" role="toolbar" aria-label="Meta filters">
        <div className="meta-toggle-group" role="group" aria-label="Set">
          <span className="meta-control-label">Set</span>
          {sets.map((code) => (
            <Button key={code} variant="toggle" size="sm" active={code === setCode} aria-pressed={code === setCode} onClick={() => chooseSet(code)}>
              {code}{isBetaSet(code) && <span className="meta-beta">Beta</span>}
            </Button>
          ))}
        </div>
        {tab === 'overview' && (
          <div className="meta-toggle-group" role="group" aria-label="Format">
            <span className="meta-control-label">Format</span>
            {(['draft', 'sealed'] as const).map((f) => (
              <Button key={f} variant="toggle" size="sm" active={format === f} aria-pressed={format === f} onClick={() => setFormat(f)}>
                {f === 'draft' ? 'Draft' : 'Sealed'}
              </Button>
            ))}
          </div>
        )}
      </div>

      <div className="meta-tabs" role="tablist" aria-label="Meta sections">
        {TABS.map((t) => (
          <Button key={t} variant="toggle" role="tab" aria-selected={tab === t} active={tab === t} onClick={() => setTab(t)}>
            {TAB_LABELS[t]}
          </Button>
        ))}
      </div>

      <div role="tabpanel" aria-label={TAB_LABELS[tab]}>
        {tab === 'overview' && <MetaOverview setCode={setCode} poolType={format} userId={userId} />}
        {tab === 'ratings' && (
          <CardDataTierList
            key={setCode}
            setCode={setCode}
            startDate={STATS_START}
            endDate={until}
            title="Card Ratings"
            description="Win rates when a card is in the deck, in the opening hand, drawn later and in hand, graded against the set."
            allowTable
            defaultView="table"
            viewParamName="view"
          />
        )}
        {tab === 'drafting' && <MetaDrafting setCode={setCode} since={STATS_START} until={until} userId={userId} canSeeFullStats={canSeeFullStats} />}
        {tab === 'sealed' && <MetaSealed setCode={setCode} since={STATS_START} until={until} userId={userId} canSeeFullStats={canSeeFullStats} />}
      </div>
    </div>
  )
}

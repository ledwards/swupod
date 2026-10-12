/**
 * MetaPreview: the drawer's peek at the Meta tab. Friends of the Pod (and
 * admins) see the deck vs format average and the strongest and weakest deck
 * cards; everyone else sees the same preview blurred, with why and how to unlock.
 */

import { useMemo } from 'react'
import { useAuth } from '../../../contexts/AuthContext'
import { useCardMetaStats } from '../../../hooks/useCardMetaStats'
import { deckAverage, formatAverage, metaRows, MIN_META_SAMPLE, type MetaRow, type StatsCard } from '../../../services/deckStats'
import { GradeChip, MetaCardCell } from './MetaCardCell'
import { StatsPanel } from './StatsCharts'

export const META_LOCKED_NOTE = 'Meta stats are for Friends of the Pod. Support Protect the Pod to unlock card win rates and grades.'
const SHOWN = 3

function CardList({ title, rows }: { title: string; rows: MetaRow[] }) {
  return (
    <div className="meta-preview-list">
      <span className="meta-dim">{title}</span>
      {rows.map(row => (
        <div key={row.card.name} className="meta-preview-row">
          <MetaCardCell row={row} />
          <span className="meta-preview-score"><GradeChip grade={row.stats?.displayGrade} />{row.score!.toFixed(1)}</span>
        </div>
      ))}
    </div>
  )
}

export function MetaPreview({ deck, sideboard, setCode, shareId }: { deck: StatsCard[]; sideboard: StatsCard[]; setCode: string | null; shareId?: string | null | undefined }) {
  const { user, isPatron } = useAuth() as { user: { is_admin?: boolean } | null; isPatron: boolean | null }
  const unlocked = isPatron === true || user?.is_admin === true
  const state = useCardMetaStats(setCode)
  const rows = useMemo(() => metaRows(deck, sideboard, state.cards), [deck, sideboard, state.cards])
  // Only cards with enough games to trust make the strongest / weakest lists.
  const scored = rows.filter(row => row.inDeck && row.score != null && row.sample >= MIN_META_SAMPLE)
  const formatAvg = useMemo(() => formatAverage(state.cards), [state.cards])
  const deckAvg = deckAverage(rows)

  if (!setCode || state.error || (!state.loading && scored.length === 0)) return null
  if (state.loading) {
    return <StatsPanel label="Meta"><div aria-busy="true" aria-label="Meta stats"><span className="skeleton-line" style={{ height: 120, width: '100%' }} /></div></StatsPanel>
  }

  const preview = (
    <>
      <div className="deck-stats-kpis">
        <div className="deck-stats-kpi"><b>{deckAvg?.toFixed(1) ?? '—'}</b><span className="deck-stats-kpi-label">Deck Avg</span></div>
        <div className="deck-stats-kpi"><b>{formatAvg?.toFixed(1) ?? '—'}</b><span className="deck-stats-kpi-label">Format Avg</span></div>
        <div className="deck-stats-kpi"><b>{state.games?.toLocaleString() ?? '—'}</b><span className="deck-stats-kpi-label">Games</span></div>
      </div>
      <CardList title="Strongest in your deck" rows={scored.slice(0, SHOWN)} />
      <CardList title="Weakest in your deck" rows={scored.slice(-SHOWN).reverse()} />
    </>
  )

  return (
    <StatsPanel label="Meta">
      {unlocked ? (
        <>
          {preview}
          {shareId && <a className="btn btn--interactive btn--sm meta-preview-link" href={`/pools/${shareId}/deck/stats#meta`} target="_blank" rel="noopener">Open Meta</a>}
        </>
      ) : (
        <div className="meta-preview-locked">
          <div className="meta-preview-blur" aria-hidden="true">{preview}</div>
          <div className="meta-preview-cta">
            <p>{META_LOCKED_NOTE}</p>
            <a className="btn btn--primary btn--sm" href="/support-the-pod">Support the Pod</a>
          </div>
        </div>
      )}
    </StatsPanel>
  )
}

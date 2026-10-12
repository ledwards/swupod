/**
 * DeckStatsDrawer: live stats for the deck being built, against the whole pool.
 * A side drawer on desktop, a bottom sheet on phones. Opened from the header
 * Stats button.
 */

import { useState } from 'react'
import { Button } from '../../Button'
import { useDeckStats, type DeckStatsView } from '../../../hooks/useDeckStats'
import type { StatsCard } from '../../../services/deckStats'
import { AspectBars, CostCurve, KIND_LABELS, LabelChips, Legend, OverlayRow, StatsPanel } from './StatsCharts'
import { BaseSynergyTiles } from './BaseSynergyTiles'
import './DeckStats.css'

const KIND_FILL: Record<string, string> = { ground: '#c58b4e', space: '#6f8cff', event: '#b07cd8', upgrade: '#4fc3b0' }
const RARITY_FILL: Record<string, string> = { Common: '#999', Uncommon: '#4CAF50', Rare: '#2196F3', Legendary: '#FF9800', Special: '#9C27B0' }

export interface DeckStatsDrawerProps {
  open: boolean
  onClose: () => void
  cardPositions: Record<string, any>
  leaderCard: StatsCard | null
  baseCard: StatsCard | null
  setCode: string
  shareId?: string | null
  activeLabel: string | null
  onSelectLabel: (label: string | null) => void
}

/** "A, B, C +4 more" so a long list doesn't swamp the summary. */
function nameList(names: string[], shown = 3): string {
  const unique = [...new Set(names)]
  if (unique.length === 0) return 'none'
  const rest = unique.length - shown
  return unique.slice(0, shown).join(', ') + (rest > 0 ? ` +${rest} more` : '')
}

function Kpi({ value, of, label, note, tone }: { value: string | number; of?: number | undefined; label: string; note?: string | undefined; tone?: 'warn' | 'bomb' | undefined }) {
  return (
    <div className="deck-stats-kpi">
      <b className={tone ? `is-${tone}` : ''}>{value}{of !== undefined && <span>/{of}</span>}</b>
      <span className="deck-stats-kpi-label">{label}</span>
      {note && <small>{note}</small>}
    </div>
  )
}

export function DeckStatsDrawer({ open, onClose, cardPositions, leaderCard, baseCard, setCode, shareId, activeLabel, onSelectLabel }: DeckStatsDrawerProps) {
  const [view, setView] = useState<DeckStatsView>('deck')
  const [openAspect, setOpenAspect] = useState<string | null>(null)
  const stats = useDeckStats({ cardPositions, leaderCard, baseCard, setCode, view })
  if (!open) return null

  const primaryLabel = view === 'deck' ? 'Deck' : 'Sideboard'
  const { summary } = stats
  const kindMax = Math.max(1, ...stats.kinds.map(r => r.pool))
  const rarityMax = Math.max(1, ...stats.rarities.map(r => r.pool))
  const hasLeaderAndBase = !!leaderCard && !!baseCard
  const toggleLabel = (label: string) => onSelectLabel(activeLabel === label ? null : label)

  return (
    <aside className="deck-stats-drawer" aria-label="Deck stats">
      <div className="deck-stats-drawer-head">
        <h3>Stats</h3>
        <div className="deck-stats-view-toggle" role="group" aria-label="Show deck or sideboard">
          <Button variant="toggle" glowColor="blue" size="sm" active={view === 'deck'} aria-pressed={view === 'deck'} onClick={() => setView('deck')}>Deck</Button>
          <Button variant="toggle" glowColor="blue" size="sm" active={view === 'sideboard'} aria-pressed={view === 'sideboard'} onClick={() => setView('sideboard')}>Sideboard</Button>
        </div>
        <Button variant="icon" size="sm" aria-label="Close stats" onClick={onClose}>&times;</Button>
      </div>

      <div className="deck-stats-drawer-body">
        <StatsPanel label="Summary">
          <div className="deck-stats-kpis">
            <Kpi value={summary.deckCount} of={30} label="Cards" note={`${summary.poolCount} in pool`} />
            <Kpi value={summary.avgCost.toFixed(2)} label="Avg cost" note={`pool ${summary.poolAvgCost.toFixed(2)}`} />
            <Kpi value={summary.groundUnits} of={summary.spaceUnits} label="Ground / space" note={`${summary.groundUnits + summary.spaceUnits} units`} />
            <Kpi value={summary.turnOnePlays} of={summary.poolTurnOnePlays} label="T1 plays" note="cost ≤ 2 after penalty" />
            {stats.bombs && <Kpi value={stats.bombs.length} of={stats.poolBombs?.length ?? 0} label="Bombs" tone="bomb" note={nameList(stats.bombs)} />}
            {hasLeaderAndBase && <Kpi value={summary.penaltyCount} label="Penalty" tone={summary.penaltyCount ? 'warn' : undefined} note={nameList(summary.penaltyCards)} />}
          </div>
        </StatsPanel>

        <AspectBars
          rows={stats.aspects} primary={stats.primary} pool={stats.pool} primaryLabel={primaryLabel}
          openAspect={openAspect} onToggle={aspect => setOpenAspect(openAspect === aspect ? null : aspect)}
          showPenalty={view === 'deck' && hasLeaderAndBase}
        />

        <CostCurve buckets={stats.curve} primaryLabel={primaryLabel} />

        <StatsPanel label="Arena & type">
          <div className="deck-stats-rows">
            {stats.kinds.map(row => <OverlayRow key={row.key} label={KIND_LABELS[row.key]} primary={row.primary} pool={row.pool} max={kindMax} fill={KIND_FILL[row.key]} />)}
          </div>
          <Legend primaryLabel={primaryLabel} />
        </StatsPanel>

        <StatsPanel label="Rarity">
          <div className="deck-stats-rows">
            {stats.rarities.map(row => (
              <OverlayRow key={row.key} label={<><img className="deck-stats-rarity-icon" src={`/icons/rarity/${row.key.toLowerCase()}.svg`} alt="" />{row.key}</>}
                primary={row.primary} pool={row.pool} max={rarityMax} fill={RARITY_FILL[row.key]} />
            ))}
          </div>
          <Legend primaryLabel={primaryLabel} />
        </StatsPanel>

        <LabelChips label="Traits" rows={stats.traits} variant="trait" activeLabel={activeLabel} onSelect={toggleLabel} limit={16} />
        <LabelChips label="Keywords" rows={stats.keywords} variant="keyword" activeLabel={activeLabel} onSelect={toggleLabel} limit={14} />

        {stats.synergy && stats.synergySet && (
          <BaseSynergyTiles tiles={stats.synergy} setCode={stats.synergySet} currentBaseName={baseCard?.name} />
        )}
      </div>

      <div className="deck-stats-drawer-foot">
        <span>Updates as you edit</span>
        {shareId && <a className="btn btn--interactive btn--sm" href={`/pools/${shareId}/deck/stats`} target="_blank" rel="noopener">Full stats</a>}
      </div>
    </aside>
  )
}

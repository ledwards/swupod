/**
 * DeckStatsModules: every deck stats module, shared by the deckbuilder drawer
 * (one column) and the Build tab on the stats page (two columns).
 */

import { useState } from 'react'
import { Button } from '../../Button'
import type { DeckStats, DeckStatsView } from '../../../hooks/useDeckStats'
import type { StatsCard } from '../../../services/deckStats'
import { AspectBars, CostCurve, KIND_LABELS, LabelChips, Legend, OverlayRow, StatsPanel } from './StatsCharts'
import { BaseSynergyTiles } from './BaseSynergyTiles'
import './DeckStats.css'
import { KindLabel, RarityLabel } from '../../CardIcons'

const KIND_FILL: Record<string, string> = { ground: 'var(--pt-kind-ground)', space: 'var(--pt-kind-space)', event: 'var(--pt-kind-event)', upgrade: 'var(--pt-kind-upgrade)' }
const RARITY_FILL: Record<string, string> = { Common: 'var(--pt-rarity-common)', Uncommon: 'var(--pt-rarity-uncommon)', Rare: 'var(--pt-rarity-rare)', Legendary: 'var(--pt-rarity-legendary)', Special: 'var(--pt-rarity-special)' }

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

export function DeckStatsViewToggle({ view, onChange }: { view: DeckStatsView; onChange: (view: DeckStatsView) => void }) {
  return (
    <div className="deck-stats-view-toggle" role="group" aria-label="Show deck or sideboard">
      <Button variant="toggle" glowColor="blue" size="sm" active={view === 'deck'} aria-pressed={view === 'deck'} onClick={() => onChange('deck')}>Deck</Button>
      <Button variant="toggle" glowColor="blue" size="sm" active={view === 'sideboard'} aria-pressed={view === 'sideboard'} onClick={() => onChange('sideboard')}>Sideboard</Button>
    </div>
  )
}

export function DeckStatsModules({ stats, view, leaderCard, baseCard, layout, activeLabel = null, onSelectLabel }: {
  stats: DeckStats
  view: DeckStatsView
  leaderCard: StatsCard | null
  baseCard: StatsCard | null
  layout: 'drawer' | 'page'
  activeLabel?: string | null
  /** Omit where there's no card grid to highlight (the stats page); chips then render as plain counts. */
  onSelectLabel?: ((label: string | null) => void) | undefined
}) {
  const [openAspect, setOpenAspect] = useState<string | null>(null)
  const primaryLabel = view === 'deck' ? 'Deck' : 'Sideboard'
  const { summary } = stats
  const kindMax = Math.max(1, ...stats.kinds.map(r => r.pool))
  const rarityMax = Math.max(1, ...stats.rarities.map(r => r.pool))
  const hasLeaderAndBase = !!leaderCard && !!baseCard
  const toggleLabel = onSelectLabel ? (label: string) => onSelectLabel(activeLabel === label ? null : label) : undefined

  return (
    <div className={`deck-stats-modules deck-stats-modules--${layout}`}>
      <div className="deck-stats-span2">
        <StatsPanel label="Summary">
          <div className="deck-stats-kpis">
            <Kpi value={summary.deckCount} of={30} label="Cards" note={`${summary.poolCount} in pool`} />
            <Kpi value={summary.avgCost.toFixed(2)} label="Avg Cost" note={`pool ${summary.poolAvgCost.toFixed(2)}`} />
            <Kpi value={summary.groundUnits} of={summary.spaceUnits} label="Ground / Space" note={`${summary.groundUnits + summary.spaceUnits} units`} />
            <Kpi value={summary.turnOnePlays} of={summary.poolTurnOnePlays} label="T1 Plays" note="cost ≤ 2 after penalty" />
            {stats.bombs && <Kpi value={stats.bombs.length} of={stats.poolBombs?.length ?? 0} label="Bombs" tone="bomb" note={nameList(stats.bombs)} />}
            {hasLeaderAndBase && <Kpi value={summary.penaltyCount} label="Penalty" tone={summary.penaltyCount ? 'warn' : undefined} note={nameList(summary.penaltyCards)} />}
          </div>
        </StatsPanel>
      </div>

      <AspectBars
        rows={stats.aspects} primary={stats.primary} pool={stats.pool} primaryLabel={primaryLabel}
        openAspect={openAspect} onToggle={aspect => setOpenAspect(openAspect === aspect ? null : aspect)}
        showPenalty={view === 'deck' && hasLeaderAndBase}
      />

      <CostCurve buckets={stats.curve} primaryLabel={primaryLabel} />

      <StatsPanel label="Arena & Type">
        <div className="deck-stats-rows">
          {stats.kinds.map(row => <OverlayRow key={row.key} label={<KindLabel kind={row.key} label={KIND_LABELS[row.key]} />} primary={row.primary} pool={row.pool} max={kindMax} fill={KIND_FILL[row.key]} />)}
        </div>
        <Legend primaryLabel={primaryLabel} />
      </StatsPanel>

      <StatsPanel label="Rarity">
        <div className="deck-stats-rows">
          {stats.rarities.map(row => (
            <OverlayRow key={row.key} label={<RarityLabel rarity={row.key} />}
              primary={row.primary} pool={row.pool} max={rarityMax} fill={RARITY_FILL[row.key]} />
          ))}
        </div>
        <Legend primaryLabel={primaryLabel} />
      </StatsPanel>

      <LabelChips label="Traits" rows={stats.traits} variant="trait" activeLabel={activeLabel} onSelect={toggleLabel} limit={layout === 'page' ? 24 : 16} />
      <LabelChips label="Keywords" rows={stats.keywords} variant="keyword" activeLabel={activeLabel} onSelect={toggleLabel} limit={layout === 'page' ? 20 : 14} />

      {stats.synergy && stats.synergySet && (
        <div className="deck-stats-span2">
          <BaseSynergyTiles tiles={stats.synergy} setCode={stats.synergySet} currentBaseName={baseCard?.name} />
        </div>
      )}
    </div>
  )
}

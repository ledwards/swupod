'use client'

import { useMemo, useState } from 'react'
import { useStatsJson, statsUrl } from '@/src/hooks/useStatsJson'
import { useTableFilter } from '@/src/components/stats/TableFilters'
import { sortRows } from '@/src/services/meta/cardRatings'
import { LeaderTiles, type LeaderTile } from './LeaderTiles'
import { CardFilterBar } from './CardFilterBar'
import { CardArtList, type ArtListColumn } from './CardArtList'
import { CohortLegend, MetaEmpty, MetaPending, MetaSection, TopPlayersPitch, fmt, pct } from './MetaBits'

interface SelectionLeader { cardName: string; selectionRate: number; timesSelected: number; aspects: string[]; imageUrl: string | null; backImageUrl: string | null; hyperspaceBackImageUrl?: string | null }
interface InclusionCard {
  cardName: string; subtitle: string | null; rarity: string; cardType: string; cost: number | null; aspects: string[]; imageUrl: string | null; backImageUrl: string | null
  hyperspaceImageUrl?: string | null; hyperspaceBackImageUrl?: string | null
  inclusionRate: number; offAspectRate: number | null; avgCopiesPlayed: number; decksWithCard: number; poolsWithCard: number
}
type Row = InclusionCard & { topRate: number | null; topDelta: number | null }

export default function MetaSealed({ setCode, since, until, userId, canSeeFullStats }: {
  setCode: string; since: string; until: string; userId: string | null; canSeeFullStats: boolean
}) {
  const base = { setCode, since, until, poolType: 'sealed' }
  // Normalized: chosen ÷ pools that offered the leader, so rare leaders aren't buried.
  const leaderBase = { ...base, normalized: 'true' }
  const leaders = useStatsJson<{ leaders: SelectionLeader[] }>(statsUrl('/api/stats/leader-selection', leaderBase))
  const topLeaders = useStatsJson<{ leaders: SelectionLeader[] }>(canSeeFullStats ? statsUrl('/api/stats/leader-selection', { ...leaderBase, topPlayersOnly: 'true' }) : null)
  const youLeaders = useStatsJson<{ leaders: SelectionLeader[] }>(userId ? statsUrl('/api/stats/leader-selection', { ...leaderBase, userId }) : null)
  const cards = useStatsJson<{ cards: InclusionCard[]; totalPoolsWithDecks: number }>(statsUrl('/api/stats/deck-inclusion', base))
  const topCards = useStatsJson<{ cards: InclusionCard[] }>(canSeeFullStats ? statsUrl('/api/stats/deck-inclusion', { ...base, topPlayersOnly: 'true' }) : null)
  const filter = useTableFilter()
  const [sort, setSort] = useState<{ key: string; dir: 'ascending' | 'descending' }>({ key: 'inclusionRate', dir: 'descending' })

  const tiles: LeaderTile[] = useMemo(() => {
    const topMap = new Map((topLeaders.data?.leaders || []).map((l) => [l.cardName, l.selectionRate]))
    const youMap = new Map((youLeaders.data?.leaders || []).map((l) => [l.cardName, l.selectionRate]))
    return [...(leaders.data?.leaders || [])].sort((a, b) => b.selectionRate - a.selectionRate).map((l) => ({
      name: l.cardName,
      imageUrl: l.hyperspaceBackImageUrl || l.backImageUrl || l.imageUrl,
      aspects: l.aspects || [],
      value: l.selectionRate,
      top: topMap.get(l.cardName) ?? null,
      you: youMap.get(l.cardName) ?? null,
      detail: `${fmt(l.timesSelected)} decks`,
    }))
  }, [leaders.data, topLeaders.data, youLeaders.data])
  const tileMax = Math.max(10, ...tiles.flatMap((t) => [t.value ?? 0, t.top ?? 0, t.you ?? 0]))

  const showTop = canSeeFullStats && Boolean(topCards.data)
  const rows: Row[] = useMemo(() => {
    const topMap = new Map((topCards.data?.cards || []).map((c) => [`${c.cardName}|${c.subtitle || ''}`, c.inclusionRate]))
    const joined = (cards.data?.cards || []).filter(filter.filterFn).map((c) => {
      const topRate = topMap.get(`${c.cardName}|${c.subtitle || ''}`) ?? null
      return { ...c, topRate, topDelta: topRate == null ? null : Math.round((topRate - c.inclusionRate) * 10) / 10 }
    })
    return sortRows(joined, (r) => r[sort.key as keyof Row] as number | null, sort.dir)
  }, [cards.data, topCards.data, filter.filterFn, sort])

  const columns: ArtListColumn<Row>[] = [
    {
      key: 'inclusionRate', label: 'Included', sortable: true, title: 'When the card is in a pool, how often it makes the deck',
      render: (r) => (
        <span className="mstats-inline-bar">
          <span className="mstats-track" aria-hidden="true">
            {r.topRate != null && <span className="mstats-track-ghost" style={{ width: `${r.inclusionRate}%` }} />}
            <span className="mstats-track-fill" style={{ width: `${r.topRate ?? r.inclusionRate}%` }} />
          </span>
          {pct(r.inclusionRate, 0)}
        </span>
      ),
    },
    ...(showTop ? [{ key: 'topDelta', label: 'Top vs All', sortable: true, render: (r: Row) => r.topDelta == null ? '–' : <span className={r.topDelta >= 0 ? 'mstats-up' : 'mstats-down'}>{r.topDelta >= 0 ? '+' : '−'}{Math.abs(r.topDelta).toFixed(1)} pts</span> }] : []),
    { key: 'offAspectRate', label: 'Off-Aspect', sortable: true, title: 'Of decks running it, how many play it out of aspect', render: (r) => pct(r.offAspectRate, 0) },
    { key: 'avgCopiesPlayed', label: 'Avg Copies', sortable: true, render: (r) => r.avgCopiesPlayed.toFixed(1) },
    { key: 'decksWithCard', label: '# Included', sortable: true, render: (r) => `${fmt(r.decksWithCard)} / ${fmt(r.poolsWithCard)}` },
  ]
  const onSort = (key: string) => setSort((s) => s.key === key ? { key, dir: s.dir === 'ascending' ? 'descending' : 'ascending' } : { key, dir: 'descending' })

  return (
    <div className="mstats-stack">
      <MetaSection
        title={`Leaders (${tiles.length})`}
        subtitle="How often each leader is chosen when a sealed pool offers it."
        actions={<CohortLegend showTop={canSeeFullStats && Boolean(topLeaders.data)} showYou={Boolean(youLeaders.data?.leaders?.length)} />}
      >
        {leaders.loading && !leaders.data ? <MetaPending kind="card" count={8} />
          : tiles.length ? <LeaderTiles tiles={tiles} max={tileMax} format={(n) => pct(n, 0)} />
          : <MetaEmpty>No sealed decks built for this set yet.</MetaEmpty>}
      </MetaSection>

      <MetaSection
        title={`Cards (${rows.length})`}
        subtitle="When a card is in a sealed pool, how often it makes the deck, how often it is splashed off-aspect, and how many copies go in."
        actions={<CardFilterBar filter={filter} />}
      >
        {cards.loading && !cards.data ? <MetaPending kind="row" count={10} /> : rows.length === 0 ? <MetaEmpty>No cards match.</MetaEmpty> : (
          <CardArtList label="Sealed card inclusion" rows={rows} columns={columns} sortKey={sort.key} sortDir={sort.dir} onSort={onSort} rowKey={(r) => `${r.cardName}|${r.subtitle || ''}`} />
        )}
        {cards.data && <div className="mstats-table-foot"><span>{fmt(cards.data.totalPoolsWithDecks)} sealed pools with a built deck</span></div>}
        {!canSeeFullStats && <TopPlayersPitch />}
      </MetaSection>
    </div>
  )
}

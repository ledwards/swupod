'use client'

import { useMemo, useState } from 'react'
import { useStatsJson, statsUrl } from '@/src/hooks/useStatsJson'
import { useTableFilter } from '@/src/components/stats/TableFilters'
import { buildPickCohortRows, type PickCohortRow, type PickSourceRow } from '@/src/services/meta/pickCohorts'
import { sortRows } from '@/src/services/meta/cardRatings'
import { LeaderTiles, type LeaderTile } from './LeaderTiles'
import { CardFilterBar } from './CardFilterBar'
import { CardArtList, type ArtListColumn } from './CardArtList'
import { CohortLegend, MetaEmpty, MetaPending, MetaSection, TopPlayersPitch, fmt, pct } from './MetaBits'

interface DraftPickCard extends PickSourceRow {
  rarity: string | null
  cardType: string | null
  cost: number | null
  aspects: string[]
  subtitle?: string | null
  imageUrl: string | null
  backImageUrl?: string | null
  hyperspaceImageUrl?: string | null
  hyperspaceBackImageUrl?: string | null
  firstPickPct: number | null
  timesPicked: number
}
interface DraftPicks { cards: DraftPickCard[]; totalDrafts: number; totalPicks: number }
type Row = PickCohortRow<DraftPickCard>

const PICKS_PER_PACK = 14

function useCohort(base: Record<string, string>, type: 'cards' | 'leaders', enabled: boolean) {
  return useStatsJson<DraftPicks>(enabled ? statsUrl('/api/stats/draft-picks', { ...base, builtDeckOnly: 'true', type: type === 'leaders' ? 'leaders' : null }) : null)
}

/** Where on the 1→14 pick scale each cohort takes a card. */
function PickDots({ row }: { row: Row }) {
  const x = (v: number) => `${((Math.min(Math.max(v, 1), PICKS_PER_PACK) - 1) / (PICKS_PER_PACK - 1)) * 100}%`
  return (
    <span className="mstats-dots" aria-label={`Everyone ${row.avgPickPosition?.toFixed(1)}${row.topAvgPick != null ? `, top players ${row.topAvgPick.toFixed(1)}` : ''}${row.youAvgPick != null ? `, you ${row.youAvgPick.toFixed(1)}` : ''}`}>
      <span className="mstats-dots-axis" />
      {row.avgPickPosition != null && <span className="mstats-dot mstats-dot--all" style={{ left: x(row.avgPickPosition) }} />}
      {row.topAvgPick != null && <span className="mstats-dot mstats-dot--top" style={{ left: x(row.topAvgPick) }} />}
      {row.youAvgPick != null && <span className="mstats-dot mstats-dot--you" style={{ left: x(row.youAvgPick) }} />}
    </span>
  )
}

function TopDelta({ delta }: { delta: number | null }) {
  if (delta == null) return <span className="mstats-muted">–</span>
  if (delta === 0) return <span className="mstats-muted">Same</span>
  return <span className={delta > 0 ? 'mstats-up' : 'mstats-down'}>{delta > 0 ? `${delta.toFixed(1)} earlier` : `${Math.abs(delta).toFixed(1)} later`}</span>
}

export default function MetaDrafting({ setCode, since, until, userId, canSeeFullStats }: {
  setCode: string; since: string; until: string; userId: string | null; canSeeFullStats: boolean
}) {
  const base = { setCode, since, until }
  const all = useCohort(base, 'cards', true)
  const allLeaders = useCohort(base, 'leaders', true)
  const top = useCohort({ ...base, topPlayersOnly: 'true' }, 'cards', canSeeFullStats)
  const topLeaders = useCohort({ ...base, topPlayersOnly: 'true' }, 'leaders', canSeeFullStats)
  const you = useCohort({ ...base, userId: userId || '' }, 'cards', Boolean(userId))
  const youLeaders = useCohort({ ...base, userId: userId || '' }, 'leaders', Boolean(userId))
  const filter = useTableFilter()
  const [sort, setSort] = useState<{ key: string; dir: 'ascending' | 'descending' }>({ key: 'avgPickPosition', dir: 'ascending' })

  const leaderTiles: LeaderTile[] = useMemo(() => {
    const topMap = new Map((topLeaders.data?.cards || []).map((c) => [c.cardName, c]))
    const youMap = new Map((youLeaders.data?.cards || []).map((c) => [c.cardName, c]))
    return [...(allLeaders.data?.cards || [])]
      .sort((a, b) => (b.firstPickPct ?? 0) - (a.firstPickPct ?? 0))
      .map((c) => ({
        name: c.cardName,
        imageUrl: c.hyperspaceBackImageUrl || c.backImageUrl || c.imageUrl,
        aspects: c.aspects || [],
        value: c.firstPickPct,
        top: topMap.get(c.cardName)?.firstPickPct ?? null,
        you: youMap.get(c.cardName)?.firstPickPct ?? null,
        detail: `Avg pick ${c.avgPickPosition?.toFixed(1) ?? '–'} · ${fmt(c.timesPicked)} drafted`,
      }))
  }, [allLeaders.data, topLeaders.data, youLeaders.data])
  const leaderMax = Math.max(10, ...leaderTiles.flatMap((t) => [t.value ?? 0, t.top ?? 0, t.you ?? 0]))

  const showTop = canSeeFullStats && Boolean(top.data)
  const showYou = Boolean(you.data?.cards?.length)

  const columns: ArtListColumn<Row>[] = [
    { key: 'avgPickPosition', label: 'Avg Pick', sortable: true, title: 'Average pick in a pack (1 = first)', render: (r) => r.avgPickPosition?.toFixed(1) ?? '–' },
    { key: 'dots', label: `Where It Goes (1–${PICKS_PER_PACK})`, render: (r) => <PickDots row={r} /> },
    { key: 'firstPickPct', label: '1st Pick', sortable: true, title: 'How often it is the first pick from a fresh pack', render: (r) => pct(r.firstPickPct) },
    ...(showTop ? [{ key: 'topDelta', label: 'Top vs All', sortable: true, title: 'How much earlier top players take it', render: (r: Row) => <TopDelta delta={r.topDelta} /> }] : []),
    { key: 'timesPicked', label: '# Drafted', sortable: true, render: (r) => fmt(r.timesPicked) },
  ]

  const rows = useMemo(() => {
    const joined = buildPickCohortRows(all.data?.cards || [], top.data?.cards, you.data?.cards).filter(filter.filterFn)
    return sortRows(joined, (r) => r[sort.key as keyof Row] as number | null, sort.dir)
  }, [all.data, top.data, you.data, filter.filterFn, sort])

  const onSort = (key: string) => setSort((s) => s.key === key
    ? { key, dir: s.dir === 'ascending' ? 'descending' : 'ascending' }
    : { key, dir: key === 'avgPickPosition' ? 'ascending' : 'descending' })

  return (
    <div className="mstats-stack">
      <MetaSection
        title={`Leaders (${leaderTiles.length})`}
        subtitle="How often each leader is taken first in the leader draft. The bar compares everyone, top players and you."
        actions={<CohortLegend showTop={showTop} showYou={Boolean(youLeaders.data?.cards?.length)} />}
      >
        {allLeaders.loading && !allLeaders.data ? <MetaPending kind="card" count={8} />
          : leaderTiles.length ? <LeaderTiles tiles={leaderTiles} max={leaderMax} format={(n) => pct(n, 0)} />
          : <MetaEmpty>No leader drafts recorded for this set yet.</MetaEmpty>}
      </MetaSection>

      <MetaSection
        title={`Cards (${rows.length})`}
        subtitle="Pick order across every draft. The dots show where everyone, top players and you take each card on the 1 to 14 pick scale."
        actions={<CardFilterBar filter={filter} />}
      >
        {all.loading && !all.data ? <MetaPending kind="row" count={10} /> : rows.length === 0 ? <MetaEmpty>No cards match.</MetaEmpty> : (
          <CardArtList label="Draft pick order" rows={rows} columns={columns} sortKey={sort.key} sortDir={sort.dir} onSort={onSort} rowKey={(r) => `${r.cardName}|${r.subtitle || ''}`} />
        )}
        <div className="mstats-table-foot">
          <CohortLegend showTop={showTop} showYou={showYou} />
          {all.data && <span>{fmt(all.data.totalDrafts)} drafts · {fmt(all.data.totalPicks)} picks · decks that were built</span>}
        </div>
        {!canSeeFullStats && <TopPlayersPitch />}
      </MetaSection>
    </div>
  )
}

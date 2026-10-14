'use client'

import { useMemo, useState } from 'react'
import { useStatsJson, statsUrl } from '@/src/hooks/useStatsJson'
import { useTableFilter } from '@/src/components/stats/TableFilters'
import { RarityLabel } from '@/src/components/CardIcons'
import { AspectIcon } from '@/src/components/AspectIcon'
import { buildPickCohortRows, type PickCohortRow, type PickSourceRow } from '@/src/services/meta/pickCohorts'
import { LeaderTiles, type LeaderTile } from './LeaderTiles'
import { CardFilterBar } from './CardFilterBar'
import { CohortLegend, MetaCardThumb, MetaEmpty, MetaPending, MetaSection, TopPlayersPitch, fmt, pct } from './MetaBits'

interface DraftPickCard extends PickSourceRow {
  rarity: string | null
  aspects: string[]
  subtitle?: string | null
  imageUrl: string | null
  backImageUrl?: string | null
  firstPickPct: number | null
  timesPicked: number
}
interface DraftPicks { cards: DraftPickCard[]; totalDrafts: number; totalPicks: number }

const PICKS_PER_PACK = 14
type SortKey = 'avgPickPosition' | 'firstPickPct' | 'topDelta' | 'timesPicked'
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'avgPickPosition', label: 'Avg Pick' },
  { key: 'firstPickPct', label: '1st Pick' },
  { key: 'topDelta', label: 'Top vs All' },
  { key: 'timesPicked', label: '# Drafted' },
]

function useCohort(base: Record<string, string>, type: 'cards' | 'leaders', enabled: boolean) {
  return useStatsJson<DraftPicks>(enabled ? statsUrl('/api/stats/draft-picks', { ...base, builtDeckOnly: 'true', type: type === 'leaders' ? 'leaders' : null }) : null)
}

/** Where on the 1→14 pick scale each cohort takes a card. */
function PickDots({ row }: { row: PickCohortRow<DraftPickCard> }) {
  const x = (v: number) => `${((Math.min(Math.max(v, 1), PICKS_PER_PACK) - 1) / (PICKS_PER_PACK - 1)) * 100}%`
  return (
    <span className="meta-dots" aria-label={`Everyone ${row.avgPickPosition?.toFixed(1)}${row.topAvgPick != null ? `, top players ${row.topAvgPick.toFixed(1)}` : ''}${row.youAvgPick != null ? `, you ${row.youAvgPick.toFixed(1)}` : ''}`}>
      <span className="meta-dots-axis" />
      {row.avgPickPosition != null && <span className="meta-dot meta-dot--all" style={{ left: x(row.avgPickPosition) }} />}
      {row.topAvgPick != null && <span className="meta-dot meta-dot--top" style={{ left: x(row.topAvgPick) }} />}
      {row.youAvgPick != null && <span className="meta-dot meta-dot--you" style={{ left: x(row.youAvgPick) }} />}
    </span>
  )
}

function TopDelta({ delta }: { delta: number | null }) {
  if (delta == null || delta === 0) return <span className="meta-muted">{delta === 0 ? 'Same' : '–'}</span>
  return <span className={delta > 0 ? 'meta-up' : 'meta-down'}>{delta > 0 ? `${delta.toFixed(1)} earlier` : `${Math.abs(delta).toFixed(1)} later`}</span>
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
  const [sortKey, setSortKey] = useState<SortKey>('avgPickPosition')

  const leaderTiles: LeaderTile[] = useMemo(() => {
    const topMap = new Map((topLeaders.data?.cards || []).map((c) => [c.cardName, c]))
    const youMap = new Map((youLeaders.data?.cards || []).map((c) => [c.cardName, c]))
    return [...(allLeaders.data?.cards || [])]
      .sort((a, b) => (b.firstPickPct ?? 0) - (a.firstPickPct ?? 0))
      .map((c) => ({
        name: c.cardName,
        imageUrl: c.backImageUrl || c.imageUrl,
        aspects: c.aspects || [],
        value: c.firstPickPct,
        top: topMap.get(c.cardName)?.firstPickPct ?? null,
        you: youMap.get(c.cardName)?.firstPickPct ?? null,
        detail: `Avg pick ${c.avgPickPosition?.toFixed(1) ?? '–'} · ${fmt(c.timesPicked)} drafted`,
      }))
  }, [allLeaders.data, topLeaders.data, youLeaders.data])
  const leaderMax = Math.max(10, ...leaderTiles.flatMap((t) => [t.value ?? 0, t.top ?? 0, t.you ?? 0]))

  const rows = useMemo(() => {
    const joined = buildPickCohortRows(all.data?.cards || [], top.data?.cards, you.data?.cards).filter(filter.filterFn)
    const dir = sortKey === 'avgPickPosition' ? 1 : -1
    return joined.sort((a, b) => dir * (((a[sortKey] as number | null) ?? (dir > 0 ? 99 : -99)) - ((b[sortKey] as number | null) ?? (dir > 0 ? 99 : -99))))
  }, [all.data, top.data, you.data, filter.filterFn, sortKey])

  const showTop = canSeeFullStats && Boolean(top.data)
  const showYou = Boolean(you.data?.cards?.length)

  return (
    <div className="meta-stack">
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
        <div className="meta-panel meta-table-wrap">
          {all.loading && !all.data ? <MetaPending kind="row" count={10} /> : rows.length === 0 ? <MetaEmpty>No cards match.</MetaEmpty> : (
            <table className="meta-table">
              <thead>
                <tr>
                  <th className="meta-l">Card</th>
                  <th className="meta-l">Aspects</th>
                  <th className="meta-l">Rarity</th>
                  {SORTS.slice(0, 1).map((s) => <SortTh key={s.key} sort={s} active={sortKey} onSort={setSortKey} />)}
                  <th className="meta-l">Where It Goes (1 → {PICKS_PER_PACK})</th>
                  {SORTS.slice(1).filter((s) => s.key !== 'topDelta' || showTop).map((s) => <SortTh key={s.key} sort={s} active={sortKey} onSort={setSortKey} />)}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.cardName}|${row.subtitle || ''}`}>
                    <td className="meta-l"><span className="meta-card-cell"><MetaCardThumb src={row.imageUrl} />{row.cardName}</span></td>
                    <td className="meta-l"><span className="meta-aspects">{(row.aspects || []).map((a) => <AspectIcon key={a} aspect={a} size="sm" />)}</span></td>
                    <td className="meta-l"><RarityLabel rarity={row.rarity} /></td>
                    <td>{row.avgPickPosition?.toFixed(1) ?? '–'}</td>
                    <td className="meta-l"><PickDots row={row} /></td>
                    <td>{pct(row.firstPickPct)}</td>
                    {showTop && <td><TopDelta delta={row.topDelta} /></td>}
                    <td>{fmt(row.timesPicked)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="meta-table-foot">
            <CohortLegend showTop={showTop} showYou={showYou} />
            {all.data && <span>{fmt(all.data.totalDrafts)} drafts · {fmt(all.data.totalPicks)} picks · decks that were built</span>}
          </div>
        </div>
        {!canSeeFullStats && <TopPlayersPitch />}
      </MetaSection>
    </div>
  )
}

function SortTh({ sort, active, onSort }: { sort: { key: SortKey; label: string }; active: SortKey; onSort: (k: SortKey) => void }) {
  const on = active === sort.key
  return (
    <th aria-sort={on ? (sort.key === 'avgPickPosition' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className={`meta-sort${on ? ' is-active' : ''}`} onClick={() => onSort(sort.key)}>{sort.label}</button>
    </th>
  )
}

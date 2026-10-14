'use client'

import { useMemo, useState } from 'react'
import { useStatsJson, statsUrl } from '@/src/hooks/useStatsJson'
import { useTableFilter } from '@/src/components/stats/TableFilters'
import { RarityLabel } from '@/src/components/CardIcons'
import { AspectIcon } from '@/src/components/AspectIcon'
import { LeaderTiles, type LeaderTile } from './LeaderTiles'
import { CardFilterBar } from './CardFilterBar'
import { CohortLegend, MetaCardThumb, MetaEmpty, MetaPending, MetaSection, TopPlayersPitch, fmt, pct } from './MetaBits'

interface SelectionLeader { cardName: string; selectionRate: number; timesSelected: number; aspects: string[]; imageUrl: string | null; backImageUrl: string | null }
interface InclusionCard {
  cardName: string; subtitle: string | null; rarity: string; aspects: string[]; imageUrl: string | null
  inclusionRate: number; offAspectRate: number | null; avgCopiesPlayed: number; decksWithCard: number; poolsWithCard: number
}
type SortKey = 'inclusionRate' | 'topDelta' | 'offAspectRate' | 'avgCopiesPlayed' | 'decksWithCard'
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'inclusionRate', label: 'Included' },
  { key: 'topDelta', label: 'Top vs All' },
  { key: 'offAspectRate', label: 'Off-Aspect' },
  { key: 'avgCopiesPlayed', label: 'Avg Copies' },
  { key: 'decksWithCard', label: '# Included' },
]

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
  const [sortKey, setSortKey] = useState<SortKey>('inclusionRate')

  const tiles: LeaderTile[] = useMemo(() => {
    const topMap = new Map((topLeaders.data?.leaders || []).map((l) => [l.cardName, l.selectionRate]))
    const youMap = new Map((youLeaders.data?.leaders || []).map((l) => [l.cardName, l.selectionRate]))
    return [...(leaders.data?.leaders || [])].sort((a, b) => b.selectionRate - a.selectionRate).map((l) => ({
      name: l.cardName,
      imageUrl: l.backImageUrl || l.imageUrl,
      aspects: l.aspects || [],
      value: l.selectionRate,
      top: topMap.get(l.cardName) ?? null,
      you: youMap.get(l.cardName) ?? null,
      detail: `${fmt(l.timesSelected)} decks`,
    }))
  }, [leaders.data, topLeaders.data, youLeaders.data])
  const tileMax = Math.max(10, ...tiles.flatMap((t) => [t.value ?? 0, t.top ?? 0, t.you ?? 0]))

  const rows = useMemo(() => {
    const topMap = new Map((topCards.data?.cards || []).map((c) => [`${c.cardName}|${c.subtitle || ''}`, c.inclusionRate]))
    return (cards.data?.cards || [])
      .filter(filter.filterFn)
      .map((c) => {
        const topRate = topMap.get(`${c.cardName}|${c.subtitle || ''}`)
        return { ...c, topRate: topRate ?? null, topDelta: topRate == null ? null : Math.round((topRate - c.inclusionRate) * 10) / 10 }
      })
      .sort((a, b) => ((b[sortKey] as number | null) ?? -999) - ((a[sortKey] as number | null) ?? -999))
  }, [cards.data, topCards.data, filter.filterFn, sortKey])

  const showTop = canSeeFullStats && Boolean(topCards.data)

  return (
    <div className="meta-stack">
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
        <div className="meta-panel meta-table-wrap">
          {cards.loading && !cards.data ? <MetaPending kind="row" count={10} /> : rows.length === 0 ? <MetaEmpty>No cards match.</MetaEmpty> : (
            <table className="meta-table">
              <thead>
                <tr>
                  <th className="meta-l">Card</th>
                  <th className="meta-l">Aspects</th>
                  <th className="meta-l">Rarity</th>
                  {SORTS.filter((s) => s.key !== 'topDelta' || showTop).map((s) => (
                    <th key={s.key} aria-sort={sortKey === s.key ? 'descending' : 'none'}>
                      <button type="button" className={`meta-sort${sortKey === s.key ? ' is-active' : ''}`} onClick={() => setSortKey(s.key)}>{s.label}</button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.cardName}|${row.subtitle || ''}`}>
                    <td className="meta-l"><span className="meta-card-cell"><MetaCardThumb src={row.imageUrl} />{row.cardName}</span></td>
                    <td className="meta-l"><span className="meta-aspects">{(row.aspects || []).map((a) => <AspectIcon key={a} aspect={a} size="sm" />)}</span></td>
                    <td className="meta-l"><RarityLabel rarity={row.rarity} /></td>
                    <td>
                      <span className="meta-inline-bar">
                        <span className="meta-track" aria-hidden="true">
                          {row.topRate != null && <span className="meta-track-ghost" style={{ width: `${row.inclusionRate}%` }} />}
                          <span className="meta-track-fill" style={{ width: `${row.topRate ?? row.inclusionRate}%` }} />
                        </span>
                        {pct(row.inclusionRate, 0)}
                      </span>
                    </td>
                    {showTop && <td>{row.topDelta == null ? '–' : <span className={row.topDelta >= 0 ? 'meta-up' : 'meta-down'}>{row.topDelta >= 0 ? '+' : '−'}{Math.abs(row.topDelta).toFixed(1)} pts</span>}</td>}
                    <td>{pct(row.offAspectRate, 0)}</td>
                    <td>{row.avgCopiesPlayed.toFixed(1)}</td>
                    <td>{fmt(row.decksWithCard)} / {fmt(row.poolsWithCard)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {cards.data && <div className="meta-table-foot"><span>{fmt(cards.data.totalPoolsWithDecks)} sealed pools with a built deck</span></div>}
        </div>
        {!canSeeFullStats && <TopPlayersPitch />}
      </MetaSection>
    </div>
  )
}

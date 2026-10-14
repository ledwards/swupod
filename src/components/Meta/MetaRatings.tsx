'use client'

import { useMemo, useState } from 'react'
import { useStatsJson, statsUrl } from '@/src/hooks/useStatsJson'
import { useTableFilter } from '@/src/components/stats/TableFilters'
import { CardDataStatsModal } from '@/src/components/CardDataTierList'
import { GradeChip } from '@/src/components/DeckBuilder/DeckStats/MetaCardCell'
import { pooledWinRate, sortRows } from '@/src/services/meta/cardRatings'
import { CardFilterBar } from './CardFilterBar'
import { CardArtList, type ArtListColumn } from './CardArtList'
import { MetaEmpty, MetaPending, MetaSection, fmt, pct } from './MetaBits'

type ModalCard = Parameters<typeof CardDataStatsModal>[0]['card']
type RatingCard = ModalCard & {
  displayGrade?: string | null
  activeRating?: { grade?: string | null } | null
  gpWins?: number | null
}
interface CardDataPayload { cards: RatingCard[]; totalDecks: number; totalMatches: number | null; gradeBasis: string }

const GRADE_ORDER = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F']
const gradeOf = (c: RatingCard) => c.activeRating?.grade ?? c.displayGrade ?? c.grade ?? null
const gradeRank = (c: RatingCard) => { const i = GRADE_ORDER.indexOf(gradeOf(c) || ''); return i < 0 ? null : GRADE_ORDER.length - i }

/** GIH WR with a bar against the set's pooled GIH WR (the tick). */
function GihCell({ card, avg }: { card: RatingCard; avg: number | null }) {
  if (card.gihWr == null || !card.gihCount) return <span className="mstats-muted">–</span>
  const center = avg ?? 50
  const x = (v: number) => `${Math.max(0, Math.min(100, ((v - (center - 15)) / 30) * 100))}%`
  const up = card.gihWr >= center
  return (
    <span className="mstats-inline-bar">
      <span className="mstats-track" aria-hidden="true">
        <span className={`mstats-track-fill ${up ? 'mstats-track-fill--up' : 'mstats-track-fill--down'}`} style={{ width: x(card.gihWr) }} />
        {avg != null && <span className="mstats-track-avg" style={{ left: x(avg) }} />}
      </span>
      <span className={up ? 'mstats-up' : 'mstats-down'}>{pct(card.gihWr)}</span>
    </span>
  )
}

/** A rate with no games behind it is a dash, never 0%. */
const rate = (value: number | null | undefined, count: number | null | undefined) => (count ? pct(value) : '–')
const signed = (n: number | null | undefined) => (n == null ? '–' : `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}`)

export default function MetaRatings({ setCode, since, until, format }: { setCode: string; since: string; until: string; format: 'draft' | 'sealed' }) {
  const data = useStatsJson<CardDataPayload>(statsUrl('/api/stats/card-data', { setCode, since, until, format, source: 'online', population: 'ptp', includeHumans: 'true', includeBots: 'false' }))
  const filter = useTableFilter()
  const [sort, setSort] = useState<{ key: string; dir: 'ascending' | 'descending' }>({ key: 'grade', dir: 'descending' })
  const [selected, setSelected] = useState<RatingCard | null>(null)

  const cards = data.data?.cards || []
  const gihAvg = useMemo(() => pooledWinRate(cards, 'gihWins', 'gihCount'), [cards])
  const rows = useMemo(() => {
    const value = (c: RatingCard): number | null => sort.key === 'grade' ? gradeRank(c) : (c[sort.key as keyof RatingCard] as number | null)
    return sortRows(cards.filter(filter.filterFn), value, sort.dir)
  }, [cards, filter.filterFn, sort])

  const n = (v: number | null | undefined) => <span className="mstats-muted">{fmt(v)}</span>
  const columns: ArtListColumn<RatingCard>[] = [
    { key: 'grade', label: 'Grade', sortable: true, title: 'Graded against the whole set', render: (c) => <GradeChip grade={gradeOf(c)} /> },
    { key: 'gpCount', label: '# GP', sortable: true, title: 'Games played with the card in the deck', render: (c) => n(c.gpCount) },
    { key: 'gpWr', label: 'GP WR', sortable: true, title: 'Win rate when the card is in the deck', render: (c) => rate(c.gpWr, c.gpCount) },
    { key: 'ohWr', label: 'OH WR', sortable: true, title: 'Win rate when the card is in the opening hand', render: (c) => rate(c.ohWr, c.ohCount) },
    { key: 'gdWr', label: 'GD WR', sortable: true, title: 'Win rate when the card is drawn after the opening hand', render: (c) => rate(c.gdWr, c.gdCount) },
    { key: 'gihCount', label: '# GIH', sortable: true, title: 'Games where the card was in hand', render: (c) => n(c.gihCount) },
    { key: 'gihWr', label: 'GIH WR', sortable: true, title: 'Win rate when the card was in hand at any point; the tick is the set average', render: (c) => <GihCell card={c} avg={gihAvg} /> },
    { key: 'iih', label: 'IIH', sortable: true, title: 'Improvement when in hand: GIH WR minus win rate when not seen', render: (c) => c.gihCount && c.gnsCount ? <span className={(c.iih ?? 0) >= 0 ? 'mstats-up' : 'mstats-down'}>{signed(c.iih)}</span> : <span className="mstats-muted">–</span> },
  ]
  const onSort = (key: string) => setSort((s) => s.key === key ? { key, dir: s.dir === 'ascending' ? 'descending' : 'ascending' } : { key, dir: 'descending' })
  const formatLabel = format === 'draft' ? 'Draft' : 'Sealed'

  return (
    <div className="mstats-stack">
      <MetaSection
        title={`Card Ratings (${rows.length})`}
        subtitle="How each card performs: win rates when it is in the deck, in the opening hand, drawn later, and in hand. Select a card for the full breakdown."
        actions={<CardFilterBar filter={filter} />}
      >
        {data.loading && !data.data ? <MetaPending kind="row" count={10} />
          : data.error ? <MetaEmpty>Card ratings are unavailable right now.</MetaEmpty>
          : rows.length === 0 ? <MetaEmpty>No rated cards for this set and format yet.</MetaEmpty>
          : <CardArtList label="Card ratings" rows={rows} columns={columns} sortKey={sort.key} sortDir={sort.dir} onSort={onSort} onSelect={setSelected} rowKey={(c) => `${c.cardName}|${c.subtitle || ''}`} />}
        {data.data && (
          <div className="mstats-table-foot">
            <span>Set average GIH WR {pct(gihAvg)} (the tick on each bar)</span>
            <span>{fmt(data.data.totalMatches)} matches · {fmt(data.data.totalDecks)} decks · {formatLabel}</span>
            <span>Grades: {data.data.gradeBasis}</span>
          </div>
        )}
      </MetaSection>
      {selected && <CardDataStatsModal card={selected} onClose={() => setSelected(null)} formatLabel={formatLabel} sampleWarningLabel={selected.sampleWarning} />}
    </div>
  )
}

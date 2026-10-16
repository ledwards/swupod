'use client'

import duplicateStats from '@/src/data/duplicateStats.json'
import { duplicateVerdictStatus } from '@/src/services/qaReport'
import { MetaEmpty, MetaSection } from '@/src/components/Meta/MetaBits'
import { QALegend, QAMath, QAOverlayRow, num } from './QABits'
import { QAStatusBadge } from './QAStatusBadge'

interface SimGroup { mean: number; sd: number; theoryMean?: number; naiveMean?: number; byCat?: Record<string, number>; pair?: Record<string, number> }
interface SetDupStats {
  poolSizes?: Record<string, number>
  sealed6: SimGroup
  sealedShuffled?: SimGroup
  actual?: { nonShuffled?: { n?: number; mean?: number | null; verdict?: string } }
  naive?: { dedup?: number; noDedup?: number }
}
const DUP = duplicateStats as unknown as { generatedAt?: string; sets?: Record<string, SetDupStats> }
const CATEGORIES = ['Leader', 'Base', 'Common', 'Uncommon', 'Rare', 'Legendary', 'Special']

/** Variant-neutral duplicates per 6-pack sealed pool: opened pools against the live generator. */
export function QADuplicates({ setCode }: { setCode: string }) {
  const s = DUP.sets?.[setCode]
  if (!s) {
    return <MetaSection panel title="Duplicates"><MetaEmpty>No duplicate data for {setCode} yet.</MetaEmpty></MetaSection>
  }
  const sim = s.sealed6
  const actual = s.actual?.nonShuffled || {}
  const hasActual = (actual.n ?? 0) >= 1 && actual.mean != null
  const status = duplicateVerdictStatus(actual.verdict)
  const ladder = [
    { key: 'actual', label: 'Actual', note: actual.n ? `opened pools, n=${actual.n.toLocaleString()}` : 'opened pools', value: hasActual ? actual.mean! : null },
    { key: 'sim', label: 'Simulated', note: 'live generator', value: sim.mean },
    { key: 'theory', label: 'Theoretical', note: 'variant-collision model', value: sim.theoryMean ?? null },
    { key: 'dedup', label: 'Naive, de-duplicated', note: 'random trials with de-duplication', value: s.naive?.dedup ?? null },
    { key: 'nodedup', label: 'Naive', note: 'random trials without collation logic', value: s.naive?.noDedup ?? sim.naiveMean ?? null },
  ]
  const max = Math.max(1, ...ladder.map((r) => r.value ?? 0)) * 1.05
  const cats = CATEGORIES.filter((c) => (sim.byCat?.[c] || 0) > 0.001 || (s.poolSizes?.[c] || 0) > 0)
  const pairs = Object.entries(sim.pair || {}).filter(([, x]) => x > 0.01)
  const sh = s.sealedShuffled

  return (
    <MetaSection panel title="Duplicates" subtitle="Duplicate cards per 6-pack sealed pool. A foil, hyperspace or prestige printing counts as the same card as its normal version." actions={<QAStatusBadge status={status} />}>
      <p className="qar-headline">
        <b>{hasActual ? num(actual.mean) : '–'}</b> actual <span className="mstats-muted">vs</span> <b>{num(sim.mean)}</b> simulated
        <span className="mstats-muted"> duplicates per pool</span>
      </p>
      <div className="qar-rows">
        {ladder.map((r) => (
          <QAOverlayRow
            key={r.key}
            label={<span className="qar-ladder-label">{r.label}<small>{r.note}</small></span>}
            value={r.value ?? 0}
            reference={sim.mean}
            max={max}
            valueText={r.value == null ? '–' : num(r.value)}
            fill={r.key === 'actual' ? 'var(--theme-accent)' : 'var(--theme-highlight)'}
          />
        ))}
      </div>
      <QALegend value="Estimate" reference="Simulated" />
      <QAMath>
        <div className="qar-math-grid">
          <table className="qar-table">
            <caption>Where duplicates land</caption>
            <thead><tr><th>Card type</th><th className="qar-num">Dups / pool</th><th className="qar-num">Cards in set</th></tr></thead>
            <tbody>{cats.map((c) => <tr key={c}><td>{c}</td><td className="qar-num">{num(sim.byCat?.[c] || 0)}</td><td className="qar-num mstats-muted">{s.poolSizes?.[c] || 0}</td></tr>)}</tbody>
          </table>
          <table className="qar-table">
            <caption>What pairing causes each duplicate</caption>
            <thead><tr><th>Pairing</th><th className="qar-num">Per pool</th></tr></thead>
            <tbody>{pairs.map(([k, x]) => <tr key={k}><td>{k}</td><td className="qar-num">{num(x)}</td></tr>)}</tbody>
          </table>
        </div>
        {sh && (
          <table className="qar-table">
            <caption>Effect of shuffling packs</caption>
            <tbody>
              <tr><td>Not shuffled <span className="mstats-muted">6 consecutive packs</span></td><td className="qar-num">{num(sim.mean)} <span className="mstats-muted">σ {num(sim.sd)}</span></td></tr>
              <tr><td>Shuffled <span className="mstats-muted">6 packs spread across the box</span></td><td className="qar-num">{num(sh.mean)} <span className="mstats-muted">σ {num(sh.sd)}</span></td></tr>
            </tbody>
          </table>
        )}
        {sh && sim.mean > 0 && (
          <p className="mstats-note">Shuffling pulls 6 packs from across the 24-pack box, outside each belt&apos;s dedup window, and duplicates rise about {(sh.mean / sim.mean).toFixed(1)}&times;.</p>
        )}
        <p className="mstats-note">
          Variant-neutral (by card name). Naive is random draws ignoring belt collation; even with per-pack de-duplication it stays high because most duplicates are cross-pack.
          {DUP.generatedAt ? ` Generated ${DUP.generatedAt}.` : ''}
        </p>
      </QAMath>
    </MetaSection>
  )
}

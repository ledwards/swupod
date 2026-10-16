'use client'

import type { ReactNode } from 'react'
import type { ChiSquaredResult, MetricResult, PackQualityData } from '@/src/services/packQualityService'
import { metricStatus, rateScale, worstStatus } from '@/src/services/qaReport'
import { RarityLabel } from '@/src/components/CardIcons'
import { MetaSection } from '@/src/components/Meta/MetaBits'
import { QALegend, QAMath, QAOverlayRow, pct } from './QABits'
import { QAStatusBadge } from './QAStatusBadge'

const RARITY_FILL: Record<string, string> = {
  Common: 'var(--pt-rarity-common)', Uncommon: 'var(--pt-rarity-uncommon)', Rare: 'var(--pt-rarity-rare)',
  Legendary: 'var(--pt-rarity-legendary)', Special: 'var(--pt-rarity-special)',
}

type Row = { key: string; label: ReactNode; metric: MetricResult }

function rateRow({ key, label, metric }: Row, fill?: string) {
  return (
    <QAOverlayRow
      key={key}
      label={label}
      value={metric.observedRate}
      reference={metric.expectedRate}
      max={rateScale(metric.observedRate, metric.expectedRate)}
      valueText={pct(metric.observedRate)}
      referenceText={pct(metric.expectedRate)}
      status={metricStatus(metric.status)}
      fill={fill}
    />
  )
}

function MathTable({ rows, head }: { rows: Row[]; head: string }) {
  return (
    <div className="qar-table-wrap">
      <table className="qar-table">
        <thead>
          <tr>
            <th>{head}</th><th>Expected</th><th className="qar-num">Observed</th><th className="qar-num">Count</th>
            <th className="qar-num">Sample</th><th className="qar-num">95% CI</th><th className="qar-num">z</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ key, label, metric }) => (
            <tr key={key}>
              <td>{label}</td>
              <td>{pct(metric.expectedRate)} <span className="mstats-muted">({metric.displayRate})</span></td>
              <td className="qar-num">{pct(metric.observedRate)}</td>
              <td className="qar-num">{metric.observed.toLocaleString()} <span className="mstats-muted">of {metric.expected.toLocaleString()} expected</span></td>
              <td className="qar-num">{metric.sampleSize.toLocaleString()}</td>
              <td className="qar-num">{pct(metric.confidenceInterval.low)} – {pct(metric.confidenceInterval.high)}</td>
              <td className="qar-num">{Number.isFinite(metric.zScore) ? metric.zScore.toFixed(2) : '–'}</td>
              <td><QAStatusBadge status={metricStatus(metric.status)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function QARateValidation({ data }: { data: PackQualityData }) {
  const t = data.treatmentMetrics
  const rows = ([
    { key: 'legendary', label: 'Legendary Rate', metric: data.rarityMetrics.legendaryRate },
    { key: 'hsLeader', label: 'Hyperspace Leader', metric: t.hyperspaceLeader },
    { key: 'hsBase', label: 'Hyperspace Base', metric: t.hyperspaceBase },
    { key: 'hsCommon', label: 'Hyperspace Common', metric: t.hyperspaceCommon },
    { key: 'hyperfoil', label: 'Hyperfoil', metric: t.hyperfoil },
    { key: 'showcase', label: 'Showcase Leader', metric: t.showcaseLeader },
  ] as Row[]).filter((r) => Boolean(r.metric))
  const verdict = worstStatus(rows.map((r) => metricStatus(r.metric.status)))
  return (
    <MetaSection panel title="Rate Validation" subtitle="Observed rate against the expected rate, tested at 95% confidence." actions={<QAStatusBadge status={verdict} />}>
      <div className="qar-rows">{rows.map((r) => rateRow(r, 'var(--theme-highlight)'))}</div>
      <QALegend value="Observed" reference="Expected" />
      <QAMath><MathTable rows={rows} head="Metric" /></QAMath>
    </MetaSection>
  )
}

function ChiSquared({ test }: { test: ChiSquaredResult }) {
  return (
    <div className="qar-chi">
      <p className="mstats-note">{test.interpretation}</p>
      <dl className="qar-facts">
        <div><dt>χ²</dt><dd>{test.chiSquared}</dd></div>
        <div><dt>df</dt><dd>{test.degreesOfFreedom}</dd></div>
        <div><dt>p</dt><dd>{test.pValue}</dd></div>
      </dl>
    </div>
  )
}

export function QAFoilDistribution({ data }: { data: PackQualityData }) {
  const dist = data.rarityMetrics.foilRarityDistribution as Record<string, MetricResult>
  const rows: Row[] = Object.entries(dist).map(([rarity, metric]) => ({ key: rarity, label: <RarityLabel rarity={rarity} />, metric }))
  const test = data.rarityMetrics.foilDistributionTest
  return (
    <MetaSection panel title="Foil Rarity Distribution" subtitle="Which rarity the foil slot lands on, with a χ² goodness-of-fit test across all rarities." actions={<QAStatusBadge status={metricStatus(test?.status)} />}>
      <div className="qar-rows">{rows.map((r) => rateRow(r, RARITY_FILL[r.key]))}</div>
      <QALegend value="Observed" reference="Expected" neutral />
      <QAMath>
        {test && <ChiSquared test={test} />}
        <MathTable rows={rows} head="Rarity" />
      </QAMath>
    </MetaSection>
  )
}

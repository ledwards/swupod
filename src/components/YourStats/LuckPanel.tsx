// @ts-nocheck
/**
 * LuckPanel — one luck dimension (rarity or aspect).
 *
 * Per plan U7:
 *   - Headline copy from data.headlineCopy.
 *   - DistributionChart below headline.
 *   - Collapsible "Show math" drawer (closed by default; toggle "Hide math").
 *     - rarity: 4 rows (Common, Uncommon, Rare, Legendary) with observed, expected, CI.
 *     - aspect: 6 rows (V, C, A, Cu, N, M) with observed, expected, CI,
 *               plus per-aspect verdict regime indicator.
 *   - All buttons use Button component (variant secondary toggle here for "show math").
 *   - Keyboard focus on the show-math expander.
 */
'use client'

import { useState } from 'react'
import Button from '@/src/components/Button'
import { DistributionChart } from './DistributionChart'

type Dimension = 'rarity' | 'aspect'

interface VerdictEntry {
  regime: 'insufficient' | 'normal' | 'unusual'
  pValue: number
  ci?: { low: number; high: number }
  copy?: string
}

interface RarityPanelData {
  observed: Record<string, number>
  expected: Record<string, number>
  platformActual?: Record<string, number>
  platformPacksCracked?: number
  perRarity: Record<string, VerdictEntry>
  headlineRegime: 'insufficient' | 'normal' | 'unusual'
  headlineCopy: string
  headlineLabel: string
}

interface AspectPanelData {
  observed: Record<string, number>
  expected: Record<string, number>
  platformActual?: Record<string, number>
  platformPacksCracked?: number
  perAspect: Record<string, VerdictEntry>
  headlineRegime: 'insufficient' | 'normal' | 'unusual'
  headlineCopy: string
  headlineLabel: string
}

export interface LuckPanelProps {
  dimension: Dimension
  data: RarityPanelData | AspectPanelData
  packsCracked: number
  title: string
}

function formatNum(n: number, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toFixed(digits)
}

function formatCI(ci: { low: number; high: number } | undefined): string {
  if (!ci || !Number.isFinite(ci.low) || !Number.isFinite(ci.high)) return '—'
  return `${ci.low.toFixed(1)} – ${ci.high.toFixed(1)}`
}

function RegimeBadge({ regime }: { regime: VerdictEntry['regime'] }) {
  const label =
    regime === 'unusual'
      ? 'Unusual'
      : regime === 'normal'
        ? 'Normal'
        : 'Too few packs'
  const cls = `your-stats-regime-badge your-stats-regime-badge--${regime}`
  return (
    <span className={cls} data-testid={`regime-badge-${regime}`}>
      {label}
    </span>
  )
}

function ShowMathTable({
  dimension,
  rows,
  perBucket,
}: {
  dimension: Dimension
  rows: string[]
  perBucket: Record<string, VerdictEntry>
}) {
  const showRegimeCol = dimension === 'aspect'
  return (
    <table className="your-stats-math-table" data-testid={`show-math-table-${dimension}`}>
      <thead>
        <tr>
          <th>{dimension === 'rarity' ? 'Rarity' : 'Aspect'}</th>
          <th>You</th>
          <th>Platform</th>
          <th>Theoretical</th>
          <th>95% CI</th>
          {showRegimeCol && <th>Verdict</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((label) => {
          const v = perBucket[label] || {
            regime: 'insufficient',
            pValue: 1,
            ci: { low: 0, high: 0 },
          }
          return (
            <tr key={label}>
              <td>{label}</td>
              <td className="your-stats-math-num">{formatNum(perBucket[label]?.['observed'] ?? 0, 0)}</td>
              <td className="your-stats-math-num">{formatNum(perBucket[label]?.['platformActual'] ?? 0, 1)}</td>
              <td className="your-stats-math-num">{formatNum(perBucket[label]?.['expected'] ?? 0, 1)}</td>
              <td className="your-stats-math-num">{formatCI(v.ci)}</td>
              {showRegimeCol && (
                <td>
                  <RegimeBadge regime={v.regime} />
                </td>
              )}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export function LuckPanel({ dimension, data, packsCracked, title }: LuckPanelProps) {
  const [showMath, setShowMath] = useState(false)

  // Rows are dimension-fixed: rarity always shows Common→Legendary;
  // aspect shows V, C, A, Cu, N, M.
  const rows =
    dimension === 'rarity'
      ? ['Common', 'Uncommon', 'Rare', 'Legendary']
      : ['Vigilance', 'Command', 'Aggression', 'Cunning', 'Neutral', 'Multicolor']

  // Merge observed/expected into the per-bucket map so the table can
  // read everything from one record.
  const perBucketRaw: Record<string, VerdictEntry> =
    dimension === 'rarity'
      ? (data as RarityPanelData).perRarity || {}
      : (data as AspectPanelData).perAspect || {}

  const perBucket: Record<string, VerdictEntry & { observed?: number; expected?: number }> = {}
  for (const label of rows) {
    perBucket[label] = {
      ...(perBucketRaw[label] || {
        regime: 'insufficient',
        pValue: 1,
        ci: { low: 0, high: 0 },
        copy: '',
      }),
      observed: Number(data.observed?.[label] || 0),
      platformActual: Number(data.platformActual?.[label] || 0),
      expected: Number(data.expected?.[label] || 0),
    }
  }

  const headlineCopy = data.headlineCopy || (data.headlineRegime === 'insufficient' ? 'We need more packs to tell.' : '')

  return (
    <section
      className={`your-stats-luck-panel your-stats-luck-panel--${dimension}`}
      data-testid={`luck-panel-${dimension}`}
      aria-label={`${title} — ${data.headlineRegime}`}
    >
      <header className="your-stats-luck-panel-header">
        <h4 className="your-stats-luck-panel-title">{title}</h4>
        <RegimeBadge regime={data.headlineRegime} />
      </header>

      <p
        className="your-stats-luck-panel-headline"
        data-testid={`luck-headline-${dimension}`}
      >
        {headlineCopy}
      </p>

      <DistributionChart
        dimension={dimension}
        data={{
          observed: data.observed,
          expected: data.expected,
          platformActual: data.platformActual,
          platformPacksCracked: data.platformPacksCracked,
          headlineLabel: data.headlineLabel,
          headlineCopy,
          headlineRegime: data.headlineRegime,
        }}
        packsCracked={packsCracked}
      />

      <div className="your-stats-luck-panel-math">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setShowMath((v) => !v)}
          aria-expanded={showMath}
          aria-controls={`show-math-${dimension}`}
          data-testid={`show-math-toggle-${dimension}`}
        >
          {showMath ? 'Hide math' : 'Show math'}
        </Button>
        {showMath && (
          <div
            id={`show-math-${dimension}`}
            className="your-stats-luck-panel-math-content"
            data-testid={`show-math-content-${dimension}`}
          >
            <ShowMathTable dimension={dimension} rows={rows} perBucket={perBucket} />
          </div>
        )}
      </div>
    </section>
  )
}

export default LuckPanel

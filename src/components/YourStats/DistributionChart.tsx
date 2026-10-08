// @ts-nocheck
/**
 * DistributionChart — the "you are here" visualization for one Luck dimension.
 *
 * Per plan U7:
 *   - dimension='rarity': a single curve. Approximate Poisson/normal density
 *     given expected. Plot user pin at observed value. Brief annotation when
 *     n is below MIN_PACKS_RARITY.
 *   - dimension='aspect': horizontal stacked / paired bar with expected vs
 *     observed per aspect (6 bars).
 *   - "You are here" pin uses BOTH a distinct color AND a distinct shape
 *     (triangle pin) for color-blind accessibility.
 *   - Chart library: recharts (confirmed from app/stats/StatsCharts.tsx).
 *   - aria-label names dimension, observed/expected, verdict.
 *
 * The rarity panel uses the "headline" rarity bucket (whatever the headline
 * driver is — usually Legendary or Rare for variance). We render one curve
 * per rarity dimension by picking the headlineLabel from the payload, with
 * a sensible fallback so the chart always renders something.
 */
'use client'

import { useMemo } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  AreaChart,
  Area,
  ReferenceDot,
  CartesianGrid,
  Cell,
} from 'recharts'
import { ASPECT_COLORS, NO_ASPECT_COLOR, RARITY_COLORS } from '@/src/utils/aspectColors'

// --- Statistical helpers (local, kept small) ---------------------------------

/** Poisson pmf for small lambda; falls back to normal pmf for larger lambda. */
function poissonPmf(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0
  if (lambda > 30) {
    // Normal approximation (mean = lambda, variance = lambda) for tail safety.
    const sigma = Math.sqrt(lambda)
    const z = (k - lambda) / sigma
    return Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI))
  }
  // Iterative factorial-safe Poisson.
  let logPmf = -lambda
  for (let i = 1; i <= k; i++) {
    logPmf += Math.log(lambda / i)
  }
  return Math.exp(logPmf)
}

interface RarityCurveData {
  /** The bucket label this curve describes (e.g. "Legendary"). */
  label: string
  observed: number
  expected: number
  platformActual: number
}

interface AspectBarRow {
  aspect: string
  observed: number
  expected: number
  platformActual: number
  isHeadline: boolean
}

// --- Common pin marker (triangle) -------------------------------------------

/**
 * Distinct shape ("you are here" triangle) AND distinct color (white outline)
 * so color-blind users can locate the pin without relying on hue alone.
 */
function PinTriangle({ cx, cy, fill = '#fff' }: { cx: number; cy: number; fill?: string }) {
  // Equilateral triangle pointing down, anchored at cx/cy.
  const size = 10
  const points = `${cx},${cy + size} ${cx - size},${cy - size} ${cx + size},${cy - size}`
  return (
    <g aria-hidden="true">
      <polygon points={points} fill={fill} stroke="#000" strokeWidth="1.5" />
      <line x1={cx} y1={cy} x2={cx} y2={cy + size * 2} stroke={fill} strokeWidth="1.5" />
    </g>
  )
}

// --- Rarity curve component -------------------------------------------------

interface RarityChartProps {
  /** observed/expected per rarity bucket. */
  data: {
    observed: Record<string, number>
    expected: Record<string, number>
    platformActual?: Record<string, number>
    platformPacksCracked?: number
    headlineLabel?: string
  }
  /** Below this, the chart adds the small-sample annotation. */
  smallSampleThreshold?: number
  packsCracked: number
  verdictCopy?: string
  regime?: string
}

function pickRarityHighlight(data: RarityChartProps['data']): RarityCurveData {
  const labels = Object.keys(data.expected || {})
  if (labels.length === 0) {
    return { label: 'Legendary', observed: 0, expected: 0, platformActual: 0 }
  }
  // Prefer headlineLabel; otherwise the rarest non-zero expected bucket.
  if (data.headlineLabel && labels.includes(data.headlineLabel)) {
    return {
      label: data.headlineLabel,
      observed: Number(data.observed[data.headlineLabel] || 0),
      expected: Number(data.expected[data.headlineLabel] || 0),
      platformActual: Number(data.platformActual?.[data.headlineLabel] || 0),
    }
  }
  // Fallback: Legendary if present, else first non-zero.
  if (labels.includes('Legendary')) {
    return {
      label: 'Legendary',
      observed: Number(data.observed['Legendary'] || 0),
      expected: Number(data.expected['Legendary'] || 0),
      platformActual: Number(data.platformActual?.['Legendary'] || 0),
    }
  }
  const first = labels.find((k) => (data.expected[k] || 0) > 0) || labels[0]
  return {
    label: first,
    observed: Number(data.observed[first] || 0),
    expected: Number(data.expected[first] || 0),
    platformActual: Number(data.platformActual?.[first] || 0),
  }
}

function RarityCurve({ data, smallSampleThreshold = 50, packsCracked, verdictCopy, regime }: RarityChartProps) {
  const picked = pickRarityHighlight(data)
  // Render a small density curve of expected outcomes around `expected`.
  const curve = useMemo(() => {
    const expected = picked.expected
    const lo = Math.max(0, Math.floor(Math.min(expected, picked.observed) - 4 * Math.sqrt(Math.max(expected, 1))))
    const hi = Math.ceil(Math.max(expected, picked.observed) + 4 * Math.sqrt(Math.max(expected, 1)))
    const points: Array<{ x: number; density: number }> = []
    for (let x = lo; x <= hi; x++) {
      points.push({ x, density: poissonPmf(x, expected) })
    }
    return points
  }, [picked.expected, picked.observed])

  // The pin sits on the curve at `observed`. Use ReferenceDot with a custom shape.
  const pinDensity = poissonPmf(picked.observed, picked.expected)

  const ariaLabel = `${picked.label} rarity distribution. You pulled ${picked.observed.toFixed(0)}, expected about ${picked.expected.toFixed(1)}. ${verdictCopy || ''}`.trim()

  return (
    <div
      className="your-stats-chart your-stats-chart--rarity"
      role="img"
      aria-label={ariaLabel}
      data-testid="distribution-chart-rarity"
    >
      <div className="your-stats-chart-label">
        {picked.label} pulls — you <strong>{picked.observed.toFixed(0)}</strong>, platform{' '}
        <strong>{picked.platformActual.toFixed(1)}</strong>, theoretical {picked.expected.toFixed(1)}
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={curve} margin={{ top: 16, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.07)" strokeDasharray="3 3" />
          <XAxis
            dataKey="x"
            tick={{ fill: 'rgba(255,255,255,0.65)', fontSize: 12 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.2)' }}
          />
          <YAxis hide />
          <Tooltip
            cursor={{ stroke: 'rgba(255,255,255,0.3)' }}
            contentStyle={{
              background: 'rgba(0,0,0,0.85)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 6,
              fontSize: 12,
            }}
            formatter={(value: any, _name: any, props: any) => [
              `density ${Number(value).toFixed(3)}`,
              `${picked.label} count ${props.payload.x}`,
            ]}
          />
          <Area
            type="monotone"
            dataKey="density"
            fill={RARITY_COLORS[picked.label] || '#64B5F6'}
            fillOpacity={0.25}
            stroke={RARITY_COLORS[picked.label] || '#64B5F6'}
            strokeWidth={2}
          />
          <ReferenceDot
            x={picked.observed}
            y={pinDensity}
            shape={(props: any) => <PinTriangle cx={props.cx} cy={props.cy} fill="#fff" />}
            isFront
          />
        </AreaChart>
      </ResponsiveContainer>
      {packsCracked < smallSampleThreshold && (
        <p className="your-stats-chart-note">
          Approximate at small n — only {packsCracked} pack{packsCracked === 1 ? '' : 's'} cracked.
        </p>
      )}
      {Number(data.platformPacksCracked || 0) > 0 && (
        <p className="your-stats-chart-note">
          Platform actual is normalized from {Number(data.platformPacksCracked || 0).toLocaleString()} platform pack
          {Number(data.platformPacksCracked || 0) === 1 ? '' : 's'} into your pack count.
        </p>
      )}
    </div>
  )
}

// --- Aspect paired bar ------------------------------------------------------

interface AspectChartProps {
  data: {
    observed: Record<string, number>
    expected: Record<string, number>
    platformActual?: Record<string, number>
    platformPacksCracked?: number
    headlineLabel?: string
  }
  packsCracked: number
  verdictCopy?: string
  regime?: string
}

function AspectBars({ data, packsCracked, verdictCopy }: AspectChartProps) {
  const rows = useMemo<AspectBarRow[]>(() => {
    const aspects = Object.keys(data.expected || {})
    return aspects.map((a) => ({
      aspect: a,
      observed: Number(data.observed[a] || 0),
      expected: Number(data.expected[a] || 0),
      platformActual: Number(data.platformActual?.[a] || 0),
      isHeadline: a === data.headlineLabel,
    }))
  }, [data])

  const ariaLabel = `Aspect distribution. ${verdictCopy || ''}`.trim()

  // Compute a max for the x-axis so both bars share scale.
  const xMax = Math.max(
    1,
    ...rows.map((r) => Math.max(r.observed, r.expected)),
    ...rows.map((r) => Number(r.platformActual || 0)),
  )

  // We render two side-by-side bars per aspect: expected and observed.
  // Pin marker rides on the observed bar for the headline aspect.
  return (
    <div
      className="your-stats-chart your-stats-chart--aspect"
      role="img"
      aria-label={ariaLabel}
      data-testid="distribution-chart-aspect"
    >
      <div className="your-stats-chart-label">
        Aspect counts — you vs platform actuals vs theoretical ({packsCracked} pack
        {packsCracked === 1 ? '' : 's'})
      </div>
      <ResponsiveContainer width="100%" height={Math.max(220, rows.length * 36)}>
        <BarChart
          layout="vertical"
          data={rows}
          margin={{ top: 8, right: 24, bottom: 8, left: 24 }}
          barGap={2}
          barCategoryGap="20%"
        >
          <CartesianGrid stroke="rgba(255,255,255,0.07)" strokeDasharray="3 3" />
          <XAxis
            type="number"
            domain={[0, Math.ceil(xMax * 1.15)]}
            tick={{ fill: 'rgba(255,255,255,0.65)', fontSize: 12 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.2)' }}
          />
          <YAxis
            dataKey="aspect"
            type="category"
            tick={{ fill: 'rgba(255,255,255,0.85)', fontSize: 12 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.2)' }}
            width={80}
          />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
            contentStyle={{
              background: 'rgba(0,0,0,0.85)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 6,
              fontSize: 12,
            }}
            formatter={(value: any, name: any) => [Number(value).toFixed(1), name]}
          />
          <Bar dataKey="expected" name="Theoretical" fillOpacity={0.42}>
            {rows.map((row) => (
              <Cell
                key={`exp-${row.aspect}`}
                fill={ASPECT_COLORS[row.aspect] || NO_ASPECT_COLOR}
              />
            ))}
          </Bar>
          <Bar dataKey="platformActual" name="Platform actual" fillOpacity={0.68}>
            {rows.map((row) => (
              <Cell
                key={`platform-${row.aspect}`}
                fill={ASPECT_COLORS[row.aspect] || NO_ASPECT_COLOR}
              />
            ))}
          </Bar>
          <Bar dataKey="observed" name="You">
            {rows.map((row) => (
              <Cell
                key={`obs-${row.aspect}`}
                fill={ASPECT_COLORS[row.aspect] || NO_ASPECT_COLOR}
                stroke={row.isHeadline ? '#fff' : 'transparent'}
                strokeWidth={row.isHeadline ? 2 : 0}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="your-stats-chart-legend" aria-hidden="true">
        <span className="your-stats-chart-legend-item">
          <span className="your-stats-chart-legend-swatch your-stats-chart-legend-swatch--expected" />
          Theoretical
        </span>
        <span className="your-stats-chart-legend-item">
          <span className="your-stats-chart-legend-swatch your-stats-chart-legend-swatch--platform" />
          Platform actual
        </span>
        <span className="your-stats-chart-legend-item">
          <span className="your-stats-chart-legend-swatch your-stats-chart-legend-swatch--observed" />
          You (outlined bar = headline aspect)
        </span>
      </div>
    </div>
  )
}

// --- Public component --------------------------------------------------------

export interface DistributionChartProps {
  dimension: 'rarity' | 'aspect'
  data: {
    observed: Record<string, number>
    expected: Record<string, number>
    headlineLabel?: string
    headlineCopy?: string
    headlineRegime?: string
  }
  packsCracked: number
}

export function DistributionChart({ dimension, data, packsCracked }: DistributionChartProps) {
  if (dimension === 'rarity') {
    return (
      <RarityCurve
        data={data}
        packsCracked={packsCracked}
        verdictCopy={data.headlineCopy}
        regime={data.headlineRegime}
      />
    )
  }
  return (
    <AspectBars
      data={data}
      packsCracked={packsCracked}
      verdictCopy={data.headlineCopy}
      regime={data.headlineRegime}
    />
  )
}

export default DistributionChart

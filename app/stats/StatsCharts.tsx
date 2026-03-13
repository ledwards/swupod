// @ts-nocheck
'use client'

import { useMemo } from 'react'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList } from 'recharts'
import { getAspectColor, getAspectColors } from '@/src/utils/aspectColors'

// === Panel colors ===
const PANEL_COLORS = {
  you: 'rgba(255, 255, 255, 0.9)',
  all: '#64B5F6',
  tournament: '#CE93D8',
  top: '#FFB74D',
}

/** Round to at most 2 decimal places, stripping trailing zeros */
function r2(n: number): string {
  return parseFloat(n.toFixed(2)).toString()
}

// === Gradient helpers ===

/** Generate a stable gradient ID from a card name */
function gradientId(name: string, prefix: string): string {
  return `${prefix}-${name.replace(/[^a-zA-Z0-9]/g, '_')}`
}

/** SVG gradient defs for multicolor cards */
function GradientDefs({ data, prefix }: { data: { name: string; colors: string[] }[]; prefix: string }) {
  const multicolor = data.filter(d => d.colors.length >= 2)
  if (multicolor.length === 0) return null
  return (
    <defs>
      {multicolor.map(d => (
        <linearGradient key={gradientId(d.name, prefix)} id={gradientId(d.name, prefix)} x1="0" y1="0" x2="1" y2="1">
          {d.colors.map((c, i) => (
            <stop key={i} offset={`${(i / (d.colors.length - 1)) * 100}%`} stopColor={c} />
          ))}
        </linearGradient>
      ))}
    </defs>
  )
}

/** Get fill value - gradient URL if multicolor, solid color otherwise */
function getFill(name: string, colors: string[], prefix: string): string {
  if (colors.length >= 2) return `url(#${gradientId(name, prefix)})`
  return colors[0] || '#888'
}

/** Check if a color is very dark (for adding visible stroke on pie charts) */
function isVeryDark(colors: string[]): boolean {
  if (colors.length !== 1) return false
  const c = colors[0]?.toLowerCase() || ''
  // Match known dark colors like Villainy #1a1a1a
  return c === '#1a1a1a' || c === '#000' || c === '#000000' || c === 'black'
}

// === Shared panel wrapper ===
function ChartPanel({ label, color, blurred, loggedOut, children }: {
  label: string
  color: string
  blurred?: boolean
  loggedOut?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="stats-chart-panel">
      <h4 className="stats-chart-panel-label" style={{ color }}>{label}</h4>
      {loggedOut ? (
        <div className="stats-chart-placeholder">
          <a href="/api/auth/signin/discord?return_to=/stats" className="stats-login-link">Log in to see your stats</a>
        </div>
      ) : blurred ? (
        <div className="stats-chart-placeholder stats-chart-blurred">
          <div className="stats-chart-lock">🔒</div>
        </div>
      ) : (
        children
      )}
    </div>
  )
}

// === Custom pie label renderer (only for slices >= 4%) ===
const PIE_LABEL_THRESHOLD = 0.06

function renderPieLabel({ cx, cy, midAngle, innerRadius, outerRadius, name, percent, value, payload }: any) {
  if (percent < PIE_LABEL_THRESHOLD) return null
  const RADIAN = Math.PI / 180
  const radius = outerRadius + 24
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)
  const total = Math.round(payload?._total || 0)
  const pctStr = `${(percent * 100).toFixed(1)}%`
  const label = total > 0 ? `${name} ${pctStr} (${Math.round(value)}/${total})` : `${name} ${pctStr}`
  return (
    <text
      x={x}
      y={y}
      fill="rgba(255,255,255,0.8)"
      textAnchor={x > cx ? 'start' : 'end'}
      dominantBaseline="central"
      fontSize={10}
    >
      {label}
    </text>
  )
}

// === Small-slice legend table ===
function SmallSliceLegend({ items }: { items: { name: string; color: string; pct: string; count: number; total: number }[] }) {
  if (!items.length) return null
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
      <table style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', borderCollapse: 'collapse' }}>
        <tbody>
          {items.map(item => (
            <tr key={item.name}>
              <td style={{ paddingRight: 6 }}>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: item.color, marginRight: 4, verticalAlign: 'middle' }} />
                {item.name}
              </td>
              <td style={{ paddingLeft: 6, textAlign: 'right', whiteSpace: 'nowrap' }}>
                {item.total > 0 ? `${item.pct} (${item.count}/${item.total})` : item.pct}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// === Leader Pie Chart ===
function LeaderPieChart({ leaders, valueKey }: {
  leaders: { cardName: string; aspects: string[]; [key: string]: any }[]
  valueKey: string
}) {
  const data = useMemo(() => {
    if (!leaders?.length) return []
    const filtered = leaders.filter(l => l[valueKey] > 0)
    const total = filtered.reduce((sum, l) => sum + l[valueKey], 0)
    return filtered
      .sort((a, b) => b[valueKey] - a[valueKey])
      .slice(0, 20)
      .map(l => ({
        name: l.cardName,
        value: l[valueKey],
        color: getAspectColor({ aspects: l.aspects }),
        colors: getAspectColors({ aspects: l.aspects }),
        _total: Math.round(total),
      }))
  }, [leaders, valueKey])

  // Split into radial-labeled vs small-slice legend
  const totalValue = data.reduce((sum, d) => sum + d.value, 0)
  const smallSlices = useMemo(() => {
    if (!totalValue) return []
    return data
      .filter(d => d.value / totalValue < PIE_LABEL_THRESHOLD)
      .map(d => ({
        name: d.name,
        color: d.colors[0] || d.color,
        pct: `${((d.value / totalValue) * 100).toFixed(1)}%`,
        count: Math.round(d.value),
        total: Math.round(d._total),
      }))
  }, [data, totalValue])

  if (!data.length) return <div className="stats-chart-empty">No data</div>

  return (
    <div>
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <GradientDefs data={data} prefix="pie" />
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={75}
            innerRadius={25}
            paddingAngle={1}
            stroke="none"
            label={renderPieLabel}
            labelLine={false}
          >
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={getFill(entry.name, entry.colors, 'pie')}
                stroke={isVeryDark(entry.colors) ? 'rgba(255,255,255,0.5)' : 'none'}
                strokeWidth={isVeryDark(entry.colors) ? 1.5 : 0}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ background: 'rgba(0,0,0,0.85)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6, color: '#fff', fontSize: '0.85rem' }}
            itemStyle={{ color: '#fff' }}
            formatter={(value: number, name: string, props: any) => {
              const total = Math.round(props?.payload?._total || 0)
              const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0'
              return [`${pct}% (${Math.round(value)}/${total})`, name]
            }}
          />
      </PieChart>
    </ResponsiveContainer>
    <SmallSliceLegend items={smallSlices} />
    </div>
  )
}

// === Bar label formatting ===
function formatBarLabel(value: number, isCountMetric: boolean, total: number, isPercentage: boolean): string {
  if (isCountMetric && total > 0) {
    const pct = ((value / total) * 100).toFixed(1)
    return `${pct}% (${Math.round(value)}/${Math.round(total)})`
  }
  if (isPercentage) return `${value.toFixed(1)}%`
  return r2(value)
}

// === Custom YAxis tick with hover for card preview ===
function BarTickWithPreview({ x, y, payload, dataLookup, onCardHover, onCardLeave }: any) {
  const entry = dataLookup?.get(payload?.value)
  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={-4}
        y={0}
        dy={4}
        textAnchor="end"
        fill="rgba(255,255,255,0.7)"
        fontSize={10}
        style={{ cursor: entry ? 'pointer' : 'default' }}
        onMouseEnter={entry && onCardHover ? (e: any) => onCardHover(entry, e) : undefined}
        onMouseLeave={onCardLeave}
      >
        {payload?.value}
      </text>
    </g>
  )
}

// === Custom tooltip for bar chart ===
function BarChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const entry = payload[0]?.payload
  const name = entry?.cardName || label
  const subtitle = entry?.subtitle || null
  const value = payload[0]?.value
  const total = Math.round(entry?._total || 0)
  const isCount = entry?._isCount
  return (
    <div style={{
      background: 'rgba(0,0,0,0.85)',
      border: '1px solid rgba(255,255,255,0.2)',
      borderRadius: 6,
      color: '#fff',
      fontSize: '0.85rem',
      padding: '6px 10px',
    }}>
      <div>
        <span style={{ fontWeight: 600 }}>{name}</span>
        {subtitle && <span style={{ fontWeight: 400, color: 'rgba(255,255,255,0.6)', marginLeft: 6 }}>{subtitle}</span>}
      </div>
      <div style={{ marginTop: 2 }}>
        {isCount && total > 0
          ? `${((value / total) * 100).toFixed(1)}% (${Math.round(value)}/${total})`
          : entry?._isPercentage ? `${r2(value)}%` : r2(value)}
      </div>
    </div>
  )
}

// === Top Cards Bar Chart ===
function TopCardsBarChart({ cards, valueKey, formatValue, onCardHover, onCardLeave }: {
  cards: { cardName: string; aspects: string[]; [key: string]: any }[]
  valueKey: string
  formatValue?: (v: number) => string
  onCardHover?: (card: any, event: any) => void
  onCardLeave?: () => void
}) {
  // Count-based metrics get XX% (Y/Z) labels; percentage metrics just show the value
  const isCountMetric = valueKey === 'timesPicked' || valueKey === 'timesSelected'
  const isPercentage = valueKey === 'inclusionRate' || valueKey === 'selectionRate'

  const data = useMemo(() => {
    if (!cards?.length) return []
    // Deduplicate by cardName — merge cards with the same name (e.g. variant types)
    // Count metrics: sum values; percentage metrics: take max
    const deduped = new Map<string, any>()
    for (const c of cards) {
      if (!(c[valueKey] > 0)) continue
      const key = c.cardName
      if (deduped.has(key)) {
        const existing = deduped.get(key)
        existing[valueKey] = isCountMetric
          ? existing[valueKey] + c[valueKey]
          : Math.max(existing[valueKey], c[valueKey])
      } else {
        deduped.set(key, { ...c })
      }
    }
    const filtered = Array.from(deduped.values())
    const total = isCountMetric ? filtered.reduce((sum, c) => sum + c[valueKey], 0) : 0
    return filtered
      .sort((a, b) => b[valueKey] - a[valueKey])
      .slice(0, 10)
      .map(c => ({
        name: c.cardName,
        fullName: c.cardName,
        cardName: c.cardName,
        subtitle: c.subtitle || null,
        value: c[valueKey],
        _label: formatBarLabel(c[valueKey], isCountMetric, Math.round(total), isPercentage),
        color: getAspectColor({ aspects: c.aspects }),
        colors: getAspectColors({ aspects: c.aspects }),
        imageUrl: c.imageUrl || null,
        backImageUrl: c.backImageUrl || null,
        isLeader: c.cardType === 'Leader' || c.isLeader || false,
        rarity: c.rarity || null,
        _total: Math.round(total),
        _isCount: isCountMetric,
        _isPercentage: isPercentage,
      }))
  }, [cards, valueKey])

  // Build lookup map for YAxis tick hover
  const dataLookup = useMemo(() => {
    const map = new Map()
    for (const d of data) {
      map.set(d.name, {
        imageUrl: d.imageUrl || undefined,
        backImageUrl: d.backImageUrl || undefined,
        name: d.cardName,
        rarity: d.rarity,
        isLeader: d.isLeader,
      })
    }
    return map
  }, [data])

  if (!data.length) return <div className="stats-chart-empty">No data</div>

  const total = isCountMetric ? data.reduce((sum, d) => sum + d.value, 0) : 0

  return (
    <ResponsiveContainer width="100%" height={Math.max(300, data.length * 36)}>
      <BarChart data={data} layout="vertical" margin={{ left: 0, right: 120, top: 5, bottom: 5 }}>
        <GradientDefs data={data} prefix="bar" />
        <XAxis type="number" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis
          type="category"
          dataKey="name"
          width={180}
          interval={0}
          tick={<BarTickWithPreview dataLookup={dataLookup} onCardHover={onCardHover} onCardLeave={onCardLeave} />}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<BarChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} isAnimationActive={false} />
        <Bar
          dataKey="value"
          shape={(props: any) => {
            const { x, y, width, height, payload } = props
            const barFill = getFill(payload.name, payload.colors, 'bar')
            return <rect x={x} y={y} width={Math.max(0, width)} height={height} fill={barFill} rx={4} ry={4} />
          }}
        >
          <LabelList dataKey="_label" position="right" fill="rgba(255,255,255,0.7)" fontSize={10} fontWeight={600} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// === 4-Panel Leader Charts ===
export function LeaderCharts({ allData, tournamentData, topData, youData, valueKey, canSeeFullStats, user }: {
  allData: any[] | null
  tournamentData: any[] | null
  topData: any[] | null
  youData: any[] | null
  valueKey: string
  canSeeFullStats?: boolean
  user?: any
}) {
  return (
    <div className="stats-chart-grid">
      <ChartPanel label="You" color={PANEL_COLORS.you} loggedOut={!user}>
        <LeaderPieChart leaders={youData || []} valueKey={valueKey} />
      </ChartPanel>
      <ChartPanel label="All Players" color={PANEL_COLORS.all}>
        <LeaderPieChart leaders={allData || []} valueKey={valueKey} />
      </ChartPanel>
      <ChartPanel label="Tournament Players" color={PANEL_COLORS.tournament} blurred={!canSeeFullStats}>
        <LeaderPieChart leaders={tournamentData || []} valueKey={valueKey} />
      </ChartPanel>
      <ChartPanel label="Top Players" color={PANEL_COLORS.top} blurred={!canSeeFullStats}>
        <LeaderPieChart leaders={topData || []} valueKey={valueKey} />
      </ChartPanel>
    </div>
  )
}

// === 4-Panel Card Charts ===
export function CardCharts({ allData, tournamentData, topData, youData, valueKey, formatValue, canSeeFullStats, user, onCardHover, onCardLeave }: {
  allData: any[] | null
  tournamentData: any[] | null
  topData: any[] | null
  youData: any[] | null
  valueKey: string
  formatValue?: (v: number) => string
  canSeeFullStats?: boolean
  user?: any
  onCardHover?: (card: any, event: any) => void
  onCardLeave?: () => void
}) {
  return (
    <div className="stats-chart-grid">
      <ChartPanel label="You" color={PANEL_COLORS.you} loggedOut={!user}>
        <TopCardsBarChart cards={youData || []} valueKey={valueKey} formatValue={formatValue} onCardHover={onCardHover} onCardLeave={onCardLeave} />
      </ChartPanel>
      <ChartPanel label="All Players" color={PANEL_COLORS.all}>
        <TopCardsBarChart cards={allData || []} valueKey={valueKey} formatValue={formatValue} onCardHover={onCardHover} onCardLeave={onCardLeave} />
      </ChartPanel>
      <ChartPanel label="Tournament Players" color={PANEL_COLORS.tournament} blurred={!canSeeFullStats}>
        <TopCardsBarChart cards={tournamentData || []} valueKey={valueKey} formatValue={formatValue} onCardHover={onCardHover} onCardLeave={onCardLeave} />
      </ChartPanel>
      <ChartPanel label="Top Players" color={PANEL_COLORS.top} blurred={!canSeeFullStats}>
        <TopCardsBarChart cards={topData || []} valueKey={valueKey} formatValue={formatValue} onCardHover={onCardHover} onCardLeave={onCardLeave} />
      </ChartPanel>
    </div>
  )
}

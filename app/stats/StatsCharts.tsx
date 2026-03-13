// @ts-nocheck
'use client'

import { useMemo } from 'react'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList } from 'recharts'
import { getAspectColor, getAspectColors } from '@/src/utils/aspectColors'

// === Panel colors ===
const PANEL_COLORS = {
  you: '#64B5F6',
  all: 'rgba(255, 255, 255, 0.9)',
  tournament: '#CE93D8',
  top: '#FFB74D',
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

// === Custom pie label renderer ===
function renderPieLabel({ cx, cy, midAngle, innerRadius, outerRadius, name, percent, value, payload }: any) {
  if (percent < 0.04) return null // Skip tiny slices
  const RADIAN = Math.PI / 180
  const radius = outerRadius + 18
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)
  const total = payload?._total || 0
  const pctStr = `${(percent * 100).toFixed(0)}%`
  const label = total > 0 ? `${name} ${pctStr} (${value}/${total})` : `${name} ${pctStr}`
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
        _total: total,
      }))
  }, [leaders, valueKey])

  if (!data.length) return <div className="stats-chart-empty">No data</div>

  return (
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
            <Cell key={i} fill={getFill(entry.name, entry.colors, 'pie')} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ background: 'rgba(0,0,0,0.85)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6, color: '#fff', fontSize: '0.85rem' }}
          formatter={(value: number, name: string, props: any) => {
            const total = props?.payload?._total || 0
            const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0'
            return [`${pct}% (${value}/${total})`, name]
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}

// === Custom bar label renderer ===
function renderBarLabel(formatValue?: (v: number) => string, total?: number) {
  return (props: any) => {
    const { x, y, width, height, value } = props
    if (width < 30) return null // Don't render on tiny bars
    const pct = total && total > 0 ? `${((value / total) * 100).toFixed(0)}%` : null
    const label = pct ? `${pct} (${value}/${total})` : (formatValue ? formatValue(value) : String(value))
    return (
      <text
        x={x + width - 6}
        y={y + height / 2}
        fill="rgba(255,255,255,0.95)"
        textAnchor="end"
        dominantBaseline="central"
        fontSize={10}
        fontWeight={600}
      >
        {label}
      </text>
    )
  }
}

// === Top Cards Bar Chart ===
function TopCardsBarChart({ cards, valueKey, formatValue }: {
  cards: { cardName: string; aspects: string[]; [key: string]: any }[]
  valueKey: string
  formatValue?: (v: number) => string
}) {
  const data = useMemo(() => {
    if (!cards?.length) return []
    return cards
      .filter(c => c[valueKey] > 0)
      .sort((a, b) => b[valueKey] - a[valueKey])
      .slice(0, 25)
      .map(c => ({
        name: c.cardName,
        fullName: c.cardName,
        value: c[valueKey],
        color: getAspectColor({ aspects: c.aspects }),
        colors: getAspectColors({ aspects: c.aspects }),
      }))
  }, [cards, valueKey])

  if (!data.length) return <div className="stats-chart-empty">No data</div>

  const total = data.reduce((sum, d) => sum + d.value, 0)
  const fmtVal = formatValue || ((v: number) => String(v))

  return (
    <ResponsiveContainer width="100%" height={Math.max(300, data.length * 28)}>
      <BarChart data={data} layout="vertical" margin={{ left: 0, right: 30, top: 5, bottom: 5 }}>
        <GradientDefs data={data} prefix="bar" />
        <XAxis type="number" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis
          type="category"
          dataKey="name"
          width={180}
          tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{ background: 'rgba(0,0,0,0.85)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6, color: '#fff', fontSize: '0.85rem' }}
          formatter={(value: number) => [fmtVal(value)]}
          labelFormatter={(label: string, payload: any[]) => payload?.[0]?.payload?.fullName || label}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
          {data.map((entry, i) => (
            <Cell key={i} fill={getFill(entry.name, entry.colors, 'bar')} />
          ))}
          <LabelList content={renderBarLabel(formatValue, total)} />
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
export function CardCharts({ allData, tournamentData, topData, youData, valueKey, formatValue, canSeeFullStats, user }: {
  allData: any[] | null
  tournamentData: any[] | null
  topData: any[] | null
  youData: any[] | null
  valueKey: string
  formatValue?: (v: number) => string
  canSeeFullStats?: boolean
  user?: any
}) {
  return (
    <div className="stats-chart-grid">
      <ChartPanel label="You" color={PANEL_COLORS.you} loggedOut={!user}>
        <TopCardsBarChart cards={youData || []} valueKey={valueKey} formatValue={formatValue} />
      </ChartPanel>
      <ChartPanel label="All Players" color={PANEL_COLORS.all}>
        <TopCardsBarChart cards={allData || []} valueKey={valueKey} formatValue={formatValue} />
      </ChartPanel>
      <ChartPanel label="Tournament Players" color={PANEL_COLORS.tournament} blurred={!canSeeFullStats}>
        <TopCardsBarChart cards={tournamentData || []} valueKey={valueKey} formatValue={formatValue} />
      </ChartPanel>
      <ChartPanel label="Top Players" color={PANEL_COLORS.top} blurred={!canSeeFullStats}>
        <TopCardsBarChart cards={topData || []} valueKey={valueKey} formatValue={formatValue} />
      </ChartPanel>
    </div>
  )
}

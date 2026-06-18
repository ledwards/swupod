// @ts-nocheck
'use client'

import React, { useState } from 'react'
import { getSetConfig } from '@/src/utils/setConfigs'
import { STATS_SET_ORDER, STATS_SET_COLORS, DEFAULT_STATS_SET_TAB } from '@/src/utils/statsSetTabs'
import duplicateStats from '@/src/data/duplicateStats.json'
import './duplicate-rates.css'

const CATS = ['Leader', 'Base', 'Common', 'Uncommon', 'Rare', 'Legendary', 'Special']
const fmt2 = (n: number) => (n ?? 0).toFixed(2)

function Distribution({ hist, color }: { hist: number[]; color: string }) {
  const total = hist.reduce((a, b) => a + b, 0) || 1
  const pct = hist.map((h) => (h / total) * 100)
  const max = Math.max(...pct, 1)
  // show 0..8 duplicates
  const bars = pct.slice(0, 9)
  return (
    <div className="dup-dist">
      {bars.map((p, k) => (
        <div className="dup-dist-col" key={k}>
          <div className="dup-dist-bar-track">
            <div
              className="dup-dist-bar"
              style={{ height: `${(p / max) * 100}%`, background: color }}
              title={`${p.toFixed(1)}% of pools have ${k} duplicate${k === 1 ? '' : 's'}`}
            />
          </div>
          <span className="dup-dist-pct">{p >= 1 ? Math.round(p) + '%' : ''}</span>
          <span className="dup-dist-k">{k}</span>
        </div>
      ))}
    </div>
  )
}

function SetDupView({ code }: { code: string }) {
  const s = (duplicateStats as any).sets?.[code]
  const color = STATS_SET_COLORS[code] || '#888'
  const name = getSetConfig(code)?.setName || code
  if (!s) return <div className="dup-empty">No data for {code}.</div>

  const a = s.sealed6, d = s.draft3
  return (
    <div className="dup-view">
      <div className="dup-set-title" style={{ color }}>
        {name} <span className="dup-set-code">({code})</span>
      </div>

      {/* Headline numbers */}
      <div className="dup-headline">
        <div className="dup-stat-card">
          <div className="dup-stat-label">Sealed — 6-pack pool</div>
          <div className="dup-stat-value" style={{ color }}>{fmt2(a.mean)}</div>
          <div className="dup-stat-sub">duplicate cards / pool</div>
          <div className="dup-ci">95% CI [{fmt2(a.ci95[0])}, {fmt2(a.ci95[1])}]</div>
        </div>
        <div className="dup-stat-card">
          <div className="dup-stat-label">Draft — 3-pack pool</div>
          <div className="dup-stat-value" style={{ color }}>{fmt2(d.mean)}</div>
          <div className="dup-stat-sub">duplicate cards / pool</div>
          <div className="dup-ci">95% CI [{fmt2(d.ci95[0])}, {fmt2(d.ci95[1])}]</div>
        </div>
      </div>

      {/* Theory vs actual vs naive */}
      <div className="dup-section">
        <h3>Actual vs. theory (6-pack pool)</h3>
        <div className="dup-compare">
          <div className="dup-compare-row">
            <span className="dup-compare-label">Actual (Monte Carlo)</span>
            <span className="dup-compare-val" style={{ color }}>{fmt2(a.mean)}</span>
          </div>
          <div className="dup-compare-row">
            <span className="dup-compare-label">Variant-collision model</span>
            <span className="dup-compare-val">{fmt2(a.theoryMean)}</span>
          </div>
          <div className="dup-compare-row dup-compare-muted">
            <span className="dup-compare-label">Naive birthday model (ignores belt)</span>
            <span className="dup-compare-val">{fmt2(a.naiveMean)}</span>
          </div>
        </div>
        <p className="dup-note">
          The belt collation makes same-printing repeats ~0, so the naive model massively over-predicts.
          The variant-collision model (each foil/hyperspace card may collide with a card of the same
          name already in the pool) matches the real generator within ~5%
          (z = {a.z}, χ²/dof = {a.chi2PerDof}).
        </p>
      </div>

      {/* Distribution */}
      <div className="dup-section">
        <h3>How many duplicates per sealed pool</h3>
        <Distribution hist={a.hist} color={color} />
      </div>

      {/* Category breakdown */}
      <div className="dup-section">
        <h3>Where the duplicates land (6-pack pool)</h3>
        <table className="dup-table">
          <thead>
            <tr><th>Card type</th><th>Duplicates / pool</th><th>Pool size</th></tr>
          </thead>
          <tbody>
            {CATS.filter((c) => (a.byCat[c] || 0) > 0.001 || (s.poolSizes[c] || 0) > 0).map((c) => (
              <tr key={c}>
                <td>{c}</td>
                <td>{fmt2(a.byCat[c] || 0)}</td>
                <td className="dup-muted">{s.poolSizes[c] || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Variant pairing */}
      <div className="dup-section">
        <h3>What variant pairing causes each duplicate</h3>
        <table className="dup-table">
          <thead><tr><th>Pairing</th><th>Per pool</th></tr></thead>
          <tbody>
            {Object.entries(a.pair).filter(([, v]: any) => v > 0.01).map(([k, v]: any) => (
              <tr key={k}><td>{k}</td><td>{fmt2(v)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function DuplicateRatesPage() {
  const [tab, setTab] = useState(DEFAULT_STATS_SET_TAB)
  const meta = duplicateStats as any
  const tabs = STATS_SET_ORDER.filter((c) => meta.sets?.[c])

  return (
    <div className="app">
      <div className="dup-page">
        <div className="dup-header">
          <h1>Duplicate Rates by Set</h1>
          <p>
            Expected number of duplicate cards per pool — counting a foil, hyperspace, or
            prestige printing as the <em>same card</em> as its normal version.
          </p>
          <p className="dup-subnote">
            Measured from {meta.sampleSizePerSet?.toLocaleString?.() || meta.sampleSizePerSet} simulated
            pools per set using the live pack generator (belts, foils, hyperspace, UC3 &amp; prestige upgrades).
          </p>
        </div>

        <div className="dup-tabs">
          {tabs.map((code) => (
            <button
              key={code}
              className={`dup-tab ${tab === code ? 'active' : ''}`}
              onClick={() => setTab(code)}
              style={
                STATS_SET_COLORS[code]
                  ? ({ '--set-color': STATS_SET_COLORS[code], ...(tab === code ? { backgroundColor: STATS_SET_COLORS[code], borderColor: STATS_SET_COLORS[code] } : {}) } as any)
                  : {}
              }
            >
              {code}
            </button>
          ))}
        </div>

        <div className="dup-content">
          <SetDupView code={tab} />
        </div>

        {meta.generatedAt ? (
          <p className="dup-footer-note">Data generated {meta.generatedAt}. {meta.metric}.</p>
        ) : null}
      </div>
    </div>
  )
}

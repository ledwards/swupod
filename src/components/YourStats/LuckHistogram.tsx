// @ts-nocheck
'use client'

/**
 * LuckHistogram + duplicate/showcase widgets + aspect breakdown.
 *
 * The centerpiece of the redesigned Luck tab:
 *  - One thin bar per base-belt card in the set, ordered by collector number.
 *    Bar color = the card's aspect (a gradient for multi-aspect cards); height
 *    = how many times you've pulled it.
 *  - Hover (desktop) OR tap (mobile) a bar to pin a readout below the chart:
 *    card name, your count vs expected, the delta, and whether that's within
 *    normal variance for the number of packs you've opened.
 *  - A search box greys out non-matching cards in place (it does not filter
 *    them out) so the shape of the set stays intact.
 *
 * No hover-only interaction: the readout is a real element under the chart that
 * both hover and tap drive, per .claude/rules/mobile.md.
 */

import { useMemo, useState } from 'react'
import { ASPECT_COLORS, NO_ASPECT_COLOR } from '@/src/utils/aspectColors'

const COLOR_ASPECTS = ['Vigilance', 'Command', 'Aggression', 'Cunning'] as const

export interface CardHit {
  cardId: string
  number: number
  name: string
  aspects: string[]
  count: number
  expected: number
  delta: number
  z: number
  withinNormal: boolean
}

// A consistent, aspect-independent color for delta text so it reads the same
// over any bar color (per the brief: "a consistent contrast color like black").
const DELTA_INK = '#0b0b0c'

function barBackground(aspects: string[]): string {
  const colors = (aspects || [])
    .filter((a) => (COLOR_ASPECTS as readonly string[]).includes(a))
    .map((a) => ASPECT_COLORS[a])
  if (colors.length === 0) return NO_ASPECT_COLOR
  if (colors.length === 1) return colors[0]
  // Multi-aspect: blend the two driving colors so the bar reads as both.
  return `linear-gradient(180deg, ${colors[0]} 0%, ${colors[colors.length - 1]} 100%)`
}

function varianceVerdict(hit: CardHit): string {
  if (hit.count === 0) {
    return hit.expected >= 1
      ? `Expected about ${hit.expected.toFixed(1)} by now — you have none yet. Still well within normal.`
      : 'Not pulled yet, which is completely normal for a card this rare in your packs.'
  }
  if (hit.withinNormal) {
    return 'Right around what’s expected — normal variance, not luck.'
  }
  return hit.z > 0
    ? 'More than expected — a genuinely lucky run on this card.'
    : 'Fewer than expected — the unlucky tail for this card.'
}

function deltaLabel(hit: CardHit): string {
  const d = hit.delta
  const sign = d > 0 ? '+' : ''
  return `${sign}${d.toFixed(1)} vs expected ${hit.expected.toFixed(1)}`
}

function CardReadout({ hit, packsCracked }: { hit: CardHit | null; packsCracked: number }) {
  if (!hit) {
    return (
      <div className="your-stats-luck-readout your-stats-luck-readout--empty">
        Hover or tap a bar to see how your pulls of that card compare to normal.
      </div>
    )
  }
  return (
    <div className="your-stats-luck-readout">
      <div className="your-stats-luck-readout-head">
        <span className="your-stats-luck-readout-swatch" style={{ background: barBackground(hit.aspects) }} aria-hidden="true" />
        <strong>{hit.name}</strong>
        <span className="your-stats-luck-readout-num">#{hit.number}</span>
      </div>
      <div className="your-stats-luck-readout-body">
        <span className="your-stats-luck-readout-count">You pulled it <strong>{hit.count}×</strong></span>
        <span className="your-stats-luck-readout-delta" style={{ color: DELTA_INK }}>{deltaLabel(hit)}</span>
      </div>
      <p className="your-stats-luck-readout-context">
        {varianceVerdict(hit)} <span className="your-stats-luck-readout-packs">({packsCracked.toLocaleString()} packs)</span>
      </p>
    </div>
  )
}

export function LuckHistogram({ cardHits, packsCracked }: { cardHits: CardHit[]; packsCracked: number }) {
  const [search, setSearch] = useState('')
  const [hovered, setHovered] = useState<CardHit | null>(null)
  const [pinned, setPinned] = useState<CardHit | null>(null)

  const maxCount = useMemo(
    () => Math.max(1, ...cardHits.map((h) => h.count)),
    [cardHits],
  )
  const needle = search.trim().toLowerCase()
  const active = hovered || pinned

  if (!cardHits.length) return null

  return (
    <section className="your-stats-luck-hist" aria-label="Card pull histogram">
      <div className="your-stats-luck-hist-head">
        <div>
          <h4>Every card you opened</h4>
          <p>Bars are cards in collector-number order, colored by aspect. Taller = you pulled it more.</p>
        </div>
        <label className="your-stats-search your-stats-luck-hist-search">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a card…"
            aria-label="Highlight a card in the histogram"
          />
        </label>
      </div>

      <div
        className="your-stats-luck-hist-bars"
        role="group"
        aria-label="Cards by collector number"
        onMouseLeave={() => setHovered(null)}
      >
        {cardHits.map((hit) => {
          const heightPct = hit.count > 0 ? Math.max(6, (hit.count / maxCount) * 100) : 2
          const dimmed = needle.length > 0 && !hit.name.toLowerCase().includes(needle)
          const isActive = active?.cardId === hit.cardId
          return (
            <button
              key={hit.cardId}
              type="button"
              className={`your-stats-luck-bar${dimmed ? ' your-stats-luck-bar--dim' : ''}${isActive ? ' your-stats-luck-bar--active' : ''}${hit.count === 0 ? ' your-stats-luck-bar--empty' : ''}`}
              style={{ height: `${heightPct}%`, background: hit.count > 0 ? barBackground(hit.aspects) : undefined }}
              onMouseEnter={() => setHovered(hit)}
              onFocus={() => setHovered(hit)}
              onClick={() => setPinned((cur) => (cur?.cardId === hit.cardId ? null : hit))}
              aria-label={`${hit.name}, number ${hit.number}, pulled ${hit.count} times`}
              title={`${hit.name} — ${hit.count}×`}
            />
          )
        })}
      </div>

      <CardReadout hit={active} packsCracked={packsCracked} />
    </section>
  )
}

// ---------------------------------------------------------------------------
// Duplicate-rate + showcase-rate widgets
// ---------------------------------------------------------------------------

export interface DuplicatesData {
  actualCount: number
  actualTotal: number
  actualRate: number
  expectedCount: number
  expectedTotal: number
  expectedRate: number
}

export interface ShowcaseData {
  actualCount: number
  actualRate: number
  expectedRate: number
  expectedCount: number
}

function pct(n: number): string {
  return `${(n * 100).toFixed(n >= 0.1 ? 0 : 1)}%`
}

export function DuplicateRateWidget({ data }: { data: DuplicatesData }) {
  const luckier = data.actualRate <= data.expectedRate
  return (
    <div className="your-stats-luck-widget">
      <h4>Duplicates</h4>
      <div className="your-stats-luck-widget-figures">
        <div>
          <span className="your-stats-luck-widget-num">{pct(data.actualRate)}</span>
          <span className="your-stats-luck-widget-cap">your repeat rate</span>
        </div>
        <span className="your-stats-luck-widget-vs">vs</span>
        <div>
          <span className="your-stats-luck-widget-num your-stats-luck-widget-num--exp">{pct(data.expectedRate)}</span>
          <span className="your-stats-luck-widget-cap">expected</span>
        </div>
      </div>
      <p className="your-stats-luck-widget-copy">
        Most people expect every card to be different. They aren&apos;t — with a fixed set,
        repeats are guaranteed. You&apos;ve seen <strong>{Math.round(data.actualCount).toLocaleString()}</strong> repeat
        {Math.round(data.actualCount) === 1 ? '' : 's'}; the math predicts about{' '}
        <strong>{Math.round(data.expectedCount).toLocaleString()}</strong>.{' '}
        {luckier ? 'Slightly fewer repeats than average.' : 'A few more repeats than average — normal swing.'}
      </p>
    </div>
  )
}

export function ShowcaseRateWidget({ data, packsCracked }: { data: ShowcaseData; packsCracked: number }) {
  const oneIn = data.expectedRate > 0 ? Math.round(1 / data.expectedRate) : 0
  return (
    <div className="your-stats-luck-widget">
      <h4>Showcases</h4>
      <div className="your-stats-luck-widget-figures">
        <div>
          <span className="your-stats-luck-widget-num">{data.actualCount.toLocaleString()}</span>
          <span className="your-stats-luck-widget-cap">you pulled</span>
        </div>
        <span className="your-stats-luck-widget-vs">vs</span>
        <div>
          <span className="your-stats-luck-widget-num your-stats-luck-widget-num--exp">{data.expectedCount.toFixed(2)}</span>
          <span className="your-stats-luck-widget-cap">expected</span>
        </div>
      </div>
      <p className="your-stats-luck-widget-copy">
        Showcase leaders are the rarest pull of all{oneIn ? <> — about <strong>1 in {oneIn.toLocaleString()}</strong> packs</> : null}.
        Across your <strong>{packsCracked.toLocaleString()}</strong> packs, {data.actualCount === 0
          ? 'none yet is exactly what’s expected.'
          : `${data.actualCount} is ${data.actualCount > data.expectedCount ? 'a genuinely lucky' : 'right on'} pace.`}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Aspect breakdown (icons left of labels; no hover graph)
// ---------------------------------------------------------------------------

const ASPECT_META: Record<string, { icon: string | null; color: string }> = {
  Vigilance: { icon: '/icons/vigilance.png', color: ASPECT_COLORS.Vigilance },
  Command: { icon: '/icons/command.png', color: ASPECT_COLORS.Command },
  Aggression: { icon: '/icons/aggression.png', color: ASPECT_COLORS.Aggression },
  Cunning: { icon: '/icons/cunning.png', color: ASPECT_COLORS.Cunning },
  Neutral: { icon: null, color: NO_ASPECT_COLOR },
  Multicolor: { icon: '/icons/aspects.png', color: '#b07cff' },
}
const ASPECT_ORDER = ['Vigilance', 'Command', 'Aggression', 'Cunning', 'Multicolor', 'Neutral']

export function AspectBreakdown({ observed, expected }: { observed: Record<string, number>; expected: Record<string, number> }) {
  const max = Math.max(1, ...ASPECT_ORDER.map((a) => Math.max(observed[a] || 0, expected[a] || 0)))
  return (
    <div className="your-stats-luck-aspects">
      <h4>Aspect mix</h4>
      <ul className="your-stats-luck-aspect-list">
        {ASPECT_ORDER.map((aspect) => {
          const meta = ASPECT_META[aspect]
          const you = Math.round(observed[aspect] || 0)
          const exp = expected[aspect] || 0
          return (
            <li key={aspect} className="your-stats-luck-aspect-row">
              <span className="your-stats-luck-aspect-label">
                {meta.icon ? (
                  <img src={meta.icon} alt="" width={18} height={18} aria-hidden="true" />
                ) : (
                  <span className="your-stats-luck-aspect-dot" style={{ background: meta.color }} aria-hidden="true" />
                )}
                <span>{aspect}</span>
              </span>
              <span className="your-stats-luck-aspect-bar-track">
                <span
                  className="your-stats-luck-aspect-bar"
                  style={{ width: `${(you / max) * 100}%`, background: meta.color }}
                />
              </span>
              <span className="your-stats-luck-aspect-vals">
                <strong>{you}</strong>
                <small>exp {exp.toFixed(1)}</small>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

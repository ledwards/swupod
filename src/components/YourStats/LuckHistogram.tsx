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

// Real game aspects (the 4 colors + the two alignments) and their icon assets.
const ASPECT_ICON: Record<string, string> = {
  Vigilance: '/icons/vigilance.png',
  Command: '/icons/command.png',
  Aggression: '/icons/aggression.png',
  Cunning: '/icons/cunning.png',
  Heroism: '/icons/heroism.png',
  Villainy: '/icons/villainy.png',
}

function AspectIcons({ aspects }: { aspects: string[] }) {
  const icons = (aspects || []).filter((a) => ASPECT_ICON[a])
  if (icons.length === 0) {
    return <span className="your-stats-luck-readout-swatch" style={{ background: NO_ASPECT_COLOR }} aria-hidden="true" />
  }
  return (
    <span className="your-stats-luck-readout-icons" aria-hidden="true">
      {icons.map((a) => (
        <img key={a} src={ASPECT_ICON[a]} alt="" width={16} height={16} />
      ))}
    </span>
  )
}

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
// regardless of the card's aspect — light, for the dark readout.
const DELTA_INK = '#ffd66b'

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
        <AspectIcons aspects={hit.aspects} />
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
          // sqrt scale: keeps single pulls visible even when one card spikes,
          // and stays readable whether you've opened 10 packs or 1000.
          const scale = (v: number) => (v > 0 ? (Math.sqrt(v) / Math.sqrt(maxCount)) * 100 : 0)
          const heightPct = hit.count > 0 ? Math.max(8, scale(hit.count)) : 0
          const expPct = Math.min(100, scale(hit.expected))
          const dimmed = needle.length > 0 && !hit.name.toLowerCase().includes(needle)
          const isActive = active?.cardId === hit.cardId
          // The whole column (full height) is the hover/click target, so even a
          // zero-count card can be inspected.
          return (
            <button
              key={hit.cardId}
              type="button"
              className={`your-stats-luck-bar-col${dimmed ? ' your-stats-luck-bar--dim' : ''}${isActive ? ' your-stats-luck-bar--active' : ''}`}
              onMouseEnter={() => setHovered(hit)}
              onFocus={() => setHovered(hit)}
              onClick={() => setPinned((cur) => (cur?.cardId === hit.cardId ? null : hit))}
              aria-label={`${hit.name}, number ${hit.number}, pulled ${hit.count} times, expected ${hit.expected.toFixed(1)}`}
              title={`${hit.name} — ${hit.count}× (exp ${hit.expected.toFixed(1)})`}
            >
              <span
                className={`your-stats-luck-bar${hit.count === 0 ? ' your-stats-luck-bar--empty' : ''}`}
                style={{ height: `${heightPct}%`, background: hit.count > 0 ? barBackground(hit.aspects) : undefined }}
              />
              {hit.expected > 0 && (
                <span className="your-stats-luck-bar-expected" style={{ bottom: `${expPct}%` }} />
              )}
            </button>
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
  const total = Math.round(data.actualTotal)
  const dupes = Math.round(data.actualCount)
  const unique = Math.max(0, total - dupes)
  const copiesPerCard = unique > 0 ? total / unique : 0
  return (
    <div className="your-stats-luck-widget">
      <h4>Duplicates</h4>
      <div className="your-stats-luck-widget-figures">
        <div>
          <span className="your-stats-luck-widget-num">{copiesPerCard ? copiesPerCard.toFixed(2) : '—'}×</span>
          <span className="your-stats-luck-widget-cap">copies per card</span>
        </div>
        <div>
          <span className="your-stats-luck-widget-num your-stats-luck-widget-num--exp">{unique.toLocaleString()}/{total.toLocaleString()}</span>
          <span className="your-stats-luck-widget-cap">unique of opened</span>
        </div>
      </div>
      <p className="your-stats-luck-widget-copy">
        You&apos;ve opened <strong>{total.toLocaleString()}</strong> cards — <strong>{unique.toLocaleString()}</strong> different
        ones, so <strong>{dupes.toLocaleString()}</strong> were repeats. Duplicates are normal: with a fixed set,
        the more you open the more copies you stack up.
        <span className="your-stats-luck-widget-note"> A precise, set-aware expected baseline is in progress.</span>
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

// Inclusive aspect order: the four colors then the two alignments. A card
// counts toward EVERY aspect it carries (a Cad Bane adds to both Vigilance and
// Command), so totals exceed the number of cards opened — that's expected.
const ASPECT_ORDER = ['Vigilance', 'Command', 'Aggression', 'Cunning', 'Heroism', 'Villainy']
const ASPECT_COLOR_FOR: Record<string, string> = {
  Vigilance: ASPECT_COLORS.Vigilance,
  Command: ASPECT_COLORS.Command,
  Aggression: ASPECT_COLORS.Aggression,
  Cunning: ASPECT_COLORS.Cunning,
  // Villainy is near-black; lift it so the bar is visible on the dark track.
  Heroism: '#cdd2da',
  Villainy: '#6b7280',
}

export function AspectBreakdown({ cardHits }: { cardHits: CardHit[] }) {
  const agg: Record<string, { you: number; exp: number }> = {}
  for (const a of ASPECT_ORDER) agg[a] = { you: 0, exp: 0 }
  for (const hit of cardHits) {
    for (const a of hit.aspects || []) {
      if (agg[a]) {
        agg[a].you += hit.count
        agg[a].exp += hit.expected
      }
    }
  }
  const max = Math.max(1, ...ASPECT_ORDER.map((a) => Math.max(agg[a].you, agg[a].exp)))
  return (
    <div className="your-stats-luck-aspects">
      <h4>Aspect mix</h4>
      <p className="your-stats-luck-aspects-note">
        Counts every card that <em>includes</em> a color, so a dual-aspect card lands in
        both rows — totals add up to more than the cards you opened.
      </p>
      <ul className="your-stats-luck-aspect-list">
        {ASPECT_ORDER.map((aspect) => {
          const you = Math.round(agg[aspect].you)
          const exp = agg[aspect].exp
          return (
            <li key={aspect} className="your-stats-luck-aspect-row">
              <span className="your-stats-luck-aspect-label">
                <img src={ASPECT_ICON[aspect]} alt="" width={18} height={18} aria-hidden="true" />
                <span>{aspect}</span>
              </span>
              <span className="your-stats-luck-aspect-bar-track">
                <span
                  className="your-stats-luck-aspect-bar"
                  style={{ width: `${(you / max) * 100}%`, background: ASPECT_COLOR_FOR[aspect] }}
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

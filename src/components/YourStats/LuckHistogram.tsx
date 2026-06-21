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

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ASPECT_COLORS, NO_ASPECT_COLOR, RARITY_COLORS } from '@/src/utils/aspectColors'
import { twoSidedPValue } from '@/src/utils/stats'
import { useRevealOnView } from '@/src/hooks/useRevealOnView'

const COLOR_ASPECTS = ['Vigilance', 'Command', 'Aggression', 'Cunning'] as const

// Real game aspects (the 4 colors + the two alignments) and their icon assets.
const ASPECT_ICON: Record<string, string> = {
  Vigilance: '/icons/vigilance.png',
  Command: '/icons/command.png',
  Aggression: '/icons/aggression.png',
  Cunning: '/icons/cunning.png',
  Heroism: '/icons/heroism.png',
  Villainy: '/icons/villainy.png',
  Multicolor: '/icons/aspects.png',
}

const RARITY_ICON: Record<string, string> = {
  Common: '/icons/rarity/common.png',
  Uncommon: '/icons/rarity/uncommon.png',
  Rare: '/icons/rarity/rare.png',
  Legendary: '/icons/rarity/legendary.png',
  Special: '/icons/rarity/special.png',
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
  rarity: string
  count: number
  expected: number
  delta: number
  z: number
  withinNormal: boolean
}

const FILTER_ASPECTS = ['Vigilance', 'Command', 'Aggression', 'Cunning', 'Heroism', 'Villainy'] as const
const FILTER_RARITIES = ['Common', 'Uncommon', 'Rare', 'Legendary'] as const

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

// Poisson standard deviation for a count with mean `expected` — the same model
// the API uses to derive `z` (σ = √expected). Surfaced in the readout so the
// user sees the actual spread, not a vague "normal variance" hand-wave.
function sigmaFor(hit: CardHit): number {
  return Math.sqrt(Math.max(hit.expected, 0))
}

// "roughly 1 run in N" from the two-sided normal tail for |z|. Used only for
// the outlier copy, where naming how rare the run is carries the point.
function oneInRuns(z: number): string {
  const p = twoSidedPValue(z)
  if (p <= 0) return 'fewer than 1 run in a million'
  return `roughly 1 run in ${Math.round(1 / p).toLocaleString()}`
}

function varianceVerdict(hit: CardHit): string {
  // Below one expected copy a single σ is wider than the mean itself, so the
  // z-score is unstable — don't dress it up as a sigma reading.
  if (hit.expected < 1) {
    return hit.count === 0
      ? `Expected well under one copy across these packs, so none yet sits right on the mean.`
      : `Expected under one copy here — ${hit.count} is too little data to read as luck either way.`
  }
  const absZ = Math.abs(hit.z).toFixed(1)
  const dir = hit.z >= 0 ? 'above' : 'below'
  if (hit.withinNormal) {
    return `${absZ}σ ${dir} the mean — inside the ±2σ range that holds ~95% of runs, so this is normal variance.`
  }
  return `${absZ}σ ${dir} the mean — past ±2σ; ${oneInRuns(hit.z)} strays this far. A genuinely ${hit.z > 0 ? 'lucky' : 'unlucky'} run on this card.`
}

function deltaLabel(hit: CardHit): string {
  const d = hit.delta
  const sign = d > 0 ? '+' : ''
  const sigma = sigmaFor(hit)
  // Show the spread as expected ± σ so the delta reads against the actual
  // standard deviation, not a bare number.
  const band = sigma >= 0.05 ? ` ± ${sigma.toFixed(1)}` : ''
  return `${sign}${d.toFixed(1)} vs expected ${hit.expected.toFixed(1)}${band}`
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
        <span className="your-stats-luck-readout-num">
          #{hit.number}
          {RARITY_ICON[hit.rarity] && (
            <img className="your-stats-luck-readout-rarity" src={RARITY_ICON[hit.rarity]} alt={hit.rarity} title={hit.rarity} width={15} height={15} />
          )}
        </span>
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
  const [aspectFilters, setAspectFilters] = useState<Set<string>>(new Set())
  const [rarityFilters, setRarityFilters] = useState<Set<string>>(new Set())
  const [sortBy, setSortBy] = useState<'number' | 'frequency' | 'expected'>('number')

  // Horizontal-scroll affordance: a faint chevron fades in (desktop hover) on
  // whichever side still has content to scroll toward. Touch/trackpad scrolling
  // is unaffected — this is only a hint, never the sole way to scroll.
  const barsRef = useRef<HTMLDivElement | null>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const recomputeScroll = useCallback(() => {
    const el = barsRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 0)
    // -1 tolerance for sub-pixel rounding so the right arrow hides at the end.
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }, [])

  const scrollByViewport = useCallback((dir: -1 | 1) => {
    const el = barsRef.current
    if (!el) return
    el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: 'smooth' })
  }, [])

  const sortedHits = useMemo(() => {
    const arr = [...cardHits]
    if (sortBy === 'frequency') arr.sort((a, b) => b.count - a.count || a.number - b.number)
    else if (sortBy === 'expected') arr.sort((a, b) => b.expected - a.expected || a.number - b.number)
    else arr.sort((a, b) => a.number - b.number || a.cardId.localeCompare(b.cardId))
    return arr
  }, [cardHits, sortBy])

  const maxCount = useMemo(
    () => Math.max(1, ...cardHits.map((h) => h.count)),
    [cardHits],
  )
  const needle = search.trim().toLowerCase()
  const active = hovered || pinned

  // Recompute the scroll affordance after layout (mount, sort/content change)
  // and on window resize.
  useLayoutEffect(() => {
    recomputeScroll()
  }, [recomputeScroll, sortedHits, sortBy])

  useEffect(() => {
    window.addEventListener('resize', recomputeScroll)
    return () => window.removeEventListener('resize', recomputeScroll)
  }, [recomputeScroll])

  function toggle(set: Set<string>, setter: (s: Set<string>) => void, key: string) {
    const next = new Set(set)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setter(next)
  }

  // A card is dimmed if it fails the search OR any active aspect/rarity filter.
  // Empty filter sets mean "no filter" (show everything).
  function isDimmed(hit: CardHit): boolean {
    if (needle && !hit.name.toLowerCase().includes(needle)) return true
    if (aspectFilters.size > 0 && !hit.aspects.some((a) => aspectFilters.has(a))) return true
    if (rarityFilters.size > 0 && !rarityFilters.has(hit.rarity)) return true
    return false
  }

  if (!cardHits.length) return null

  return (
    <section className="your-stats-luck-hist" aria-label="Card pull histogram">
      <div className="your-stats-luck-hist-head">
        <div>
          <h4>Every card you opened</h4>
          <p>Bars are cards in collector-number order, colored by aspect. Height = how many you pulled — twice as tall means twice as many.</p>
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

      <div className="your-stats-luck-sort" role="group" aria-label="Sort histogram">
        <span className="your-stats-luck-sort-label">Sort</span>
        {([['number', 'Collector №'], ['frequency', 'Frequency'], ['expected', 'Expected rate']] as const).map(([val, label]) => (
          <button
            key={val}
            type="button"
            className={`your-stats-luck-sort-btn${sortBy === val ? ' is-on' : ''}`}
            onClick={() => setSortBy(val)}
            aria-pressed={sortBy === val}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="your-stats-luck-filters">
        <div className="your-stats-luck-filter-group" role="group" aria-label="Filter by aspect">
          {FILTER_ASPECTS.map((a) => (
            <button
              key={a}
              type="button"
              className={`your-stats-luck-filter-btn${aspectFilters.has(a) ? ' is-on' : ''}`}
              onClick={() => toggle(aspectFilters, setAspectFilters, a)}
              aria-pressed={aspectFilters.has(a)}
              title={a}
            >
              <img src={ASPECT_ICON[a]} alt={a} width={16} height={16} />
            </button>
          ))}
        </div>
        <div className="your-stats-luck-filter-group" role="group" aria-label="Filter by rarity">
          {FILTER_RARITIES.map((r) => (
            <button
              key={r}
              type="button"
              className={`your-stats-luck-filter-btn your-stats-luck-filter-btn--rarity${rarityFilters.has(r) ? ' is-on' : ''}`}
              onClick={() => toggle(rarityFilters, setRarityFilters, r)}
              aria-pressed={rarityFilters.has(r)}
              style={{ ['--rarity' as any]: RARITY_COLORS[r] || '#888' }}
              title={r}
            >
              <span className="your-stats-luck-filter-dot" />{r.charAt(0)}
            </button>
          ))}
        </div>
      </div>

      <div
        className={`your-stats-luck-hist-scroll${canScrollLeft ? ' can-scroll-left' : ''}${canScrollRight ? ' can-scroll-right' : ''}`}
      >
      <div
        ref={barsRef}
        className="your-stats-luck-hist-bars"
        role="group"
        aria-label="Cards by collector number"
        onMouseLeave={() => setHovered(null)}
        onScroll={recomputeScroll}
      >
        {sortedHits.map((hit) => {
          // Linear scale so the chart reads as a true histogram: a card pulled
          // twice is exactly twice as tall as one pulled once. (A small CSS
          // min-height on the bar keeps single pulls visible without distorting
          // the ratio the way the old sqrt scale did.)
          const scale = (v: number) => (v > 0 ? (v / maxCount) * 100 : 0)
          const heightPct = scale(hit.count)
          const expPct = Math.min(100, scale(hit.expected))
          const dimmed = isDimmed(hit)
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

        <button
          type="button"
          className="your-stats-luck-scroll-cue your-stats-luck-scroll-cue--left"
          aria-hidden="true"
          tabIndex={-1}
          onClick={() => scrollByViewport(-1)}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <button
          type="button"
          className="your-stats-luck-scroll-cue your-stats-luck-scroll-cue--right"
          aria-hidden="true"
          tabIndex={-1}
          onClick={() => scrollByViewport(1)}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      <CardReadout hit={active} packsCracked={packsCracked} />
    </section>
  )
}

// ---------------------------------------------------------------------------
// Duplicate-rate + showcase-rate widgets
// ---------------------------------------------------------------------------

export interface DuplicatesData {
  pools: number
  avgPacksPerPool: number
  actualPerPool: number
  expectedPerPool: number
  /** Model's typical per-pool spread (σ) — natural variation between pools,
   *  invariant to how many pools you've opened (NOT the standard error of the mean). */
  expectedSd?: number
  /** False when this set has no precomputed duplicate model yet. */
  hasModel?: boolean
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

// Card counts are whole — show "5", not "5.0". Keep a single decimal only when
// the value is genuinely fractional (e.g. a per-pool average across many pools).
function wholeIfInt(n: number, dp = 1): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(dp)
}

export function DuplicateRateWidget({ data }: { data: DuplicatesData }) {
  const actual = data.actualPerPool
  const expected = data.expectedPerPool
  const sd = data.expectedSd || 0
  const z = sd > 0 ? (actual - expected) / sd : null
  const poolWord = data.avgPacksPerPool > 0 && data.avgPacksPerPool < 4 ? 'draft pool' : 'pool'

  // Stat verdict, in the same σ language as the histogram readout.
  const verdict = (() => {
    if (!data.hasModel || data.pools === 0 || z == null) return null
    const a = Math.abs(z).toFixed(1)
    if (Math.abs(z) <= 2) return `${a}σ from expected — a normal run.`
    return z > 0
      ? `${a}σ above expected — your pools ran duplicate-heavy.`
      : `${a}σ below expected — unusually clean pools.`
  })()

  return (
    <div className="your-stats-luck-widget">
      <h4>Duplicates per pool</h4>
      <div className="your-stats-luck-widget-figures">
        <div>
          <span className="your-stats-luck-widget-num">{wholeIfInt(actual)}</span>
          <span className="your-stats-luck-widget-cap">you saw</span>
        </div>
        <span className="your-stats-luck-widget-vs">vs</span>
        <div>
          <span className="your-stats-luck-widget-num your-stats-luck-widget-num--exp">{data.hasModel ? expected.toFixed(1) : '—'}</span>
          <span className="your-stats-luck-widget-cap">expected</span>
        </div>
      </div>
      <p className="your-stats-luck-widget-copy">
        A duplicate is the same card twice — a foil or hyperspace printing counts as a repeat of
        the normal. The belt almost never repeats a plain printing, so nearly every duplicate is a
        variant colliding with a card already in your {poolWord}.
        {data.hasModel && <> This set runs about <strong>{expected.toFixed(1)}</strong> per pool.</>}
        {verdict && <span className="your-stats-luck-widget-note"> {verdict}</span>}
        {data.pools > 0 && <span className="your-stats-luck-widget-note"> Across {data.pools.toLocaleString()} {poolWord}{data.pools === 1 ? '' : 's'}.</span>}
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

const PRIMARIES = ['Vigilance', 'Command', 'Aggression', 'Cunning'] as const
const ALIGN_COLOR: Record<string, string> = {
  Heroism: '#dfe4ec',
  Villainy: '#5b616e',
  Neutral: NO_ASPECT_COLOR,
  Multicolor: '#b07cff',
}

type Slice = { label: string; value: number; expected: number; color: string }

function PieLegendMark({ slice }: { slice: Slice }) {
  const icon = ASPECT_ICON[slice.label]
  if (icon) {
    return <img className="your-stats-luck-pie-icon" src={icon} alt="" width={15} height={15} />
  }
  return <span className="your-stats-luck-pie-dot" style={{ background: slice.color }} />
}

function Pie({ title, slices }: { title: string; slices: Slice[] }) {
  const { ref: pieRef, inView } = useRevealOnView()
  const total = slices.reduce((s, x) => s + x.value, 0)
  const expTotal = slices.reduce((s, x) => s + x.expected, 0)
  let acc = 0
  const stops = slices
    .filter((s) => s.value > 0)
    .map((s) => {
      const start = (acc / (total || 1)) * 360
      acc += s.value
      const end = (acc / (total || 1)) * 360
      return `${s.color} ${start}deg ${end}deg`
    })
    .join(', ')
  return (
    <div className={`your-stats-luck-pie-block${inView ? ' your-stats-reveal' : ''}`} ref={pieRef}>
      <div className="your-stats-luck-pie" style={{ background: total > 0 ? `conic-gradient(${stops})` : 'rgba(255,255,255,0.08)' }} aria-hidden="true" />
      <div className="your-stats-luck-pie-side">
        <h5>{title}</h5>
        <ul className="your-stats-luck-pie-legend">
          {slices.map((s) => {
            const pct = total > 0 ? Math.round((s.value / total) * 100) : 0
            const expPct = expTotal > 0 ? Math.round((s.expected / expTotal) * 100) : 0
            return (
              <li key={s.label}>
                <PieLegendMark slice={s} />
                <span className="your-stats-luck-pie-label">{s.label}</span>
                <span className="your-stats-luck-pie-val">
                  {Math.round(s.value)} · {pct}%
                  <small className="your-stats-luck-pie-exp"> / exp {expPct}%</small>
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

export function AspectBreakdown({ cardHits }: { cardHits: CardHit[] }) {
  const primary: Record<string, number> = { Vigilance: 0, Command: 0, Aggression: 0, Cunning: 0 }
  const primaryExp: Record<string, number> = { Vigilance: 0, Command: 0, Aggression: 0, Cunning: 0 }
  const align: Record<string, number> = { Heroism: 0, Villainy: 0, Neutral: 0, Multicolor: 0 }
  const alignExp: Record<string, number> = { Heroism: 0, Villainy: 0, Neutral: 0, Multicolor: 0 }
  for (const hit of cardHits) {
    const aspects = hit.aspects || []
    const colors = aspects.filter((a) => (PRIMARIES as readonly string[]).includes(a))
    // Main aspects wheel: each primary the card carries (a dual card lands in both).
    for (const c of colors) { primary[c] += hit.count; primaryExp[c] += hit.expected }
    // Heroism / Villainy / Multicolor wheel — a separate dimension.
    if (aspects.includes('Heroism')) { align.Heroism += hit.count; alignExp.Heroism += hit.expected }
    if (aspects.includes('Villainy')) { align.Villainy += hit.count; alignExp.Villainy += hit.expected }
    if (colors.length === 0) { align.Neutral += hit.count; alignExp.Neutral += hit.expected }
    if (colors.length >= 2) { align.Multicolor += hit.count; alignExp.Multicolor += hit.expected }
  }
  const primarySlices: Slice[] = PRIMARIES.map((p) => ({ label: p, value: primary[p], expected: primaryExp[p], color: ASPECT_COLORS[p] }))
  const alignSlices: Slice[] = ['Heroism', 'Villainy', 'Multicolor', 'Neutral'].map((a) => ({ label: a, value: align[a], expected: alignExp[a], color: ALIGN_COLOR[a] }))
  return (
    <div className="your-stats-luck-aspects">
      <h4>Aspect mix</h4>
      <div className="your-stats-luck-pies">
        <Pie title="Main Aspects" slices={primarySlices} />
        <Pie title="Heroism / Villainy / Multicolor" slices={alignSlices} />
      </div>
      <p className="your-stats-luck-aspects-note">
        Counts every card that <em>includes</em> a color, so a dual-color card lands in
        two aspects — slices add to more than the cards you opened. Expected % is for this set.
      </p>
    </div>
  )
}

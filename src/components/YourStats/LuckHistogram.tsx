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
import { ASPECT_COLORS, NO_ASPECT_COLOR, RARITY_COLORS } from '@/src/utils/aspectColors'

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
  const [aspectFilters, setAspectFilters] = useState<Set<string>>(new Set())
  const [rarityFilters, setRarityFilters] = useState<Set<string>>(new Set())
  const [sortBy, setSortBy] = useState<'number' | 'frequency' | 'expected'>('number')

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
        className="your-stats-luck-hist-bars"
        role="group"
        aria-label="Cards by collector number"
        onMouseLeave={() => setHovered(null)}
      >
        {sortedHits.map((hit) => {
          // sqrt scale: keeps single pulls visible even when one card spikes,
          // and stays readable whether you've opened 10 packs or 1000.
          const scale = (v: number) => (v > 0 ? (Math.sqrt(v) / Math.sqrt(maxCount)) * 100 : 0)
          const heightPct = hit.count > 0 ? Math.max(8, scale(hit.count)) : 0
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
  const actual = data.actualPerPool
  return (
    <div className="your-stats-luck-widget">
      <h4>Duplicates per pool</h4>
      <div className="your-stats-luck-widget-figures">
        <div>
          <span className="your-stats-luck-widget-num">{actual.toFixed(2)}</span>
          <span className="your-stats-luck-widget-cap">you saw</span>
        </div>
        <span className="your-stats-luck-widget-vs">vs</span>
        <div>
          <span className="your-stats-luck-widget-num your-stats-luck-widget-num--exp">0</span>
          <span className="your-stats-luck-widget-cap">expected</span>
        </div>
      </div>
      <p className="your-stats-luck-widget-copy">
        A single pool gives you <strong>no duplicate cards</strong> — including foils and
        hyperspace. Each rarity is drawn from a shuffled hopper without replacement, and one
        pool never empties it, so you can&apos;t pull the same card twice (you saw {actual.toFixed(2)}/pool).
        Duplicates only build up <em>across</em> pools.
        {data.pools > 0 && <span className="your-stats-luck-widget-note"> Across {data.pools.toLocaleString()} pool{data.pools === 1 ? '' : 's'}.</span>}
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

function Pie({ title, slices }: { title: string; slices: Slice[] }) {
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
    <div className="your-stats-luck-pie-block">
      <div className="your-stats-luck-pie" style={{ background: total > 0 ? `conic-gradient(${stops})` : 'rgba(255,255,255,0.08)' }} aria-hidden="true" />
      <div className="your-stats-luck-pie-side">
        <h5>{title}</h5>
        <ul className="your-stats-luck-pie-legend">
          {slices.map((s) => {
            const pct = total > 0 ? Math.round((s.value / total) * 100) : 0
            const expPct = expTotal > 0 ? Math.round((s.expected / expTotal) * 100) : 0
            return (
              <li key={s.label}>
                <span className="your-stats-luck-pie-dot" style={{ background: s.color }} />
                {ASPECT_ICON[s.label] && <img src={ASPECT_ICON[s.label]} alt="" width={15} height={15} />}
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
      <p className="your-stats-luck-aspects-note">
        Counts every card that <em>includes</em> a color, so a dual-color card lands in
        two aspects — slices add to more than the cards you opened. Expected % is for this set.
      </p>
      <div className="your-stats-luck-pies">
        <Pie title="Main Aspects" slices={primarySlices} />
        <Pie title="Heroism / Villainy / Multicolor" slices={alignSlices} />
      </div>
    </div>
  )
}

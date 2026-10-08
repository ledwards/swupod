// @ts-nocheck
'use client'

/**
 * DraftAnalytics — draft-only Meta widgets (Pack 1 Pick 1 + average pick turn).
 *
 * Pick turn is the interesting one: every drafted card has an average position
 * it's taken at (pick 1 = bonkers bomb, pick 14 = wheel fodder). We render the
 * whole set as a single ranked "pick-order ladder" — one row per card with a
 * marker on a 1→14 track — and let you narrow it by typing, or with the same
 * aspect / cost / rarity filter buttons used elsewhere. Cards vs leaders toggle.
 */

import { useEffect, useMemo, useState } from 'react'
import { ASPECT_COLORS, NO_ASPECT_COLOR, RARITY_COLORS } from '@/src/utils/aspectColors'
import { CardName } from './CardNamePreview'
import CostIcon from '@/src/components/CostIcon'

const ASPECT_ICON: Record<string, string> = {
  Vigilance: '/icons/vigilance.png',
  Command: '/icons/command.png',
  Aggression: '/icons/aggression.png',
  Cunning: '/icons/cunning.png',
  Heroism: '/icons/heroism.png',
  Villainy: '/icons/villainy.png',
}
const FILTER_ASPECTS = ['Vigilance', 'Command', 'Aggression', 'Cunning', 'Heroism', 'Villainy'] as const
// Special (S) shows up in some boosters — include it in the rarity filter.
const FILTER_RARITIES = ['Common', 'Uncommon', 'Rare', 'Legendary', 'Special'] as const
const RARITY_ICON: Record<string, string> = {
  Common: '/icons/rarity/common.png',
  Uncommon: '/icons/rarity/uncommon.png',
  Rare: '/icons/rarity/rare.png',
  Legendary: '/icons/rarity/legendary.png',
  Special: '/icons/rarity/special.png',
}
const COLOR_ASPECTS = ['Vigilance', 'Command', 'Aggression', 'Cunning']

interface PickRow {
  cardName: string
  rarity: string
  cardType: string
  aspects: string[]
  cost: number | null
  timesPicked: number
  avgPickPosition: number
  p1p1Picks: number
  p1p1Pct: number | null
  firstPicks: number
  firstPickPct: number | null
  subtitle: string | null
  imageUrl: string | null
  backImageUrl: string | null
}

function aspectColor(aspects: string[]): string {
  const c = (aspects || []).filter((a) => COLOR_ASPECTS.includes(a)).map((a) => ASPECT_COLORS[a])
  if (c.length === 0) return NO_ASPECT_COLOR
  if (c.length === 1) return c[0]
  return `linear-gradient(90deg, ${c[0]}, ${c[c.length - 1]})`
}

async function getJson(url: string) {
  const r = await fetch(url, { credentials: 'include' })
  if (!r.ok) throw new Error(`${url} → ${r.status}`)
  const b = await r.json()
  return b && b.data ? b.data : b
}

const MIN_PICKS = 8

/** A pick-1 ranking card (Pack-1-Pick-1 or Any-pack-pick-1). Bars show the
 *  ACTUAL pick-1 percentage (not normalized to the top row), so a 20.8% rate
 *  fills 20.8% of the track. */
function Pick1Card({ title, subtitle, rows, countOf, pctOf, loading }: {
  title: string
  subtitle: string
  rows: PickRow[]
  countOf: (c: PickRow) => number
  pctOf: (c: PickRow) => number | null
  loading: boolean
}) {
  return (
    <section className="your-stats-meta-card">
      <header className="your-stats-meta-card-header">
        <div>
          <h3>{title}</h3>
        </div>
        <span className="your-stats-meta-tag">Draft</span>
      </header>
      <p className="your-stats-meta-subtitle">{subtitle}</p>
      {loading ? (
        <div className="your-stats-meta-bars">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton-line your-stats-meta-skeleton" />)}</div>
      ) : rows.length === 0 ? (
        <p className="your-stats-meta-empty">No draft data for this set yet.</p>
      ) : (
        <div className="your-stats-meta-bars">
          {rows.map((c) => (
            <div key={c.cardName} className="your-stats-meta-bar-row">
              <div className="your-stats-meta-bar-head">
                <CardName entry={{ name: c.cardName, subtitle: c.subtitle, imageUrl: c.imageUrl, backImageUrl: c.backImageUrl }} className="your-stats-meta-bar-name" />
                <span className="your-stats-meta-bar-value" style={{ color: '#64B5F6' }}>{countOf(c)}× · {pctOf(c)}%</span>
              </div>
              <div className="your-stats-meta-bar-track">
                <span className="your-stats-meta-bar-fill" style={{ width: `${Math.max(2, Math.min(100, pctOf(c) || 0))}%`, background: aspectColor(c.aspects) }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function ftoggle<T>(set: Set<T>, setter: (s: Set<T>) => void, key: T) {
  const next = new Set(set)
  next.has(key) ? next.delete(key) : next.add(key)
  setter(next)
}

/** One pick-turn ladder box. Leaders and cards each get their own identical box
 *  (side by side) with their own search + filters, instead of a shared toggle. */
function PickTurnCard({ title, subtitle, rows, showCost, loading }: {
  title: string
  subtitle: string
  rows: PickRow[]
  showCost: boolean
  loading: boolean
}) {
  const [search, setSearch] = useState('')
  const [aspectFilters, setAspectFilters] = useState<Set<string>>(new Set())
  const [rarityFilters, setRarityFilters] = useState<Set<string>>(new Set())
  const [costFilters, setCostFilters] = useState<Set<number>>(new Set())

  const maxPick = useMemo(() => Math.max(8, ...rows.map((c) => c.avgPickPosition)), [rows])
  const needle = search.trim().toLowerCase()
  const filtered = useMemo(() => {
    return [...rows]
      .filter((c) => {
        if (needle && !c.cardName.toLowerCase().includes(needle)) return false
        if (aspectFilters.size > 0 && !(c.aspects || []).some((a) => aspectFilters.has(a))) return false
        if (rarityFilters.size > 0 && !rarityFilters.has(c.rarity)) return false
        if (costFilters.size > 0) {
          const cost = c.cost == null ? -1 : Math.min(7, c.cost)
          if (!costFilters.has(cost)) return false
        }
        return true
      })
      .sort((a, b) => a.avgPickPosition - b.avgPickPosition)
  }, [rows, needle, aspectFilters, rarityFilters, costFilters, showCost])

  const label = showCost ? 'card' : 'leader'

  return (
    <section className="your-stats-meta-card">
      <header className="your-stats-meta-card-header">
        <div><h3>{title}</h3></div>
        <span className="your-stats-meta-tag">Draft</span>
      </header>
      <p className="your-stats-meta-subtitle">{subtitle}</p>

      <div className="your-stats-pickturn-toolbar">
        <label className="your-stats-search">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Find a ${label}…`} aria-label={`Filter ${label} pick-turn list`} />
        </label>
      </div>

      <div className="your-stats-luck-filters">
        <div className="your-stats-luck-filter-group" role="group" aria-label="Filter by aspect">
          {FILTER_ASPECTS.map((a) => (
            <button key={a} type="button" title={a} aria-pressed={aspectFilters.has(a)}
              className={`your-stats-luck-filter-btn${aspectFilters.has(a) ? ' is-on' : ''}`}
              onClick={() => ftoggle(aspectFilters, setAspectFilters, a)}>
              <img src={ASPECT_ICON[a]} alt={a} width={16} height={16} />
            </button>
          ))}
        </div>
        <div className="your-stats-luck-filter-group" role="group" aria-label="Filter by rarity">
          {FILTER_RARITIES.map((r) => (
            <button key={r} type="button" title={r} aria-pressed={rarityFilters.has(r)}
              className={`your-stats-luck-filter-btn your-stats-luck-filter-btn--rarity${rarityFilters.has(r) ? ' is-on' : ''}`}
              style={{ ['--rarity' as any]: RARITY_COLORS[r] || '#888' }}
              onClick={() => ftoggle(rarityFilters, setRarityFilters, r)}>
              <img src={RARITY_ICON[r]} alt={r} width={18} height={18} />
            </button>
          ))}
        </div>
        <div className="your-stats-luck-filter-group" role="group" aria-label="Filter by cost">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((cost) => (
            <button key={cost} type="button" title={cost === 7 ? '7+ cost' : `${cost} cost`} aria-pressed={costFilters.has(cost)}
              className={`your-stats-luck-filter-btn your-stats-luck-filter-btn--cost${costFilters.has(cost) ? ' is-on' : ''}`}
              onClick={() => ftoggle(costFilters, setCostFilters, cost)}>
              <CostIcon cost={cost === 7 ? '7+' : cost} size={24} />
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="your-stats-meta-bars">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton-line your-stats-meta-skeleton" />)}</div>
      ) : filtered.length === 0 ? (
        <p className="your-stats-meta-empty">No {label}s match those filters.</p>
      ) : (
        <ol className="your-stats-pickturn-list">
          {filtered.map((c) => {
            const pct = Math.min(100, (c.avgPickPosition / maxPick) * 100)
            return (
              <li key={c.cardName} className="your-stats-pickturn-row">
                <CardName entry={{ name: c.cardName, subtitle: c.subtitle, imageUrl: c.imageUrl, backImageUrl: c.backImageUrl, isLeader: !showCost }} className="your-stats-pickturn-name" />
                <div className="your-stats-pickturn-track">
                  <span className="your-stats-pickturn-marker" style={{ left: `${pct}%`, background: aspectColor(c.aspects) }} />
                </div>
                <span className="your-stats-pickturn-pos">{c.avgPickPosition.toFixed(1)}</span>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

export function DraftAnalytics({ setCode, since, until }: { setCode: string; since: string; until: string }) {
  const [cards, setCards] = useState<PickRow[]>([])
  const [leaders, setLeaders] = useState<PickRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    const base = `setCode=${encodeURIComponent(setCode)}&since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}`
    Promise.all([getJson(`/api/stats/draft-picks?${base}`), getJson(`/api/stats/draft-picks?${base}&type=leaders`)])
      .then(([cardData, leaderData]) => {
        if (cancelled) return
        const clean = (rows: any[]): PickRow[] =>
          (rows || []).filter((c) => Number(c.timesPicked || 0) >= MIN_PICKS && Number.isFinite(c.avgPickPosition))
        setCards(clean(cardData.cards))
        setLeaders(clean(leaderData.cards))
        setLoading(false)
      })
      .catch(() => { if (!cancelled) { setError(true); setLoading(false) } })
    return () => { cancelled = true }
  }, [setCode, since, until])

  // Pick-1 ladders always use cards (leaders are picked in a separate round).
  // P1P1 = pack 1 pick 1; "any pack" = pick 1 of pack 1, 2 OR 3.
  const p1p1 = useMemo(
    () => [...cards].filter((c) => c.p1p1Picks > 0).sort((a, b) => b.p1p1Picks - a.p1p1Picks).slice(0, 8),
    [cards],
  )
  const anyPackP1 = useMemo(
    () => [...cards].filter((c) => (c.firstPicks || 0) > 0).sort((a, b) => (b.firstPicks || 0) - (a.firstPicks || 0)).slice(0, 8),
    [cards],
  )

  if (error) return null

  return (
    <section className="your-stats-draft-analytics">
      {/* Pick-1 ladders: pack-1 pick-1 and pick-1 of any pack, side by side. */}
      <div className="your-stats-meta-grid">
        <Pick1Card
          title="Pack 1, Pick 1"
          subtitle="The cards most often taken as the very first pick of a draft."
          rows={p1p1}
          countOf={(c) => c.p1p1Picks}
          pctOf={(c) => c.p1p1Pct}
          loading={loading}
        />
        <Pick1Card
          title="Any pack, Pick 1"
          subtitle="Cards taken first out of the pack — pick 1 of pack 1, 2 or 3."
          rows={anyPackP1}
          countOf={(c) => c.firstPicks}
          pctOf={(c) => c.firstPickPct}
          loading={loading}
        />
      </div>

      {/* Average pick turn — leaders (left) and cards (right), identical boxes. */}
      <div className="your-stats-meta-grid your-stats-pickturn-grid">
        <PickTurnCard
          title="Average pick turn — Leaders"
          subtitle="Where each leader is taken on average — pick 1 is a first-pick bomb, the far right is wheel fodder."
          rows={leaders}
          showCost={false}
          loading={loading}
        />
        <PickTurnCard
          title="Average pick turn — Cards"
          subtitle="Where each card is taken on average — pick 1 is a first-pick bomb, the far right is wheel fodder."
          rows={cards}
          showCost={true}
          loading={loading}
        />
      </div>
    </section>
  )
}

export default DraftAnalytics

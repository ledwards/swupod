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

const ASPECT_ICON: Record<string, string> = {
  Vigilance: '/icons/vigilance.png',
  Command: '/icons/command.png',
  Aggression: '/icons/aggression.png',
  Cunning: '/icons/cunning.png',
  Heroism: '/icons/heroism.png',
  Villainy: '/icons/villainy.png',
}
const FILTER_ASPECTS = ['Vigilance', 'Command', 'Aggression', 'Cunning', 'Heroism', 'Villainy'] as const
const FILTER_RARITIES = ['Common', 'Uncommon', 'Rare', 'Legendary'] as const
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
  firstPickPct: number | null
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

export function DraftAnalytics({ setCode, since, until }: { setCode: string; since: string; until: string }) {
  const [cards, setCards] = useState<PickRow[]>([])
  const [leaders, setLeaders] = useState<PickRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const [mode, setMode] = useState<'cards' | 'leaders'>('cards')
  const [search, setSearch] = useState('')
  const [aspectFilters, setAspectFilters] = useState<Set<string>>(new Set())
  const [rarityFilters, setRarityFilters] = useState<Set<string>>(new Set())
  const [costFilters, setCostFilters] = useState<Set<number>>(new Set())

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

  const source = mode === 'cards' ? cards : leaders

  // P1P1 ladder always uses cards (leaders are picked in a separate round).
  const p1p1 = useMemo(
    () => [...cards].filter((c) => c.p1p1Picks > 0).sort((a, b) => b.p1p1Picks - a.p1p1Picks).slice(0, 8),
    [cards],
  )

  const maxPick = useMemo(() => Math.max(8, ...source.map((c) => c.avgPickPosition)), [source])

  const needle = search.trim().toLowerCase()
  const filtered = useMemo(() => {
    return [...source]
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
  }, [source, needle, aspectFilters, rarityFilters, costFilters])

  function toggle<T>(set: Set<T>, setter: (s: Set<T>) => void, key: T) {
    const next = new Set(set)
    next.has(key) ? next.delete(key) : next.add(key)
    setter(next)
  }

  if (error) return null

  return (
    <section className="your-stats-draft-analytics">
      <div className="your-stats-meta-subhead">
        <span className="your-stats-eyebrow">Drafting</span>
        <h3>Draft signal</h3>
      </div>

      {/* P1P1 */}
      <section className="your-stats-meta-card">
        <header className="your-stats-meta-card-header">
          <div>
            <span className="your-stats-eyebrow">Drafting</span>
            <h3>Pack 1, Pick 1</h3>
          </div>
          <span className="your-stats-meta-tag">Draft</span>
        </header>
        <p className="your-stats-meta-subtitle">The cards most often taken as the very first pick of a draft.</p>
        {loading ? (
          <div className="your-stats-meta-bars">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton-line your-stats-meta-skeleton" />)}</div>
        ) : p1p1.length === 0 ? (
          <p className="your-stats-meta-empty">No draft data for this set yet.</p>
        ) : (
          <div className="your-stats-meta-bars">
            {p1p1.map((c) => {
              const max = p1p1[0].p1p1Picks || 1
              return (
                <div key={c.cardName} className="your-stats-meta-bar-row">
                  <div className="your-stats-meta-bar-head">
                    <span className="your-stats-meta-bar-name">{c.cardName}</span>
                    <span className="your-stats-meta-bar-value" style={{ color: '#64B5F6' }}>{c.p1p1Picks}× · {c.p1p1Pct}%</span>
                  </div>
                  <div className="your-stats-meta-bar-track">
                    <span className="your-stats-meta-bar-fill" style={{ width: `${Math.max(4, (c.p1p1Picks / max) * 100)}%`, background: aspectColor(c.aspects) }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Pick-turn ladder */}
      <section className="your-stats-meta-card">
        <header className="your-stats-meta-card-header">
          <div>
            <span className="your-stats-eyebrow">Drafting</span>
            <h3>Average pick turn</h3>
          </div>
          <span className="your-stats-meta-tag">Draft</span>
        </header>
        <p className="your-stats-meta-subtitle">Where each {mode === 'cards' ? 'card' : 'leader'} is taken on average — pick 1 is a first-pick bomb, the far right is wheel fodder.</p>

        <div className="your-stats-pickturn-toolbar">
          <div className="your-stats-luck-sort" role="group" aria-label="Cards or leaders">
            {(['cards', 'leaders'] as const).map((m) => (
              <button key={m} type="button" className={`your-stats-luck-sort-btn${mode === m ? ' is-on' : ''}`} aria-pressed={mode === m} onClick={() => setMode(m)}>
                {m === 'cards' ? 'Cards' : 'Leaders'}
              </button>
            ))}
          </div>
          <label className="your-stats-search">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a card…" aria-label="Filter pick-turn list" />
          </label>
        </div>

        <div className="your-stats-luck-filters">
          <div className="your-stats-luck-filter-group" role="group" aria-label="Filter by aspect">
            {FILTER_ASPECTS.map((a) => (
              <button key={a} type="button" title={a} aria-pressed={aspectFilters.has(a)}
                className={`your-stats-luck-filter-btn${aspectFilters.has(a) ? ' is-on' : ''}`}
                onClick={() => toggle(aspectFilters, setAspectFilters, a)}>
                <img src={ASPECT_ICON[a]} alt={a} width={16} height={16} />
              </button>
            ))}
          </div>
          <div className="your-stats-luck-filter-group" role="group" aria-label="Filter by rarity">
            {FILTER_RARITIES.map((r) => (
              <button key={r} type="button" title={r} aria-pressed={rarityFilters.has(r)}
                className={`your-stats-luck-filter-btn your-stats-luck-filter-btn--rarity${rarityFilters.has(r) ? ' is-on' : ''}`}
                style={{ ['--rarity' as any]: RARITY_COLORS[r] || '#888' }}
                onClick={() => toggle(rarityFilters, setRarityFilters, r)}>
                <span className="your-stats-luck-filter-dot" />{r.charAt(0)}
              </button>
            ))}
          </div>
          {mode === 'cards' && (
            <div className="your-stats-luck-filter-group" role="group" aria-label="Filter by cost">
              {[0, 1, 2, 3, 4, 5, 6, 7].map((cost) => (
                <button key={cost} type="button" title={cost === 7 ? '7+ cost' : `${cost} cost`} aria-pressed={costFilters.has(cost)}
                  className={`your-stats-luck-filter-btn your-stats-luck-filter-btn--cost${costFilters.has(cost) ? ' is-on' : ''}`}
                  onClick={() => toggle(costFilters, setCostFilters, cost)}>
                  {cost === 7 ? '7+' : cost}
                </button>
              ))}
            </div>
          )}
        </div>

        {loading ? (
          <div className="your-stats-meta-bars">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton-line your-stats-meta-skeleton" />)}</div>
        ) : filtered.length === 0 ? (
          <p className="your-stats-meta-empty">No {mode} match those filters.</p>
        ) : (
          <ol className="your-stats-pickturn-list">
            {filtered.map((c) => {
              const pct = Math.min(100, (c.avgPickPosition / maxPick) * 100)
              return (
                <li key={c.cardName} className="your-stats-pickturn-row">
                  <span className="your-stats-pickturn-name">{c.cardName}</span>
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
    </section>
  )
}

export default DraftAnalytics

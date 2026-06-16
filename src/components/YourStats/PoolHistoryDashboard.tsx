'use client'

import { useEffect, useMemo, useState } from 'react'
import Button from '@/src/components/Button'
import UserAvatar from '@/src/components/UserAvatar'

interface PoolBuild {
  shareId: string
  name: string
  isOriginal: boolean
  isMine: boolean
  builder: {
    id: string | null
    username: string | null
    avatarUrl: string | null
  }
  leaderName: string | null
  baseName: string | null
  leaderImageUrl: string | null
  baseImageUrl: string | null
  baseColor: string | null
  mainDeckCount: number
  wins: number
  losses: number
  draws: number
  capturedMatches: number
  createdAt: string | null
  updatedAt: string | null
  links: {
    pool: string
    deck: string
    play: string
    json: string
  }
}

interface PoolHistoryItem {
  shareId: string
  name: string
  setCode: string | null
  setName: string | null
  poolType: string
  poolTypeLabel: string
  relationship: 'owned' | 'built-on' | 'shared'
  cardCount: number
  wins: number
  losses: number
  draws: number
  capturedMatches: number
  createdAt: string | null
  updatedAt: string | null
  lastViewedAt: string | null
  owner: {
    id: string | null
    username: string | null
    avatarUrl: string | null
  }
  builds: PoolBuild[]
}

interface FetchState {
  loading: boolean
  error: boolean
  pools: PoolHistoryItem[]
}

const RELATIONSHIP_FILTERS: Array<{ value: 'all' | 'owned' | 'built-on' | 'shared'; label: string; title: string }> = [
  { value: 'all', label: 'All', title: 'All pools' },
  { value: 'owned', label: 'Owned', title: 'Pools you own' },
  { value: 'built-on', label: 'Built', title: 'Your builds on other players’ pools' },
  { value: 'shared', label: 'Shared', title: 'Shared pools you’ve viewed' },
]

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}

function formatDate(value: string | null): string {
  if (!value) return 'Unknown date'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown date'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function recordLine(item: Pick<PoolBuild, 'wins' | 'losses' | 'draws'>): string {
  const wins = Number(item.wins || 0)
  const losses = Number(item.losses || 0)
  const draws = Number(item.draws || 0)
  if (wins + losses + draws === 0) return 'No matches'
  return `${wins}W ${losses}L ${draws}D`
}

function comboLine(build: PoolBuild): string {
  if (build.leaderName && build.baseName) return `${build.leaderName} / ${build.baseName}`
  if (build.leaderName) return build.leaderName
  if (build.baseName) return build.baseName
  return 'Decklist in progress'
}

function absoluteUrl(path: string): string {
  if (typeof window === 'undefined') return path
  return new URL(path, window.location.origin).toString()
}

function PoolBuildCard({
  build,
  copiedKey,
  copyValue,
}: {
  build: PoolBuild
  copiedKey: string | null
  copyValue: (key: string, value: string) => void
}) {
  const deckUrl = absoluteUrl(build.links.deck)
  const jsonUrl = absoluteUrl(build.links.json)
  const leader = build.leaderName || comboLine(build)
  const style = build.baseColor ? ({ ['--row-tint' as any]: build.baseColor }) : undefined
  return (
    <div className="your-stats-pool-build" style={style}>
      <div className="your-stats-pool-build-art" aria-hidden="true">
        {build.leaderImageUrl ? (
          <img src={build.leaderImageUrl} alt="" loading="lazy" />
        ) : (
          <span className="your-stats-pool-build-art-fallback">{build.leaderName ? build.leaderName.charAt(0) : '·'}</span>
        )}
      </div>
      {!build.isMine && (
        <span className="your-stats-pool-build-owner-badge" title={`Built by ${build.builder.username || 'another player'}`}>
          <UserAvatar
            size={28}
            src={build.builder.avatarUrl}
            alt={build.builder.username || 'Deck builder'}
            fallback={(build.builder.username || 'B').charAt(0).toUpperCase()}
            placeholderClassName="your-stats-owner-avatar-placeholder"
          />
        </span>
      )}
      <div className="your-stats-replay-content">
        <div className="your-stats-replay-combo">
          <strong>{leader}</strong>
          {build.baseName && <small>{build.baseName}</small>}
        </div>
        <div className="your-stats-replay-meta">
          <span>{build.mainDeckCount || 0} cards</span>
          <span>{recordLine(build)}</span>
          {build.capturedMatches > 0 && <span>{build.capturedMatches.toLocaleString()} captures</span>}
        </div>
        {!build.isMine && (
          <div className="your-stats-pool-build-tags">
            <span className="your-stats-pool-build-byline">by {build.builder.username || 'another player'}</span>
          </div>
        )}
        <div className="your-stats-replay-actions">
          <a className="btn btn--interactive btn--sm your-stats-pool-action" href={build.links.deck}>Open</a>
          <a className="btn btn--secondary btn--sm your-stats-pool-action" href={build.links.play}>Play</a>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => copyValue(`url-${build.shareId}`, deckUrl)}
          >
            {copiedKey === `url-${build.shareId}` ? 'Copied URL' : 'Copy URL'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => copyValue(`json-${build.shareId}`, jsonUrl)}
          >
            {copiedKey === `json-${build.shareId}` ? 'Copied JSON' : 'Copy JSON'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function PoolHistoryDashboard({ fetchImpl }: { fetchImpl?: typeof fetch }) {
  const [state, setState] = useState<FetchState>({ loading: true, error: false, pools: [] })
  const [query, setQuery] = useState('')
  const [relationshipFilter, setRelationshipFilter] = useState<'all' | 'owned' | 'built-on' | 'shared'>('all')
  const [sortBy, setSortBy] = useState<'recent' | 'leader' | 'owner' | 'builds'>('recent')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const f = fetchImpl || fetch
    setState((prev) => ({ ...prev, loading: true, error: false }))
    f('/api/me/pool-history?limit=80', { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error(`pool history fetch failed: ${res.status}`)
        return res.json()
      })
      .then((body) => {
        if (cancelled) return
        const data = body && body.data ? body.data : body
        setState({ loading: false, error: false, pools: data.pools || [] })
      })
      .catch((err) => {
        if (cancelled) return
        // eslint-disable-next-line no-console
        console.error('PoolHistoryDashboard fetch error:', err)
        setState({ loading: false, error: true, pools: [] })
      })
    return () => {
      cancelled = true
    }
  }, [fetchImpl])

  const filteredPools = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const matchesSearch = (pool: PoolHistoryItem) => {
      if (!needle) return true
      const values = [
        pool.name,
        pool.setCode,
        pool.poolTypeLabel,
        pool.owner.username,
        ...pool.builds.flatMap((build) => [
          build.name,
          build.builder.username,
          build.leaderName,
          build.baseName,
        ]),
      ]
      return values.some((value) => String(value || '').toLowerCase().includes(needle))
    }

    return state.pools
      .filter((pool) => relationshipFilter === 'all' || pool.relationship === relationshipFilter)
      .filter(matchesSearch)
      .sort((a, b) => {
        if (sortBy === 'leader') {
          const aLeader = a.builds[0]?.leaderName || ''
          const bLeader = b.builds[0]?.leaderName || ''
          return aLeader.localeCompare(bLeader)
        }
        if (sortBy === 'owner') {
          return String(a.owner.username || '').localeCompare(String(b.owner.username || ''))
        }
        if (sortBy === 'builds') {
          return b.builds.length - a.builds.length
        }
        return new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime()
      })
  }, [query, relationshipFilter, sortBy, state.pools])

  async function copyValue(key: string, value: string) {
    await navigator.clipboard.writeText(value)
    setCopiedKey(key)
    window.setTimeout(() => setCopiedKey((current) => current === key ? null : current), 1400)
  }

  if (state.loading) {
    return (
      <section className="your-stats-pools" data-testid="pool-history-dashboard" aria-busy="true">
        <div className="your-stats-explorer-toolbar">
          <span className="skeleton-line your-stats-pool-toolbar-skeleton" />
          <span className="skeleton-line your-stats-pool-toolbar-skeleton" />
        </div>
        <div className="your-stats-pool-group your-stats-counter--skeleton">
          <span className="skeleton-line your-stats-pool-row-skeleton" />
          <span className="skeleton-line your-stats-pool-row-skeleton" />
        </div>
      </section>
    )
  }

  if (state.error) {
    return (
      <section className="your-stats-pools" data-testid="pool-history-dashboard">
        <p className="your-stats-error-note" role="status">
          Couldn't load pool history. Try refreshing.
        </p>
      </section>
    )
  }

  return (
    <section className="your-stats-pools" data-testid="pool-history-dashboard">
      <div className="your-stats-pool-header">
        <div>
          <span className="your-stats-eyebrow">Pool History</span>
          <h3>Your pools &amp; every decklist built on them</h3>
        </div>
        <span className="your-stats-count-pill">{filteredPools.length.toLocaleString()} of {state.pools.length.toLocaleString()}</span>
      </div>

      <div className="your-stats-explorer-toolbar" aria-label="Pool history controls">
        <label className="your-stats-search">
          <SearchIcon />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Leader, base, owner, set…"
            aria-label="Search pools"
          />
        </label>
        <div className="your-stats-seg" role="group" aria-label="Filter pools by relationship">
          {RELATIONSHIP_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              className={`your-stats-seg-btn ${relationshipFilter === f.value ? 'active' : ''}`}
              onClick={() => setRelationshipFilter(f.value)}
              aria-pressed={relationshipFilter === f.value}
              title={f.title}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="your-stats-explorer-selects">
          <label className="your-stats-field">
            <span>Sort</span>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as any)}>
              <option value="recent">Recently updated</option>
              <option value="leader">Leader</option>
              <option value="owner">Owner</option>
              <option value="builds">Most builds</option>
            </select>
          </label>
        </div>
      </div>

      {filteredPools.length === 0 ? (
        <div className="your-stats-gameplay-empty">
          <h3>No pools found</h3>
          <p>Try a different search, or open a sealed pool or draft first.</p>
        </div>
      ) : (
        <div className="your-stats-pool-list">
          {filteredPools.map((pool) => (
            <article key={pool.shareId} className={`your-stats-pool-group your-stats-pool-group--${pool.relationship}`}>
              <header className="your-stats-pool-group-header">
                <div>
                  <h3>{pool.name}</h3>
                  <p>
                    {pool.setCode || 'SWU'} · {pool.cardCount.toLocaleString()} cards · {formatDate(pool.updatedAt || pool.createdAt)}
                  </p>
                </div>
                <div className="your-stats-pool-owner">
                  <UserAvatar
                    size={42}
                    src={pool.owner.avatarUrl}
                    alt={pool.owner.username || 'Pool owner'}
                    fallback={(pool.owner.username || 'P').charAt(0).toUpperCase()}
                    placeholderClassName="your-stats-owner-avatar-placeholder"
                  />
                  <span>
                    <small>Owner</small>
                    <strong>{pool.owner.username || 'Unknown'}</strong>
                  </span>
                </div>
              </header>

              <div className="your-stats-pool-build-list">
                {pool.builds.map((build) => (
                  <PoolBuildCard
                    key={build.shareId}
                    build={build}
                    copiedKey={copiedKey}
                    copyValue={copyValue}
                  />
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

export default PoolHistoryDashboard

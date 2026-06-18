'use client'

import { useEffect, useMemo, useState } from 'react'
import UserAvatar from '@/src/components/UserAvatar'
import { getPackArtUrl } from '@/src/utils/packArt'
import { deletePool } from '@/src/utils/poolApi'
import { useWayfinderDetection } from '@/src/hooks/useWayfinderDetection'

// Play glyph (like a video play button) for the lobby + play actions.
function PlayMark() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

// Pencil glyph — the conventional "edit" affordance.
function EditMark() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  )
}

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
  leaderBackImageUrl: string | null
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

type PoolFilter = 'all' | 'with-decks' | 'no-decks' | 'friends'

const RELATIONSHIP_FILTERS: Array<{ value: PoolFilter; label: string; title: string }> = [
  { value: 'all', label: 'All', title: 'All pools' },
  { value: 'with-decks', label: 'Decks', title: 'Pools with at least one deck built' },
  { value: 'no-decks', label: 'To be built', title: 'Pools with no deck yet' },
  { value: 'friends', label: 'Friends', title: 'Pools that involve other players' },
]

const poolHasDeck = (pool: PoolHistoryItem): boolean =>
  pool.builds.some((b) => b.leaderName || b.baseName)

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

function LinkIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  )
}

function PoolBuildCard({
  build,
  setCode,
  poolType,
  canDeletePool,
  poolShareId,
  copiedKey,
  copyValue,
  onDeletePool,
  deleteArmed,
  onArmDelete,
  wayfinderDetected,
}: {
  build: PoolBuild
  setCode: string | null
  poolType: string
  canDeletePool: boolean
  poolShareId: string
  copiedKey: string | null
  copyValue: (key: string, value: string) => void
  onDeletePool: (shareId: string) => void
  deleteArmed: boolean
  onArmDelete: (shareId: string | null) => void
  wayfinderDetected: boolean
}) {
  const deckUrl = absoluteUrl(build.links.deck)
  const jsonUrl = absoluteUrl(build.links.json)
  const hasDeck = Boolean(build.leaderName || build.baseName)
  const style = build.baseColor ? ({ ['--row-tint' as any]: build.baseColor }) : undefined
  // Prefer the Hyperspace leader art for the card background; portrait is a
  // fallback for older/odd cards that lack it.
  const artUrl = build.leaderBackImageUrl || build.leaderImageUrl

  // A pool with no deck built yet: set art, a "(No Decklists)" note, a Build
  // Deck CTA, and a trash control (arm → confirm) to delete the pool.
  if (!hasDeck) {
    const setArt = setCode ? getPackArtUrl(setCode) : null
    return (
      <div className="your-stats-pool-build your-stats-pool-build--empty">
        {setArt && (
          <div className="your-stats-pool-build-art your-stats-pool-build-art--set" aria-hidden="true">
            <img src={setArt} alt="" loading="lazy" />
          </div>
        )}
        {/* Trash sits in the upper-right of the pool graphic, on a legible chip.
            Only the pool's owner can delete it. */}
        {!canDeletePool ? null : deleteArmed ? (
          <span className="your-stats-pool-delete-confirm your-stats-pool-delete-confirm--corner">
            <button type="button" className="btn btn--danger btn--sm your-stats-pool-action" onClick={() => onDeletePool(poolShareId)}>Delete pool</button>
            <button type="button" className="btn btn--secondary btn--sm your-stats-pool-action" onClick={() => onArmDelete(null)}>Cancel</button>
          </span>
        ) : (
          <button
            type="button"
            className="your-stats-pool-trash your-stats-pool-trash--corner"
            title="Delete this pool"
            aria-label="Delete this pool"
            onClick={() => onArmDelete(poolShareId)}
          >
            <TrashIcon />
          </button>
        )}
        <div className="your-stats-replay-content your-stats-pool-empty-content">
          <span className="your-stats-pool-empty-note">(No Decklists)</span>
          <a className="btn btn--primary btn--sm your-stats-pool-action your-stats-pool-action--play" href={build.links.deck}>Build Deck</a>
        </div>
      </div>
    )
  }

  const leader = build.leaderName || comboLine(build)
  return (
    <div className="your-stats-pool-build" style={style}>
      <div className="your-stats-pool-build-art" aria-hidden="true">
        {artUrl ? (
          <img src={artUrl} alt="" loading="lazy" />
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
          <span className={`your-stats-format-tag your-stats-format-tag--${poolType === 'draft' ? 'draft' : 'sealed'}`}>
            {poolType === 'draft' ? 'Draft' : 'Sealed'}
          </span>
          <span>{build.mainDeckCount || 0} cards</span>
          <span>{recordLine(build)}</span>
          {build.capturedMatches > 0 && <span>{build.capturedMatches.toLocaleString()} {build.capturedMatches === 1 ? 'capture' : 'captures'}</span>}
        </div>
        {!build.isMine && (
          <div className="your-stats-pool-build-tags">
            <span className="your-stats-pool-build-byline">by {build.builder.username || 'another player'}</span>
          </div>
        )}
        {/* All actions on ONE line. */}
        <div className="your-stats-replay-actions your-stats-pool-actions-row">
          <a className="btn btn--interactive btn--sm your-stats-pool-action your-stats-pool-action--glow" href={build.links.deck}><EditMark /><span>Edit</span></a>
          <a className="btn btn--primary btn--sm your-stats-pool-action your-stats-pool-action--play" href={build.links.play}><PlayMark /><span>Play</span></a>
          <button
            type="button"
            className="btn btn--secondary btn--sm your-stats-pool-action your-stats-pool-action--glow"
            title="Copy deck link"
            onClick={() => copyValue(`url-${build.shareId}`, deckUrl)}
          >
            {copiedKey === `url-${build.shareId}` ? 'Copied' : <LinkIcon />}
          </button>
          <button
            type="button"
            className="btn btn--secondary btn--sm your-stats-pool-action your-stats-pool-action--glow"
            title="Copy deck JSON"
            onClick={() => copyValue(`json-${build.shareId}`, jsonUrl)}
          >
            {copiedKey === `json-${build.shareId}` ? 'Copied' : <CopyIcon />}
          </button>
          {wayfinderDetected && (
            <>
              <a
                className="btn btn--secondary btn--sm your-stats-pool-action your-stats-pool-action--play your-stats-pool-lobby-btn"
                href={`${build.links.play}?lobby=private`}
                title="Open a private Karabast lobby with this deck"
              >
                <PlayMark /><span>Private</span>
              </a>
              <a
                className="btn btn--secondary btn--sm your-stats-pool-action your-stats-pool-action--play your-stats-pool-lobby-btn"
                href={`${build.links.play}?lobby=public`}
                title="Open a public Karabast lobby with this deck"
              >
                <PlayMark /><span>Public</span>
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export function PoolHistoryDashboard({ fetchImpl, setFilter = 'all' }: { fetchImpl?: typeof fetch; setFilter?: string }) {
  const { detected: wayfinderDetected } = useWayfinderDetection()
  const [state, setState] = useState<FetchState>({ loading: true, error: false, pools: [] })
  const [query, setQuery] = useState('')
  const [armedDelete, setArmedDelete] = useState<string | null>(null)
  const [relationshipFilter, setRelationshipFilter] = useState<PoolFilter>('all')
  const [formatFilter, setFormatFilter] = useState<'all' | 'sealed' | 'draft'>('all')
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
      .filter((pool) => {
        // Pools tab is limited-only: exclude chaos sealed, pack wars, blitz,
        // rotisserie and any other non-draft/sealed formats.
        const t = String(pool.poolType || '').toLowerCase()
        return t === 'draft' || t === 'sealed'
      })
      .filter((pool) => {
        // All | Sealed | Draft format filter.
        if (formatFilter === 'all') return true
        return String(pool.poolType || '').toLowerCase() === formatFilter
      })
      .filter((pool) => {
        // Global Set filter (from the page) — 'all' shows every set.
        if (setFilter && setFilter !== 'all') {
          return String(pool.setCode || '').split(',').map((s) => s.trim()).includes(setFilter)
        }
        return true
      })
      .filter((pool) => {
        if (relationshipFilter === 'with-decks') return poolHasDeck(pool)
        if (relationshipFilter === 'no-decks') return !poolHasDeck(pool)
        if (relationshipFilter === 'friends') return pool.relationship !== 'owned' || pool.builds.some((b) => !b.isMine)
        return true
      })
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
  }, [query, relationshipFilter, formatFilter, sortBy, setFilter, state.pools])

  async function copyValue(key: string, value: string) {
    await navigator.clipboard.writeText(value)
    setCopiedKey(key)
    window.setTimeout(() => setCopiedKey((current) => current === key ? null : current), 1400)
  }

  async function handleDeletePool(shareId: string) {
    setArmedDelete(null)
    // Optimistically drop it from the list; deletePool swallows its own errors.
    setState((prev) => ({ ...prev, pools: prev.pools.filter((p) => p.shareId !== shareId) }))
    await deletePool(shareId)
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
        <div className="your-stats-seg" role="group" aria-label="Filter pools by format">
          {(['all', 'sealed', 'draft'] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={`your-stats-seg-btn ${formatFilter === f ? 'active' : ''}`}
              onClick={() => setFormatFilter(f)}
              aria-pressed={formatFilter === f}
            >
              {f === 'all' ? 'All' : f === 'sealed' ? 'Sealed' : 'Draft'}
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
                  <div className="your-stats-pool-group-title">
                    <h3>{pool.name}</h3>
                    <span className={`your-stats-format-tag your-stats-format-tag--${pool.poolType === 'draft' ? 'draft' : 'sealed'}`}>
                      {pool.poolType === 'draft' ? 'Draft' : 'Sealed'}
                    </span>
                  </div>
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
                {(() => {
                  // On a pool you own, show every deck (you can manage them all).
                  // On someone else's pool, show only YOUR decks; the rest get a
                  // "and N more" link out to the full pool page.
                  const ownsPool = pool.relationship === 'owned'
                  const visible = ownsPool ? pool.builds : pool.builds.filter((b) => b.isMine)
                  const hidden = pool.builds.length - visible.length
                  return (
                    <>
                      {visible.map((build) => (
                        <PoolBuildCard
                          key={build.shareId}
                          build={build}
                          setCode={pool.setCode}
                          poolType={pool.poolType}
                          canDeletePool={pool.relationship === 'owned'}
                          poolShareId={pool.shareId}
                          copiedKey={copiedKey}
                          copyValue={copyValue}
                          onDeletePool={handleDeletePool}
                          deleteArmed={armedDelete === pool.shareId}
                          onArmDelete={setArmedDelete}
                          wayfinderDetected={wayfinderDetected}
                        />
                      ))}
                      {hidden > 0 && (
                        <a className="your-stats-pool-more-link" href={`/pool/${pool.shareId}`}>
                          and {hidden} more {hidden === 1 ? 'deck' : 'decks'} on this pool
                          <span className="your-stats-pool-more-arrow" aria-hidden="true">→</span>
                        </a>
                      )}
                    </>
                  )
                })()}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

export default PoolHistoryDashboard

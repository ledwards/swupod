'use client'

/**
 * Deck picker for New Game / Join flows (R23/R31). Shows the caller's built
 * decks as the /me pool list items (leader art, pool name, meta), paginated,
 * with the site's rainbow-border treatment marking the selection. Ineligible
 * decks (wrong set/format for the game being joined) are not shown at all.
 * Your deck choice is yours alone — opponents never see it (R29).
 */
import { useEffect, useRef, useState } from 'react'
import Button from '@/src/components/Button'
import { STATS_SET_ORDER } from '@/src/utils/statsSetTabs'
import { packBucketsMatch, packCountLabel } from '@/src/utils/sealedFormat'
import { deckCreationLinkForListing } from '@/src/utils/deckCreationLink'
import '@/src/components/YourStats/YourStats.css'
import './DeckPicker.css'

export interface EligibleDeck {
  poolShareId: string
  setCode: string
  setName: string | null
  format: string
  /** Sealed packs this pool was opened from — part of the format (6-pack and
   *  8-pack sealed never match). Null for draft/chaos and legacy pools. */
  packsPerPlayer?: number | null
  name: string | null
  builtAt: string | null
  eligible: boolean
  complete?: boolean
  leaderName: string | null
  leaderImageUrl: string | null
  leaderBackImageUrl: string | null
  baseColor: string | null
  aspectColors?: string[]
}

interface DeckPickerProps {
  /** Filter to a specific game's set+format (Join flow); omit for New Game. */
  setCode?: string
  format?: string
  /** Sealed pack bucket of the game being joined — part of the format, and a
   *  hard split (a 6-pack deck is never offered for an 8-pack game). Only
   *  applies alongside `format`; the unfiltered New Game picker ignores it. */
  packsPerPlayer?: number | null
  selected: string | null
  onSelect: (deck: EligibleDeck) => void
  /** Fires whenever the eligible count is known/changes (modal hides its
   *  confirm button at zero). */
  onEligibleCount?: (count: number) => void
}

/* The modal never scrolls internally, so the page size has to be whatever
   actually fits the viewport — a fixed 8 overflowed the top of the screen on
   any laptop shorter than ~830px. Measured against the tallest deck modal
   (New Lobby, which also carries the visibility toggle): one 2-up row costs
   108px + a 10px gap, and the modal's fixed chrome — title, filters, toggle,
   actions, padding — is ~352px. */
const DECK_ROW_H = 118
const MODAL_CHROME_H = 352
const VIEWPORT_MARGIN = 24
const MIN_ROWS = 1
const MAX_ROWS = 4

function rowsForViewport(viewportH: number): number {
  const rows = Math.floor((viewportH - VIEWPORT_MARGIN - MODAL_CHROME_H + 10) / DECK_ROW_H)
  return Math.min(MAX_ROWS, Math.max(MIN_ROWS, rows))
}

/** Decks per page (2-up grid), sized so the modal always fits on screen. */
function usePageSize(): number {
  // Starts at the conservative floor so the first paint can't overflow before
  // the real viewport height is known (and so SSR has no `window`).
  const [rows, setRows] = useState(MIN_ROWS)
  useEffect(() => {
    const compute = (): void => setRows(rowsForViewport(window.innerHeight))
    compute()
    window.addEventListener('resize', compute)
    return () => window.removeEventListener('resize', compute)
  }, [])
  return rows * 2
}

// Set buckets for the picker's filter bar: the latest standard set gets its
// own button, everything else standard lives under "Older", and multi-set
// pools (Chaos etc.) are "Other".
const LATEST_SET: string = STATS_SET_ORDER[0]

function setBucket(sc: string): 'latest' | 'older' | 'other' {
  if (sc === LATEST_SET) return 'latest'
  return (STATS_SET_ORDER as readonly string[]).includes(sc) ? 'older' : 'other'
}

function formatLabel(format?: string): string {
  return format === 'draft' ? 'Draft' : 'Sealed'
}

/** Zero-eligible-decks state (Join flow): a working deep link to make a deck
 *  that actually fits THIS game — set and (for sealed) pack count already
 *  chosen — plus open draft pods for drafts. See utils/deckCreationLink. */
function NoEligibleDecks({ setCode, format, packsPerPlayer }: { setCode?: string | undefined; format?: string | undefined; packsPerPlayer?: number | null }): React.JSX.Element {
  const isDraft = format === 'draft'
  const makeDeck = deckCreationLinkForListing({ setCode, format, packsPerPlayer })
  // Open draft pods are a faster on-ramp for draft games; count them so the
  // link reads "or join a draft pod (2 open)".
  const [openDraftPods, setOpenDraftPods] = useState<number | null>(null)

  useEffect(() => {
    if (!isDraft) return
    let cancelled = false
    fetch('/api/pods/public')
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then(json => {
        if (cancelled) return
        const pods = (json.data || json).pods || []
        setOpenDraftPods(pods.filter((p: { podType?: string }) => p.podType === 'draft').length)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [isDraft])

  return (
    <div className="lobby-state lobby-deck-empty">
      <p>
        You don&apos;t have a {setCode} {formatLabel(format)}
        {packCountLabel(packsPerPlayer) ? ` (${packCountLabel(packsPerPlayer)})` : ''} deck
        yet — make one first:
      </p>
      <div className="lobby-deck-empty-ctas">
        {/* Deep-linked: for sealed this lands on /pools/new with THIS game's
            set and pack count already chosen, so the pool it creates is
            actually joinable here. Format-specific only — a sealed game needs
            a sealed deck, a draft game a drafted one (deckCreationLink). */}
        <a href={makeDeck.href} className="btn btn--sm btn--primary">
          {makeDeck.label}
        </a>
      </div>
      {isDraft && (
        <p className="lobby-deck-empty-alt">
          or <a href="/draft">join a draft pod{openDraftPods !== null ? ` (${openDraftPods} open)` : ''}</a>
        </p>
      )}
    </div>
  )
}

export default function DeckPicker({ setCode, format, packsPerPlayer = null, selected, onSelect, onEligibleCount }: DeckPickerProps): React.JSX.Element {
  const PAGE_SIZE = usePageSize()
  const [decks, setDecks] = useState<EligibleDeck[] | null>(null)
  const [error, setError] = useState(false)
  // Bumped by the Retry button to re-run the fetch effect.
  const [attempt, setAttempt] = useState(0)
  const [page, setPage] = useState(0)
  // New Lobby flow (no pinned set/format): local single-select filters.
  // setFilter: null (all) | LATEST_SET | an older set code | 'other' (Chaos).
  const [formatFilter, setFormatFilter] = useState<'sealed' | 'draft' | null>(null)
  const [setFilter, setSetFilter] = useState<string | null>(null)
  const [olderOpen, setOlderOpen] = useState(false)
  const [query, setQuery] = useState('')
  // Persisted preference: show pools that don't have a finished deck yet.
  const [showIncomplete, setShowIncomplete] = useState(false)
  useEffect(() => {
    try { setShowIncomplete(localStorage.getItem('ptp:picker-show-incomplete') === '1') } catch { /* no-op */ }
  }, [])
  const toggleIncomplete = (): void => {
    setShowIncomplete(v => {
      try { localStorage.setItem('ptp:picker-show-incomplete', v ? '0' : '1') } catch { /* no-op */ }
      return !v
    })
    setPage(0)
  }
  const olderRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!olderOpen) return
    const close = (e: MouseEvent): void => {
      if (!olderRef.current?.contains(e.target as Node)) setOlderOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [olderOpen])

  useEffect(() => {
    let cancelled = false
    let retried = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const params = new URLSearchParams()
    if (setCode) params.set('setCode', setCode)
    if (format) params.set('format', format)
    // Sealed pack count is part of the format: the server marks 6-pack decks
    // ineligible for an 8-pack game (and vice versa).
    if (packsPerPlayer) params.set('packs', String(packsPerPlayer))
    setPage(0)

    // One failed fetch must not strand the picker in a dead-end error state
    // (a dev-server recompile or network blip is enough): retry once
    // automatically after 1s, then fall back to the Retry button.
    const load = (): void => {
      fetch(`/api/open-games/eligible-decks?${params}`)
        .then(res => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
        .then(json => {
          if (!cancelled) setDecks((json.data || json).decks || [])
        })
        .catch(() => {
          if (cancelled) return
          if (!retried) {
            retried = true
            timer = setTimeout(load, 1000)
          } else {
            setError(true)
          }
        })
    }
    load()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [setCode, format, packsPerPlayer, attempt])

  const filtered = Boolean(setCode || format)
  const matchesSetFilter = (sc: string): boolean => {
    if (setFilter === null) return true
    if (setFilter === 'other') return setBucket(sc) === 'other'
    return sc === setFilter
  }
  const q = query.trim().toLowerCase()
  const matchesQuery = (d: EligibleDeck): boolean =>
    q === '' ||
    (d.name ?? '').toLowerCase().includes(q) ||
    (d.leaderName ?? '').toLowerCase().includes(q)
  const matchesLocalFilters = (d: EligibleDeck): boolean =>
    matchesQuery(d) &&
    (filtered
      ? true
      : (formatFilter === null || (d.format === 'draft' ? 'draft' : 'sealed') === formatFilter) &&
        matchesSetFilter(d.setCode))
  const eligible = (decks?.filter(d => d.eligible) ?? []).filter(matchesLocalFilters)
  // Unfinished pools (no deck yet): greyed, unselectable, click = open builder.
  const incomplete = showIncomplete
    ? (decks ?? []).filter(d =>
        d.complete === false &&
        matchesLocalFilters(d) &&
        (!setCode || d.setCode === setCode) &&
        (!format || d.format === format) &&
        // Pack bucket only narrows a format-pinned (Join) picker.
        (!format || packBucketsMatch(d.packsPerPlayer, packsPerPlayer)))
    : []
  const availableSets = filtered ? [] : [...new Set((decks ?? []).map(d => d.setCode))]
  const hasLatest = availableSets.some(sc => setBucket(sc) === 'latest')
  const hasOther = availableSets.some(sc => setBucket(sc) === 'other')
  // Older sets, newest first (STATS_SET_ORDER order).
  const olderSets = (STATS_SET_ORDER as readonly string[]).filter(
    sc => sc !== LATEST_SET && availableSets.includes(sc)
  )
  const olderActive = setFilter !== null && setFilter !== 'other' && setFilter !== LATEST_SET

  useEffect(() => {
    if (decks !== null) onEligibleCount?.(eligible.length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decks])

  // Open on the current set — that's the pool almost everyone is bringing, and
  // an unfiltered list buries it under every deck they've ever built. Runs once
  // per load, and only for the unfiltered picker; the chip still toggles off.
  const setDefaultedRef = useRef(false)
  useEffect(() => {
    if (filtered || decks === null || setDefaultedRef.current) return
    setDefaultedRef.current = true
    if (decks.some(d => setBucket(d.setCode) === 'latest')) setSetFilter(LATEST_SET)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decks, filtered])

  // "ASH · Draft (4 eligible)" / "LAW · Sealed · 8-pack (2 eligible)" —
  // the Join modal's one-line subtitle.
  const subtitle = filtered && (
    <p className="lobby-deck-subtitle">
      {setCode} · {formatLabel(format)}
      {packCountLabel(packsPerPlayer) ? ` · ${packCountLabel(packsPerPlayer)}` : ''}
      {decks !== null && <> ({eligible.length} eligible)</>}
    </p>
  )

  if (error) {
    return (
      <div className="lobby-state lobby-state-error">
        <p>Couldn&apos;t load your decks.</p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setError(false)
            setDecks(null)
            setAttempt(a => a + 1)
          }}
        >
          Retry
        </Button>
      </div>
    )
  }
  if (decks === null) {
    return (
      <>
        {subtitle}
        <div className="lobby-state">Loading your decks…</div>
      </>
    )
  }

  if (eligible.length === 0) {
    if (q !== '') {
      return (
        <>
          {subtitle}
          <div className="lobby-deck-filters">
            <input
              type="search"
              className="lobby-deck-search"
              placeholder="Search decks"
              aria-label="Search your decks"
              value={query}
              onChange={e => { setQuery(e.target.value); setPage(0) }}
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
            />
          </div>
          <div className="lobby-state">No decks match &ldquo;{query.trim()}&rdquo;.</div>
        </>
      )
    }
    if (filtered) {
      return (
        <>
          {subtitle}
          <NoEligibleDecks setCode={setCode} format={format} packsPerPlayer={packsPerPlayer} />
        </>
      )
    }
    return (
      <div className="lobby-state lobby-deck-empty">
        <p>
          No decks yet — run a Solo Sealed or Solo Draft first, build a deck,
          and it&apos;ll show up here ready to play.
        </p>
        {/* New Game flow: no listing is pinned, so there is no set or pack
            count to deep-link — these are the plain set pickers. */}
        <div className="lobby-deck-empty-ctas">
          <a href="/sealed" className="btn btn--sm btn--primary">
            Start a Solo Sealed
          </a>
          <a href="/draft/solo" className="btn btn--sm btn--secondary">
            Start a Solo Draft
          </a>
        </div>
      </div>
    )
  }

  const pageCount = Math.max(1, Math.ceil(eligible.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const pageDecks = eligible.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  return (
    <>
      {subtitle}
      <div className="lobby-deck-filters">
        {!filtered && (
          <div className="lobby-deck-filter-group">
            {(['sealed', 'draft'] as const).map(f => (
              <Button
                key={f}
                variant="toggle"
                size="sm"
                glowColor="blue"
                active={formatFilter === f}
                onClick={() => { setFormatFilter(cur => (cur === f ? null : f)); setPage(0) }}
              >
                {f === 'draft' ? 'Draft' : 'Sealed'}
              </Button>
            ))}
          </div>
        )}
        <input
          type="search"
          className="lobby-deck-search"
          placeholder="Search decks"
          aria-label="Search your decks"
          value={query}
          onChange={e => { setQuery(e.target.value); setPage(0) }}
        />
        {!filtered && (
          <div className="lobby-deck-filter-group">
            {hasLatest && (
              <Button
                variant="toggle"
                size="sm"
                glowColor="blue"
                active={setFilter === LATEST_SET}
                onClick={() => { setSetFilter(cur => (cur === LATEST_SET ? null : LATEST_SET)); setPage(0) }}
              >
                {LATEST_SET}
              </Button>
            )}
            {olderSets.length > 0 && (
              <div className="lobby-deck-older" ref={olderRef}>
                <Button
                  variant="toggle"
                  size="sm"
                  glowColor="blue"
                  active={olderActive}
                  onClick={() => setOlderOpen(open => !open)}
                >
                  {olderActive ? setFilter : 'Older'} ▾
                </Button>
                {olderOpen && (
                  <div className="lobby-deck-older-menu" role="menu">
                    {olderSets.map(sc => (
                      <button
                        key={sc}
                        type="button"
                        role="menuitem"
                        className={`lobby-deck-older-item${setFilter === sc ? ' lobby-deck-older-item--active' : ''}`}
                        onClick={() => {
                          setSetFilter(cur => (cur === sc ? null : sc))
                          setOlderOpen(false)
                          setPage(0)
                        }}
                      >
                        {sc}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {hasOther && (
              <Button
                variant="toggle"
                size="sm"
                glowColor="blue"
                active={setFilter === 'other'}
                onClick={() => { setSetFilter(cur => (cur === 'other' ? null : 'other')); setPage(0) }}
              >
                Other
              </Button>
            )}
          </div>
        )}
        <label className="lobby-deck-incomplete-toggle">
          <input type="checkbox" checked={showIncomplete} onChange={toggleIncomplete} />
          <span>Show incomplete</span>
        </label>
      </div>
      <div className="lobby-deck-picker" role="radiogroup" aria-label="Your decks">
        {pageDecks.map(deck => {
          const isSelected = selected === deck.poolShareId
          const artUrl = deck.leaderBackImageUrl || deck.leaderImageUrl
          return (
            <div
              key={deck.poolShareId}
              role="radio"
              aria-checked={isSelected}
              tabIndex={0}
              className={`lobby-deck-option${isSelected ? ' lobby-deck-option--selected' : ''}`}
              style={{
                ['--deck-grad-a' as never]: deck.aspectColors?.[0] ?? deck.baseColor ?? '#2a3654',
                ['--deck-grad-b' as never]:
                  deck.aspectColors?.[deck.aspectColors.length - 1] ?? deck.baseColor ?? '#2a3654',
              }}
              onClick={() => onSelect(deck)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect(deck)
                }
              }}
            >
              <button
                type="button"
                className="lobby-deck-edit"
                title="Edit this deck"
                aria-label="Edit this deck"
                onClick={e => {
                  e.stopPropagation()
                  window.open(`/pool/${deck.poolShareId}/deck`, '_blank', 'noopener')
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                </svg>
              </button>
              {/* /me pool list item (PoolHistoryDashboard PoolBuildCard) reuse. */}
              <div className="your-stats-pool-build">
                <div className="your-stats-pool-build-art" aria-hidden="true">
                  {artUrl ? (
                    <img src={artUrl} alt="" loading="lazy" />
                  ) : (
                    <span className="your-stats-pool-build-art-fallback">
                      {deck.leaderName ? deck.leaderName.charAt(0) : '·'}
                    </span>
                  )}
                </div>
                <div className="your-stats-replay-content">
                  <div className="your-stats-replay-combo">
                    <strong>{deck.name || `${deck.setCode} ${formatLabel(deck.format)}`}</strong>
                    {deck.leaderName && <small>{deck.leaderName}</small>}
                  </div>
                  <div className="your-stats-replay-meta">
                    <span className={`your-stats-format-tag your-stats-format-tag--${deck.format === 'draft' ? 'draft' : 'sealed'}`}>
                      {formatLabel(deck.format)}
                    </span>
                    <span>{setBucket(deck.setCode) === 'other' ? 'Chaos' : deck.setCode}</span>
                    {/* 6-pack vs 8-pack sealed are different formats. */}
                    {packCountLabel(deck.packsPerPlayer) && (
                      <span>{packCountLabel(deck.packsPerPlayer)}</span>
                    )}
                    {/* Month/day only: the tag row is capped to one line, and a
                        full y/m/d date was the piece that got clipped. */}
                    {deck.builtAt && (
                      <span>{new Date(deck.builtAt).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
        {incomplete.map(deck => (
          <div
            key={deck.poolShareId}
            role="button"
            tabIndex={0}
            className="lobby-deck-option lobby-deck-option--incomplete"
            title="No deck built yet"
            onClick={() => window.open(`/pool/${deck.poolShareId}/deck`, '_blank', 'noopener')}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                window.open(`/pool/${deck.poolShareId}/deck`, '_blank', 'noopener')
              }
            }}
          >
            <div className="your-stats-pool-build">
              <div className="your-stats-pool-build-art" aria-hidden="true">
                {(deck.leaderBackImageUrl || deck.leaderImageUrl) ? (
                  <img src={deck.leaderBackImageUrl || deck.leaderImageUrl || ''} alt="" loading="lazy" />
                ) : (
                  <span className="your-stats-pool-build-art-fallback">·</span>
                )}
              </div>
              <div className="your-stats-replay-content">
                <div className="your-stats-replay-combo">
                  <strong>{deck.name || `${deck.setCode} ${formatLabel(deck.format)}`}</strong>
                  <small>Click to create a deck from this pool</small>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      {/* Outside the grid on purpose: as a grid item it read as another deck
          tile and got lost at the bottom of the list. */}
      {pageCount > 1 && (
        <div className="lobby-deck-pager">
          <Button
            variant="secondary"
            size="xs"
            disabled={safePage === 0}
            onClick={() => setPage(p => Math.max(0, p - 1))}
          >
            Prev
          </Button>
          <span className="lobby-deck-pager-count">
            {safePage + 1} / {pageCount}
          </span>
          <Button
            variant="secondary"
            size="xs"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
          >
            Next
          </Button>
        </div>
      )}
    </>
  )
}

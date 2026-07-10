'use client'

/**
 * Deck picker for New Game / Join flows (R23/R31). Shows the caller's built
 * decks as the /me pool list items (leader art, pool name, meta), paginated,
 * with the site's rainbow-border treatment marking the selection. Ineligible
 * decks (wrong set/format for the game being joined) are not shown at all.
 * Your deck choice is yours alone — opponents never see it (R29).
 */
import { useEffect, useState } from 'react'
import Button from '@/src/components/Button'
import '@/src/components/YourStats/YourStats.css'
import './DeckPicker.css'

export interface EligibleDeck {
  poolShareId: string
  setCode: string
  setName: string | null
  format: string
  name: string | null
  builtAt: string | null
  eligible: boolean
  leaderName: string | null
  leaderImageUrl: string | null
  leaderBackImageUrl: string | null
  baseColor: string | null
}

interface DeckPickerProps {
  /** Filter to a specific game's set+format (Join flow); omit for New Game. */
  setCode?: string
  format?: string
  selected: string | null
  onSelect: (deck: EligibleDeck) => void
  /** Fires whenever the eligible count is known/changes (modal hides its
   *  confirm button at zero). */
  onEligibleCount?: (count: number) => void
}

/** ~6 items per page keeps the modal shorter than a viewport. */
const PAGE_SIZE = 6

function formatLabel(format?: string): string {
  return format === 'draft' ? 'Draft' : 'Sealed'
}

/** Zero-eligible-decks state (Join flow): link out to make a deck that fits
 *  this game — Solo Sealed / Solo Draft, plus open draft pods for drafts. */
function NoEligibleDecks({ setCode, format }: { setCode?: string | undefined; format?: string | undefined }): React.JSX.Element {
  const isDraft = format === 'draft'
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
        You don&apos;t have a {setCode} {formatLabel(format)} deck yet — make one first:
      </p>
      <div className="lobby-deck-empty-ctas">
        {/* Format-specific only: a sealed game needs a sealed deck, a draft
            game a drafted one — never suggest the other format. */}
        {isDraft ? (
          <a href="/draft/solo" className="btn btn--sm btn--primary">
            Start a Solo Draft
          </a>
        ) : (
          <a href="/sealed" className="btn btn--sm btn--primary">
            Start a Solo Sealed
          </a>
        )}
      </div>
      {isDraft && (
        <p className="lobby-deck-empty-alt">
          or <a href="/draft">join a draft pod{openDraftPods !== null ? ` (${openDraftPods} open)` : ''}</a>
        </p>
      )}
    </div>
  )
}

export default function DeckPicker({ setCode, format, selected, onSelect, onEligibleCount }: DeckPickerProps): React.JSX.Element {
  const [decks, setDecks] = useState<EligibleDeck[] | null>(null)
  const [error, setError] = useState(false)
  // Bumped by the Retry button to re-run the fetch effect.
  const [attempt, setAttempt] = useState(0)
  const [page, setPage] = useState(0)
  // New Lobby flow (no pinned set/format): local single-select filters.
  const [formatFilter, setFormatFilter] = useState<'sealed' | 'draft' | null>(null)
  const [setFilter, setSetFilter] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let retried = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const params = new URLSearchParams()
    if (setCode) params.set('setCode', setCode)
    if (format) params.set('format', format)
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
  }, [setCode, format, attempt])

  const filtered = Boolean(setCode || format)
  const eligible = (decks?.filter(d => d.eligible) ?? []).filter(d =>
    filtered
      ? true
      : (formatFilter === null || (d.format === 'draft' ? 'draft' : 'sealed') === formatFilter) &&
        (setFilter === null || d.setCode === setFilter)
  )
  const availableSets = filtered
    ? []
    : [...new Set((decks ?? []).map(d => d.setCode))]

  useEffect(() => {
    if (decks !== null) onEligibleCount?.(eligible.length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decks])

  // "ASH · Draft (4 eligible)" — the Join modal's one-line subtitle.
  const subtitle = filtered && (
    <p className="lobby-deck-subtitle">
      {setCode} · {formatLabel(format)}
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
    if (filtered) {
      return (
        <>
          {subtitle}
          <NoEligibleDecks setCode={setCode} format={format} />
        </>
      )
    }
    return (
      <div className="lobby-state">
        No decks yet — run a Solo Sealed or Solo Draft first, build a deck, and
        it&apos;ll show up here ready to play.
      </div>
    )
  }

  const pageCount = Math.max(1, Math.ceil(eligible.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const pageDecks = eligible.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  return (
    <>
      {subtitle}
      {!filtered && (
        <div className="lobby-deck-filters">
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
          {availableSets.length > 1 && (
            <div className="lobby-deck-filter-group">
              {availableSets.map(sc => (
                <Button
                  key={sc}
                  variant="toggle"
                  size="sm"
                  glowColor="blue"
                  active={setFilter === sc}
                  onClick={() => { setSetFilter(cur => (cur === sc ? null : sc)); setPage(0) }}
                >
                  {sc}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}
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
              style={deck.baseColor ? ({ ['--row-tint' as never]: deck.baseColor }) : undefined}
              onClick={() => onSelect(deck)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect(deck)
                }
              }}
            >
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
                    <span>{deck.setCode}</span>
                    {deck.builtAt && <span>{new Date(deck.builtAt).toLocaleDateString()}</span>}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
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
      </div>
    </>
  )
}

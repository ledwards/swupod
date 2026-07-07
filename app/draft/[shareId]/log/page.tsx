// @ts-nocheck
'use client'

import { useState, useEffect, use } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Button from '../../../../src/components/Button'
import ConfirmModal from '../../../../src/components/ConfirmModal'
import CardWithPreview from '../../../../src/components/CardWithPreview'
import { getPackArtUrl } from '../../../../src/utils/packArt'
import '../../../../src/App.css'
import './log.css'

interface DraftLogPick {
  type: 'leader' | 'card'
  packNumber: number
  pickInPack: number
  overallPickNumber: number
  visibleCards: Array<{ instanceId: string; [key: string]: unknown }>
  pickedInstanceId: string | null
}

interface PlayerInfo {
  seatNumber: number
  username: string
  userId: string
  isBot: boolean
  isLogPublic: boolean
  strategyName: string | null
  strategyDisplayName: string | null
  strategyDescription: string | null
  mixinName: string | null
  mixinDisplayName: string | null
  mixinDescription: string | null
  poolShareId: string | null
  poolIsPublic: boolean | null
}

interface DraftLogMeta {
  shareId: string
  setCode: string
  setName: string
  targetSeat: number | null
  playerName: string | null
  hostUsername: string | null
  players: PlayerInfo[]
  viewableSeats: number[]
  isHost: boolean
  isDraftPublic: boolean
  myPlayerId: string | null
}

interface DraftLogData {
  picks: DraftLogPick[]
  meta: DraftLogMeta
}

interface PageProps {
  params: Promise<{ shareId: string }>
}

// Lock icon SVGs
function LockClosed({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

function LockOpen({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </svg>
  )
}

export default function DraftLogPage({ params }: PageProps) {
  const resolvedParams = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const [data, setData] = useState<DraftLogData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  // Gate making the whole draft public behind a confirm — it exposes every
  // player's picks, so it shouldn't fire on a single stray click.
  const [showPublicConfirm, setShowPublicConfirm] = useState(false)

  const shareId = resolvedParams.shareId
  const seatParam = searchParams.get('seat')

  useEffect(() => {
    if (!shareId) return

    async function fetchLog() {
      try {
        setLoading(true)
        const url = seatParam
          ? `/api/draft/${shareId}/log?seat=${seatParam}`
          : `/api/draft/${shareId}/log`
        const response = await fetch(url, { credentials: 'include' })
        if (!response.ok) {
          // 403 means no access - still load meta for blank state
          if (response.status === 403) {
            const body = await response.json().catch(() => ({}))
            throw new Error(body.message || 'Access denied')
          }
          const body = await response.json().catch(() => ({}))
          throw new Error(body.message || 'Failed to load draft log')
        }
        const json = await response.json()
        setData(json.data)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load draft log')
      } finally {
        setLoading(false)
      }
    }

    fetchLog()
  }, [shareId, seatParam])

  const handleSeatChange = (seat: number) => {
    if (!data) return
    // Only allow clicking viewable seats
    if (!data.meta.viewableSeats.includes(seat)) return
    router.push(`/draft/${shareId}/log?seat=${seat}`)
  }

  const handleCopyShareLink = async () => {
    try {
      const seat = data?.meta?.targetSeat || 1
      await navigator.clipboard.writeText(`${window.location.origin}/draft/${shareId}/log?seat=${seat}`)
      setMessage('Share link copied!')
      setTimeout(() => setMessage(null), 3000)
    } catch {
      setMessage('Failed to copy link')
      setTimeout(() => setMessage(null), 3000)
    }
  }

  // Persist the draft-level visibility change (optimistic, with revert on
  // failure). Going public is gated by a confirm; see handleToggleDraftPublic.
  const applyDraftPublic = async (newValue: boolean) => {
    if (!data) return
    // Optimistic update
    setData({
      ...data,
      meta: {
        ...data.meta,
        isDraftPublic: newValue,
        viewableSeats: newValue
          ? data.meta.players.map(p => p.seatNumber)
          : data.meta.viewableSeats,
      },
    })
    try {
      const response = await fetch(`/api/draft/${shareId}/log/visibility`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ draftPublic: newValue }),
      })
      if (!response.ok) {
        // Revert on failure
        setData({
          ...data,
          meta: { ...data.meta },
        })
      }
    } catch {
      // Revert on failure
      setData({
        ...data,
        meta: { ...data.meta },
      })
    }
  }

  const handleToggleDraftPublic = () => {
    if (!data) return
    // Making the draft public exposes every participant's picks, so confirm
    // first. Flipping back to private is harmless and applies immediately.
    if (!data.meta.isDraftPublic) {
      setShowPublicConfirm(true)
      return
    }
    applyDraftPublic(false)
  }

  const handleConfirmDraftPublic = () => {
    setShowPublicConfirm(false)
    applyDraftPublic(true)
  }

  const handleTogglePlayerPublic = async (player: PlayerInfo) => {
    if (!data) return
    const newValue = !player.isLogPublic
    // Optimistic update
    setData({
      ...data,
      meta: {
        ...data.meta,
        players: data.meta.players.map(p =>
          p.userId === player.userId ? { ...p, isLogPublic: newValue } : p
        ),
      },
    })
    try {
      const response = await fetch(`/api/draft/${shareId}/log/visibility`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ playerPublic: newValue }),
      })
      if (response.ok) {
        setMessage(newValue ? 'Your draft log is now public' : 'Your draft log is now private')
        setTimeout(() => setMessage(null), 3000)
      } else {
        // Revert
        setData({
          ...data,
          meta: {
            ...data.meta,
            players: data.meta.players.map(p =>
              p.userId === player.userId ? { ...p, isLogPublic: !newValue } : p
            ),
          },
        })
      }
    } catch {
      // Revert
      setData({
        ...data,
        meta: {
          ...data.meta,
          players: data.meta.players.map(p =>
            p.userId === player.userId ? { ...p, isLogPublic: !newValue } : p
          ),
        },
      })
    }
  }

  const handleDownloadJson = async () => {
    if (!data) return

    try {
      let jsonData: unknown

      if (data.meta.isDraftPublic) {
        // Fetch full anonymized data from public API
        const response = await fetch(`/api/public/draft-log/${shareId}`)
        if (response.ok) {
          const result = await response.json()
          jsonData = result.data || result
        } else {
          // Fallback to local data
          jsonData = buildLocalJson()
        }
      } else {
        // Private: build JSON from page data (current user's picks only)
        jsonData = buildLocalJson()
      }

      const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `draft-log-${shareId}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      setMessage('Failed to download')
      setTimeout(() => setMessage(null), 3000)
    }
  }

  const buildLocalJson = () => {
    if (!data) return {}
    const { picks, meta } = data
    return {
      draft: {
        setCode: meta.setCode,
        setName: meta.setName,
        totalSeats: meta.players.length,
      },
      picks: picks.map(pick => {
        const pickedCard = pick.visibleCards.find(c => c.instanceId === pick.pickedInstanceId)
        return {
          seat: meta.targetSeat,
          packNumber: pick.packNumber,
          pickInPack: pick.pickInPack,
          cardId: pickedCard?.cardId || pickedCard?.id || null,
          cardName: pickedCard?.name || null,
          rarity: pickedCard?.rarity || null,
          type: pickedCard?.type || null,
          aspects: pickedCard?.aspects || [],
          isLeader: pick.type === 'leader',
          leaderRound: pick.type === 'leader' ? pick.packNumber : null,
        }
      }),
    }
  }

  if (loading) {
    return (
      <div className="draft-log-page">
        <div className="draft-log-content">
          <div className="draft-log-header">
            <div className="skeleton-line" style={{ width: '160px', height: '1.8rem', margin: '0 auto 0.5rem' }} />
            <div className="skeleton-line" style={{ width: '240px', height: '0.9rem', margin: '0 auto' }} />
          </div>
          <div className="draft-log-top-nav">
            <div className="skeleton-block" style={{ width: '80px', height: '36px' }} />
            <div className="skeleton-block" style={{ width: '140px', height: '36px' }} />
            <div className="skeleton-block" style={{ width: '130px', height: '36px' }} />
          </div>
          <div className="draft-log-tabs">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="skeleton-tab" style={{ width: '100px', marginRight: '-1px' }} />
            ))}
          </div>
          <div className="draft-log-tab-content">
            {[1, 2, 3].map(i => (
              <div key={i} className="draft-log-pick-row" style={{ opacity: 1 - i * 0.2 }}>
                <div className="draft-log-pick-label">
                  <div className="skeleton-line" style={{ width: '40px', height: '0.7rem' }} />
                  <div className="skeleton-line" style={{ width: '30px', height: '1rem', marginTop: '0.25rem' }} />
                </div>
                <div className="draft-log-pack-cards" style={{ display: 'flex', gap: '0.5rem', flex: 1 }}>
                  {Array.from({ length: 14 - (i - 1) * 4 }).map((_, j) => (
                    <div key={j} className="skeleton-block" style={{ width: '65px', height: '91px', flexShrink: 0 }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="draft-log-page">
        <div className="draft-log-content">
          <div className="draft-log-error">
            <h2>Error</h2>
            <p>{error}</p>
            <Button variant="primary" onClick={() => router.push(`/draft/${shareId}/pod`)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
              Play
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (!data) return null

  const { picks, meta } = data
  const packArtUrl = meta.setCode ? getPackArtUrl(meta.setCode) : null
  const isParticipant = !!meta.myPlayerId
  const hasViewableSeats = meta.viewableSeats.length > 0
  const isBlankState = !hasViewableSeats || meta.targetSeat === null

  // Sort players: current user first, then by seat number
  const sortedPlayers = [...meta.players].sort((a, b) => {
    if (a.userId === meta.myPlayerId) return -1
    if (b.userId === meta.myPlayerId) return 1
    return a.seatNumber - b.seatNumber
  })

  // Group picks by section
  const leaderPicks = picks.filter(p => p.type === 'leader')
  const pack1Picks = picks.filter(p => p.type === 'card' && p.packNumber === 1)
  const pack2Picks = picks.filter(p => p.type === 'card' && p.packNumber === 2)
  const pack3Picks = picks.filter(p => p.type === 'card' && p.packNumber === 3)

  const sections = [
    { title: 'Leader Draft', picks: leaderPicks },
    { title: 'Pack 1', picks: pack1Picks },
    { title: 'Pack 2', picks: pack2Picks },
    { title: 'Pack 3', picks: pack3Picks },
  ].filter(s => s.picks.length > 0)

  return (
    <div className="draft-log-page">
      {packArtUrl && (
        <div className="set-art-header" style={{ backgroundImage: `url("${packArtUrl}")` }}></div>
      )}

      <div className="draft-log-content">
        <div className="draft-log-header">
          <h1>Draft Log</h1>
          {meta.targetSeat !== null && (
            <p>{meta.playerName} &middot; Seat {meta.targetSeat} &middot; {meta.setName}</p>
          )}
          {meta.targetSeat === null && meta.setName && (
            <p>{meta.setName}</p>
          )}
        </div>

        {meta.isHost && (
          <p className="draft-log-organizer">You are the draft organizer</p>
        )}

        {/* Top nav: Play button + Copy Share Link + Host lock + Download JSON */}
        <div className="draft-log-top-nav">
          <Button variant="primary" onClick={() => router.push(`/draft/${shareId}/pod`)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            Play
          </Button>
          <Button variant="secondary" className="draft-log-share-link" onClick={handleCopyShareLink}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            Copy Share Link
          </Button>
          <Button variant="secondary" onClick={handleDownloadJson}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download JSON
          </Button>
          {meta.isHost && (
            <Button
              variant="secondary"
              onClick={handleToggleDraftPublic}
              title={meta.isDraftPublic ? 'Draft is public - click to make private' : 'Draft is private - click to make public'}
              style={{ color: meta.isDraftPublic ? '#81c784' : '#ff6b6b' }}
            >
              {meta.isDraftPublic ? <LockOpen size={14} /> : <LockClosed size={14} />}
              {meta.isDraftPublic ? 'Public' : 'Private'}
            </Button>
          )}
        </div>

        <ConfirmModal
          isOpen={showPublicConfirm}
          title="Make this draft log public?"
          confirmLabel="Make Public"
          cancelLabel="Cancel"
          onConfirm={handleConfirmDraftPublic}
          onCancel={() => setShowPublicConfirm(false)}
        >
          <p>
            This makes the entire draft log publicly visible — every player&apos;s
            picks become viewable by anyone with the link, not just the
            participants.
          </p>
          <p>You can switch it back to private at any time.</p>
        </ConfirmModal>

        {/* Feedback message */}
        {message && (
          <div className="draft-log-message">
            {message}
          </div>
        )}

        {/* Player tabs */}
        <div className="draft-log-tabs">
          {sortedPlayers.map(p => {
            const isViewable = meta.viewableSeats.includes(p.seatNumber)
            const isActive = p.seatNumber === meta.targetSeat
            const isOwnTab = p.userId === meta.myPlayerId
            const isPlayerPublic = p.isLogPublic || meta.isDraftPublic
            let className = 'draft-log-tab'
            if (isActive) className += ' active'
            if (!isViewable) className += ' disabled'

            return (
              <button
                key={p.seatNumber}
                className={className}
                onClick={() => isViewable && handleSeatChange(p.seatNumber)}
                disabled={!isViewable}
                title={!isViewable ? 'This player\'s draft log is private' : p.username}
              >
                {p.username}
                {/* Lock icon: show on non-bot tabs */}
                {!p.isBot && (
                  isOwnTab ? (
                    <span
                      className={`draft-log-lock clickable ${isPlayerPublic ? 'lock-public' : 'lock-private'}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleTogglePlayerPublic(p)
                      }}
                      title={isPlayerPublic ? 'Your log is public - click to make private' : 'Your log is private - click to make public'}
                    >
                      {isPlayerPublic ? <LockOpen /> : <LockClosed />}
                    </span>
                  ) : (
                    <span
                      className={`draft-log-lock ${isPlayerPublic ? 'lock-public' : 'lock-private'}`}
                      title={isPlayerPublic ? 'This draft log is public' : 'This draft log is private'}
                    >
                      {isPlayerPublic ? <LockOpen /> : <LockClosed />}
                    </span>
                  )
                )}
              </button>
            )
          })}
        </div>

        {/* Tab content area */}
        <div className="draft-log-tab-content">
          {isBlankState ? (
            <div className="draft-log-blank">
              <p>This draft log is private.</p>
              <p>
                Contact the draft organizer{meta.hostUsername ? ` (${meta.hostUsername})` : ''} to make it public.
                {!isParticipant && ' If you are a participant, log in to view your own picks.'}
              </p>
            </div>
          ) : (
            <>
            {/* Player info header — strategy for bots, deck link for all */}
            {(() => {
              const activePlayer = meta.players.find(p => p.seatNumber === meta.targetSeat)
              if (!activePlayer) return null
              return (
                <div className="draft-log-player-info">
                  {activePlayer.isBot && activePlayer.strategyDisplayName && (
                    <div className="draft-log-strategy">
                      <strong>Strategy:</strong> {activePlayer.strategyDisplayName}
                      {activePlayer.mixinDisplayName && ` + ${activePlayer.mixinDisplayName}`}
                      {activePlayer.strategyDescription && (
                        <p className="draft-log-strategy-desc">{activePlayer.strategyDescription} {activePlayer.mixinDescription || ''}</p>
                      )}
                    </div>
                  )}
                  {activePlayer.poolShareId ? (
                    activePlayer.poolIsPublic || activePlayer.isBot || activePlayer.userId === meta.myPlayerId || meta.isHost ? (
                      <a href={`/pool/${activePlayer.poolShareId}/deck`} className="draft-log-deck-link">
                        View {activePlayer.isBot ? `${activePlayer.username}'s` : ''} Deck & Pool
                      </a>
                    ) : (
                      <span className="draft-log-deck-private">
                        <LockClosed /> Deck is private
                      </span>
                    )
                  ) : activePlayer.userId === meta.myPlayerId ? (
                    <a href={`/draft/${shareId}/pod`} className="draft-log-deck-link">Go to pod to build deck</a>
                  ) : (
                    <span className="draft-log-deck-building">Still deckbuilding...</span>
                  )}
                </div>
              )
            })()}
            {sections.map(section => (
              <div key={section.title} className="draft-log-section">
                {section.picks.map((pick, i) => (
                  <div key={i} className="draft-log-pick-row">
                    <div className="draft-log-pick-label">
                      {section.title === 'Leader Draft' ? 'Leaders' : `Pack ${pick.packNumber}`}
                      <span>Pick {pick.pickInPack}</span>
                    </div>
                    <div className="draft-log-pack-cards cards-grid">
                      {pick.visibleCards.map(card => (
                        <CardWithPreview
                          key={card.instanceId}
                          card={card}
                          selected={card.instanceId === pick.pickedInstanceId}
                          statsSetCode={meta.setCode}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

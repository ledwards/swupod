'use client'

/**
 * LeaderTable — the leader phases drawn on the card-pick table.
 *
 * Leader pick and card pick are one table: the same seats around the same
 * centre arrow, "Your Leaders" in the header, the pack in the strip along the
 * bottom and the confirmation under it. Only the pack holds leaders instead of
 * cards. This renders PackDraftPhase's DOM (same `.draft-pick-table` classes,
 * same grid rows) so
 * the leader → card handover does not move a single seat. Change the card-pick
 * table and this one together.
 */
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import PlayerCircle, { type PlayerCircleProps } from './PlayerCircle'
import Button from './Button'
import CardZoom from './CardZoom'
import DraftReviewModal from './DraftReviewModal'
import { draftPackLayout } from '../utils/draftPackLayout'
// Same order the page always loaded them in: LeaderDraftPhase.css, then PackDraftPhase.css.
import './LeaderDraftPhase.css'
import './PackDraftPhase.css'

const ReviewIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
    <polyline points="14 2 14 8 20 8"></polyline>
    <line x1="16" y1="13" x2="8" y2="13"></line>
    <line x1="16" y1="17" x2="8" y2="17"></line>
    <polyline points="10 9 9 9 8 9"></polyline>
  </svg>
)

/** Leaders are landscape: 504 × 360. */
const LEADER_ASPECT = 360 / 504

type ReviewModalProps = ComponentProps<typeof DraftReviewModal>

interface TableLeader {
  name?: string
  imageUrl?: string
  backImageUrl?: string
}

interface TableDraft {
  maxPlayers?: number
  packSize?: number
  competitive?: boolean
  [key: string]: unknown
}

interface TablePlayer {
  id?: string
  draftedLeaders?: TableLeader[]
  draftedCards?: unknown[]
}

interface LeaderTableProps {
  phaseClassName: string
  draft: TableDraft | null
  players: PlayerCircleProps['players']
  myPlayer: TablePlayer | null
  isHost: boolean
  leaderRound: number
  /** Card packs to come, for the "Cards: 0/42" count. */
  totalPacks: number
  passDirection: 'left' | 'right'
  /** Timer controls for the header tray (none while the table is previewed). */
  timer?: ReactNode
  /** Shown in place of the leader summary to anyone watching. */
  spectatorLabel: string
  packLabel: string
  /** Number of leader slots in the strip, for sizing them. */
  packCount: number
  pack: ReactNode
  bottom: ReactNode
  bottomTimer?: ReactNode
  error: string | null
  onTogglePause?: () => void
  onTimerExpire?: () => void
}

function LeaderTable({
  phaseClassName,
  draft,
  players,
  myPlayer,
  isHost,
  leaderRound,
  totalPacks,
  passDirection,
  timer,
  spectatorLabel,
  packLabel,
  packCount,
  pack,
  bottom,
  bottomTimer,
  error,
  onTogglePause,
  onTimerExpire,
}: LeaderTableProps) {
  const isSpectator = !myPlayer
  const draftedLeaders = myPlayer?.draftedLeaders || []
  const draftedCards = myPlayer?.draftedCards || []
  const packSize = draft?.packSize || 14
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [zoomedLeader, setZoomedLeader] = useState<TableLeader | null>(null)

  // Keep the picked leaders above the table at every viewport size.
  const [headerTray, setHeaderTray] = useState<HTMLElement | null>(null)
  useEffect(() => {
    setHeaderTray(document.getElementById('draft-header-leaders'))
  }, [])

  // Fit the leaders to the strip the same way the pack fits its cards.
  const packAreaRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const area = packAreaRef.current
    if (!area) return
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      const fit = draftPackLayout(Math.max(1, entry.contentRect.width - 40), Math.max(1, entry.contentRect.height - 16), packCount, LEADER_ASPECT, 320)
      area.style.setProperty('--pack-auto-rows', String(fit.rows))
      area.style.setProperty('--pack-auto-columns', String(fit.columns))
      area.style.setProperty('--pack-fit-width', `${fit.cardWidth}px`)
    })
    observer.observe(area)
    return () => observer.disconnect()
  }, [packCount, myPlayer?.id])

  const leaderTray = (
    <div className="draft-player-area draft-player-area-top" role="region" aria-label="Draft status and leaders">

      {timer}
      {isSpectator ? (
        <div className="draft-info-header">
          <div className="draft-progress-info">
            <span className="progress-item">
              <span className="info-label">Spectating —</span>
              <span className="info-value">{spectatorLabel}</span>
            </span>
          </div>
        </div>
      ) : (
        <div className="draft-info-header draft-leader-summary">
          <div className="my-leaders-info">
            {draftedLeaders.length > 0 && <span className="draft-leaders-label">Your Leaders</span>}
            {draftedLeaders.length > 0 ? (
              <div className="leader-thumbnails">
                {draftedLeaders.map((l, idx) => (
                  <div
                    key={idx}
                    className="leader-thumbnail"
                    role="button"
                    tabIndex={0}
                    aria-label={`${l.name || 'Leader'} — enlarge`}
                    onClick={() => setZoomedLeader(l)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter' && e.key !== ' ') return
                      e.preventDefault()
                      setZoomedLeader(l)
                    }}
                  >
                    <img src={l.imageUrl} alt={l.name} className="leader-thumbnail-img" />
                  </div>
                ))}
              </div>
            ) : (
              null
            )}
          </div>
          {draftedCards.length > 0 && <div className="draft-progress-info">
            {!draft?.competitive ? (
              <Button variant="secondary" size="sm" className="review-button" title="View your drafted cards" onClick={() => setShowReviewModal(true)}>
                <ReviewIcon />
                <span>Cards: {draftedCards.length}/{packSize * totalPacks}</span>
              </Button>
            ) : (
              <span className="competitive-card-count">Cards: {draftedCards.length}/{packSize * totalPacks}</span>
            )}
          </div>}
        </div>
      )}
    </div>
  )

  return (
    <div className={`draft-pick-table ${phaseClassName}`}>
      <div className="draft-layout">
        <div className="players-section">
          <PlayerCircle
            players={players}
            maxPlayers={draft?.maxPlayers || 8}
            {...(myPlayer?.id ? { currentUserId: myPlayer.id } : {})}
            showStatus={true}
            {...(draft ? { draft } : {})}
            hideEmptySeats={true}
            passDirection={passDirection}
            showLeaderInfo={true}
            pairLeaderInfo={true}
            leaderRound={leaderRound}
          />
        </div>

        <div className="cards-section">
          {headerTray ? createPortal(leaderTray, headerTray) : leaderTray}

          {!isSpectator && (
            <div className="current-pack" ref={packAreaRef}>
              <div className="pack-card-holder">
                <span className="pack-choice-label">{packLabel}</span>
                {pack}
              </div>
            </div>
          )}

          <div className="draft-player-area draft-player-area-bottom" role="region" aria-label="Pick confirmation">
            {bottom}
          </div>

          {!isSpectator && bottomTimer && <div className="timer-bar-bottom">{bottomTimer}</div>}
        </div>
      </div>

      {error && <div className="phase-error">{error}</div>}

      {!isSpectator && showReviewModal && (
        <DraftReviewModal
          draftedCards={draftedCards as NonNullable<ReviewModalProps['draftedCards']>}
          draftedLeaders={draftedLeaders as NonNullable<ReviewModalProps['draftedLeaders']>}
          packSize={packSize}
          {...(draft ? { draft } : {})}
          players={players as unknown as NonNullable<ReviewModalProps['players']>}
          isHost={isHost}
          {...(onTogglePause ? { onTogglePause } : {})}
          {...(onTimerExpire ? { onTimerExpire } : {})}
          onClose={() => setShowReviewModal(false)}
        />
      )}

      {zoomedLeader && <CardZoom card={zoomedLeader} onClose={() => setZoomedLeader(null)} />}
    </div>
  )
}

export default LeaderTable

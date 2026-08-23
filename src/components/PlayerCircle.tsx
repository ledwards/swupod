// @ts-nocheck
'use client'

import { useState, useRef, useEffect, memo } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../contexts/AuthContext'
import { ASPECT_COLORS } from '../utils/aspectColors'
import PlayerSeat from './PlayerSeat'
import './PlayerCircle.css'

interface Leader {
  id?: string
  instanceId?: string
  name: string
  set?: string
  aspects?: string[]
  imageUrl?: string
  backImageUrl?: string
}

interface Player {
  id: string
  seatNumber: number
  username?: string
  pickStatus?: 'waiting' | 'picked' | 'selected' | 'picking' | 'timeout'
  /** A staged selection is tentative until the player confirms it. */
  selectionConfirmed?: boolean
  currentPackSize?: number
  draftedLeaders?: Leader[]
  leaderPack?: Leader[]
  activeLeaderName?: string | null
  chosenBase?: { name: string; aspects?: string[]; imageUrl?: string; backImageUrl?: string } | null
}

interface Draft {
  [key: string]: unknown
}

interface Seat {
  seatNumber: number
  player?: Player
  isCurrentUser: boolean
}

interface PositionStyle {
  left: string
  top: string
  angle: number
}

export interface PlayerCircleProps {
  players: Player[]
  maxPlayers?: number
  currentUserId?: string
  showStatus?: boolean
  draft?: Draft
  hideEmptySeats?: boolean
  showLeaderInfo?: boolean | 'simple'
  passDirection?: 'left' | 'right' | null
  leaderRound?: number
  hostId?: string
  onRemovePlayer?: (userId: string) => void
}

/**
 * Circular layout for draft players
 * Current user is always at the bottom (6 o'clock)
 * Other players arranged clockwise from bottom-left
 */
function PlayerCircle({ players, maxPlayers = 8, currentUserId, showStatus = false, draft, hideEmptySeats = false, showLeaderInfo = false, passDirection = null, leaderRound = 1, hostId, onRemovePlayer }: PlayerCircleProps) {
  const { isPatron } = useAuth()
  const [hoveredLeaderPreview, setHoveredLeaderPreview] = useState<Leader | null>(null)
  const previewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleLeaderMouseEnter = (leader: Leader) => {
    // Disable hover preview on mobile
    const isMobileDevice = window.innerWidth <= 768 || ('ontouchstart' in window) || (navigator.maxTouchPoints > 0)
    if (isMobileDevice) return

    if (previewTimeoutRef.current) {
      clearTimeout(previewTimeoutRef.current)
    }
    previewTimeoutRef.current = setTimeout(() => {
      setHoveredLeaderPreview(leader)
    }, 400)
  }

  const handleLeaderMouseLeave = () => {
    if (previewTimeoutRef.current) {
      clearTimeout(previewTimeoutRef.current)
    }
    setHoveredLeaderPreview(null)
  }

  // Find current user's seat
  const currentUser = players.find(p => p.id === currentUserId)
  const userSeat = currentUser?.seatNumber || 1

  // Debug: log if current user not found
  if (!currentUser && currentUserId && players.length > 0) {
    console.warn('[PlayerCircle] Current user not found!', {
      currentUserId,
      playerIds: players.map(p => ({ id: p.id, type: typeof p.id })),
      currentUserIdType: typeof currentUserId
    })
  }

  // Create array of seats (filled or empty)
  let seats: Seat[] = []
  if (hideEmptySeats) {
    // Build seats from actual players — handles players in seats beyond maxPlayers.
    // Dedupe by seatNumber defensively: a pod corrupted by a pre-fix join (one
    // that collided onto an already-occupied seat — see findNextAvailableSeat in
    // app/api/draft/[shareId]/join/route.ts) can have two players sharing a
    // seat_number. Rendered directly, that produces two children with the same
    // `seat-${n}` key and crashes the phase. Keep one occupant per seat (the
    // current user wins their own seat; otherwise the first by seat/id order) so
    // the draft survives legacy bad data. New joins can no longer create this.
    const bySeat = new Map<number, (typeof players)[number]>()
    for (const p of players.slice().sort((a, b) => a.seatNumber - b.seatNumber || String(a.id).localeCompare(String(b.id)))) {
      const existing = bySeat.get(p.seatNumber)
      if (!existing || (p.id === currentUserId && existing.id !== currentUserId)) {
        bySeat.set(p.seatNumber, p)
      }
    }
    seats = Array.from(bySeat.values())
      .sort((a, b) => a.seatNumber - b.seatNumber)
      .map(p => ({
        seatNumber: p.seatNumber,
        player: p,
        isCurrentUser: p.id === currentUserId,
      }))
  } else {
    for (let i = 1; i <= maxPlayers; i++) {
      const player = players.find(p => p.seatNumber === i)
      seats.push({
        seatNumber: i,
        player,
        isCurrentUser: player?.id === currentUserId,
      })
    }
  }

  // Calculate position on circle
  // For dynamic positioning, we calculate based on actual number of seats shown
  const getPositionStyle = (index: number, totalSeats: number, radius = 42): PositionStyle => {
    // Start from bottom (180 degrees) and go clockwise
    // Current user should be at the bottom
    let currentUserIndex = seats.findIndex(s => s.isCurrentUser)

    // If current user not found, default to first seat at bottom
    if (currentUserIndex === -1) {
      currentUserIndex = 0
    }

    // Rotate so current user is at bottom (index 0 position)
    let adjustedIndex = index - currentUserIndex
    if (adjustedIndex < 0) adjustedIndex += totalSeats

    // Calculate angle: start at 0° (bottom in our coordinate system), go clockwise
    // cos(0°) = 1 gives top = 92% (bottom of container)
    // sin increases clockwise from bottom
    const angleStep = 360 / totalSeats
    const angle = adjustedIndex * angleStep
    const angleRad = (angle * Math.PI) / 180

    const left = 50 + radius * Math.sin(angleRad)
    const top = 52.5 + radius * Math.cos(angleRad)

    return {
      left: `${left}%`,
      top: `${top}%`,
      angle: angle // Return angle for text alignment
    }
  }

  // Render aspect icons
  const renderAspectIcons = (aspects?: string[]) => {
    if (!aspects || aspects.length === 0) return null
    return (
      <span className="leader-aspects">
        {aspects.map((aspect, idx) => (
          <img
            key={idx}
            src={`/icons/${aspect.toLowerCase()}.png`}
            alt={aspect}
            className="leader-aspect-icon"
          />
        ))}
      </span>
    )
  }

  // Get status color
  // A staged-but-unconfirmed selection is NOT a made choice — the player can
  // still swap it — so it reads as still picking, same as no selection at all.
  const getStatusColor = (status?: string, confirmed?: boolean) => {
    switch (status) {
      case 'picked': return '#4CAF50'
      case 'selected': return confirmed ? '#4CAF50' : '#FFC107'  // Green once locked in
      case 'picking': return '#FFC107'
      case 'waiting': return '#9E9E9E'   // Neutral - picking hasn't opened yet
      case 'timeout': return '#F44336'
      default: return '#666'
    }
  }

  // 'waiting' is the leader preview: packs are dealt and leaders are revealed,
  // but nobody can pick until the host starts the draft. Labelling those seats
  // "Picking..." made players click leaders that do nothing and conclude the
  // app was broken.
  const getStatusLabel = (status?: string, confirmed?: boolean) => {
    switch (status) {
      case 'picked': return 'Done'
      case 'selected': return confirmed ? 'Done' : 'Picking...'
      case 'waiting': return 'Ready'
      default: return 'Picking...'
    }
  }

  // Render simple leader info - for pack draft and report seating
  const renderSimpleLeaderInfo = (player?: Player) => {
    if (!player) return null

    const draftedLeaders = player.draftedLeaders || []
    const displayName = player.username || `Player ${player.seatNumber}`

    // Split into chosen leader (first match only) and unchosen pool
    let chosenLeader: Leader | null = null
    const unchosenLeaders: Leader[] = []
    let foundActive = false
    for (const leader of draftedLeaders) {
      if (!foundActive && player.activeLeaderName && leader.name === player.activeLeaderName) {
        chosenLeader = leader
        foundActive = true
      } else {
        unchosenLeaders.push(leader)
      }
    }

    const hasChosenSection = chosenLeader || player.chosenBase
    const showDivider = hasChosenSection && unchosenLeaders.length > 0

    return (
      <div className="radial-leader-info simple">
        <div className="radial-player-name">
          {displayName}
        </div>
        <div className="leader-info-list">
          {chosenLeader && (
            <div className="leader-info-item">
              <span
                className="leader-name hoverable"
                onMouseEnter={() => handleLeaderMouseEnter(chosenLeader)}
                onMouseLeave={handleLeaderMouseLeave}
              >
                {chosenLeader.name}{chosenLeader.set && draft?.settings?.draftMode === 'chaos' && <span className="leader-set-code"> ({chosenLeader.set})</span>}
              </span>
              {renderAspectIcons(chosenLeader.aspects)}
            </div>
          )}
          {player.chosenBase && (
            <div className="leader-info-item">
              <span
                className="leader-name hoverable"
                style={{
                  fontStyle: 'italic',
                  color: player.chosenBase.aspects?.[0] ? (ASPECT_COLORS[player.chosenBase.aspects[0]] || 'white') : 'white',
                }}
                onMouseEnter={() => handleLeaderMouseEnter(player.chosenBase as Leader)}
                onMouseLeave={handleLeaderMouseLeave}
              >
                {player.chosenBase.name}
              </span>
              {renderAspectIcons(player.chosenBase.aspects)}
            </div>
          )}
          {unchosenLeaders.map((leader, idx) => (
            <div key={idx} className="leader-info-item" style={{ opacity: 0.5 }}>
              <span
                className="leader-name hoverable"
                onMouseEnter={() => handleLeaderMouseEnter(leader)}
                onMouseLeave={handleLeaderMouseLeave}
              >
                {leader.name}{leader.set && draft?.settings?.draftMode === 'chaos' && <span className="leader-set-code"> ({leader.set})</span>}
              </span>
              {renderAspectIcons(leader.aspects)}
            </div>
          ))}
        </div>
        {player.pickStatus && (
          <div
            className="leader-info-status"
            style={{ color: getStatusColor(player.pickStatus, player.selectionConfirmed) }}
          >
            {getStatusLabel(player.pickStatus, player.selectionConfirmed)}
          </div>
        )}
      </div>
    )
  }

  // Render full leader info (with pack, status, etc.) - for leader draft
  const renderLeaderInfo = (player?: Player, isCurrentUser?: boolean) => {
    if (!player) return null

    const allPickedLeaders = player.draftedLeaders || []
    const remainingPack = player.leaderPack || []
    const displayName = player.username || `Player ${player.seatNumber}`

    // Show picks from PREVIOUS rounds only (not current round)
    // Round 1: show 0, Round 2: show 1, Round 3: show 2
    const pickedLeaders = allPickedLeaders.slice(0, leaderRound - 1)

    // Get the leader picked THIS round (if any)
    // If they have picked this round, it's at index leaderRound - 1
    const currentRoundPick = allPickedLeaders.length >= leaderRound
      ? allPickedLeaders[leaderRound - 1]
      : null

    // Build full pack: remaining leaders + current round pick (should always be 3)
    const fullPack = currentRoundPick
      ? [...remainingPack, currentRoundPick]
      : remainingPack

    const showDivider = pickedLeaders.length > 0 && fullPack.length > 0

    return (
      <div className="radial-leader-info">
        <div className="radial-player-name">
          {displayName}
        </div>
        {pickedLeaders.length > 0 && (
          <div className="leader-info-section">
            <div className="leader-info-list">
              {pickedLeaders.map((leader, idx) => (
                <div key={idx} className="leader-info-item">
                  <span
                    className="leader-name hoverable"
                    onMouseEnter={() => handleLeaderMouseEnter(leader)}
                    onMouseLeave={handleLeaderMouseLeave}
                  >
                    {leader.name}{leader.set && draft?.settings?.draftMode === 'chaos' && <span className="leader-set-code"> ({leader.set})</span>}
                  </span>
                  {renderAspectIcons(leader.aspects)}
                </div>
              ))}
            </div>
          </div>
        )}
        {showDivider && <hr className="leader-info-divider" />}
        <div className="leader-info-section">
          <div className="leader-info-label">Current Pack</div>
          {fullPack.length > 0 ? (
            <div className="leader-info-list">
              {fullPack.map((leader, idx) => (
                <div key={idx} className="leader-info-item">
                  <span
                    className="leader-name hoverable"
                    onMouseEnter={() => handleLeaderMouseEnter(leader)}
                    onMouseLeave={handleLeaderMouseLeave}
                  >
                    {leader.name}{leader.set && draft?.settings?.draftMode === 'chaos' && <span className="leader-set-code"> ({leader.set})</span>}
                  </span>
                  {renderAspectIcons(leader.aspects)}
                </div>
              ))}
            </div>
          ) : (
            <div className="leader-info-empty">Waiting...</div>
          )}
        </div>
        <div
          className="leader-info-status"
          style={{ color: getStatusColor(player.pickStatus, player.selectionConfirmed) }}
        >
          {getStatusLabel(player.pickStatus, player.selectionConfirmed)}
        </div>
      </div>
    )
  }

  // Get CSS class for position (only used when not hiding empty seats)
  const getDisplayPosition = (seatNumber: number) => {
    // Rotate seats so current user is at position 1 (bottom)
    // userSeat defaults to 1 if current user not found
    let position = seatNumber - userSeat + 1
    if (position <= 0) position += maxPlayers
    return position
  }

  const getPositionClass = (displayPosition: number) => {
    return `seat-position-${displayPosition}`
  }

  // Detect mobile for adjusted radii
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Center point of the circle
  const centerX = 50
  const centerY = 52.5

  // Radii for concentric circles (in percentage of container)
  // Bring inward on mobile to fit screen, spread out on desktop/iPad
  const seatRadius = isMobile ? 22 : 27
  const leaderInfoRadius = isMobile ? 43 : 47

  // Render leader preview portal
  const renderLeaderPreview = () => {
    if (!hoveredLeaderPreview) return null

    const leader = hoveredLeaderPreview
    const hasBackImage = leader.backImageUrl

    // Calculate scaled dimensions
    const scale = 0.6
    const scaledFrontWidth = 504 * scale
    const scaledFrontHeight = 360 * scale
    const scaledBackWidth = 360 * scale
    const scaledBackHeight = 504 * scale

    return createPortal(
      <div
        className="card-preview-enlarged"
        style={{
          position: 'fixed',
          right: '0',
          top: '0',
          width: '50vw',
          height: '100vh',
          zIndex: 9999,
          pointerEvents: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          paddingLeft: '20px',
        }}
      >
        {hasBackImage ? (
          <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
            {/* Front - horizontal */}
            <div style={{
              width: `${scaledFrontWidth}px`,
              height: `${scaledFrontHeight}px`,
              overflow: 'hidden',
              borderRadius: '12px',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8)',
              border: '2px solid rgba(255, 255, 255, 0.3)',
            }}>
              <img
                src={leader.imageUrl}
                alt={leader.name}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                }}
              />
            </div>
            {/* Back - vertical */}
            <div style={{
              width: `${scaledBackWidth}px`,
              height: `${scaledBackHeight}px`,
              overflow: 'hidden',
              borderRadius: '12px',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8)',
              border: '2px solid rgba(255, 255, 255, 0.3)',
            }}>
              <img
                src={leader.backImageUrl}
                alt={`${leader.name} - Back`}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                }}
              />
            </div>
          </div>
        ) : (
          <div style={{
            width: `${scaledFrontWidth}px`,
            height: `${scaledFrontHeight}px`,
            overflow: 'hidden',
            borderRadius: '24px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8)',
            border: '2px solid rgba(255, 255, 255, 0.3)',
          }}>
            <img
              src={leader.imageUrl}
              alt={leader.name}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
              }}
            />
          </div>
        )}
      </div>,
      document.body
    )
  }

  return (
    <div className={`player-circle ${showLeaderInfo ? 'with-leader-info' : ''}`}>
      <div className="circle-container">
        {/* Center arrow - innermost */}
        {passDirection && (
          <div className="center-arrow">
            <span className="arrow-symbol">
              {passDirection === 'left' ? '←' : '→'}
            </span>
            <span className="pass-direction-text">
              <span className="pass-word">Pass</span>
              <span className="direction-word">{passDirection === 'left' ? 'Left' : 'Right'}</span>
            </span>
          </div>
        )}

        {/* Player seats - middle ring */}
        {seats.map((seat, index) => {
          const positionStyle = getPositionStyle(index, seats.length, seatRadius)

          return (
            <div
              key={`seat-${seat.seatNumber}`}
              className="seat-wrapper"
              style={positionStyle}
            >
              <PlayerSeat
                player={seat.player}
                seatNumber={seat.seatNumber}
                isCurrentUser={seat.isCurrentUser}
                isEmpty={!seat.player}
                showStatus={showStatus}
                isPatron={seat.isCurrentUser && isPatron}
                isHost={!!hostId && seat.player?.id === hostId}
                isHostViewing={!!onRemovePlayer}
                onRemove={seat.player && onRemovePlayer ? () => onRemovePlayer(seat.player.id) : undefined}
              />
            </div>
          )
        })}

        {/* Leader info - outer ring (skip current user) */}
        {showLeaderInfo && seats.map((seat, index) => {
          if (!seat.player || seat.isCurrentUser) return null

          const totalSeats = seats.length
          let currentUserIndex = seats.findIndex(s => s.isCurrentUser)
          if (currentUserIndex === -1) currentUserIndex = 0

          let adjustedIndex = index - currentUserIndex
          if (adjustedIndex < 0) adjustedIndex += totalSeats

          const angleStep = 360 / totalSeats
          const angle = adjustedIndex * angleStep
          const angleRad = (angle * Math.PI) / 180

          const left = centerX + leaderInfoRadius * Math.sin(angleRad)
          const top = centerY + leaderInfoRadius * Math.cos(angleRad)

          return (
            <div
              key={`info-${seat.seatNumber}`}
              className="radial-info-wrapper"
              style={{
                left: `${left}%`,
                top: `${top}%`,
              }}
            >
              {showLeaderInfo === 'simple'
                ? renderSimpleLeaderInfo(seat.player)
                : renderLeaderInfo(seat.player, seat.isCurrentUser)}
            </div>
          )
        })}
      </div>
      {renderLeaderPreview()}
    </div>
  )
}

export default memo(PlayerCircle)

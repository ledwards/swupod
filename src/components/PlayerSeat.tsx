// @ts-nocheck
'use client'

import { memo } from 'react'
import UserAvatar from './UserAvatar'
import './PlayerSeat.css'

const CrownIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="#FFD700" stroke="none">
    <path d="M2 20h20v2H2zM4 17h16l-2-9-4 4-2-6-2 6-4-4z"/>
  </svg>
)

const isDoneStatus = (status?: string) => status === 'picked' || status === 'selected' || status === 'confirmed'

interface Player {
  id?: string
  username?: string
  avatarUrl?: string
  pickStatus?: string
}

export interface PlayerSeatProps {
  player?: Player | null
  seatNumber: number
  isCurrentUser?: boolean
  isEmpty?: boolean
  showStatus?: boolean
  statusColor?: string | null
  isPatron?: boolean
  isHost?: boolean
  isHostViewing?: boolean
  onRemove?: () => void
}

function PlayerSeat({
  player,
  seatNumber,
  isCurrentUser,
  isEmpty,
  showStatus = false,
  statusColor = null,
  isPatron = false,
  isHost = false,
  isHostViewing = false,
  onRemove,
}: PlayerSeatProps) {
  // Status colors
  const getStatusColor = (status?: string): string => {
    switch (status) {
      case 'picked':
      case 'selected':
      case 'confirmed':
        return '#4CAF50' // Green
      case 'picking':
        return '#FFC107' // Yellow
      case 'timeout':
        return '#F44336' // Red
      default:
        return '#444' // Gray (default border)
    }
  }

  // Use passed statusColor or derive from player status
  const borderColor = statusColor || (player?.pickStatus ? getStatusColor(player.pickStatus) : undefined)

  if (isEmpty) {
    return (
      <div className="player-seat empty" data-testid={`player-seat-${seatNumber}`} data-seat-number={seatNumber}>
        <div className="seat-avatar empty-avatar">
          <span>{seatNumber}</span>
        </div>
        <div className="seat-name">Empty</div>
      </div>
    )
  }

  const displayName = isCurrentUser ? 'You' : player?.username || `Player ${seatNumber}`

  const showRemove = isHostViewing && onRemove && !isCurrentUser && !!player

  return (
    <div
      className={`player-seat ${isCurrentUser ? 'current-user' : ''}`}
      data-testid={`player-seat-${seatNumber}`}
      data-seat-number={seatNumber}
      {...(player?.id ? { 'data-player-id': player.id } : {})}
      {...(player?.username ? { 'data-username': player.username } : {})}
    >
      <div
        className="seat-avatar"
        style={isPatron
          ? { borderColor: '#cc6a00', boxShadow: '0 0 0 2px #ffb347, 0 0 8px rgba(255, 179, 71, 0.5)' }
          : { borderColor }
        }
      >
        {showRemove && (
          <button
            className="seat-remove-btn"
            onClick={(e) => { e.stopPropagation(); onRemove() }}
            title="Remove player"
            aria-label="Remove player"
          >
            ✕
          </button>
        )}
        <UserAvatar
          src={player?.avatarUrl}
          alt={player?.username}
          isPatron={false}
          size={44}
          fallback={player?.username?.[0]?.toUpperCase() || '?'}
        />
        {showStatus && isDoneStatus(player?.pickStatus) && (
          <div className="status-check">✓</div>
        )}
      </div>
      {isPatron && (
        <img
          src="/icons/friend-of-the-pod.png"
          alt="Friend of the Pod"
          className="seat-patron-badge"
          style={{ position: 'absolute', bottom: '35%', left: '50%', transform: 'translate(-50%, 50%)', width: '64px', maxHeight: '44px', height: 'auto', pointerEvents: 'none', zIndex: 10 }}
        />
      )}
      {showStatus && (
        <div
          className="seat-status"
          style={{ color: getStatusColor(player?.pickStatus) }}
        >
          {isDoneStatus(player?.pickStatus) ? 'Done' : 'Picking...'}
        </div>
      )}
      <div className="seat-name">
        {isHost && <CrownIcon />}
        {displayName}
      </div>
    </div>
  )
}

export default memo(PlayerSeat)

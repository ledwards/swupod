// @ts-nocheck
'use client'

import { useState } from 'react'
import Button from './Button'
import EditableTitle from './EditableTitle'
import CollapsibleSection from './CollapsibleSection'
import CompetitivePracticeRules from './CompetitivePracticeRules'
import { formatPoolLabel } from '../utils/poolDisplayName'
import { trackEvent } from '../hooks/useAnalytics'
import { buildLimitedContext, LimitedAnalyticsEvents } from '../analytics/limitedEvents'
import './SealedPodLobby.css'

const CopyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
  </svg>
)

const CrownIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="#FFD700" stroke="none">
    <path d="M2 20h20v2H2zM4 17h16l-2-9-4 4-2-6-2 6-4-4z"/>
  </svg>
)

const RemoveIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
)

const DefaultAvatar = ({ size = 28 }: { size?: number }) => (
  <div className="player-avatar default-avatar" style={{ width: size, height: size }}>
    <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 71 55" fill="currentColor">
      <path d="M60.1 4.9A58.5 58.5 0 0045.4.2a.2.2 0 00-.2.1 40.7 40.7 0 00-1.8 3.7 54 54 0 00-16.2 0A39.2 39.2 0 0025.4.3a.2.2 0 00-.2-.1 58.4 58.4 0 00-14.7 4.6.2.2 0 00-.1.1C1.5 18.7-.9 32.2.3 45.5v.1a58.9 58.9 0 0018 9.1.2.2 0 00.2-.1 42.1 42.1 0 003.6-5.9.2.2 0 00-.1-.3 38.8 38.8 0 01-5.5-2.6.2.2 0 01 0-.4l1.1-.9a.2.2 0 01.2 0 42 42 0 0035.6 0 .2.2 0 01.2 0l1.1.9a.2.2 0 010 .3 36.4 36.4 0 01-5.5 2.7.2.2 0 00-.1.3 47.3 47.3 0 003.6 5.9.2.2 0 00.2.1 58.7 58.7 0 0018-9.1v-.1c1.4-15-2.3-28.4-9.8-40.1a.2.2 0 00-.1-.1zM23.7 37.3c-3.5 0-6.3-3.2-6.3-7.1s2.8-7.1 6.3-7.1 6.4 3.2 6.3 7.1c0 3.9-2.8 7.1-6.3 7.1zm23.3 0c-3.5 0-6.3-3.2-6.3-7.1s2.8-7.1 6.3-7.1 6.4 3.2 6.3 7.1c0 3.9-2.8 7.1-6.3 7.1z"/>
    </svg>
  </div>
)

interface Player {
  id: string
  username: string
  avatarUrl?: string
  seatNumber: number
}

interface SealedPodLobbyProps {
  setName: string
  podName?: string | null
  shareId: string
  players: Player[]
  isHost: boolean
  isPlayer: boolean
  currentUserId?: string
  hostId?: string
  maxPlayers?: number
  isPublic?: boolean
  competitive?: boolean
  /** Packs each player opens — fixed at creation, shown read-only to everyone. */
  packsPerPlayer?: number
  onStart: () => void
  onLeave: () => void
  onCancel: () => void
  onBack: () => void
  onRemovePlayer: (userId: string) => void
  onSettingsChange?: (settings: Record<string, unknown>) => void
  onRenamePod?: (name: string) => void
  starting: boolean
  error: string | null
  isAdmin?: boolean
}

export default function SealedPodLobby({
  setName,
  podName,
  shareId,
  players,
  isHost,
  isPlayer,
  currentUserId,
  hostId,
  maxPlayers,
  isPublic,
  competitive = false,
  packsPerPlayer,
  onStart,
  onLeave,
  onCancel,
  onBack,
  onRemovePlayer,
  onSettingsChange,
  onRenamePod,
  starting,
  error,
  isAdmin = false,
}: SealedPodLobbyProps) {
  const [copied, setCopied] = useState(false)

  const handleCopyShareUrl = async () => {
    const url = `${window.location.origin}/sealed/${shareId}`
    try {
      await navigator.clipboard.writeText(url)
      trackEvent(LimitedAnalyticsEvents.LIMITED_POD_INVITE_COPIED, {
        ...buildLimitedContext({
          format: 'sealed',
          mode: 'group',
          podShareId: shareId,
          sourceRoute: '/sealed/[shareId]',
        }),
        is_public: isPublic === true,
        current_players: players.length,
        human_players: players.length,
        bot_players: 0,
      })
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  // Admins can bypass the 2-player minimum for testing/facilitation.
  const canStart = isHost && (players.length >= 2 || (isAdmin && players.length >= 1))

  const showPackCount = typeof packsPerPlayer === 'number' && packsPerPlayer > 0

  return (
    <div className="sealed-pod-lobby">
      <h1>
        <EditableTitle
          value={podName || formatPoolLabel(setName, 'sealed')}
          isEditable={isHost && !!onRenamePod}
          onSave={(newName) => {
            if (newName && onRenamePod) {
              onRenamePod(newName)
            }
          }}
          maxLength={100}
          className="sealed-pod-title"
        />
      </h1>

      <div className="sealed-pod-share">
        <span className="share-label">Share URL:</span>
        <Button variant="interactive" size="sm" className="copy-url-button" onClick={handleCopyShareUrl}>
          <CopyIcon />
          <span>{copied ? 'Copied!' : 'Copy Invite Link'}</span>
        </Button>
      </div>

      {(showPackCount || (isHost && onSettingsChange)) && (
        <div className="sealed-pod-settings">
          {/* Read-only pack count — fixed when the pod is created, so joiners
              can see whether it's a 6- or 8-pack pod before sitting down. */}
          {showPackCount && (
            <div className="settings-row">
              <span className="setting-item">
                <span className="setting-label">Packs:</span>
                <span>{packsPerPlayer} each</span>
              </span>
            </div>
          )}
          {isHost && onSettingsChange && (
          <div className="settings-row settings-row-spread">
            <span className="setting-item">
              <span className="setting-label">Max Players:</span>
              <select
                className="setting-select"
                value={maxPlayers || 8}
                onChange={(e) => onSettingsChange({ maxPlayers: Number(e.target.value) })}
                disabled={competitive}
                title={competitive ? 'Competitive Sealed pods are capped at 8 players' : undefined}
              >
                {/* Competitive Sealed pods are capped at 8 players */}
                {Array.from({ length: (competitive ? 8 : 16) - 1 }, (_, i) => i + 2).map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </span>
            <button
              className={`setting-lock ${isPublic ? 'setting-lock-open' : 'setting-lock-closed'}`}
              onClick={() => onSettingsChange({ isPublic: !isPublic })}
              title={isPublic ? 'Public — visible to other players' : 'Private — only players with the link can join'}
            >
              {isPublic ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
              )}
              <span>{isPublic ? 'Public' : 'Private'}</span>
            </button>
          </div>
          )}
        </div>
      )}

      {competitive && (
        <div className="cpm-rules-panel">
          <CollapsibleSection
            title="Competitive Sealed"
            variant="default"
            defaultExpanded={false}
            className="cpm-rules-collapsible"
          >
            <CompetitivePracticeRules showTitle={false} format="sealed" />
          </CollapsibleSection>
        </div>
      )}

      <div className="sealed-pod-players">
        <h2>Players ({players.length}{maxPlayers ? ` / ${maxPlayers}` : ''})</h2>
        <div className="player-list">
          {players.map((player) => (
            <div key={player.id} className={`player-item ${player.id === currentUserId ? 'is-me' : ''}`}>
              {player.avatarUrl ? (
                <img className="player-avatar" src={player.avatarUrl} alt="" />
              ) : (
                <DefaultAvatar />
              )}
              <span className="player-name">
                {player.id === hostId && <CrownIcon />}
                {player.username}
                {player.id === currentUserId && <span className="you-badge">(you)</span>}
              </span>
              {isHost && player.id !== currentUserId && (
                <button
                  className="remove-player-button"
                  onClick={() => onRemovePlayer(player.id)}
                  title="Remove player"
                >
                  <RemoveIcon />
                </button>
              )}
            </div>
          ))}
          <div className="player-item waiting">
            <span className="waiting-text">Waiting for players...</span>
          </div>
        </div>
      </div>

      {error && <p className="sealed-pod-error">{error}</p>}

      <div className="sealed-pod-actions">
        <Button variant="back" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Back
        </Button>
        {isHost && (
          <>
            <Button variant="danger" onClick={onCancel}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              Cancel Pod
            </Button>
            <Button
              variant="primary"
              onClick={onStart}
              disabled={!canStart || starting}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
              {starting ? 'Starting...' : `Start (${players.length} players)`}
            </Button>
          </>
        )}
        {isPlayer && !isHost && (
          <>
            <Button variant="primary" disabled>
              Waiting for host...
            </Button>
            <Button variant="danger" onClick={onLeave}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
              Drop
            </Button>
          </>
        )}
      </div>

      {isHost && players.length < 2 && !isAdmin && (
        <p className="sealed-pod-hint">Need at least 2 players to start</p>
      )}
      {isHost && players.length < 2 && isAdmin && (
        <p className="sealed-pod-hint">Admin override: you can start with fewer than 2 players.</p>
      )}
    </div>
  )
}

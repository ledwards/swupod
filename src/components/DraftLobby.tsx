// @ts-nocheck
'use client'

import { useState } from 'react'
import PlayerCircle from './PlayerCircle'
import HostControls from './HostControls'
import Button from './Button'
import VoiceCueMuteButton from './VoiceCueMuteButton'
import CollapsibleSection from './CollapsibleSection'
import CompetitivePracticeRules from './CompetitivePracticeRules'
import { trackEvent } from '../hooks/useAnalytics'
import { buildLimitedContext, LimitedAnalyticsEvents } from '../analytics/limitedEvents'
import './DraftLobby.css'

const CopyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
  </svg>
)

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>
)

interface Player {
  id: string
  isBot?: boolean
  lobbyReady?: boolean
  [key: string]: unknown
}

interface Draft {
  maxPlayers?: number
  myPlayer?: {
    id: string
  }
  [key: string]: unknown
}

interface DraftLobbyProps {
  draft: Draft | null
  players: Player[]
  isHost: boolean
  isPlayer: boolean
  onStart: () => void
  onRandomize: () => void
  onRandomizePacks?: () => void
  onAddBot: () => void
  onSettingsChange: (settings: unknown) => void
  onLeave: () => void
  onToggleReady: () => void
  onRemovePlayer?: (userId: string) => void
  onSwitchToSolo?: () => void
  startingDraft: boolean
  togglingReady?: boolean
  randomizing: boolean
  randomizingPacks?: boolean
  addingBot: boolean
  error: string | null
  shareId: string
  isAdmin?: boolean
}

function DraftLobby({
  draft,
  players,
  isHost,
  isPlayer,
  onStart,
  onRandomize,
  onRandomizePacks,
  onAddBot,
  onSettingsChange,
  onLeave,
  onToggleReady,
  onRemovePlayer,
  onSwitchToSolo,
  startingDraft,
  togglingReady,
  randomizing,
  randomizingPacks,
  addingBot,
  error,
  shareId,
  isAdmin,
}: DraftLobbyProps) {
  const maxPlayers = draft?.maxPlayers || 8
  const isFull = players.length >= maxPlayers
  const [copied, setCopied] = useState(false)

  // Lobby readiness. Bots arrive ready (the server marks them so), which keeps
  // solo/bot pods a single click for the host. `players[].id` is the seat id,
  // which is what `draft.myPlayer.id` holds.
  const humanPlayers = players.filter(p => !p.isBot)
  const readyHumans = humanPlayers.filter(p => p.lobbyReady === true)
  const allHumansReady = readyHumans.length === humanPlayers.length
  const myLobbyPlayer = players.find(p => p.id === draft?.myPlayer?.id)
  const iAmReady = myLobbyPlayer?.lobbyReady === true

  const handleCopyShareUrl = async () => {
    const url = `${window.location.origin}/draft/${shareId}`
    try {
      await navigator.clipboard.writeText(url)
      trackEvent(LimitedAnalyticsEvents.LIMITED_POD_INVITE_COPIED, {
        ...buildLimitedContext({
          format: 'draft',
          mode: draft?.settings?.isSolo === true ? 'solo' : 'group',
          setCode: draft?.setCode,
          podShareId: shareId,
          sourceRoute: '/draft/[shareId]',
        }),
        is_public: draft?.isPublic === true,
        current_players: players.length,
        human_players: players.filter(p => !p.isBot).length,
        bot_players: players.filter(p => p.isBot).length,
      })
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  return (
    <div className="draft-lobby">
      <div className="lobby-layout">
        <div className="players-section">
          <PlayerCircle
            players={players}
            maxPlayers={maxPlayers}
            currentUserId={draft?.myPlayer?.id}
            enableTooltip={false}
            hostId={draft?.host?.id}
            hideEmptySeats={false}
            showLobbyReady={true}
            onRemovePlayer={onRemovePlayer}
          />
          <p className="player-count">
            {players.length} / {maxPlayers} players
          </p>
          {shareId && (
            <div className="share-url-section">
              <span className="share-label">Share URL:</span>
              <Button variant="secondary" size="sm" className="copy-url-button" onClick={handleCopyShareUrl}>
                <CopyIcon />
                <span>{copied ? 'Copied!' : 'Copy Link'}</span>
              </Button>
            </div>
          )}
        </div>

        <div className="controls-section">
          {isPlayer && (
            <div className="lobby-ready-panel">
              <div className="lobby-ready-row">
                <Button
                  variant={iAmReady ? 'toggle' : 'primary'}
                  active={iAmReady}
                  glowColor={iAmReady ? 'blue' : null}
                  className="lobby-ready-button"
                  onClick={onToggleReady}
                  disabled={togglingReady}
                >
                  <CheckIcon />
                  <span>{iAmReady ? "You're Ready" : "I'm Ready"}</span>
                </Button>
                {/* Same control as the timer bar. It belongs here too: the
                    lobby is where `ready-the-draft` plays, and TimerPanel
                    renders nothing before the draft is active. Competitive
                    only — a casual pod has no voice at all. */}
                {draft?.competitive && <VoiceCueMuteButton
                  packId={(draft?.voicePackId ?? draft?.settings?.voicePackId ?? null) as string | null}
                  className="lobby-ready-mute"
                />}
              </div>
              <p className="lobby-ready-count">
                {readyHumans.length} / {humanPlayers.length} players ready
              </p>
              {draft?.competitive && (
                <p className="lobby-ready-hint">
                  Ready also turns on the draft&apos;s voice calls in this browser.
                </p>
              )}
            </div>
          )}

          {isHost && (
            <HostControls
              draft={draft}
              playerCount={players.length}
              humanPlayerCount={players.filter(p => !p.isBot).length}
              onStart={onStart}
              onRandomize={onRandomize}
              onRandomizePacks={onRandomizePacks}
              onAddBot={onAddBot}
              onSettingsChange={onSettingsChange}
              startingDraft={startingDraft}
              randomizing={randomizing}
              randomizingPacks={randomizingPacks}
              addingBot={addingBot}
              isFull={isFull}
              allHumansReady={allHumansReady}
              shareId={shareId}
              onSwitchToSolo={onSwitchToSolo}
              isAdmin={isAdmin}
            />
          )}

          {draft?.competitive && (
            <div className="cpm-rules-panel">
              <CollapsibleSection
                title="Competitive Practice Mode"
                variant="default"
                defaultExpanded={false}
                className="cpm-rules-collapsible"
              >
                <CompetitivePracticeRules showTitle={false} />
              </CollapsibleSection>
            </div>
          )}

          {isPlayer && !isHost && (
            <div className="player-actions">
              <p className="waiting-message">Waiting for host to start the draft...</p>
              <Button
                variant="danger"
                className="leave-button"
                onClick={onLeave}
              >
                Leave Draft
              </Button>
            </div>
          )}

          {!isPlayer && (
            <div className="spectator-notice">
              <p>You are spectating this draft.</p>
            </div>
          )}

          {error && <div className="lobby-error">{error}</div>}
        </div>
      </div>
    </div>
  )
}

export default DraftLobby

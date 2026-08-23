// @ts-nocheck
'use client'

import { useState } from 'react'
import type { ChangeEvent, MouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import Button from './Button'
import './HostControls.css'

const CopyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
  </svg>
)

const BroadcastIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="2"></circle>
    <path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14"></path>
  </svg>
)

const DiceIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
    <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"></circle>
    <circle cx="15.5" cy="8.5" r="1.5" fill="currentColor"></circle>
    <circle cx="8.5" cy="15.5" r="1.5" fill="currentColor"></circle>
    <circle cx="15.5" cy="15.5" r="1.5" fill="currentColor"></circle>
  </svg>
)

const RobotIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="10" rx="2"></rect>
    <circle cx="12" cy="5" r="2"></circle>
    <path d="M12 7v4"></path>
    <line x1="8" y1="16" x2="8" y2="16"></line>
    <line x1="16" y1="16" x2="16" y2="16"></line>
    <circle cx="8" cy="16" r="1" fill="currentColor"></circle>
    <circle cx="16" cy="16" r="1" fill="currentColor"></circle>
  </svg>
)

const XIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
)

// Shared with LeaderPreviewPhase — the ONE play icon for start-draft actions.
export const PlayIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <polygon points="5 3 19 12 5 21 5 3"></polygon>
  </svg>
)

interface Draft {
  maxPlayers?: number
  timed?: boolean
  timerEnabled?: boolean
  pickTimeoutSeconds?: number
  timerSeconds?: number
  isPublic?: boolean
  competitive?: boolean
  [key: string]: unknown
}

interface SettingsChange {
  timed?: boolean
  timerEnabled?: boolean
  pickTimeoutSeconds?: number
  timerSeconds?: number
  isPublic?: boolean
  maxPlayers?: number
}

export interface HostControlsProps {
  draft?: Draft | null
  playerCount: number
  humanPlayerCount: number
  onStart?: () => void
  onRandomize?: () => void
  onRandomizePacks?: () => void
  onAddBot?: () => void
  onSettingsChange?: (settings: SettingsChange) => void
  startingDraft?: boolean
  randomizing?: boolean
  randomizingPacks?: boolean
  addingBot?: boolean
  isFull?: boolean
  /**
   * Every HUMAN seat has pressed Ready in the lobby (bots are always ready).
   * Gates the deal button — see migration 079. Defaults to true so callers that
   * have no ready flow are unaffected.
   */
  allHumansReady?: boolean
  shareId?: string
  showCancelButton?: boolean
  onSwitchToSolo?: () => void
  isAdmin?: boolean
}

function HostControls({
  draft,
  playerCount,
  humanPlayerCount,
  onStart,
  onRandomize,
  onRandomizePacks,
  onAddBot,
  onSettingsChange,
  startingDraft,
  randomizing,
  randomizingPacks,
  addingBot,
  isFull,
  allHumansReady = true,
  shareId,
  showCancelButton = true,
  onSwitchToSolo,
  isAdmin = false,
}: HostControlsProps) {
  const router = useRouter()
  const [copied, setCopied] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  // Privileged Observer — public, no-login live-slideshow link for streaming.
  const [observerEnabled, setObserverEnabled] = useState(!!draft?.observerPublic)
  const [observerBusy, setObserverBusy] = useState(false)
  const [observerCopied, setObserverCopied] = useState(false)
  const observerUrl = typeof window !== 'undefined' && shareId ? `${window.location.origin}/draft/${shareId}/observe` : ''

  const setObserver = async (value: boolean) => {
    setObserverBusy(true)
    try {
      const res = await fetch(`/api/draft/${shareId}/report/visibility`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ observerPublic: value }),
      })
      if (res.ok) setObserverEnabled(value)
    } catch {
      /* ignore */
    } finally {
      setObserverBusy(false)
    }
  }

  const handleCopyObserverUrl = async () => {
    try {
      await navigator.clipboard.writeText(observerUrl)
      setObserverCopied(true)
      setTimeout(() => setObserverCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }
  // Solo mode (entered from Solo button) allows 1 human + bots; pod mode needs 2+ humans.
  // Admins bypass the 2-human requirement for testing/facilitation.
  const isSoloDraft = draft?.settings?.isSolo === true
  const hasEnoughPlayers = playerCount >= 2 && (humanPlayerCount >= 2 || isSoloDraft || isAdmin)
  // Dealing is also gated on the lobby handshake: every human must press Ready,
  // which is the click that unlocks voice cues in their browser.
  const canStart = hasEnoughPlayers && allHumansReady
  const waitingOnReady = hasEnoughPlayers && !allHumansReady
  const needsMoreHumans = playerCount >= 2 && humanPlayerCount < 2 && !isSoloDraft && !isAdmin
  const canAddBot = playerCount < (draft?.maxPlayers || 8)
  const isRoundTimerEnabled = draft?.timed === true
  const isLastPlayerTimerEnabled = draft?.timerEnabled !== false
  // Competitive Practice Mode governs all timers by Appendix C rules — the host
  // can't change them, so the timer settings render as static, locked constants.
  const isCompetitive = draft?.competitive === true

  const handleCancelDraft = async () => {
    if (!shareId) return
    setIsCancelling(true)
    try {
      const response = await fetch(`/api/draft/${shareId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (response.ok) {
        const isFormats = draft?.settings?.draftMode === 'chaos'
        router.push(isFormats ? '/formats' : '/draft')
      } else {
        console.error('Failed to cancel draft')
        setIsCancelling(false)
        setShowCancelConfirm(false)
      }
    } catch (err) {
      console.error('Failed to cancel draft:', err)
      setIsCancelling(false)
      setShowCancelConfirm(false)
    }
  }

  const handleCopyShareUrl = async () => {
    try {
      const url = `${window.location.origin}/draft/${shareId}`
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  // Timer settings for display
  const pickTimeoutSeconds = draft?.pickTimeoutSeconds || 60
  const lastPlayerTimerSeconds = draft?.timerSeconds || 30

  const handleRoundTimerChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (onSettingsChange) {
      onSettingsChange({ timed: e.target.checked })
    }
  }

  const handleLastPlayerTimerChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (onSettingsChange) {
      onSettingsChange({ timerEnabled: e.target.checked })
    }
  }

  const handleRoundTimerSecondsChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10)
    if (onSettingsChange && !isNaN(val) && val > 0) {
      onSettingsChange({ pickTimeoutSeconds: val })
    }
  }

  const handleLastPlayerTimerSecondsChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10)
    if (onSettingsChange && !isNaN(val) && val > 0) {
      onSettingsChange({ timerSeconds: val })
    }
  }

  return (
    <div className="host-controls">
      <h3>Host Controls</h3>

      <div className="host-visibility-row">
        <button
          className={`setting-lock ${draft?.isPublic ? 'setting-lock-open' : 'setting-lock-closed'}`}
          onClick={() => {
            if (onSettingsChange) {
              onSettingsChange({ isPublic: !draft?.isPublic })
            }
          }}
          title={draft?.isPublic ? 'Public — visible to other players' : 'Private — only players with the link can join'}
        >
          {draft?.isPublic ? (
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
          <span>{draft?.isPublic ? 'Public' : 'Private'}</span>
        </button>
      </div>

      <div className="draft-settings">
        {/* Competitive Practice fixes the timers, so there is nothing here for a
            host to change. Showing greyed-out controls just adds noise — hide
            them instead. */}
        {isCompetitive ? null : (
          <>
            <div className="settings-row">
              <label className="setting-checkbox">
                <input
                  type="checkbox"
                  checked={isRoundTimerEnabled}
                  onChange={handleRoundTimerChange}
                />
                <span>Round Timer</span>
              </label>
              <input
                type="number"
                className="setting-timer-input"
                value={pickTimeoutSeconds}
                onChange={handleRoundTimerSecondsChange}
                disabled={!isRoundTimerEnabled}
                min={5}
                max={600}
              />
              <span className="setting-timer-unit">sec</span>
            </div>

            <div className="settings-row">
              <label className="setting-checkbox">
                <input
                  type="checkbox"
                  checked={isLastPlayerTimerEnabled}
                  onChange={handleLastPlayerTimerChange}
                />
                <span>Last Player Timer</span>
              </label>
              <input
                type="number"
                className="setting-timer-input"
                value={lastPlayerTimerSeconds}
                onChange={handleLastPlayerTimerSecondsChange}
                disabled={!isLastPlayerTimerEnabled}
                min={5}
                max={600}
              />
              <span className="setting-timer-unit">sec</span>
            </div>
          </>
        )}

        <div className="settings-row">
          <span className="setting-item">
            <span className="setting-label">Max Players:</span>
            <select
              className="setting-select"
              value={draft?.maxPlayers || 8}
              onChange={(e) => {
                if (onSettingsChange) {
                  onSettingsChange({ maxPlayers: Number(e.target.value) })
                }
              }}
            >
              {[2, 3, 4, 5, 6, 7, 8].filter(n => n >= Math.max(2, playerCount)).map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </span>
        </div>
      </div>


      <div className="controls-section">
        {/* Row 1: Randomize Seats + Shuffle Packs */}
        <div className="controls-row secondary-controls">
          <Button
            variant="secondary"
            glowColor="blue"
            className="control-button"
            onClick={onRandomize}
            disabled={randomizing || playerCount < 2}
            title="Shuffle player seating order"
          >
            <DiceIcon />
            <span>{randomizing ? 'Randomizing...' : 'Randomize Seats'}</span>
          </Button>

          {onRandomizePacks && (
            <Button
              variant="secondary"
              glowColor="blue"
              className="control-button"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  const sound = new Audio('/sounds/shuffling-hand.mp3')
                  sound.volume = 0.5
                  sound.play().catch(() => {})
                }
                onRandomizePacks()
              }}
              disabled={randomizingPacks || playerCount < 2}
              title="Shuffle which packs you get from the booster box"
            >
              <DiceIcon />
              <span>{randomizingPacks ? 'Shuffling...' : 'Shuffle Packs'}</span>
            </Button>
          )}
        </div>

        {/* Row 2: Add Bot + Privileged Observer */}
        <div className="controls-row secondary-controls">
          <Button
            variant="secondary"
            glowColor="blue"
            className="control-button"
            onClick={onAddBot}
            disabled={addingBot || !canAddBot}
          >
            <RobotIcon />
            <span>{addingBot ? 'Adding...' : 'Add Bot'}</span>
          </Button>

          {shareId && (observerEnabled ? (
            <Button
              variant="secondary"
              glowColor="yellow"
              className="control-button"
              onClick={handleCopyObserverUrl}
              title={observerUrl}
            >
              <CopyIcon />
              <span>{observerCopied ? 'Copied!' : 'Copy Observer Link'}</span>
            </Button>
          ) : (
            <Button
              variant="secondary"
              glowColor="yellow"
              className="control-button"
              onClick={() => setObserver(true)}
              disabled={observerBusy}
              title="Public, no-login link to stream this draft as a live slideshow"
            >
              <BroadcastIcon />
              <span>{observerBusy ? 'Enabling…' : 'Enable Observer'}</span>
            </Button>
          ))}
        </div>

        {observerEnabled && (
          <div
            className="observer-status-line"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '0.75rem', color: 'rgba(255, 215, 0, 0.85)', marginBottom: '4px' }}
          >
            <span>● Observer link live</span>
            <button
              type="button"
              onClick={() => setObserver(false)}
              disabled={observerBusy}
              style={{ background: 'none', border: 'none', color: 'rgba(255, 255, 255, 0.6)', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.75rem', padding: 0 }}
            >
              Disable
            </button>
          </div>
        )}

        {/* One slot for every start-state message. Fixed minimum height so
            swapping between them never shifts the controls below. */}
        <div className="start-state-note">
        {!canStart && !needsMoreHumans && (
          <div className="min-players-note">
            <p>Need at least 2 players to start</p>
            {onSwitchToSolo && (
              <p className="solo-mode-hint">
                Want to draft alone?{' '}
                <a
                  href="#"
                  className="solo-mode-link"
                  onClick={(e: MouseEvent) => {
                    e.preventDefault()
                    onSwitchToSolo()
                  }}
                >
                  Switch to Solo Mode
                </a>{' '}
                to draft against bots.
              </p>
            )}
          </div>
        )}

        {needsMoreHumans && (
          <div className="min-players-note">
            <p>Pod mode requires at least 2 human players.</p>
            {onSwitchToSolo && (
              <p className="solo-mode-hint">
                For solo play,{' '}
                <a
                  href="#"
                  className="solo-mode-link"
                  onClick={(e: MouseEvent) => {
                    e.preventDefault()
                    onSwitchToSolo()
                  }}
                >
                  use Solo Mode
                </a>{' '}
                to draft against bots.
              </p>
            )}
          </div>
        )}

        {waitingOnReady && (
          <div className="min-players-note">
            <p>Waiting for every player to press Ready.</p>
          </div>
        )}

        {isFull && !waitingOnReady && (
          <p className="ready-to-start">Ready to Start</p>
        )}
        </div>

        <div className="controls-row cancel-controls">
          {/* "Deal Packs" deals packs and reveals leaders (leader preview) —
              the host then starts picking with "Start Draft" during the preview.
              Enabled only once every human seat has pressed Ready. */}
          <Button
            variant="primary"
            className="control-button"
            onClick={onStart}
            disabled={startingDraft || !canStart}
          >
            <PlayIcon />
            <span>{startingDraft ? 'Dealing...' : 'Deal Packs'}</span>
          </Button>

          {showCancelButton && (
            <Button
              variant="danger"
              className="control-button"
              onClick={() => setShowCancelConfirm(true)}
              disabled={isCancelling}
            >
              Cancel Draft
            </Button>
          )}
        </div>
      </div>

      {/* Cancel Confirmation Modal */}
      {showCancelConfirm && (
        <div className="cancel-confirm-overlay" onClick={() => setShowCancelConfirm(false)}>
          <div className="cancel-confirm-modal" onClick={(e: MouseEvent) => e.stopPropagation()}>
            <h2>Cancel Draft?</h2>
            <p>Are you sure you want to cancel this draft? All players will be redirected and this action cannot be undone.</p>
            <div className="cancel-confirm-buttons">
              <Button
                variant="secondary"
                onClick={() => setShowCancelConfirm(false)}
                disabled={isCancelling}
              >
                Go Back
              </Button>
              <Button
                variant="danger"
                onClick={handleCancelDraft}
                disabled={isCancelling}
              >
                {isCancelling ? 'Cancelling...' : 'Cancel Draft'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default HostControls

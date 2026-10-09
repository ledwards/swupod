// @ts-nocheck
'use client'

import { useState } from 'react'
import type { ChangeEvent, MouseEvent, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import VoicePackPicker from './VoicePackPicker'
import Button from './Button'
import {useAuth} from '../contexts/AuthContext'
import {hasEntryAccess} from '../services/entry/access'
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

// Same trash glyph as DeleteDeckSection / OpenGameMatch — one icon per action site-wide.
const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="3 6 5 6 21 6"></polyline>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
    <line x1="10" y1="11" x2="10" y2="17"></line>
    <line x1="14" y1="11" x2="14" y2="17"></line>
  </svg>
)

const UnlockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
    <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
  </svg>
)

const LockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
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
  /**
   * The host's own lobby-ready controls (I'm Ready / voice mute / ready count).
   * Rendered in the panel footer beside Deal Packs so the host sees one card,
   * not a settings card stacked on a ready card.
   */
  readySlot?: ReactNode
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
  readySlot,
}: HostControlsProps) {
  const {user: alphaUser} = useAuth()
  const alpha = hasEntryAccess(alphaUser)
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
  const adminCanBypassMinimum = isAdmin && !isSoloDraft && humanPlayerCount < 2 && playerCount >= 2
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

  const setPublic = (isPublic: boolean) => {
    if (onSettingsChange && !!draft?.isPublic !== isPublic) {
      onSettingsChange({ isPublic })
    }
  }

  return (
    <div className="host-controls">
      {/* Border-mounted panel label (style guide: Bordered Panel Labels). */}
      <h3 className="host-controls-legend">Host Controls</h3>

      <div className="host-controls-columns">
        {/* ---- Settings ---- */}
        <div className="host-controls-column">
          <h4 className="host-controls-eyebrow">Settings</h4>
          <div className="host-settings-list">
            <div className="host-setting-row">
              <span className="host-setting-name">Visibility</span>
              <div className="host-setting-control host-visibility-toggle" role="group" aria-label="Lobby visibility">
                <Button
                  variant="toggle"
                  size="xs"
                  glowColor="blue"
                  active={!!draft?.isPublic}
                  aria-pressed={!!draft?.isPublic}
                  onClick={() => setPublic(true)}
                  title="Public — visible to other players"
                >
                  <UnlockIcon />
                  <span>Public</span>
                </Button>
                <Button
                  variant="toggle"
                  size="xs"
                  glowColor="blue"
                  active={!draft?.isPublic}
                  aria-pressed={!draft?.isPublic}
                  onClick={() => setPublic(false)}
                  title="Private — only players with the link can join"
                >
                  <LockIcon />
                  <span>Private</span>
                </Button>
              </div>
            </div>

            {/* Competitive Practice fixes the timers, so there is nothing here
                for a host to change. Showing greyed-out controls just adds
                noise — hide them instead. */}
            {isCompetitive ? null : (
              <>
                <div className="host-setting-row">
                  <label className="host-setting-name" htmlFor="host-round-timer">Round timer</label>
                  <div className="host-setting-control">
                    <label className="host-switch">
                      <input
                        id="host-round-timer"
                        type="checkbox"
                        checked={isRoundTimerEnabled}
                        onChange={handleRoundTimerChange}
                      />
                      <span className="host-switch-track" aria-hidden="true"></span>
                    </label>
                    <input
                      type="number"
                      className="setting-timer-input"
                      aria-label="Round timer seconds"
                      value={pickTimeoutSeconds}
                      onChange={handleRoundTimerSecondsChange}
                      disabled={!isRoundTimerEnabled}
                      min={5}
                      max={600}
                    />
                    <span className="setting-timer-unit">sec</span>
                  </div>
                </div>

                <div className="host-setting-row">
                  <label className="host-setting-name" htmlFor="host-last-player-timer">Last player timer</label>
                  <div className="host-setting-control">
                    <label className="host-switch">
                      <input
                        id="host-last-player-timer"
                        type="checkbox"
                        checked={isLastPlayerTimerEnabled}
                        onChange={handleLastPlayerTimerChange}
                      />
                      <span className="host-switch-track" aria-hidden="true"></span>
                    </label>
                    <input
                      type="number"
                      className="setting-timer-input"
                      aria-label="Last player timer seconds"
                      value={lastPlayerTimerSeconds}
                      onChange={handleLastPlayerTimerSecondsChange}
                      disabled={!isLastPlayerTimerEnabled}
                      min={5}
                      max={600}
                    />
                    <span className="setting-timer-unit">sec</span>
                  </div>
                </div>
              </>
            )}

            <div className="host-setting-row">
              <label className="host-setting-name" htmlFor="host-max-players">Max players</label>
              <div className="host-setting-control">
                <select
                  id="host-max-players"
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
              </div>
            </div>
          </div>
        </div>

        {/* ---- Lobby tools ---- */}
        <div className="host-controls-column">
          <h4 className="host-controls-eyebrow">Lobby</h4>
          <div className="host-lobby-tools">
            <Button
              variant="secondary"
              size="sm"
              glowColor="blue"
              className="host-tool-button"
              onClick={onAddBot}
              disabled={addingBot || !canAddBot}
            >
              <RobotIcon />
              <span>{addingBot ? 'Adding...' : 'Add Bot'}</span>
            </Button>

            <Button
              variant="secondary"
              size="sm"
              glowColor="blue"
              className="host-tool-button"
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
                size="sm"
                glowColor="blue"
                className="host-tool-button"
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

            {shareId && (observerEnabled ? (
              <Button
                variant="secondary"
                size="sm"
                glowColor="yellow"
                className="host-tool-button"
                onClick={handleCopyObserverUrl}
                title={observerUrl}
              >
                <CopyIcon />
                <span>{observerCopied ? 'Copied!' : 'Copy Observer Link'}</span>
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                glowColor="yellow"
                className="host-tool-button"
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
            <div className="observer-status-line">
              <span>● Observer link live</span>
              <button
                type="button"
                className="observer-status-disable"
                onClick={() => setObserver(false)}
                disabled={observerBusy}
              >
                Disable
              </button>
            </div>
          )}
        </div>
      </div>

      {!alpha && shareId && <div className="host-voice-row"><VoicePackPicker shareId={shareId} isHost={true}/></div>}

      <div className="host-controls-footer">
        {/* One slot for every start-state message. Fixed minimum height so
            swapping between them never shifts the controls below. */}
        <div className="start-state-note">
        {!canStart && !needsMoreHumans && (
          <div className="min-players-note">
            <p>Need at least 2 players to start.</p>
            {onSwitchToSolo && (
              <p className="solo-mode-hint">
                Drafting alone?{' '}
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

        {/* Admins may start below the normal two-human minimum. Says so rather
            than leaving a host wondering why the button is live — and sits in
            the same fixed-height slot, so nothing shifts when it appears. */}
        {adminCanBypassMinimum && (
          <div className="min-players-note">
            <p>Admin override: you can start with fewer than 2 humans.</p>
          </div>
        )}

        {isFull && !waitingOnReady && (
          <p className="ready-to-start">Ready to Start</p>
        )}
        </div>

        <div className="host-controls-actions">
          <div className="host-controls-actions-left">{readySlot}</div>
          <div className="host-controls-actions-right">
            {showCancelButton && (
              <Button
                variant="danger"
                size="xs"
                textOnly
                className="host-cancel-button"
                onClick={() => setShowCancelConfirm(true)}
                disabled={isCancelling}
              >
                <TrashIcon />
                <span>Cancel Draft</span>
              </Button>
            )}
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
          </div>
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

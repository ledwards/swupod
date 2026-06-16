// @ts-nocheck
'use client'

import { useState, useEffect } from 'react'
import { getLatestReleasedSetCode } from '../utils/setConfigs/latest'
import { trackEvent } from '../hooks/useAnalytics'
import { buildLimitedContext, LimitedAnalyticsEvents, LimitedPlayActions } from '../analytics/limitedEvents'
import { KARABAST_PUBLIC_LOBBY_NAME } from '../utils/karabastLobby'
import WayfinderStoreButtons, { WayfinderCompanionLockup } from './WayfinderStoreButtons'
import './PlayInstructions.css'

const DISCORD_INVITE_URL = process.env.NEXT_PUBLIC_DISCORD_INVITE_URL || 'https://discord.gg/u6fkdDzWqF'

const PRIVATE_LOBBY_PATTERN = /^https:\/\/karabast\.net\/\?lobbyId=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const WAYFINDER_VALUE_PROPS = [
  'Automagically join the Karabast queue',
  'Collect play data for your pool',
  'Record, share, and rewatch your replays',
] as const

interface PlayInstructionsProps {
  shareId: string | null
  poolType: 'draft' | 'sealed' | 'sealed_pod' | string
  setCode?: string | null
  opponentName?: string | null
  hasBye?: boolean
  isSoloDraft?: boolean
  onCopyLink?: () => void
  onCopyJson?: () => void
  onDownload?: () => void
  onDeckImage?: () => void
  generatingImage?: boolean
  message?: string | null
  messageType?: 'success' | 'error' | null
  showActions?: boolean
  isOwner?: boolean
  ownerName?: string | null
  wayfinderDetected?: boolean
  analyticsContext?: Record<string, unknown>
}

export default function PlayInstructions({
  shareId,
  poolType,
  setCode = null,
  opponentName = null,
  hasBye = false,
  isSoloDraft = false,
  onCopyLink,
  onCopyJson,
  onDownload,
  onDeckImage,
  generatingImage = false,
  message = null,
  messageType = null,
  showActions = true,
  isOwner = true,
  ownerName = null,
  wayfinderDetected = false,
  analyticsContext = {},
}: PlayInstructionsProps) {
  const inPod = poolType === 'draft' || poolType === 'sealed_pod'
  const viewingOthersDeck = !isOwner && ownerName
  const isCurrentSet = setCode === getLatestReleasedSetCode()
  const cardPoolName = isCurrentSet ? 'Current' : 'Unlimited'

  const [activeTab, setActiveTab] = useState<'wayfinder' | 'manual'>('wayfinder')
  const [lobbyCount, setLobbyCount] = useState(0)
  const [joinUrl, setJoinUrl] = useState('')
  const [joinError, setJoinError] = useState<string | null>(null)
  const [cardPool, setCardPool] = useState(cardPoolName)
  const [lobbyName, setLobbyName] = useState(KARABAST_PUBLIC_LOBBY_NAME)
  const [wayfinderIconUrl, setWayfinderIconUrl] = useState<string | null>(null)

  function trackPlayAction(action: string, extra: Record<string, unknown> = {}) {
    trackEvent(LimitedAnalyticsEvents.LIMITED_PLAY_ACTION_USED, {
      ...buildLimitedContext({
        format: poolType,
        poolType,
        setCode,
        shareId,
        routeTemplate: '/pool/[shareId]/deck/play',
        ...analyticsContext,
      }),
      action,
      success: extra.success ?? true,
      target: extra.target ?? null,
      ...extra,
    })
  }

  // Read icon URL from extension's meta tag
  useEffect(() => {
    const meta = document.querySelector('meta[name="wayfinder-installed"]') as HTMLMetaElement | null
    if (meta?.dataset.iconUrl) setWayfinderIconUrl(meta.dataset.iconUrl)
  }, [wayfinderDetected])

  // Listen for extension events via postMessage
  useEffect(() => {
    if (!wayfinderDetected) return

    const onMessage = (e: MessageEvent) => {
      if (e.source !== window) return
      if (e.data?.type === 'wayfinder:lobby-count') {
        setLobbyCount(e.data.count)
      } else if (e.data?.type === 'wayfinder:metadata') {
        if (e.data.cardPool) setCardPool(e.data.cardPool)
        if (e.data.lobbyName) setLobbyName(e.data.lobbyName)
      }
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [wayfinderDetected])

  // -- Extension action dispatchers --

  function dispatchCreateLobby(privacy: 'private' | 'public') {
    window.postMessage({
      type: 'wayfinder:create-lobby',
      privacy,
      deckUrl: window.location.href,
      shareId,
      format: poolType === 'sealed_pod' ? 'pool' : poolType === 'draft' ? 'pool' : poolType,
      cardPool,
      lobbyName,
    }, '*')
    trackPlayAction(
      privacy === 'private'
        ? LimitedPlayActions.WAYFINDER_CREATE_PRIVATE_LOBBY
        : LimitedPlayActions.WAYFINDER_CREATE_PUBLIC_LOBBY,
      { target: 'wayfinder', card_pool: cardPool }
    )
  }

  function dispatchJoinPrivate() {
    const url = joinUrl.trim()
    if (!PRIVATE_LOBBY_PATTERN.test(url)) {
      setJoinError('Not a valid Karabast private lobby URL')
      trackPlayAction(LimitedPlayActions.WAYFINDER_JOIN_PRIVATE_LOBBY, {
        target: 'wayfinder',
        success: false,
        failure_reason: 'invalid_private_lobby_url',
      })
      return
    }
    setJoinError(null)
    window.postMessage({
      type: 'wayfinder:join-lobby',
      lobbyUrl: url,
      deckUrl: window.location.href,
      shareId,
      format: poolType === 'sealed_pod' ? 'pool' : poolType === 'draft' ? 'pool' : poolType,
      cardPool,
    }, '*')
    trackPlayAction(LimitedPlayActions.WAYFINDER_JOIN_PRIVATE_LOBBY, {
      target: 'wayfinder',
      card_pool: cardPool,
    })
  }

  function trackInstallClick(browser: 'chrome' | 'safari' | 'firefox') {
    trackPlayAction(LimitedPlayActions.WAYFINDER_INSTALL_CTA, {
      target: browser === 'chrome' ? 'chrome_web_store' : `${browser}_store_pending`,
      browser,
      installed: wayfinderDetected,
    })
  }

  function renderValueProps() {
    return (
      <ul className="wayfinder-promo-list">
        {WAYFINDER_VALUE_PROPS.map((value) => (
          <li key={value}>
            <span className="wayfinder-promo-check" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </span>
            <span>{value}</span>
          </li>
        ))}
      </ul>
    )
  }

  function renderCompanionInstallPanel() {
    return (
      <section className="wayfinder-promo-panel" aria-label="Wayfinder Companion">
        <div className="wayfinder-promo-copy">
          <WayfinderCompanionLockup className="wayfinder-promo-lockup" />
          <h3>Play on Karabast with Protect the Pod</h3>
          <p>
            Install the Companion before you queue and Protect the Pod can
            connect your pool back to your stats and replays.
          </p>
          {renderValueProps()}
        </div>

        <WayfinderStoreButtons onChromeClick={() => trackInstallClick('chrome')} />
      </section>
    )
  }

  function renderCompanionReadyPanel() {
    return (
      <div className="wayfinder-ready-panel">
        <WayfinderCompanionLockup className="wayfinder-ready-lockup" />
      </div>
    )
  }

  // -- Manual steps (existing content, extracted for reuse) --

  function renderManualSteps() {
    if (viewingOthersDeck) {
      return (
        <>
          <div className="play-step">
            <span className="step-number">1</span>
            <div className="step-content">
              <h3>Get Your Own Deck</h3>
              <p>Open a sealed pool or join a draft on <a href="/" rel="noopener noreferrer">Protect the Pod</a> to build your own deck.</p>
            </div>
          </div>
          <div className="play-step">
            <span className="step-number">2</span>
            <div className="step-content">
              <h3>Find an Opponent</h3>
              <p>Join the <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer">Protect the Pod Discord</a> to find pods and opponents.</p>
            </div>
          </div>
          <div className="play-step">
            <span className="step-number">3</span>
            <div className="step-content">
              <h3>Play on Karabast</h3>
              <p>Go to <a href="https://karabast.net" target="_blank" rel="noopener noreferrer" onClick={() => trackPlayAction(LimitedPlayActions.OPEN_KARABAST, { target: 'karabast' })}>karabast.net</a> and paste your deck link or JSON. Create a lobby with <strong>Format: Limited</strong> and <strong>Card Pool: {cardPoolName}</strong>.</p>
            </div>
          </div>
        </>
      )
    }

    if (inPod) {
      return (
        <>
          <div className="play-step">
            <span className="step-number">1</span>
            <div className="step-content">
              <h3>Copy Your Deck:
                {onCopyLink && (
                  <button className="step-copy-button" onClick={onCopyLink} title="Copy deck link">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                    </svg>
                    Link
                  </button>
                )}
                {onCopyJson && (
                  <button className="step-copy-button" onClick={onCopyJson} title="Copy deck JSON">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    JSON
                  </button>
                )}
              </h3>
              <p>Copy your deck link for <a href="https://karabast.net" target="_blank" rel="noopener noreferrer" onClick={() => trackPlayAction(LimitedPlayActions.OPEN_KARABAST, { target: 'karabast' })}>Karabast</a>, or copy the deck JSON for <a href="https://swudb.com" target="_blank" rel="noopener noreferrer">SWUDB</a>.</p>
            </div>
          </div>

          <div className="play-step">
            <span className="step-number">2</span>
            <div className="step-content">
              <h3>Play on Karabast</h3>
              <p>Create a <strong>Private Lobby</strong> on <a href="https://karabast.net" target="_blank" rel="noopener noreferrer" onClick={() => trackPlayAction(LimitedPlayActions.OPEN_KARABAST, { target: 'karabast' })}>karabast.net</a> with <strong>Format: Limited</strong> and <strong>Card Pool: {cardPoolName}</strong>. Paste your deck link or JSON as your decklist and share the lobby link with your opponent.</p>
            </div>
          </div>

          <div className="play-step">
            <span className="step-number">3</span>
            <div className="step-content">
              {hasBye ? (
                <>
                  <h3>You Have a Bye</h3>
                  <p>You have a bye this round. Take a break or practice!</p>
                </>
              ) : opponentName ? (
                <>
                  <h3>Find Your Opponent</h3>
                  <p>Your opponent is <strong>{opponentName}</strong>. Send them the Karabast lobby link to start your match!</p>
                </>
              ) : (
                <>
                  <h3>Find a Human Opponent</h3>
                  <p>Reach out to your podmates to set up a match. Bots drafted with you but you play against other humans on Karabast.</p>
                </>
              )}
            </div>
          </div>
        </>
      )
    }

    return (
      <div className="play-manual-flow">
        <ul className="play-manual-bullets">
          <li>Go to <a href="https://karabast.net" target="_blank" rel="noopener noreferrer" onClick={() => trackPlayAction(LimitedPlayActions.OPEN_KARABAST, { target: 'karabast' })}>karabast.net</a></li>
          <li>Paste your deck link or JSON</li>
          <li>Create a <strong>Public Lobby</strong> with <strong>Format: Limited</strong> and <strong>Card Pool: {cardPoolName}</strong></li>
        </ul>

        <div className="play-manual-ways">
          <span className="play-manual-ways-label">3 ways to play:</span>
          <ol className="play-manual-ways-list">
            <li>Find a match</li>
            <li>Join an existing <strong>Limited Lobby</strong></li>
            <li>Make a <strong>Private Lobby</strong> and share the link with a friend from the <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer">Protect the Pod Discord</a></li>
          </ol>
        </div>

        <a
          className="play-karabast-cta"
          href="https://karabast.net"
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackPlayAction(LimitedPlayActions.OPEN_KARABAST, { target: 'karabast' })}
        >
          Karabast
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </a>
      </div>
    )
  }

  // -- Wayfinder tab content --

  function renderWayfinderTab() {
    return (
      <div className="wayfinder-tab">
        {renderCompanionReadyPanel()}

        <div className="wayfinder-section">
          <button className="wayfinder-btn" onClick={() => dispatchCreateLobby('private')}>
            🔒 Create Private Lobby
          </button>
          <button className="wayfinder-btn" onClick={() => dispatchCreateLobby('public')}>
            🌐 Create Public Lobby
          </button>
          <button
            className="wayfinder-btn"
            disabled={lobbyCount === 0}
            onClick={() => {
              trackPlayAction(LimitedPlayActions.WAYFINDER_JOIN_PUBLIC_GAME, {
                target: 'wayfinder',
                lobby_count: lobbyCount,
              })
              window.open('https://karabast.net', '_blank')
            }}
          >
            🎮 Join Public Game ({lobbyCount} in progress)
          </button>
        </div>

        <div className="wayfinder-divider">- OR -</div>

        <div className="wayfinder-section">
          <div className="wayfinder-join-label">
            Join Private Lobby <span className="wayfinder-join-sub">(from another player)</span>
          </div>
          <div className="wayfinder-join-row">
            <input
              className={`wayfinder-join-input${joinError ? ' error' : ''}`}
              value={joinUrl}
              onChange={e => { setJoinUrl(e.target.value); setJoinError(null) }}
              placeholder="https://karabast.net/?lobbyId=..."
            />
            <button className="wayfinder-join-btn" onClick={dispatchJoinPrivate}>
              Join
            </button>
          </div>
          {joinError && <div className="wayfinder-error">{joinError}</div>}
        </div>
      </div>
    )
  }

  // -- Render --

  return (
    <div className="play-instructions">
      <h2>{viewingOthersDeck ? `${ownerName}'s Deck` : 'Deck Complete!'}</h2>
      <p>{viewingOthersDeck
        ? `This deck belongs to ${ownerName}. Want to play too? Here's how:`
        : "Your deck is built! Now find a human opponent and play on Karabast."
      }</p>

      {isSoloDraft && !viewingOthersDeck && (
        <div className="play-solo-notice">
          This was a simulated pod — you can't play against the bots, but you can check out their decks from the draft log. You need to find a human opponent to play your deck!
        </div>
      )}

      {viewingOthersDeck ? (
        <div className="play-steps">
          {renderManualSteps()}
        </div>
      ) : (
        // Automatic (Companion) and manual, side by side — no oppressive
        // stacking. The plugin column is the autojoin flow when the Companion
        // is installed, or the install promo when it isn't.
        <div className="play-split">
          <div className="play-split-col play-split-plugin">
            {wayfinderDetected && isOwner
              ? renderWayfinderTab()
              : renderCompanionInstallPanel()}
          </div>

          <div className="play-split-or" aria-hidden="true"><span>OR</span></div>

          <div className="play-split-col play-split-manual">
            <div className="play-manual-header">
              <div className="wayfinder-promo-kicker">Manual</div>
              <h3>Play it yourself on Karabast</h3>
            </div>
            <div className="play-steps">
              {renderManualSteps()}
            </div>
          </div>
        </div>
      )}

      {/* Action buttons */}
      {showActions && (
        <div className="play-instructions-actions">
          {onCopyLink && (
            <button className="play-instructions-action-button primary" onClick={onCopyLink}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
              </svg>
              Copy Link
            </button>
          )}
          {onCopyJson && (
            <button className="play-instructions-action-button" onClick={onCopyJson}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              Copy JSON
            </button>
          )}
          {onDownload && (
            <button className="play-instructions-action-button" onClick={onDownload}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              Download
            </button>
          )}
          {onDeckImage && (
            <button className="play-instructions-action-button" onClick={onDeckImage} disabled={generatingImage}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
              </svg>
              {generatingImage ? 'Generating...' : 'Deck Image'}
            </button>
          )}
        </div>
      )}

      {message && (
        <div className={`play-instructions-message ${messageType}`}>
          {message}
        </div>
      )}
    </div>
  )
}

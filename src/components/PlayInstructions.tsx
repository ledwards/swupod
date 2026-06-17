// @ts-nocheck
'use client'

import { useState, useEffect, useRef } from 'react'
import { getLatestReleasedSetCode } from '../utils/setConfigs/latest'
import { trackEvent } from '../hooks/useAnalytics'
import { buildLimitedContext, LimitedAnalyticsEvents, LimitedPlayActions } from '../analytics/limitedEvents'
import { KARABAST_PUBLIC_LOBBY_NAME } from '../utils/karabastLobby'
import WayfinderStoreButtons, { WayfinderCompanionLockup } from './WayfinderStoreButtons'
import Button from './Button'
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
  /** Whether the viewer is signed in. Drives the "log in to link the Companion"
   *  CTA shown when the plugin is detected but the user isn't authenticated. */
  isLoggedIn?: boolean
  wayfinderDetected?: boolean
  /**
   * When set (from a ?lobby=private|public deep link, e.g. the /me Pools tab
   * lobby buttons), auto-open that Karabast lobby once the Companion is detected
   * and the viewer owns the deck. Fires at most once.
   */
  autoLobbyIntent?: 'private' | 'public' | null
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
  isLoggedIn = true,
  wayfinderDetected = false,
  autoLobbyIntent = null,
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

  // Honor a ?lobby=private|public deep link (from the /me Pools tab buttons):
  // once the Companion is detected and the viewer owns the deck, open that lobby
  // exactly once. The extension's play-page listener is live by then, and a small
  // delay lets its metadata (card pool, lobby name) arrive first.
  const autoLobbyFiredRef = useRef(false)
  useEffect(() => {
    if (!autoLobbyIntent || autoLobbyFiredRef.current) return
    if (!wayfinderDetected || !isOwner) return
    autoLobbyFiredRef.current = true
    setActiveTab('wayfinder')
    const t = window.setTimeout(() => dispatchCreateLobby(autoLobbyIntent), 400)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLobbyIntent, wayfinderDetected, isOwner])

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
    // Companion is active — the mark is identity here, not a CTA, so it does
    // not link out. No box of its own; the whole tab carries the blue box.
    return (
      <div className="wayfinder-ready-panel">
        <WayfinderCompanionLockup className="wayfinder-ready-lockup" noLink />
      </div>
    )
  }

  // Plugin detected but signed out: linking a game to a pool needs an account,
  // so pitch Discord sign-in (rare, but real). Mirrored anywhere we gate on
  // login + plugin state.
  function renderCompanionLoginCta() {
    const returnTo = typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/'
    const signInUrl = `/api/auth/signin/discord?return_to=${encodeURIComponent(returnTo)}`
    return (
      <section className="wayfinder-tab wayfinder-tab--login">
        {renderCompanionReadyPanel()}
        <p className="wayfinder-login-copy">
          You&apos;ve got the Companion installed. Sign in with Discord so it can link
          your Karabast games back to this pool and save your replays.
        </p>
        <a href={signInUrl} className="btn btn--discord btn--md wayfinder-login-btn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.2.5a18 18 0 0 1 4.2 1.4 13 13 0 0 0-15-.0A18 18 0 0 1 8.8 3.5L8.6 3a19.8 19.8 0 0 0-4.9 1.4C1 9.3.2 14.1.6 18.8a20 20 0 0 0 6 3l.8-1.3a13 13 0 0 1-2-1l.5-.4a14 14 0 0 0 12 0l.5.4c-.6.4-1.3.7-2 1l.8 1.3a20 20 0 0 0 6-3c.5-5.5-.8-10.2-3.6-14.4ZM8.9 15.6c-1.2 0-2.1-1.1-2.1-2.4 0-1.3.9-2.4 2.1-2.4 1.2 0 2.2 1.1 2.1 2.4 0 1.3-.9 2.4-2.1 2.4Zm6.2 0c-1.2 0-2.1-1.1-2.1-2.4 0-1.3.9-2.4 2.1-2.4 1.2 0 2.2 1.1 2.1 2.4 0 1.3-.9 2.4-2.1 2.4Z" />
          </svg>
          Log in with Discord
        </a>
      </section>
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

        <Button
          variant="primary"
          className="play-karabast-cta"
          onClick={() => {
            trackPlayAction(LimitedPlayActions.OPEN_KARABAST, { target: 'karabast' })
            window.open('https://karabast.net', '_blank', 'noopener,noreferrer')
          }}
        >
          Karabast
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Button>
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
            {wayfinderDetected && !isLoggedIn
              ? renderCompanionLoginCta()
              : wayfinderDetected && isOwner
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

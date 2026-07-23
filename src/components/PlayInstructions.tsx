// @ts-nocheck
'use client'

import { useState, useEffect, useRef } from 'react'
import { getKarabastCardPool } from '../utils/setConfigs/latest'
import { trackEvent } from '../hooks/useAnalytics'
import { buildLimitedContext, LimitedAnalyticsEvents, LimitedPlayActions } from '../analytics/limitedEvents'
import { buildLobbyName, isValidPrivateLobbyUrl } from '../utils/karabastLobby'
import { WayfinderCompanionLockup } from './WayfinderStoreButtons'
import PluginCTA from '@/src/components/PluginCTA'
import PlayPageLobbies from './Lobby/PlayPageLobbies'
import Button from './Button'
import { useAuth } from '../contexts/AuthContext'
import { isCompanionBeta } from '../utils/companionBeta'
import './PlayInstructions.css'

const DISCORD_INVITE_URL = process.env.NEXT_PUBLIC_DISCORD_INVITE_URL || 'https://discord.gg/u6fkdDzWqF'

interface PlayInstructionsProps {
  shareId: string | null
  poolType: 'draft' | 'sealed' | 'sealed_pod' | string
  setCode?: string | null
  /** Deck archetype name, used to build the public Karabast game name. */
  archetypeName?: string | null
  opponentName?: string | null
  hasBye?: boolean
  isSoloDraft?: boolean
  /** Suppress the "simulated pod" solo notice (the pod page renders it inside
   *  the Pod Status box instead). */
  hideSoloNotice?: boolean
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
  /** Companion is required here (competitive/Swiss pod) — force the install CTA
   *  on even for users outside the rollout. Set only by the play page. */
  pluginRequired?: boolean
  /** Whether the Companion extension itself is signed in. `null`/undefined =
   *  unknown (older build or no signal yet) — we don't nag. When explicitly
   *  `false` we swap the lobby flow for a "sign in from your toolbar" CTA. */
  pluginLoggedIn?: boolean | null
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
  archetypeName = null,
  opponentName = null,
  hasBye = false,
  isSoloDraft = false,
  hideSoloNotice = false,
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
  pluginRequired = false,
  pluginLoggedIn = null,
  autoLobbyIntent = null,
  analyticsContext = {},
}: PlayInstructionsProps) {
  // The Companion is beta-gated: non-beta players see the pre-plugin manual
  // flow only (no install pitch, no autojoin column).
  const { user } = useAuth() as { user: { username?: string | null; is_beta_tester?: boolean | null; is_admin?: boolean | null } | null }
  const companionBeta = isCompanionBeta(user)
  const inPod = poolType === 'draft' || poolType === 'sealed_pod'
  const viewingOthersDeck = !isOwner && ownerName
  const cardPoolName = getKarabastCardPool(setCode)

  const [activeTab, setActiveTab] = useState<'wayfinder' | 'manual'>('wayfinder')
  const [lobbyCount, setLobbyCount] = useState(0)
  const [joinUrl, setJoinUrl] = useState('')
  const [joinError, setJoinError] = useState<string | null>(null)
  const [cardPool, setCardPool] = useState(cardPoolName)
  const [wayfinderIconUrl, setWayfinderIconUrl] = useState<string | null>(null)

  // Transient local "Opening…" feedback for the Companion lobby buttons. These
  // post a fire-and-forget message to the Companion (which opens Karabast in a
  // new tab), so there's no completion signal to react to here — we just give an
  // immediate acknowledgement so the click never feels like it did nothing, then
  // clear it after a few seconds. If Karabast is slow or unavailable, the
  // Companion's own launch-status toast carries the richer "still opening /
  // didn't respond, try again" status on top of this.
  const [openingAction, setOpeningAction] = useState<'private' | 'public' | 'join' | null>(null)
  const openingTimerRef = useRef<number | null>(null)
  function markOpening(action: 'private' | 'public' | 'join') {
    setOpeningAction(action)
    if (openingTimerRef.current !== null) window.clearTimeout(openingTimerRef.current)
    openingTimerRef.current = window.setTimeout(() => {
      setOpeningAction(null)
      openingTimerRef.current = null
    }, 4000)
  }
  useEffect(() => () => {
    if (openingTimerRef.current !== null) window.clearTimeout(openingTimerRef.current)
  }, [])

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
    // Signed out of the Companion → don't fire a lobby it can't act on; the
    // toolbar sign-in CTA renders instead.
    if (!wayfinderDetected || !isOwner || pluginLoggedIn === false) return
    autoLobbyFiredRef.current = true
    setActiveTab('wayfinder')
    const t = window.setTimeout(() => dispatchCreateLobby(autoLobbyIntent), 400)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLobbyIntent, wayfinderDetected, isOwner, pluginLoggedIn])

  // -- Extension action dispatchers --

  function dispatchCreateLobby(privacy: 'private' | 'public') {
    window.postMessage({
      type: 'wayfinder:create-lobby',
      privacy,
      deckUrl: window.location.href,
      shareId,
      format: poolType === 'sealed_pod' ? 'pool' : poolType === 'draft' ? 'pool' : poolType,
      cardPool,
      // Public Karabast game name, e.g. "SEC Draft Leia Splash Green protectthepod.com".
      lobbyName: buildLobbyName({ setCode, poolType, archetypeName }),
    }, '*')
    markOpening(privacy)
    trackPlayAction(
      privacy === 'private'
        ? LimitedPlayActions.WAYFINDER_CREATE_PRIVATE_LOBBY
        : LimitedPlayActions.WAYFINDER_CREATE_PUBLIC_LOBBY,
      { target: 'wayfinder', card_pool: cardPool }
    )
  }

  function dispatchJoinPrivate() {
    const url = joinUrl.trim()
    if (!isValidPrivateLobbyUrl(url)) {
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
    markOpening('join')
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

  function renderCompanionInstallPanel() {
    // The one universal install CTA. Autodetect = a single prominent button for
    // the browser you're in. It self-gates on rollout + Companion presence.
    return <PluginCTA variant="autodetect" required={pluginRequired} onChromeClick={() => trackInstallClick('chrome')} />
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

  // Plugin installed AND the viewer is signed into PTP, but the Companion itself
  // is signed out. A page can't open the extension popup (browsers don't allow
  // it), so point them at the toolbar to finish signing in there.
  function renderCompanionToolbarLoginCta() {
    return (
      <section className="wayfinder-tab wayfinder-tab--login">
        {renderCompanionReadyPanel()}
        <p className="wayfinder-login-copy">
          The Companion is installed — it just needs to sign in. Click the Companion
          icon
          {wayfinderIconUrl && (
            <img className="wayfinder-toolbar-icon" src={wayfinderIconUrl} alt="" width={18} height={18} />
          )}
          {' '}in your browser toolbar, then <strong>Log in with Discord</strong>. Your
          Karabast games will link back to this pool automatically.
        </p>
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
            <li>Join the <strong>Match Queue</strong></li>
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
          <button className="wayfinder-btn" disabled={openingAction !== null} onClick={() => dispatchCreateLobby('private')}>
            {openingAction === 'private' ? 'Opening on Karabast…' : '🔒 Create Private Lobby'}
          </button>
          <button className="wayfinder-btn" disabled={openingAction !== null} onClick={() => dispatchCreateLobby('public')}>
            {openingAction === 'public' ? 'Opening on Karabast…' : '🌐 Create Public Lobby'}
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
              placeholder="https://karabast.net/lobby?lobbyId=..."
            />
            <button className="wayfinder-join-btn" disabled={openingAction !== null} onClick={dispatchJoinPrivate}>
              {openingAction === 'join' ? 'Opening…' : 'Join'}
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

      {isSoloDraft && !viewingOthersDeck && !hideSoloNotice && (
        <div className="play-solo-notice">
          This was a simulated pod — you can't play against the bots, but you can check out their decks from the draft log. You need to find a human opponent to play your deck!
        </div>
      )}

      {/* R35 → U6: the deck owner's live lobby options — join an open lobby
          for this set+format with THIS deck, or post this deck to the Lobby. */}
      {isOwner && !viewingOthersDeck && shareId && setCode && (
        <PlayPageLobbies
          poolShareId={shareId}
          setCode={setCode}
          format={poolType === 'draft' ? 'draft' : 'sealed'}
          currentUsername={user?.username ?? null}
        />
      )}

      {viewingOthersDeck || (!companionBeta && !wayfinderDetected && !pluginRequired) ? (
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
              : wayfinderDetected && isOwner && pluginLoggedIn === false
                ? renderCompanionToolbarLoginCta()
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

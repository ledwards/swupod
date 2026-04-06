// @ts-nocheck
'use client'

import { useState, useEffect } from 'react'
import './PlayInstructions.css'

const DISCORD_INVITE_URL = process.env.NEXT_PUBLIC_DISCORD_INVITE_URL || 'https://discord.gg/u6fkdDzWqF'

const PRIVATE_LOBBY_PATTERN = /^https:\/\/karabast\.net\/\?lobbyId=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
}: PlayInstructionsProps) {
  const inPod = poolType === 'draft' || poolType === 'sealed_pod'
  const viewingOthersDeck = !isOwner && ownerName
  const isCurrentSet = setCode === 'LAW'
  const cardPoolName = isCurrentSet ? 'Current' : 'Unlimited'

  const [activeTab, setActiveTab] = useState<'wayfinder' | 'manual'>('wayfinder')
  const [lobbyCount, setLobbyCount] = useState(0)
  const [joinUrl, setJoinUrl] = useState('')
  const [joinError, setJoinError] = useState<string | null>(null)
  const [cardPool, setCardPool] = useState(cardPoolName)
  const [wayfinderIconUrl, setWayfinderIconUrl] = useState<string | null>(null)

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

  // -- Extension action dispatchers --

  function dispatchCreateLobby(privacy: 'private' | 'public') {
    window.postMessage({
      type: 'wayfinder:create-lobby',
      privacy,
      deckUrl: window.location.href,
      shareId,
      format: poolType === 'sealed_pod' ? 'pool' : poolType === 'draft' ? 'pool' : poolType,
      cardPool,
    }, '*')
  }

  function dispatchJoinPrivate() {
    const url = joinUrl.trim()
    if (!PRIVATE_LOBBY_PATTERN.test(url)) {
      setJoinError('Not a valid Karabast private lobby URL')
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
              <p>Go to <a href="https://karabast.net" target="_blank" rel="noopener noreferrer">karabast.net</a> and paste your deck link or JSON. Create a lobby with <strong>Format: Limited</strong> and <strong>Card Pool: {cardPoolName}</strong>.</p>
            </div>
          </div>
        </>
      )
    }

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
            <p>Copy your deck link for <a href="https://karabast.net" target="_blank" rel="noopener noreferrer">Karabast</a>, or copy the deck JSON for <a href="https://swudb.com" target="_blank" rel="noopener noreferrer">SWUDB</a>.</p>
          </div>
        </div>

        <div className="play-step">
          <span className="step-number">2</span>
          <div className="step-content">
            <h3>Play on Karabast</h3>
            {inPod ? (
              <p>Create a <strong>Private Lobby</strong> on <a href="https://karabast.net" target="_blank" rel="noopener noreferrer">karabast.net</a> with <strong>Format: Limited</strong> and <strong>Card Pool: {cardPoolName}</strong>. Paste your deck link or JSON as your decklist and share the lobby link with your opponent.</p>
            ) : (
              <p>Go to <a href="https://karabast.net" target="_blank" rel="noopener noreferrer">karabast.net</a> and paste your deck link or JSON. Create a <strong>Public Lobby</strong> with <strong>Format: Limited</strong> and <strong>Card Pool: {cardPoolName}</strong> to find a match, join an existing <strong>Limited Lobby</strong>, or make a <strong>Private Lobby</strong> and share the link with a friend from the <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer">Protect the Pod Discord</a>.</p>
            )}
          </div>
        </div>

        {inPod && (
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
        )}
      </>
    )
  }

  // -- Wayfinder tab content --

  function renderWayfinderTab() {
    return (
      <div className="wayfinder-tab">
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
            onClick={() => window.open('https://karabast.net', '_blank')}
          >
            🎮 Join Public Game ({lobbyCount} Public Limited Lobb{lobbyCount === 1 ? 'y' : 'ies'})
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
          This was a simulated pod — you can't play against the bots, but you can check out their decks from the draft log. Find a human opponent to play your deck!
        </div>
      )}

      {wayfinderDetected && isOwner ? (
        <>
          <div className="play-tabs">
            <button
              className={`play-tab${activeTab === 'wayfinder' ? ' active' : ''}`}
              onClick={() => setActiveTab('wayfinder')}
            >
              {wayfinderIconUrl && <img src={wayfinderIconUrl} alt="" width="16" height="16" className="play-tab-icon" />}
              Play with Wayfinder
            </button>
            <button
              className={`play-tab${activeTab === 'manual' ? ' active' : ''}`}
              onClick={() => setActiveTab('manual')}
            >
              Manual
            </button>
          </div>

          {activeTab === 'wayfinder' ? (
            renderWayfinderTab()
          ) : (
            <div className="play-steps">
              {renderManualSteps()}
            </div>
          )}
        </>
      ) : (
        <div className="play-steps">
          {renderManualSteps()}
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

'use client'

import Button from '@/src/components/Button'
import { getPackArtUrl } from '@/src/utils/packArt'
import type { OpenGamesBoard, OpenGameListing } from '@/src/hooks/useOpenGamesSocket'
import type { KarabastLobby } from '@/src/hooks/useKarabastLobbies'

export function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.max(0, Math.round(ms / 60_000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  return `${hours}h ago`
}

const NON_PTP_WARNING =
  'Created outside Protect the Pod — other simulators generate lower-quality pools, so you risk playing against an unrealistic deck.'

interface OpenGamesColumnProps {
  board: OpenGamesBoard
  karabast: { available: boolean; lobbies: KarabastLobby[] }
  /** Logged-in username — socket pushes are viewer-agnostic, so ownership of a
   *  listing falls back to a username comparison when `mine` isn't carried. */
  currentUsername?: string | null
  onJoin: (listing: OpenGameListing) => void
  /** Remove your own listing (DELETE); the socket broadcast clears the row. */
  onLeave: (listing: OpenGameListing) => void
  onNewGame: () => void
  onJoinKarabast: (lobby: KarabastLobby) => void
}

/**
 * Open Lobbies box (R6/R28/R29/R33): PTP listings and Karabast public lobbies
 * mixed in ONE list. Karabast-sourced rows explain their thinner data
 * ("listed on Karabast · player details unavailable") and carry the non-PTP
 * pool warning when applicable. Without the Companion, the last row links
 * straight to karabast.net so players can browse lobbies themselves.
 */
export default function OpenGamesColumn({
  board,
  karabast,
  currentUsername = null,
  onJoin,
  onLeave,
  onNewGame,
  onJoinKarabast,
}: OpenGamesColumnProps): React.JSX.Element {
  const { status, listings, recentCompleted, retry } = board
  const totalCount = listings.length + (karabast.available ? karabast.lobbies.length : 0)
  const boardEmpty = status === 'ready' && totalCount === 0

  return (
    <section className="lobby-column" aria-label="Open lobbies">
      <h3 className="lobby-column-title">
        Open Lobbies ({totalCount})<span>waiting for an opponent</span>
      </h3>

      {status === 'error' && (
        <div className="lobby-state lobby-state-error">
          <p>Couldn&apos;t load live lobbies.</p>
          <Button variant="secondary" size="sm" onClick={retry}>
            Retry
          </Button>
        </div>
      )}

      {status === 'loading' && (
        <div className="lobby-skeleton-rows" aria-hidden>
          <div className="skeleton-row" />
          <div className="skeleton-row" />
        </div>
      )}

      {boardEmpty && (
        <div className="lobby-state">
          <p>No open lobbies right now.</p>
          <Button variant="primary" size="sm" onClick={onNewGame}>
            Create a Lobby
          </Button>
                    {recentCompleted.length > 0 && (
            <p className="lobby-state-sub">
              Recently played:{' '}
              {recentCompleted
                .slice(0, 3)
                .map(r => `${r.players.filter(Boolean).join(' vs ')} (${r.setCode})`)
                .join(' · ')}
            </p>
          )}
        </div>
      )}

      {status === 'ready' &&
        listings.map(listing => {
          const isMine =
            listing.mine === true ||
            (currentUsername != null && listing.host.username === currentUsername)
          // Set key art as a right-anchored row background (same treatment
          // as /draft's public pod rows); rows without art stay plain glass.
          const artUrl = getPackArtUrl(listing.setCode)
          return (
          <div
            className={`lobby-row${artUrl ? ' lobby-row--art' : ''}`}
            key={listing.shareId}
            style={artUrl ? ({ ['--row-art' as never]: `url(${artUrl})` }) : undefined}
          >
            {listing.host.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="lobby-row-avatar" src={listing.host.avatarUrl} alt="" />
            ) : (
              <div className="lobby-row-avatar" />
            )}
            <div className="lobby-row-who">
              <div className="lobby-row-name">
                <span className="lobby-row-name-text">{listing.host.username || 'Unknown player'}</span>
                <span
                  className={`lobby-host-dot${listing.hostConnected === false ? ' lobby-host-away' : ''}`}
                  title={listing.hostConnected === false ? 'Stepped away' : 'Online'}
                />
                <span className="lobby-badge">{listing.setCode}</span>
                <span className={`lobby-badge lobby-badge-format-${listing.format === 'draft' ? 'draft' : 'sealed'}`}>
                  {listing.format === 'draft' ? 'Draft' : 'Sealed'}
                </span>
                {listing.bestOf === 3 && <span className="lobby-badge">Bo3</span>}
              </div>
              <div className="lobby-row-meta">
                {isMine && listing.yourDeck?.name ? `${listing.yourDeck.name} · ` : ''}
                {timeAgo(listing.createdAt)}
                {listing.hostConnected === false ? ' · stepped away' : ''}
              </div>
            </div>
            {isMine ? (
              // Your own listing: you can't join yourself — discard it instead
              // (danger treatment: this throws the posted lobby away).
              <Button variant="danger" size="sm" onClick={() => onLeave(listing)}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                Leave
              </Button>
            ) : (
              <Button variant="primary" size="sm" onClick={() => onJoin(listing)}>
                Join
              </Button>
            )}
          </div>
          )
        })}

      {/* Karabast public lobbies, mixed into the same list (R33). */}
      {status === 'ready' &&
        karabast.available &&
        karabast.lobbies.map((lobby, i) => (
          <div className="lobby-row" key={`kb-${lobby.lobbyId ?? lobby.name}-${i}`}>
            <div className="lobby-row-avatar lobby-row-avatar-unknown" title="Player details unavailable for games listed on Karabast" />
            <div className="lobby-row-who">
              <div className="lobby-row-name">
                <span className="lobby-row-name-text">{lobby.name}</span>
                {!lobby.isPtp && (
                  <span className="lobby-warn" title={NON_PTP_WARNING}>
                    ⚠
                  </span>
                )}
                <span className="lobby-badge lobby-badge-karabast">Karabast</span>
              </div>
              <div className="lobby-row-meta">
                listed on Karabast · {lobby.waiting} waiting
              </div>
            </div>
            <Button variant="interactive" size="sm" onClick={() => onJoinKarabast(lobby)}>
              Join
            </Button>
          </div>
        ))}

      {/* No Companion: players can always browse Karabast's lobby themselves. */}
      {status === 'ready' && !karabast.available && (
        <a
          className="lobby-row lobby-row-link"
          href="https://karabast.net/"
          target="_blank"
          rel="noopener noreferrer"
        >
          <div className="lobby-row-who">
            <div className="lobby-row-name">More games on Karabast ↗</div>
            <div className="lobby-row-meta">
              Browse public lobbies on karabast.net.
            </div>
          </div>
        </a>
      )}
    </section>
  )
}

'use client'

import Button from '@/src/components/Button'
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
  onJoin: (listing: OpenGameListing) => void
  onNewGame: () => void
  onJoinKarabast: (lobby: KarabastLobby) => void
}

/**
 * Open Games box (R6/R28/R29/R33): PTP listings and Karabast public lobbies
 * mixed in ONE list. Karabast-sourced rows explain their thinner data
 * ("listed on Karabast · player details unavailable") and carry the non-PTP
 * pool warning when applicable. Without the Companion, the last row links
 * straight to karabast.net so players can browse lobbies themselves.
 */
export default function OpenGamesColumn({
  board,
  karabast,
  onJoin,
  onNewGame,
  onJoinKarabast,
}: OpenGamesColumnProps): React.JSX.Element {
  const { status, listings, recentCompleted, retry } = board
  const totalCount = listings.length + (karabast.available ? karabast.lobbies.length : 0)
  const boardEmpty = status === 'ready' && totalCount === 0

  return (
    <section className="lobby-column" aria-label="Open games">
      <h3 className="lobby-column-title">
        Open Games ({totalCount})<span>waiting for an opponent</span>
      </h3>

      {status === 'error' && (
        <div className="lobby-state lobby-state-error">
          <p>Couldn&apos;t load live games.</p>
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
          <p>No open games right now.</p>
          <Button variant="primary" size="sm" onClick={onNewGame}>
            Post the First Game
          </Button>
          <p className="lobby-state-sub">We&apos;ll ping the Discord when you do.</p>
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
        listings.map(listing => (
          <div className="lobby-row" key={listing.shareId}>
            {listing.host.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="lobby-row-avatar" src={listing.host.avatarUrl} alt="" />
            ) : (
              <div className="lobby-row-avatar" />
            )}
            <div className="lobby-row-who">
              <div className="lobby-row-name">
                {listing.host.username || 'Unknown player'}
                <span
                  className={`lobby-host-dot${listing.hostConnected === false ? ' lobby-host-away' : ''}`}
                  title={listing.hostConnected === false ? 'Stepped away' : 'Online'}
                />
              </div>
              <div className="lobby-row-meta">
                {timeAgo(listing.createdAt)}
                {listing.hostConnected === false ? ' · stepped away' : ''}
              </div>
            </div>
            <span className="lobby-badge">{listing.setCode}</span>
            <span className={`lobby-badge lobby-badge-format-${listing.format === 'draft' ? 'draft' : 'sealed'}`}>
              {listing.format === 'draft' ? 'Draft' : 'Sealed'}
            </span>
            <Button variant="primary" size="sm" onClick={() => onJoin(listing)}>
              Join
            </Button>
          </div>
        ))}

      {/* Karabast public lobbies, mixed into the same list (R33). */}
      {status === 'ready' &&
        karabast.available &&
        karabast.lobbies.map((lobby, i) => (
          <div className="lobby-row" key={`kb-${lobby.lobbyId ?? lobby.name}-${i}`}>
            <div className="lobby-row-avatar lobby-row-avatar-unknown" title="Player details unavailable for games listed on Karabast" />
            <div className="lobby-row-who">
              <div className="lobby-row-name">
                {lobby.name}
                {!lobby.isPtp && (
                  <span className="lobby-warn" title={NON_PTP_WARNING}>
                    ⚠
                  </span>
                )}
              </div>
              <div className="lobby-row-meta">
                listed on Karabast · {lobby.waiting} waiting · player details unavailable
              </div>
            </div>
            <span className="lobby-badge lobby-badge-karabast">Karabast</span>
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
              Browse public lobbies on karabast.net — the Companion lists them here automatically.
            </div>
          </div>
        </a>
      )}
    </section>
  )
}

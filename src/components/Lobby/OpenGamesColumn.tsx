'use client'

import Button from '@/src/components/Button'
import PluginCTA from '@/src/components/PluginCTA'
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
 * Open Games column (R6/R28/R29): dense v3 rows — avatar, player, presence,
 * set/format badges, Join. Deck identity never appears (R29). The
 * "On Karabast Now" cross-listing (R33) lives at the bottom of the panel,
 * with the Companion pitch in its place when no plugin is present (R36).
 */
export default function OpenGamesColumn({
  board,
  karabast,
  onJoin,
  onNewGame,
  onJoinKarabast,
}: OpenGamesColumnProps): React.JSX.Element {
  const { status, listings, recentCompleted, retry } = board

  return (
    <section className="lobby-column" aria-label="Open games">
      <h3 className="lobby-column-title">
        Open Games ({listings.length})<span>waiting for an opponent</span>
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

      {status === 'ready' && listings.length === 0 && (
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

      <div className="lobby-subhead">On Karabast Now · via Companion</div>
      {karabast.available ? (
        karabast.lobbies.length === 0 ? (
          <div className="lobby-state">
            <p>No public Karabast lobbies right now.</p>
          </div>
        ) : (
          karabast.lobbies.map((lobby, i) => (
            <div className="lobby-row" key={`${lobby.lobbyId ?? lobby.name}-${i}`}>
              <div className="lobby-row-who">
                <div className="lobby-row-name">
                  {lobby.name}
                  {!lobby.isPtp && (
                    <span className="lobby-warn" title={NON_PTP_WARNING}>
                      ⚠
                    </span>
                  )}
                </div>
                <div className="lobby-row-meta">Karabast public lobby · {lobby.waiting} waiting</div>
              </div>
              {lobby.isPtp && <span className="lobby-badge lobby-badge-ptp">PTP</span>}
              <Button variant="interactive" size="sm" onClick={() => onJoinKarabast(lobby)}>
                Join
              </Button>
            </div>
          ))
        )
      ) : (
        <div className="lobby-state">
          <PluginCTA variant="compact" />
        </div>
      )}
    </section>
  )
}

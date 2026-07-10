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
 * Open Games column (R6/R28/R29): PTP listings seeking an opponent, plus the
 * "On Karabast now" cross-listing (R33) — or the Companion pitch without one
 * (R36). Listings never show deck identity.
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
    <div className="lobby-column">
      <h3 className="lobby-column-title">
        Open Games <span>waiting for an opponent</span>
      </h3>

      {status === 'error' && (
        <div className="lobby-state lobby-state-error">
          Couldn&apos;t load live games.{' '}
          <Button variant="secondary" size="sm" onClick={retry}>
            Retry
          </Button>
        </div>
      )}

      {status === 'loading' && <div className="lobby-state">Loading live games…</div>}

      {status === 'ready' && listings.length === 0 && (
        <div className="lobby-state">
          No open games right now.{' '}
          <Button variant="primary" size="sm" onClick={onNewGame}>
            Post the first game
          </Button>
          <div className="lobby-row-meta">We&apos;ll ping the Discord when you do.</div>
          {recentCompleted.length > 0 && (
            <div className="lobby-row-meta">
              Recently played:{' '}
              {recentCompleted
                .slice(0, 3)
                .map(r => `${r.players.filter(Boolean).join(' vs ')} (${r.setCode})`)
                .join(' · ')}
            </div>
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

      <div className="lobby-subhead">On Karabast now · via Companion</div>
      {karabast.available ? (
        karabast.lobbies.length === 0 ? (
          <div className="lobby-state">No public Karabast lobbies right now.</div>
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
                <div className="lobby-row-meta">
                  Karabast public lobby · {lobby.waiting} waiting
                </div>
              </div>
              {lobby.isPtp && <span className="lobby-badge lobby-badge-ptp">PTP</span>}
              <Button variant="interactive" size="sm" onClick={() => onJoinKarabast(lobby)}>
                Join
              </Button>
            </div>
          ))
        )
      ) : (
        <div className="lobby-row lobby-cta-row">
          <PluginCTA variant="compact" />
        </div>
      )}
    </div>
  )
}

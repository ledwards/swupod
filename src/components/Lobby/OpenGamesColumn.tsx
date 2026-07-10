'use client'

import Button from '@/src/components/Button'
import PluginCTA from '@/src/components/PluginCTA'
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
  onJoin: (listing: OpenGameListing) => void
  onNewGame: () => void
  onJoinKarabast: (lobby: KarabastLobby) => void
}

/**
 * Open Games column (R6/R28/R29). Rows reuse the site's `.history-item`
 * listing treatment (same as /draft, /sealed/pod, /history) with pack-art
 * backgrounds. Listings never show deck identity.
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
    <div className="draft-history lobby-column">
      <h2>Open Games</h2>

      {status === 'error' && (
        <div className="lobby-state lobby-state-error">
          Couldn&apos;t load live games.{' '}
          <Button variant="secondary" size="sm" onClick={retry}>
            Retry
          </Button>
        </div>
      )}

      {status === 'loading' && (
        <div className="history-list" aria-hidden>
          <div className="skeleton-row" />
          <div className="skeleton-row" />
        </div>
      )}

      {status === 'ready' && listings.length === 0 && (
        <div className="lobby-state">
          <p>No open games right now.</p>
          <Button variant="primary" size="sm" onClick={onNewGame}>
            Post the first game
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

      {status === 'ready' && listings.length > 0 && (
        <div className="history-list">
          {listings.map(listing => {
            const artUrl = getPackArtUrl(listing.setCode)
            const formatLabel = listing.format === 'draft' ? 'Draft' : 'Sealed'
            return (
              <div
                key={listing.shareId}
                className={`history-item${artUrl ? ' history-item--art' : ''}`}
                style={artUrl ? { backgroundImage: `url("${artUrl}")` } : undefined}
                role="button"
                tabIndex={0}
                onClick={() => onJoin(listing)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') onJoin(listing)
                }}
              >
                <div className="history-item-main">
                  <span className="history-set">
                    {listing.host.username || 'Unknown player'}
                    {listing.hostConnected === false ? ' · stepped away' : ''}
                  </span>
                  <span className="history-status waiting">Join</span>
                </div>
                <div className="history-item-meta">
                  <span className="history-date">
                    {listing.setName || listing.setCode} {formatLabel} · {timeAgo(listing.createdAt)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <h2 className="lobby-karabast-header">On Karabast Now</h2>
      {karabast.available ? (
        karabast.lobbies.length === 0 ? (
          <div className="lobby-state">No public Karabast lobbies right now.</div>
        ) : (
          <div className="history-list">
            {karabast.lobbies.map((lobby, i) => (
              <div
                key={`${lobby.lobbyId ?? lobby.name}-${i}`}
                className="history-item"
                role="button"
                tabIndex={0}
                onClick={() => onJoinKarabast(lobby)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') onJoinKarabast(lobby)
                }}
              >
                <div className="history-item-main">
                  <span className="history-set">
                    {lobby.name}
                    {!lobby.isPtp && (
                      <span className="lobby-warn" title={NON_PTP_WARNING}>
                        {' '}⚠
                      </span>
                    )}
                  </span>
                  <span className="history-status waiting">Join</span>
                </div>
                <div className="history-item-meta">
                  <span className="history-date">
                    Karabast public lobby · {lobby.waiting} waiting
                    {lobby.isPtp ? ' · protectthepod.com' : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <PluginCTA variant="compact" />
      )}
    </div>
  )
}

'use client'

/**
 * Play-page "Open Lobbies" section (Lobby V1, U6).
 *
 * Replaces the old "Find an opponent in the Lobby" link on the finished-deck
 * play page with the player's actual options for THIS deck:
 * - live open lobbies matching this deck's set + format (same row UI as the
 *   lobby board) — Join brings this deck directly, no picker;
 * - or post this deck to the Lobby as a new open game.
 *
 * Board data comes from the same live socket hook the lobby page uses.
 */
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/src/components/Button'
import { useToast } from '@/src/components/Toast'
import { useOpenGamesSocket, type OpenGameListing } from '@/src/hooks/useOpenGamesSocket'
import { timeAgo } from './OpenGamesColumn'
import './Lobby.css'
import './PlayPageLobbies.css'

interface PlayPageLobbiesProps {
  /** Share id of THIS pool — the deck we join/post with. */
  poolShareId: string
  setCode: string
  /** Normalized play format ('sealed_pod' and friends collapse to 'sealed'). */
  format: 'draft' | 'sealed'
  /** Logged-in username — socket pushes are viewer-agnostic, so ownership of
   *  a listing falls back to a username comparison when `mine` isn't carried
   *  (same fallback the lobby board uses). */
  currentUsername?: string | null
}

/** Listings store the raw pool_type as `format`; collapse to draft/sealed. */
function normalizeFormat(format: string): 'draft' | 'sealed' {
  return format === 'draft' ? 'draft' : 'sealed'
}

export default function PlayPageLobbies({
  poolShareId,
  setCode,
  format,
  currentUsername = null,
}: PlayPageLobbiesProps): React.JSX.Element {
  const { status, listings, retry } = useOpenGamesSocket()
  const { showToast } = useToast()
  const router = useRouter()
  const [busy, setBusy] = useState<'join' | 'post' | null>(null)

  const matches = useMemo(
    () =>
      listings
        .filter(
          listing =>
            listing.setCode === setCode &&
            normalizeFormat(listing.format) === format &&
            listing.mine !== true &&
            !(
              currentUsername != null &&
              listing.host.username != null &&
              listing.host.username === currentUsername
            )
        )
        // GET already returns newest-first; sort defensively so "most recent"
        // holds for socket pushes too.
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [listings, setCode, format, currentUsername]
  )

  const top = matches[0] ?? null
  const extraCount = Math.max(0, matches.length - 1)
  const formatLabel = format === 'draft' ? 'Draft' : 'Sealed'

  function redirectToLogin(): void {
    const returnTo = window.location.pathname + window.location.search
    window.location.href = `/api/auth/signin/discord?return_to=${encodeURIComponent(returnTo)}`
  }

  async function joinListing(listing: OpenGameListing): Promise<void> {
    if (busy) return
    setBusy('join')
    try {
      const res = await fetch(`/api/open-games/${listing.shareId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ poolShareId }),
      })
      if (res.status === 401) {
        redirectToLogin()
        return
      }
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        if (json?.code === 'listing_gone') {
          showToast({ text: 'That lobby was just taken.', kind: 'danger' })
          retry()
          return
        }
        throw new Error(json?.message || 'Could not join the game')
      }
      router.push(`/g/${(json.data || json).game.shareId}`)
    } catch (error) {
      showToast({
        text: error instanceof Error ? error.message : 'Could not join the game',
        kind: 'danger',
      })
    } finally {
      setBusy(null)
    }
  }

  async function postThisDeck(): Promise<void> {
    if (busy) return
    setBusy('post')
    try {
      const res = await fetch('/api/open-games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ poolShareId }),
      })
      if (res.status === 401) {
        redirectToLogin()
        return
      }
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.message || 'Could not post this deck')
      router.push(`/g/${(json.data || json).game.shareId}`)
    } catch (error) {
      showToast({
        text: error instanceof Error ? error.message : 'Could not post this deck',
        kind: 'danger',
      })
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="lobby-column play-page-lobbies" aria-label="Open lobbies">
      <h3 className="lobby-column-title">
        Open Lobbies<span>{setCode} {formatLabel}</span>
      </h3>

      {status === 'error' && (
        <div className="lobby-state lobby-state-error">
          <p>Couldn&apos;t load open lobbies.</p>
          <Button variant="secondary" size="sm" onClick={retry}>
            Retry
          </Button>
        </div>
      )}

      {status === 'loading' && (
        <div className="lobby-skeleton-rows" aria-hidden>
          <div className="skeleton-row" />
        </div>
      )}

      {status === 'ready' && top && (
        <>
          <div className="lobby-row">
            {top.host.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="lobby-row-avatar" src={top.host.avatarUrl} alt="" />
            ) : (
              <div className="lobby-row-avatar" />
            )}
            <div className="lobby-row-who">
              <div className="lobby-row-name">
                {top.host.username || 'Unknown player'}
                <span
                  className={`lobby-host-dot${top.hostConnected === false ? ' lobby-host-away' : ''}`}
                  title={top.hostConnected === false ? 'Stepped away' : 'Online'}
                />
              </div>
              <div className="lobby-row-meta">
                {timeAgo(top.createdAt)}
                {top.hostConnected === false ? ' · stepped away' : ''}
              </div>
            </div>
            <span className="lobby-badge">{top.setCode}</span>
            <span className={`lobby-badge lobby-badge-format-${format}`}>{formatLabel}</span>
            <Button variant="primary" size="sm" onClick={() => joinListing(top)} disabled={busy != null}>
              {busy === 'join' ? 'Joining…' : 'Join'}
            </Button>
          </div>

          {extraCount > 0 && (
            // NOTE: this becomes "/" when the lobby is promoted to the homepage.
            <a className="lobby-row lobby-row-link play-lobbies-more" href="/lobby">
              {extraCount} more in the Lobby →
            </a>
          )}

          <div className="play-lobbies-footer">
            <Button variant="secondary" size="sm" onClick={postThisDeck} disabled={busy != null}>
              {busy === 'post' ? 'Posting…' : 'Post This Deck to the Lobby'}
            </Button>
          </div>
        </>
      )}

      {status === 'ready' && !top && (
        <div className="lobby-state">
          <p>
            No open lobbies for {setCode} {formatLabel} right now.
          </p>
          <Button variant="primary" size="sm" onClick={postThisDeck} disabled={busy != null}>
            {busy === 'post' ? 'Posting…' : 'Post This Deck to the Lobby'}
          </Button>
        </div>
      )}
    </section>
  )
}

'use client'

/**
 * The live board plus everything needed to act on it — join, leave, create,
 * and the Karabast handoff — in one drop-in.
 *
 * Extracted from LobbyHome so the homepage can carry the board below the fold
 * without duplicating ~100 lines of handlers. Both surfaces render this, so a
 * fix to the join flow lands on both by construction.
 */
import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/src/contexts/AuthContext'
import type { OpenGamesBoard, OpenGameListing } from '@/src/hooks/useOpenGamesSocket'
import type { PublicPod } from '@/src/hooks/usePublicPodsSocket'
import type { KarabastLobby } from '@/src/hooks/useKarabastLobbies'
import {
  buildWayfinderCasualCreatePayload,
  karabastLobbyPrivacy,
} from '@/src/hooks/useWayfinderCasualLaunch'
import { useToast } from '@/src/components/Toast'
import LobbyBoard from '@/src/components/Lobby/LobbyBoard'
import PostGameModal from '@/src/components/Lobby/PostGameModal'
import JoinGameModal from '@/src/components/Lobby/JoinGameModal'
import JoinKarabastModal from '@/src/components/Lobby/JoinKarabastModal'

interface LobbyBoardSectionProps {
  /* Live data is passed IN rather than fetched here: useOpenGamesSocket opens
     its own socket per call, so a page that also shows counts in its header
     would otherwise hold two connections and double-fetch the board. The
     parent owns one instance and shares it. */
  board: OpenGamesBoard
  pods: PublicPod[]
  karabast: { available: boolean; lobbies: KarabastLobby[] }
  companionCapable: boolean
  /** Where an anonymous click should land back after Discord OAuth. */
  returnPath?: string
  /** R35: play-page CTA preselects the deck for the New Lobby modal. */
  initialPoolShareId?: string | null
}

export default function LobbyBoardSection({
  board,
  pods,
  karabast,
  companionCapable,
  returnPath = '/',
  initialPoolShareId = null,
}: LobbyBoardSectionProps): React.JSX.Element {
  const router = useRouter()
  // AuthContext is untyped JSX; the user object is snake_case (documented trap).
  const { user, loading: authLoading } = useAuth() as {
    user: { id: string; username?: string } | null
    loading: boolean
  }
  const { showToast } = useToast()
  const [newGameOpen, setNewGameOpen] = useState(false)
  const [joinTarget, setJoinTarget] = useState<OpenGameListing | null>(null)
  const [karabastTarget, setKarabastTarget] = useState<KarabastLobby | null>(null)

  // R26: anonymous action clicks round-trip through Discord OAuth and land
  // back where they started. The destination re-validates state on return.
  const requireLogin = useCallback(
    (intent?: string): boolean => {
      if (user) return true
      // Auth still resolving: swallow the click instead of misreading a
      // logged-in user as anonymous and bouncing them through OAuth.
      if (authLoading) return false
      const returnTo = intent ? `${returnPath}${intent}` : returnPath
      window.location.href = `/api/auth/signin/discord?return_to=${encodeURIComponent(returnTo)}`
      return false
    },
    [user, authLoading, returnPath]
  )

  // Hash-anchor deep links (house rule: hash, not ?tab=): #new-game opens the
  // modal, including the post-OAuth return trip.
  useEffect(() => {
    if (user && window.location.hash === '#new-game') {
      setNewGameOpen(true)
    }
  }, [user])

  const handleNewGame = useCallback(() => {
    if (!requireLogin('#new-game')) return
    setNewGameOpen(true)
  }, [requireLogin])

  const handleJoin = useCallback(
    (listing: OpenGameListing) => {
      if (!requireLogin()) return
      setJoinTarget(listing)
    },
    [requireLogin]
  )

  // Leave your own listing: DELETE it and let the socket broadcast clear the
  // row for everyone (including this board). No success toast — the row
  // disappearing is the feedback.
  const handleLeave = useCallback(
    async (listing: OpenGameListing) => {
      try {
        const res = await fetch(`/api/open-games/${listing.shareId}`, {
          method: 'DELETE',
          credentials: 'include',
        })
        if (!res.ok) throw new Error(String(res.status))
      } catch {
        showToast({ text: 'Could not remove your lobby — try again.', kind: 'danger' })
      }
    },
    [showToast]
  )

  // R34 create-at-post: after creating, a capable Companion pre-creates the
  // public Karabast lobby before anyone joins.
  const handleCreated = useCallback(
    async (
      game: { shareId: string; visibility: string; karabastFindable?: boolean },
      createKarabastLobby: boolean
    ) => {
      setNewGameOpen(false)
      if (createKarabastLobby) {
        try {
          const res = await fetch(`/api/open-games/${game.shareId}/claim`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ companionCapable: true }),
          })
          const json = await res.json().catch(() => null)
          const claim = (json?.data || json)?.claim
          if (claim?.action === 'create_lobby') {
            window.postMessage(
              buildWayfinderCasualCreatePayload({
                openGameShareId: game.shareId,
                poolShareId: '',
                deckUrl: `${window.location.origin}/g/${game.shareId}`,
                lobbyName: claim.lobbyName || 'protectthepod.com',
                // One source of truth with the match page's Create Game button:
                // both derive privacy from the persisted findability flag, so
                // pre-created and match-time lobbies can't disagree.
                visibility: karabastLobbyPrivacy(game),
              }),
              '*'
            )
          }
        } catch {
          // Lobby pre-creation is best-effort; the match-time handshake covers it.
        }
      }
      router.push(`/g/${game.shareId}`)
    },
    [router]
  )

  // Karabast lobbies take a deck like any other game: pick one, then the
  // Companion loads it and drops you into that lobby (wayfinder:join-lobby).
  // The picker is unfiltered — the relay carries no set or pack count, so the
  // lobby name is the only signal and the player reads it themselves.
  const handleJoinKarabast = useCallback((lobby: KarabastLobby) => {
    setKarabastTarget(lobby)
  }, [])

  return (
    <>
      <LobbyBoard
        board={board}
        pods={pods}
        karabast={karabast}
        currentUsername={user?.username ?? null}
        onJoin={handleJoin}
        onLeave={handleLeave}
        onNewGame={handleNewGame}
        onJoinKarabast={handleJoinKarabast}
      />

      <PostGameModal
        isOpen={newGameOpen}
        onClose={() => setNewGameOpen(false)}
        onCreated={handleCreated}
        companionCapable={companionCapable}
        initialPoolShareId={initialPoolShareId}
      />

      <JoinGameModal
        isOpen={joinTarget != null}
        onClose={() => setJoinTarget(null)}
        game={
          joinTarget
            ? {
              shareId: joinTarget.shareId,
              setCode: joinTarget.setCode,
              format: joinTarget.format,
              // Sealed pack count is part of the format (hard split).
              packsPerPlayer: joinTarget.packsPerPlayer ?? null,
              hostUsername: joinTarget.host.username,
            }
            : null
        }
        onJoined={game => {
          setJoinTarget(null)
          router.push(`/g/${game.shareId}`)
        }}
      />

      <JoinKarabastModal
        isOpen={karabastTarget != null}
        onClose={() => setKarabastTarget(null)}
        lobby={karabastTarget}
      />
    </>
  )
}

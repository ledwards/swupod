'use client'

/**
 * Join a Karabast lobby with one of your decks.
 *
 * Unlike the PTP join flow, this deck picker is deliberately UNFILTERED. A
 * Karabast listing tells us only its name — the relay carries no set and no
 * pack count — so there is nothing to filter against, and guessing would hide
 * decks that are actually fine. Every limited deck is offered and the player
 * reads the lobby name to decide what fits.
 *
 * The handoff is the same `wayfinder:join-lobby` intent the play page's
 * "join private lobby" box sends; the Companion loads the deck and drops the
 * player into the lobby.
 */
import { useState } from 'react'
import Modal from '@/src/components/Modal'
import Button from '@/src/components/Button'
import DeckPicker, { type EligibleDeck } from './DeckPicker'
import { isValidPrivateLobbyUrl } from '@/src/utils/karabastLobby'
import { getKarabastCardPool } from '@/src/utils/setConfigs/latest'
import { useToast } from '@/src/components/Toast'
import type { KarabastLobby } from '@/src/hooks/useKarabastLobbies'

interface JoinKarabastModalProps {
  isOpen: boolean
  onClose: () => void
  lobby: KarabastLobby | null
}

/** Karabast's canonical lobby deep link — the shape isValidPrivateLobbyUrl expects. */
export function karabastLobbyUrl(lobbyId: string): string {
  return `https://karabast.net/lobby?lobbyId=${encodeURIComponent(lobbyId)}`
}

export default function JoinKarabastModal({
  isOpen,
  onClose,
  lobby,
}: JoinKarabastModalProps): React.JSX.Element | null {
  const [selected, setSelected] = useState<EligibleDeck | null>(null)
  const [busy, setBusy] = useState(false)
  const { showToast } = useToast()

  if (!lobby) return null

  function join(): void {
    if (!selected || !lobby || busy) return
    const lobbyUrl = lobby.lobbyId ? karabastLobbyUrl(lobby.lobbyId) : null
    if (!lobbyUrl || !isValidPrivateLobbyUrl(lobbyUrl)) {
      // The relay dropped the id (older Companion, or a lobby that vanished).
      // Send them to Karabast rather than firing an intent that can't land.
      showToast({ text: 'That lobby is no longer joinable from here — opening Karabast.', kind: 'danger' })
      window.open('https://karabast.net/', '_blank', 'noopener')
      onClose()
      return
    }
    setBusy(true)
    window.postMessage(
      {
        type: 'wayfinder:join-lobby',
        lobbyUrl,
        // The Companion reads the deck off its play page, the same URL the
        // play-page dispatcher passes as window.location.href.
        deckUrl: `${window.location.origin}/pool/${selected.poolShareId}/deck/play`,
        shareId: selected.poolShareId,
        format: 'pool',
        cardPool: getKarabastCardPool(selected.setCode),
      },
      '*'
    )
    onClose()
    setBusy(false)
  }

  return (
    <Modal className="lobby-deck-modal" isOpen={isOpen} onClose={onClose} title={`Join ${lobby.name}`}>
      <Modal.Body>
        <p className="lobby-karabast-note">
          Any limited deck can be brought to this lobby — check the lobby name for the set and format
          the host is expecting.
        </p>
        <DeckPicker selected={selected?.poolShareId ?? null} onSelect={setSelected} />
      </Modal.Body>
      <Modal.Actions>
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="primary" onClick={join} disabled={!selected || busy}>
          {busy ? 'Opening…' : 'Join on Karabast'}
        </Button>
      </Modal.Actions>
    </Modal>
  )
}

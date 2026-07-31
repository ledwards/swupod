'use client'

/**
 * Join modal (R28/R31): pick which of your decks to bring — strictly
 * filtered to the game's set + format; ineligible decks are not shown.
 * Sealed pack count is part of that format: an 8-pack game only offers
 * 8-pack decks.
 */
import { useState } from 'react'
import Modal from '@/src/components/Modal'
import Button from '@/src/components/Button'
import DeckPicker, { type EligibleDeck } from './DeckPicker'
import { useToast } from '@/src/components/Toast'

interface JoinGameModalProps {
  isOpen: boolean
  onClose: () => void
  game: {
    shareId: string
    setCode: string
    format: string
    /** Sealed packs behind the listing — null/absent means "don't filter". */
    packsPerPlayer?: number | null
    hostUsername?: string | null
  } | null
  onJoined: (game: { shareId: string }) => void
}

export default function JoinGameModal({ isOpen, onClose, game, onJoined }: JoinGameModalProps): React.JSX.Element | null {
  const [selected, setSelected] = useState<EligibleDeck | null>(null)
  const [busy, setBusy] = useState(false)
  const [eligibleCount, setEligibleCount] = useState<number | null>(null)
  const { showToast } = useToast()

  if (!game) return null

  async function joinGame(): Promise<void> {
    if (!selected || !game || busy) return
    setBusy(true)
    try {
      const res = await fetch(`/api/open-games/${game.shareId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ poolShareId: selected.poolShareId }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        const code = json?.code
        if (code === 'listing_gone') {
          showToast({
            text: 'That game was just taken or cancelled.',
            kind: 'danger',
            href: '/lobby',
            actionLabel: 'Back to Lobby',
          })
          onClose()
          return
        }
        throw new Error(json?.message || 'Could not join the game')
      }
      onJoined((json.data || json).game)
    } catch (error) {
      showToast({
        text: error instanceof Error ? error.message : 'Could not join the game',
        kind: 'danger',
      })
    } finally {
      setBusy(false)
    }
  }

  const title = game.hostUsername ? `Join ${game.hostUsername}'s lobby` : 'Join lobby'

  return (
    <Modal className="lobby-deck-modal" isOpen={isOpen} onClose={onClose} title={title}>
      <Modal.Body>
        <DeckPicker
          setCode={game.setCode}
          format={game.format}
          packsPerPlayer={game.packsPerPlayer ?? null}
          selected={selected?.poolShareId ?? null}
          onSelect={setSelected}
          onEligibleCount={setEligibleCount}
        />
      </Modal.Body>
      <Modal.Actions>
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        {eligibleCount !== 0 && (
          <Button variant="primary" onClick={joinGame} disabled={!selected || busy}>
            {busy ? 'Joining…' : 'Join Lobby'}
          </Button>
        )}
      </Modal.Actions>
    </Modal>
  )
}

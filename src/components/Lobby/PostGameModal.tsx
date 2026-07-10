'use client'

/**
 * New Game modal (R28/R31/R32/R34): pick a deck (it sets the game's
 * set+format), choose Public vs Private link, and — with a capable
 * Companion — pre-create the Karabast lobby (default ON).
 */
import { useState } from 'react'
import Modal from '@/src/components/Modal'
import Button from '@/src/components/Button'
import DeckPicker, { type EligibleDeck } from './DeckPicker'
import { useToast } from '@/src/components/Toast'

interface PostGameModalProps {
  isOpen: boolean
  onClose: () => void
  onCreated: (game: { shareId: string; visibility: string }, createKarabastLobby: boolean) => void
  companionCapable: boolean
  /** R35: play-page CTA preselects the deck. */
  initialPoolShareId?: string | null
}

export default function PostGameModal({
  isOpen,
  onClose,
  onCreated,
  companionCapable,
  initialPoolShareId = null,
}: PostGameModalProps): React.JSX.Element {
  const [selected, setSelected] = useState<EligibleDeck | null>(null)
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')
  const [createKarabast, setCreateKarabast] = useState(true)
  const [busy, setBusy] = useState(false)
  const { showToast } = useToast()

  const selectedShareId = selected?.poolShareId ?? initialPoolShareId

  async function createGame(): Promise<void> {
    if (!selectedShareId || busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/open-games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ poolShareId: selectedShareId, visibility }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(json?.message || 'Could not create the game')
      }
      const game = (json.data || json).game
      onCreated(game, companionCapable && createKarabast)
    } catch (error) {
      showToast({
        text: error instanceof Error ? error.message : 'Could not create the game',
        kind: 'danger',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal className="lobby-deck-modal" isOpen={isOpen} onClose={onClose} title="New Game">
      <Modal.Body>
        <p className="lobby-row-meta">Choose your deck.</p>
        <DeckPicker selected={selectedShareId} onSelect={setSelected} />

        <div className="lobby-vis-toggle">
          <Button
            variant="toggle"
            active={visibility === 'public'}
            glowColor="blue"
            onClick={() => setVisibility('public')}
          >
            Public
          </Button>
          <Button
            variant="toggle"
            active={visibility === 'private'}
            glowColor="blue"
            onClick={() => setVisibility('private')}
          >
            Private link
          </Button>
        </div>
        <p className="lobby-row-meta">
          {visibility === 'public'
            ? 'Listed on the board.'
            : 'Only people with the link can join.'}
        </p>

        {companionCapable && (
          <label className="lobby-check">
            <input
              type="checkbox"
              checked={createKarabast}
              onChange={e => setCreateKarabast(e.target.checked)}
            />
            <span>
              <strong>Also create the lobby on Karabast now</strong>
            </span>
          </label>
        )}
      </Modal.Body>
      <Modal.Actions>
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="primary" onClick={createGame} disabled={!selectedShareId || busy}>
          {busy ? 'Creating…' : 'Create Game'}
        </Button>
      </Modal.Actions>
    </Modal>
  )
}

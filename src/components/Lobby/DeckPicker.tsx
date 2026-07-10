'use client'

/**
 * Deck picker for New Game / Join flows (R23/R31). Shows the caller's built
 * decks; ineligible decks (wrong set/format for the game being joined) are
 * greyed with the reason. Your deck choice is yours alone — opponents never
 * see it (R29).
 */
import { useEffect, useState } from 'react'

export interface EligibleDeck {
  poolShareId: string
  setCode: string
  setName: string | null
  format: string
  name: string | null
  builtAt: string | null
  eligible: boolean
}

interface DeckPickerProps {
  /** Filter to a specific game's set+format (Join flow); omit for New Game. */
  setCode?: string
  format?: string
  selected: string | null
  onSelect: (deck: EligibleDeck) => void
}

export function deckLabel(deck: EligibleDeck): string {
  if (deck.name) return deck.name
  const fmt = deck.format === 'draft' ? 'Draft' : 'Sealed'
  return `${deck.setCode} ${fmt}${deck.builtAt ? ` — ${new Date(deck.builtAt).toLocaleDateString()}` : ''}`
}

export default function DeckPicker({ setCode, format, selected, onSelect }: DeckPickerProps): React.JSX.Element {
  const [decks, setDecks] = useState<EligibleDeck[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams()
    if (setCode) params.set('setCode', setCode)
    if (format) params.set('format', format)
    fetch(`/api/open-games/eligible-decks?${params}`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then(json => setDecks((json.data || json).decks || []))
      .catch(() => setError(true))
  }, [setCode, format])

  if (error) return <div className="lobby-state lobby-state-error">Couldn&apos;t load your decks.</div>
  if (decks === null) return <div className="lobby-state">Loading your decks…</div>

  const eligible = decks.filter(d => d.eligible)

  if (decks.length === 0) {
    return (
      <div className="lobby-state">
        No decks yet — run a Solo Sealed or Solo Draft first, build a deck, and
        it&apos;ll show up here ready to play.
      </div>
    )
  }

  return (
    <div className="lobby-deck-picker">
      {(setCode || format) && (
        <div className="lobby-deck-filterline">
          Showing your {setCode} {format === 'draft' ? 'Draft' : 'Sealed'} decks ({eligible.length} of{' '}
          {decks.length} eligible)
        </div>
      )}
      {decks.map(deck => {
        const isSelected = selected === deck.poolShareId
        return (
          <div
            key={deck.poolShareId}
            role="radio"
            aria-checked={isSelected}
            tabIndex={deck.eligible ? 0 : -1}
            className={`lobby-deck${isSelected ? ' lobby-deck-selected' : ''}${deck.eligible ? '' : ' lobby-deck-off'}`}
            onClick={() => deck.eligible && onSelect(deck)}
            onKeyDown={e => {
              if (deck.eligible && (e.key === 'Enter' || e.key === ' ')) onSelect(deck)
            }}
          >
            <span className={`lobby-deck-radio${isSelected ? ' lobby-deck-radio-on' : ''}`} />
            <span className="lobby-deck-name">
              {deckLabel(deck)}
              <span className="lobby-row-meta">
                {deck.eligible
                  ? `${deck.format === 'draft' ? 'Draft' : 'Sealed'}${deck.builtAt ? ` · built ${new Date(deck.builtAt).toLocaleDateString()}` : ''}`
                  : 'wrong set or format for this game'}
              </span>
            </span>
            <span className="lobby-badge">{deck.setCode}</span>
            <span className={`lobby-badge lobby-badge-format-${deck.format === 'draft' ? 'draft' : 'sealed'}`}>
              {deck.format === 'draft' ? 'Draft' : 'Sealed'}
            </span>
          </div>
        )
      })}
    </div>
  )
}

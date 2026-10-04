'use client'

import { useState } from 'react'
import Button from '@/src/components/Button'
import type { PlayDeckSummary } from '@/src/services/play/playState'

export type NativeDeck = PlayDeckSummary & { practiceReady?: boolean; packCount?: number | null; leaderImageUrl?: string | null }

export default function NativeDeckPicker({ decks, hiddenCount, selected, reserved, disabled, mismatch, onSelect }: {
  decks: NativeDeck[]
  hiddenCount?: number
  selected: string
  reserved?: string | undefined
  disabled: boolean
  mismatch: (deck: NativeDeck) => boolean
  onSelect: (id: string) => void
}) {
  const [query, setQuery] = useState('')
  const [format, setFormat] = useState('')
  const [set, setSet] = useState('')
  const filtered = decks.filter(deck => (!format || deck.poolType === format) && (!set || deck.setCode === set) &&
    [deck.name, deck.leaderName, deck.baseName, deck.setCode, deck.setName].join(' ').toLowerCase().includes(query.trim().toLowerCase()))
  const reset = () => { setQuery(''); setFormat(''); setSet('') }

  return <section className="native-play-panel native-deck-library" aria-label="Your saved decks">
    <div className="native-library-heading"><h2>Your Saved Decks <span>({decks.length})</span></h2><a href="/">Build a new deck</a></div>
    <div className="native-deck-filters">
      <input type="search" aria-label="Search decks" placeholder="Search decks or leaders" value={query} onChange={event => setQuery(event.target.value)} />
      <div className="native-deck-filter-row">
        <div className="native-format-filter" aria-label="Deck format">{([['', 'All'], ['draft', 'Draft'], ['sealed', 'Sealed']] as const).map(([value, label]) => <Button key={value} size="sm" variant="toggle" active={format === value} aria-pressed={format === value} onClick={() => setFormat(value)}>{label}</Button>)}</div>
        <select aria-label="Deck set" value={set} onChange={event => setSet(event.target.value)}><option value="">All sets</option>{[...new Set(decks.map(deck => deck.setCode))].sort().map(code => <option key={code} value={code}>{code}</option>)}</select>
      </div>
    </div>
    <fieldset className="native-play-decks"><legend className="native-visually-hidden">Choose a deck</legend>
      {filtered.map(deck => <div key={deck.poolShareId} className={`native-deck-tile ${selected === deck.poolShareId ? 'is-selected' : ''}`}>
        <label className="native-play-deck">
          <input type="radio" name="native-deck" value={deck.poolShareId} checked={selected === deck.poolShareId} disabled={disabled || (!deck.ready && !deck.practiceReady) || mismatch(deck)} onChange={() => onSelect(deck.poolShareId)} />
          {deck.leaderImageUrl && <img className="native-deck-art" src={deck.leaderImageUrl} alt="" loading="lazy" />}
          <span><strong>{deck.name}{reserved === deck.poolShareId ? ' · Reserved' : ''}</strong><span>{[deck.leaderName || 'Choose a leader', deck.baseName].filter(Boolean).join(' · ')}</span><span>{deck.setCode} · {deck.poolType}{deck.packCount ? ` · ${deck.packCount} packs` : ''}</span></span>
        </label>
        <div className="native-deck-foot"><span>{!deck.ready ? (deck.practiceReady ? 'Local testing only' : 'Needs attention') : mismatch(deck) ? 'Different format' : `${deck.mainDeckCount} cards`}</span><a href={`/pool/${encodeURIComponent(deck.poolShareId)}`}>Edit deck</a></div>
        {!deck.practiceReady && (deck.blocker || mismatch(deck)) && <details className="native-deck-blocker"><summary>Why can’t I play this?</summary><p>{deck.blocker || 'This deck does not match the invitation’s set, format, or pack count.'}</p></details>}
      </div>)}
      {!filtered.length && <div className="native-play-empty"><p>{decks.length ? 'No decks match these filters.' : hiddenCount ? `${hiddenCount} of your saved decks can’t enter the lobby yet.` : 'Save a draft or sealed deck to play.'}</p>{decks.length > 0 ? <Button size="sm" onClick={reset}>Clear filters</Button> : hiddenCount ? <a className="btn btn--md btn--secondary" href="/sealed">Start a new sealed pool</a> : null}</div>}
    </fieldset>
    <div className="native-library-footer"><span>{filtered.length} of {decks.length} decks</span>{!filtered.some(deck => deck.poolShareId === selected) && selected && <span>Your selected deck is outside these filters.</span>}</div>
  </section>
}

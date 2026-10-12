'use client'

import { useMemo, useState } from 'react'
import Button from '@/src/components/Button'
import { StatsPanel } from '@/src/components/DeckBuilder/DeckStats/StatsCharts'
import { GradeChip, gradeTone, MetaCardCell as CardCell } from '@/src/components/DeckBuilder/DeckStats/MetaCardCell'
import { useCardMetaStats } from '@/src/hooks/useCardMetaStats'
import '@/src/components/DeckBuilder/DeckStats/DeckStats.css'
import {
  deckAverage, formatAverage, metaRows, MIN_META_SAMPLE, penaltyOf, sideboardUpgrades,
  type MetaRow,
} from '@/src/services/deckStats'
import type { BuildTabData } from './BuildTab'
import './meta-tab.css'

type Scope = 'deck' | 'sideboard' | 'pool'

/** Strip and GIH bar axis, in win-rate points. */
const AXIS_LO = 40
const AXIS_HI = 66
const pos = (v: number) => ((Math.min(AXIS_HI, Math.max(AXIS_LO, v)) - AXIS_LO) / (AXIS_HI - AXIS_LO)) * 100
const pct = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(1))
const pp = (v: number | null | undefined) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)}`)

function QualityStrip({ rows, formatAvg, deckAvg }: { rows: MetaRow[]; formatAvg: number | null; deckAvg: number | null }) {
  const stacks = new Map<number, number>()
  const marks = rows.filter(row => row.score != null).sort((a, b) => Number(a.inDeck) - Number(b.inDeck)).flatMap(row =>
    Array.from({ length: row.copies }, (_, i) => {
      const bin = Math.round(row.score! * 2)
      const level = (stacks.get(bin) ?? 0) + 1
      stacks.set(bin, level)
      return <span key={`${row.card.name}-${row.inDeck}-${i}`} className={`meta-mark${row.inDeck ? ' is-deck' : ''}`} style={{ left: `${pos(row.score!)}%`, bottom: `${(level - 1) * 9 + 4}px` }} title={`${row.card.name} ${row.score!.toFixed(1)}`} />
    }))
  return (
    <>
      <div className="meta-strip" role="img" aria-label={`Card win rates: deck average ${pct(deckAvg)}, format average ${pct(formatAvg)}`}>
        {marks}
        {formatAvg != null && <span className="meta-avg" style={{ left: `${pos(formatAvg)}%` }}><em>Format {formatAvg.toFixed(1)}</em></span>}
        {deckAvg != null && <span className="meta-avg is-deck" style={{ left: `${pos(deckAvg)}%` }}><em>Your deck {deckAvg.toFixed(1)}</em></span>}
      </div>
      <div className="meta-axis">{[40, 45, 50, 55, 60, 65].map(t => <span key={t} style={{ left: `${pos(t)}%` }}>{t}%</span>)}</div>
      <div className="deck-stats-legend"><span><i className="deck-stats-swatch" />In deck</span><span><i className="deck-stats-swatch deck-stats-swatch--ghost" />Sideboard</span><span>One mark per copy, by GIH WR (GP WR where there's no hand data)</span></div>
    </>
  )
}

function MetaTable({ rows, formatAvg }: { rows: MetaRow[]; formatAvg: number | null }) {
  return (
    <div className="meta-table-wrap">
      <table className="meta-table">
        <thead>
          <tr className="meta-group-row"><th colSpan={2} /><th colSpan={5}>In Hand</th><th colSpan={2}>Deck</th><th colSpan={2}>Usage</th><th colSpan={2}>Draft</th><th /></tr>
          <tr>
            <th>Card</th><th>Grade</th><th title="Win rate when drawn or in the opening hand">GIH WR</th><th title="Opening hand win rate">OH WR</th><th title="Win rate when drawn later">GD WR</th>
            <th title="Win rate when in the deck but never seen">GNS WR</th><th title="Improvement when drawn: GIH WR minus GNS WR">IIH</th><th title="Win rate of decks that played it">GP WR</th>
            <th title="Played WAR: win-rate change when played vs not">PWAR</th><th title="How often a seen copy was played">PR</th><th title="How often a seen copy was resourced">RWS</th>
            <th title="Average pick taken">ATA</th><th title="How often it was picked when seen">Pick %</th><th>Games</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const s = row.stats
            const hand = !!s?.gihCount
            return (
              <tr key={`${row.card.name}-${row.inDeck}`} className={row.inDeck ? '' : 'is-sideboard'}>
                <td><CardCell row={row} /></td>
                <td><GradeChip grade={s?.displayGrade} /></td>
                <td>
                  <span className="meta-gih">
                    {hand && row.score != null && formatAvg != null && (
                      <span className="meta-gih-bar" aria-hidden="true">
                        <i className="meta-gih-avg" style={{ left: `${pos(formatAvg)}%` }} />
                        <i className={`meta-gih-fill ${gradeTone(s?.displayGrade)}`} style={{ left: `${Math.min(pos(formatAvg), pos(row.score))}%`, width: `${Math.abs(pos(row.score) - pos(formatAvg))}%` }} />
                      </span>
                    )}
                    <b>{hand ? pct(s?.gihWr) : '—'}</b>
                  </span>
                </td>
                <td>{hand ? pct(s?.ohWr) : '—'}</td><td>{hand ? pct(s?.gdWr) : '—'}</td><td>{hand ? pct(s?.gnsWr) : '—'}</td>
                <td className={s?.iih != null && hand ? (s.iih > 2 ? 'is-up' : s.iih < 0 ? 'is-down' : '') : ''}>{hand ? pp(s?.iih) : '—'}</td>
                <td>{pct(s?.gpWr)}</td>
                <td className={s?.playedWar != null && hand ? (s.playedWar > 2 ? 'is-up' : s.playedWar < 0 ? 'is-down' : '') : ''}>{hand ? pp(s?.playedWar) : '—'}</td>
                <td>{hand && s?.playedRate != null ? `${Math.round(s.playedRate)}%` : '—'}</td>
                <td>{hand && s?.resourcedWhenSeen != null ? `${Math.round(s.resourcedWhenSeen)}%` : '—'}</td>
                <td>{s?.ata != null ? s.ata.toFixed(1) : '—'}</td>
                <td>{s?.pickRate != null ? `${Math.round(s.pickRate)}%` : '—'}</td>
                <td><span className={`meta-sample${row.sample < MIN_META_SAMPLE ? ' is-thin' : ''}`}>{row.sample.toLocaleString()}</span></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function MetaSkeleton() {
  return (
    <section className="deck-stats-modules deck-stats-modules--page" aria-busy="true" aria-label="Meta stats">
      <div className="deck-stats-span2"><StatsPanel label="Deck Quality"><span className="skeleton-line" style={{ height: 110, width: '100%' }} /></StatsPanel></div>
      <div className="deck-stats-span2"><StatsPanel label="Card Stats">{[0, 1, 2, 3, 4].map(i => <span key={i} className="skeleton-line" style={{ height: 22, width: '100%', marginBottom: 8 }} />)}</StatsPanel></div>
    </section>
  )
}

/** Meta tab: format win rates for this deck's cards. Friends of the Pod only; the tab is disabled for everyone else. */
export function MetaTab({ build }: { build: BuildTabData }) {
  const [scope, setScope] = useState<Scope>('deck')
  const state = useCardMetaStats(build.setCode)

  const rows = useMemo(() => metaRows(build.deck, build.sideboard, state.cards), [build.deck, build.sideboard, state.cards])
  const formatAvg = useMemo(() => formatAverage(state.cards), [state.cards])
  const deckAvg = useMemo(() => deckAverage(rows), [rows])
  const upgrades = useMemo(() => sideboardUpgrades(rows, card => penaltyOf(card, build.leader, build.base) === 0), [rows, build.leader, build.base])

  if (state.loading) return <MetaSkeleton />
  if (state.error) {
    return <section className="deck-stats-panel deck-stats-panel--error"><span className="your-stats-eyebrow">Meta</span><h3>Couldn't load meta stats</h3><p>Try refreshing this page.</p></section>
  }
  if (!state.cards.length) {
    return <section className="deck-stats-panel deck-stats-panel--empty"><span className="your-stats-eyebrow">Meta</span><h3>No games for {build.setCode} yet</h3><p>Card win rates appear once online Limited games for this set are recorded.</p></section>
  }

  const shown = rows.filter(row => scope === 'pool' || (scope === 'deck') === row.inDeck)
  return (
    <section className="deck-stats-modules deck-stats-modules--page meta-tab">
      <div className="deck-stats-span2 meta-source">
        Online Limited games recorded by Wayfinder{state.games ? ` · ${state.games.toLocaleString()} games` : ''} · {build.setCode}
      </div>
      <div className="deck-stats-span2">
        <StatsPanel label="Deck Quality"><QualityStrip rows={rows} formatAvg={formatAvg} deckAvg={deckAvg} /></StatsPanel>
      </div>
      <div className="deck-stats-span2">
        <StatsPanel label="Sideboard Upgrades">
          {upgrades.length === 0 ? <p className="meta-dim meta-none">None found: no sideboard card in your aspects beats a deck card by enough games to trust it.</p> : (
            <div className="meta-swaps">
              {upgrades.map(up => (
                <div key={`${up.out.card.name}-${up.in.card.name}`} className="meta-swap">
                  <span className="meta-swap-tag is-out">Out</span><span className="meta-swap-card"><CardCell row={up.out} /><GradeChip grade={up.out.stats?.displayGrade} /><span className="meta-dim">{pct(up.out.score)}</span></span>
                  <span className="meta-swap-tag is-in">In</span><span className="meta-swap-card"><CardCell row={up.in} /><GradeChip grade={up.in.stats?.displayGrade} /><span className="meta-dim">{pct(up.in.score)}</span></span>
                  <span className="meta-swap-gain">{pp(up.gain)} pts</span>
                </div>
              ))}
            </div>
          )}
        </StatsPanel>
      </div>
      <div className="deck-stats-span2">
        <StatsPanel label="Card Stats">
          <div className="meta-table-head">
            <div className="deck-stats-view-toggle" role="group" aria-label="Rows to show">
              {(['deck', 'sideboard', 'pool'] as const).map(value => (
                <Button key={value} variant="toggle" glowColor="blue" size="sm" active={scope === value} aria-pressed={scope === value} onClick={() => setScope(value)}>
                  {value === 'deck' ? 'Deck' : value === 'sideboard' ? 'Sideboard' : 'Pool'}
                </Button>
              ))}
            </div>
            <span className="meta-dim">Bar: distance from the format average · dash: no hand data · amber games: under {MIN_META_SAMPLE}</span>
          </div>
          <MetaTable rows={shown} formatAvg={formatAvg} />
        </StatsPanel>
      </div>
    </section>
  )
}

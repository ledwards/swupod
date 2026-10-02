'use client'

import { useState } from 'react'
import Button from '../../src/components/Button'

type Tone = 'good' | 'bad'

type Chip = { text: string, tone?: Tone }

type Cell = { summary: Chip, counts: Chip | Chip[] }

const COLUMNS = [
  'Standard',
  'Protect the Pod',
  'Limited Lab',
  'SWUDraftSim',
  'Felt Table',
  'SWU Sealed',
  'SWU-DR4FT',
  'CCS',
  'ManyTCG',
] as const

function feature(on: boolean): Cell {
  const chip: Chip = { text: on ? 'Yes' : 'No', tone: on ? 'good' : 'bad' }
  return { summary: chip, counts: chip }
}

function plain(text: string): Cell {
  const chip: Chip = { text }
  return { summary: chip, counts: chip }
}

function stat(summary: string, number: string, tone?: Tone): Cell {
  return {
    summary: { text: summary, tone },
    counts: { text: number, tone },
  }
}

function mix(summary: string, summaryTone: Tone | undefined, values: string[], tones?: Tone[]): Cell {
  return {
    summary: { text: summary, tone: summaryTone },
    counts: values.map((text, i) => ({ text, tone: tones?.[i] })),
  }
}

const dash = stat('—', '—')

const ROWS: { label: string, countsLabel?: string, cells: Cell[] }[] = [
  {
    label: 'Draft',
    cells: [
      plain('Yes'),
      feature(true),
      feature(false),
      feature(true),
      feature(true),
      feature(false),
      feature(true),
      feature(false),
      feature(true),
    ],
  },
  {
    label: 'Sealed',
    cells: [
      plain('Yes'),
      feature(true),
      feature(true),
      feature(true),
      feature(true),
      feature(true),
      feature(true),
      feature(true),
      feature(true),
    ],
  },
  {
    label: 'Solo',
    cells: [
      plain('Yes'),
      feature(true),
      feature(true),
      feature(true),
      feature(true),
      feature(true),
      feature(true),
      feature(true),
      feature(true),
    ],
  },
  {
    label: 'Multiplayer',
    cells: [
      plain('Yes'),
      feature(true),
      feature(false),
      feature(false),
      feature(false),
      feature(false),
      feature(true),
      feature(false),
      feature(true),
    ],
  },
  {
    label: 'Play vs AI',
    cells: [
      plain('Yes'),
      feature(false),
      feature(false),
      feature(false),
      feature(true),
      feature(false),
      feature(false),
      feature(false),
      feature(false),
    ],
  },
  {
    label: 'Real opponent',
    cells: [
      plain('Yes'),
      feature(true),
      feature(false),
      feature(false),
      feature(false),
      feature(false),
      feature(true),
      feature(false),
      feature(true),
    ],
  },
  {
    label: 'Sitewide stats',
    cells: [
      plain('Yes'),
      feature(true),
      feature(true),
      feature(false),
      feature(false),
      feature(true),
      feature(false),
      feature(false),
      feature(false),
    ],
  },
  {
    label: 'Personal stats',
    cells: [
      plain('Yes'),
      feature(true),
      feature(true),
      feature(false),
      feature(false),
      feature(false),
      feature(false),
      feature(false),
      feature(true),
    ],
  },
  {
    label: 'Duplicates',
    cells: [
      stat('Recorded', '6.2'),
      stat('Close', '6.5', 'good'),
      stat('Off', '7.0', 'bad'),
      stat('Off', '0', 'bad'),
      stat('Off', '13.5', 'bad'),
      stat('Off', '13.2', 'bad'),
      dash,
      stat('Off', '14.3', 'bad'),
      stat('Off', '13.9', 'bad'),
    ],
  },
  {
    label: '10+ duplicates',
    cells: [
      stat('Recorded', '7%'),
      stat('Close', '7%', 'good'),
      stat('Off', '18%', 'bad'),
      stat('Off', '0%', 'bad'),
      stat('Off', '96%', 'bad'),
      stat('Off', '94%', 'bad'),
      dash,
      stat('Off', '98%', 'bad'),
      stat('Off', '97%', 'bad'),
    ],
  },
  {
    label: 'Card mix',
    countsLabel: 'L : R : S : U : C',
    cells: [
      mix('Recorded', undefined, ['1.6', '5.5', '0.2', '17.8', '58.9']),
      mix('Close', 'good', ['1.5', '5.6', '0.3', '17.6', '59.0'], ['good', 'good', 'good', 'good', 'good']),
      mix('Off', 'bad', ['0.8', '5.4', '0.1', '18.7', '59.0'], ['bad', 'good', 'good', 'good', 'good']),
      mix('Off', 'bad', ['1.4', '5.8', '0.6', '19.2', '57.0'], ['good', 'good', 'bad', 'bad', 'bad']),
      mix('Off', 'bad', ['1.3', '5.0', '0.2', '19.4', '58.2'], ['good', 'bad', 'good', 'bad', 'good']),
      mix('Off', 'bad', ['0.9', '5.9', '0.1', '21.2', '55.5'], ['bad', 'bad', 'good', 'bad', 'bad']),
      dash,
      mix('Off', 'bad', ['0.8', '5.7', '0.0', '19.4', '58.2'], ['bad', 'good', 'good', 'bad', 'good']),
      mix('Off', 'bad', ['1.7', '6.1', '0.2', '19.5', '56.5'], ['good', 'bad', 'good', 'bad', 'bad']),
    ],
  },
]

function ChipView({ chip }: { chip: Chip }) {
  return <span className={chip.tone ? `comps-chip ${chip.tone}` : 'comps-chip'}>{chip.text}</span>
}

function CellView({ cell, showCounts }: { cell: Cell, showCounts: boolean }) {
  const counts = cell.counts
  if (showCounts && Array.isArray(counts)) {
    return (
      <span className="comps-ratio">
        {counts.map((chip, i) => <ChipView key={i} chip={chip} />)}
      </span>
    )
  }
  const chip = showCounts && !Array.isArray(counts) ? counts : cell.summary
  return <ChipView chip={chip} />
}

export default function CompsMatrix() {
  const [showCounts, setShowCounts] = useState(false)

  return (
    <>
      <div className="comps-toggle" role="group" aria-label="Cell detail">
        <Button
          variant="toggle"
          glowColor="blue"
          size="sm"
          active={!showCounts}
          aria-pressed={!showCounts}
          onClick={() => setShowCounts(false)}
        >
          Summary
        </Button>
        <Button
          variant="toggle"
          glowColor="blue"
          size="sm"
          active={showCounts}
          aria-pressed={showCounts}
          onClick={() => setShowCounts(true)}
        >
          Counts
        </Button>
      </div>

      <div className="comps-table-wrap">
        <table className="comps-table">
          <thead>
            <tr>
              <th></th>
              {COLUMNS.map(name => <th key={name}>{name}</th>)}
            </tr>
          </thead>
          <tbody>
            {ROWS.map(row => (
              <tr key={row.label}>
                <th scope="row">{showCounts && row.countsLabel ? row.countsLabel : row.label}</th>
                {row.cells.map((cell, i) => (
                  <td key={COLUMNS[i]} data-label={COLUMNS[i]}>
                    <CellView cell={cell} showCounts={showCounts} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCounts && (
        <p className="comps-note">
          Duplicates are repeated card names. L : R : S : U : C is legendaries, rares, specials, uncommons, commons.
          Standard is the published pack rate, and the opened-pack rate where none was published.
        </p>
      )}
    </>
  )
}

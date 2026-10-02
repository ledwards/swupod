import type { Metadata } from 'next'
import '../../src/components/PrivacyPolicy.css'
import './comps.css'

export const metadata: Metadata = {
  title: 'Pack comparison',
  robots: { index: false, follow: false },
}

type Tone = 'good' | 'bad'

type Cell =
  | { text: string, tone?: Tone }
  | { values: string[], tones: Tone[] }

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

function Ratio({ values, tones }: { values: string[], tones: Tone[] }) {
  return (
    <>
      {values.map((value, i) => (
        <span key={i}>
          {i > 0 && <span className="comps-sep"> : </span>}
          <span className={tones[i]}>{value}</span>
        </span>
      ))}
    </>
  )
}

function CellView({ cell }: { cell: Cell }) {
  if ('values' in cell) return <Ratio values={cell.values} tones={cell.tones} />
  if (!cell.tone) return cell.text
  return <span className={cell.tone}>{cell.text}</span>
}

function yes(on: boolean): Cell {
  return { text: on ? 'Yes' : 'No', tone: on ? 'good' : 'bad' }
}

const ROWS: { label: string, cells: Cell[] }[] = [
  {
    label: 'Duplicates',
    cells: [
      { text: '6.2' },
      { text: '6.5', tone: 'good' },
      { text: '7.0', tone: 'bad' },
      { text: '0', tone: 'bad' },
      { text: '—' },
      { text: '13.2', tone: 'bad' },
      { text: '—' },
      { text: '14.3', tone: 'bad' },
      { text: '—' },
    ],
  },
  {
    label: '10+ duplicates',
    cells: [
      { text: '7%' },
      { text: '7%', tone: 'good' },
      { text: '18%', tone: 'bad' },
      { text: '0%', tone: 'bad' },
      { text: '—' },
      { text: '94%', tone: 'bad' },
      { text: '—' },
      { text: '98%', tone: 'bad' },
      { text: '—' },
    ],
  },
  {
    label: 'L : R : S : U : C',
    cells: [
      { text: '1.6 : 5.5 : 0.2 : 17.8 : 58.9' },
      { values: ['1.5', '5.6', '0.3', '17.6', '59.0'], tones: ['good', 'good', 'good', 'good', 'good'] },
      { values: ['0.8', '5.4', '0.1', '18.7', '59.0'], tones: ['bad', 'good', 'good', 'good', 'good'] },
      { values: ['1.4', '5.8', '0.6', '19.2', '57.0'], tones: ['good', 'good', 'bad', 'bad', 'bad'] },
      { text: '—' },
      { values: ['0.9', '5.9', '0.1', '21.2', '55.5'], tones: ['bad', 'bad', 'good', 'bad', 'bad'] },
      { text: '—' },
      { values: ['0.8', '5.7', '0.0', '19.4', '58.2'], tones: ['bad', 'good', 'good', 'bad', 'good'] },
      { text: '—' },
    ],
  },
  {
    label: 'Draft',
    cells: [
      { text: 'Yes' },
      yes(true),
      yes(false),
      yes(true),
      yes(true),
      yes(false),
      yes(true),
      yes(false),
      yes(true),
    ],
  },
  {
    label: 'Sealed',
    cells: [
      { text: 'Yes' },
      yes(true),
      yes(true),
      yes(true),
      yes(true),
      yes(true),
      yes(true),
      yes(true),
      yes(true),
    ],
  },
  {
    label: 'Solo',
    cells: [
      { text: 'Yes' },
      yes(true),
      yes(true),
      yes(true),
      yes(true),
      yes(true),
      yes(true),
      yes(true),
      yes(true),
    ],
  },
  {
    label: 'Multiplayer',
    cells: [
      { text: 'Yes' },
      yes(true),
      yes(false),
      yes(false),
      yes(false),
      yes(false),
      yes(true),
      yes(false),
      yes(true),
    ],
  },
]

export default function CompsPage() {
  return (
    <div className="legal-page comps-page">
      <div className="legal-content">
        <h1>Pack comparison</h1>
        <p className="last-updated">Six-pack kit. Per kit.</p>

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
                  <th scope="row">{row.label}</th>
                  {row.cells.map((cell, i) => (
                    <td key={COLUMNS[i]} data-label={COLUMNS[i]}>
                      <CellView cell={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="comps-note">
          Duplicates are repeated card names. L : R : S : U : C is legendaries, rares, specials, uncommons, commons.
          Standard is the published pack rate, and the opened-pack rate where none was published.
          A dash means pack contents were not published.
        </p>
      </div>
    </div>
  )
}

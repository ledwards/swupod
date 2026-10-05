type Tone = 'good' | 'bad'

type Chip = { text: string, tone?: Tone }

type Cell = Chip | Chip[]

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
  return { text: on ? 'Yes' : 'No', tone: on ? 'good' : 'bad' }
}

function plain(text: string): Cell {
  return { text }
}

function delta(base: number, value: number, tone: Tone): Cell {
  const rounded = Math.round(((value - base) / base) * 100)
  const text = rounded > 0 ? `+${rounded}%` : rounded < 0 ? `${rounded}%` : '+0%'
  return { text, tone }
}

function mix(values: string[], tones?: Tone[]): Cell {
  return values.map((text, i) => {
    const tone = tones?.[i]
    return tone ? { text, tone } : { text }
  })
}

const dash: Cell = { text: '—' }

const ROWS: { label: string, cells: Cell[] }[] = [
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
      feature(false),
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
    label: 'Duplicate Rate',
    cells: [
      plain('6.2'),
      delta(6.2, 6.5, 'good'),
      delta(6.2, 7.0, 'bad'),
      delta(6.2, 0, 'bad'),
      delta(6.2, 13.5, 'bad'),
      delta(6.2, 13.2, 'bad'),
      dash,
      delta(6.2, 14.3, 'bad'),
      delta(6.2, 13.9, 'bad'),
    ],
  },
  {
    label: 'Kits with 10+ repeats',
    cells: [
      plain('7%'),
      delta(7, 7, 'good'),
      delta(7, 18, 'bad'),
      delta(7, 0, 'bad'),
      delta(7, 96, 'bad'),
      delta(7, 94, 'bad'),
      dash,
      delta(7, 98, 'bad'),
      delta(7, 97, 'bad'),
    ],
  },
  {
    label: 'L : R : S : U : C',
    cells: [
      mix(['1.6', '5.5', '0.2', '17.8', '58.9']),
      mix(['1.5', '5.6', '0.3', '17.6', '59.0'], ['good', 'good', 'good', 'good', 'good']),
      mix(['0.8', '5.4', '0.1', '18.7', '59.0'], ['bad', 'good', 'good', 'good', 'good']),
      mix(['1.4', '5.8', '0.6', '19.2', '57.0'], ['good', 'good', 'bad', 'bad', 'bad']),
      mix(['1.3', '5.0', '0.2', '19.4', '58.2'], ['good', 'bad', 'good', 'bad', 'good']),
      mix(['0.9', '5.9', '0.1', '21.2', '55.5'], ['bad', 'bad', 'good', 'bad', 'bad']),
      dash,
      mix(['0.8', '5.7', '0.0', '19.4', '58.2'], ['bad', 'good', 'good', 'bad', 'good']),
      mix(['1.7', '6.1', '0.2', '19.5', '56.5'], ['good', 'bad', 'good', 'bad', 'bad']),
    ],
  },
]

function ChipView({ chip }: { chip: Chip }) {
  return <span className={chip.tone ? `comps-value ${chip.tone}` : 'comps-value'}>{chip.text}</span>
}

function CellView({ cell }: { cell: Cell }) {
  if (Array.isArray(cell)) {
    return (
      <span className="comps-ratio">
        {cell.map((chip, i) => <ChipView key={i} chip={chip} />)}
      </span>
    )
  }
  return <ChipView chip={cell} />
}

export default function CompsMatrix() {
  return (
    <div className="comps-panel">
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
    </div>
  )
}

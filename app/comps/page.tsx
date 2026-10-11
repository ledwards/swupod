import type { Metadata } from 'next'
import '../../src/components/LandingPage.css'
import './comps.css'
import { comparisonTable, type TableCell } from '../../src/services/compsTable'
import { scorecard } from './scorecard'

export const metadata: Metadata = {
  title: 'How the simulators compare',
  robots: { index: false, follow: false },
}

const OURS = 'ptp'

function Check({ on }: { on: boolean }) {
  return on
    ? (
      <svg className="comps-mark good" viewBox="0 0 24 24" aria-label="Yes" role="img">
        <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
    : (
      <svg className="comps-mark bad" viewBox="0 0 24 24" aria-label="No" role="img">
        <path d="M7 7l10 10M17 7L7 17" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      </svg>
    )
}

function Cell({ cell }: { cell: TableCell }) {
  switch (cell.kind) {
    case 'score': return <span className="comps-score" style={{ color: scoreColor(cell.value) }}>{cell.value}%</span>
    case 'check': return <Check on={cell.on} />
    case 'target': return <span className="comps-num">{cell.value.toFixed(1)}</span>
    case 'number': return <span className={cell.good ? 'comps-num good' : 'comps-num bad'}>{cell.value.toFixed(1)}</span>
    default: return <span className="comps-none" aria-label="Not published">—</span>
  }
}

/** Green at 100%, through amber, to red at RED_AT and below. */
const RED_AT = 34
function scoreColor(value: number): string {
  const t = Math.max(0, Math.min(1, (value - RED_AT) / (100 - RED_AT)))
  return `hsl(${Math.round(t * 120)}, 85%, 58%)`
}

function measuredOn(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

export default function CompsPage() {
  const table = comparisonTable(scorecard.reference, scorecard.sites, OURS)

  return (
    <main className="landing-page comps-page">
      <header className="landing-content comps-hero">
        <img className="landing-logo" src="/ptp_logo400.png" alt="Protect the Pod" />
        <h1 className="comps-title">The closest thing to opening a real box</h1>
        <p className="comps-lede">
          We opened eleven booster boxes of Ashes of the Empire, then put every Star Wars Unlimited simulator next to them.
        </p>
      </header>

      <section className="comps-board" aria-label="Simulator comparison">
        <div className="comps-table-wrap">
          <table className="comps-table">
            <thead>
              <tr>
                <td className="comps-corner" />
                <th scope="col" className="comps-target">Target</th>
                {table.columns.map(c => (
                  <th key={c.id} scope="col" className={c.id === OURS ? 'is-ours' : undefined}>{c.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, r) => (
                <tr key={row.label} className={r === 0 ? 'comps-overall' : undefined}>
                  <th scope="row">{row.label}</th>
                  <td className="comps-target"><Cell cell={row.target} /></td>
                  {row.cells.map((cell, i) => (
                    <td key={table.columns[i]!.id} className={table.columns[i]!.id === OURS ? 'is-ours' : undefined}>
                      <Cell cell={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="comps-footnote">
        Each simulator&apos;s own pack code, run for thousands of six-pack kits on the same cards and compared with hundreds of packs from real boxes.
      </p>
      <p className="comps-footnote">Last measured {measuredOn(scorecard.measuredAt)}.</p>
    </main>
  )
}

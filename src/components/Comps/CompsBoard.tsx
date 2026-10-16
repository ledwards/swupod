import type { ReactNode } from 'react'
import { RarityIcon } from '@/src/components/CardIcons'
import { comparisonTable, type TableCell } from '@/src/services/compsTable'
import { scoreTone, zTone, TONE_WORDS, type Tone } from '@/src/services/compsTones'
import { getSetConfig } from '@/src/utils/setConfigs'
import { getCyclingPackImageUrls } from '@/src/utils/packArt'
import { scorecard } from '@/app/comps/scorecard'
import './comps-board.css'

const OURS = 'ptp'
const MIX_RARITIES = ['Legendary', 'Rare', 'Special', 'Uncommon', 'Common']
/** Product wording for row labels the shared table service names differently. */
const ROW_LABELS: Record<string, string> = { 'Play vs AI': 'Play vs the AI' }

function fmt(value: number, percent?: boolean): string {
  return percent ? `${Math.round(value)}%` : value.toFixed(1)
}

function measuredOn(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

/** A toned value: the colour plus the same verdict in words for assistive tech and the hover title. */
function Toned({ tone, children, className = '' }: { tone: Tone | null; children: ReactNode; className?: string }) {
  if (!tone) return <span className={className}>{children}</span>
  return (
    <span className={`cmp-tone cmp-tone--${tone} ${className}`.trim()} title={TONE_WORDS[tone]}>
      {children}<span className="cmp-sr">, {TONE_WORDS[tone].toLowerCase()}</span>
    </span>
  )
}

function Mark({ on, tone }: { on: boolean; tone?: boolean }) {
  const cls = `cmp-mark${tone ? (on ? ' cmp-tone--success' : ' cmp-tone--danger') : ''}`
  return on
    ? <svg className={cls} viewBox="0 0 24 24" role="img" aria-label="Yes"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
    : <svg className={cls} viewBox="0 0 24 24" role="img" aria-label="No"><path d="M7 7l10 10M17 7L7 17" /></svg>
}

function Cell({ cell, target = false }: { cell: TableCell; target?: boolean }) {
  switch (cell.kind) {
    case 'score': return <Toned tone={scoreTone(cell.value)}>{cell.value}%</Toned>
    case 'check': return <Mark on={cell.on} tone={!target} />
    // Alpha viewers already have AI play.
    case 'alpha': return <Mark on tone />
    case 'target': return <span>{fmt(cell.value, cell.percent)}</span>
    case 'number': return <Toned tone={zTone(cell.z)}>{fmt(cell.value, cell.percent)}</Toned>
    case 'mix':
      return (
        <span className="cmp-mix">
          {cell.values.map((v, i) => (
            <Toned key={MIX_RARITIES[i]} tone={cell.z ? zTone(cell.z[i]) : null} className="cmp-mix-item">
              <RarityIcon rarity={MIX_RARITIES[i]} size={12} />{v.toFixed(v >= 10 ? 0 : 1)}
            </Toned>
          ))}
        </span>
      )
    default: return <span className="cmp-none" aria-label="Not published">—</span>
  }
}

/** The themed pack-generation comparison (alpha). Server-rendered from the committed scorecard. */
export default function CompsBoard() {
  const table = comparisonTable(scorecard.reference, scorecard.sites, OURS)
  const setName = getSetConfig(scorecard.set)?.setName
  const overall = table.rows[0]!
  const packs = getCyclingPackImageUrls(scorecard.set, 6) as string[]

  return (
    <div className="cmp-page">
      <h1>The Closest Thing to Opening a Real Box</h1>
      <p>How the simulators compare</p>

      <div className="cmp-panel cmp-lede">
        <div className="cmp-lede-copy">
          <p>
            We crowdsourced box openings in our Discord, processed them en masse to build the best pack opening simulator for Star Wars Unlimited, and compared our results with hundreds of packs opened on other simulators.
          </p>
          <div className="cmp-chips">
            <span className="cmp-chip">{setName ? `${scorecard.set} · ${setName}` : scorecard.set}</span>
            <span className="cmp-chip">{scorecard.reference.kits} real six-pack kits</span>
            <span className="cmp-chip">{table.columns.length} simulators</span>
          </div>
        </div>
        <div className="cmp-kit" aria-hidden="true">
          {packs.map((src, i) => <img key={i} src={src} alt="" loading="lazy" />)}
        </div>
      </div>

      <section className="cmp-panel cmp-labeled" aria-labelledby="cmp-overall">
        <h2 id="cmp-overall" className="cmp-label">Overall Score</h2>
        <div className="cmp-rank">
          {table.columns.map((c, i) => {
            const cell = overall.cells[i]
            const value = cell?.kind === 'score' ? cell.value : 0
            const tone = scoreTone(value)
            return (
              <div key={c.id} className={`cmp-rank-row${c.id === OURS ? ' is-ours' : ''}`}>
                <span className="cmp-rank-name">{c.name}</span>
                <div className="cmp-bar" role="img" aria-label={`${c.name} scores ${value}%, ${TONE_WORDS[tone].toLowerCase()}`}>
                  <span className={`cmp-bar-fill cmp-bar-fill--${tone}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
                </div>
                <span className={`cmp-rank-score cmp-tone--${tone}`}>{value}%</span>
              </div>
            )
          })}
        </div>
      </section>

      <section className="cmp-panel cmp-labeled" aria-labelledby="cmp-table">
        <h2 id="cmp-table" className="cmp-label">Against Real {scorecard.set} Boxes</h2>
        <div className="cmp-table-wrap">
          <table className="cmp-table">
            <thead>
              <tr>
                <td />
                <th scope="col" className="is-target">{scorecard.set} Boxes</th>
                {table.columns.map(c => <th key={c.id} scope="col" className={c.id === OURS ? 'is-ours' : undefined}>{c.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, r) => (
                <tr key={row.label} className={r === 0 ? 'cmp-overall-row' : undefined}>
                  <th scope="row">{ROW_LABELS[row.label] ?? row.label}</th>
                  <td className="is-target"><Cell cell={row.target} target /></td>
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
        <ul className="cmp-legend" aria-label="Colour key">
          <li><span className="cmp-swatch cmp-bar-fill--success" />{TONE_WORDS.success}: within one standard deviation</li>
          <li><span className="cmp-swatch cmp-bar-fill--warning" />{TONE_WORDS.warning}: within two</li>
          <li><span className="cmp-swatch cmp-bar-fill--danger" />{TONE_WORDS.danger}: further than two</li>
        </ul>
      </section>

      <div className="cmp-notes">
        <p>*Counts every printing: foil slots, hyperspace upgrades and the upgraded third uncommon slot.</p>
        <p>Each simulator&apos;s own pack code, run for thousands of six-pack kits on the same cards and compared with crowdsourced box openings.</p>
        <p>Last measured {measuredOn(scorecard.measuredAt)}.</p>
      </div>
    </div>
  )
}

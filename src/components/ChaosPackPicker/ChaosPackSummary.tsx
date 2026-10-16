'use client'
import Button from '../Button'
import { getPackImageUrl } from '../../utils/packArt'
import type { SetData } from '../../utils/packSelectorSort'
import { canChangeCount, pickerSummary, type PackLimits, type PickerState } from '../../services/chaosPackPicker'
import { promoTierForCode } from '../../services/chaosSealedSelection'
import './chaos-pack-picker.css'

const FAN_MAX = 8
const TIER_LABEL = { silver: 'GC Silver', black: 'GC Black' } as const
const chipLabel = (code: string) => {
  const tier = promoTierForCode(code)
  return tier ? TIER_LABEL[tier] : code
}

/** EntryPackFan's layout (same .entry-pack-fan rules) for a mixed list of packs; open slots are outlines. */
function ChaosPackFan({ codes, empty }: { codes: string[]; empty: number }) {
  const items = [...codes.map((code) => ({ code })), ...Array.from({ length: empty }, () => ({ code: null }))].slice(0, FAN_MAX)
  const count = items.length
  return (
    <div className="entry-pack-fan" aria-hidden="true">
      {items.map((item, i) => {
        const position = count === 1 ? 0 : (i / (count - 1)) * 2 - 1
        const style = {
          left: `${50 + position * 19}%`,
          transform: `translateX(-50%) rotate(${position * 24}deg)`,
          zIndex: count - Math.round(Math.abs(position) * count),
        }
        return item.code
          ? <img key={i} src={getPackImageUrl(item.code)} alt="" style={style} />
          : <span key={i} className="cpk-fan-empty" style={style} />
      })}
    </div>
  )
}

/**
 * The summary half of the pack picker and the only place the pack count lives: the fan, the
 * count stepper and the packs in order. Tapping a pack removes it. The stepper can't go below
 * the packs already chosen; it says so instead of dropping any.
 */
export default function ChaosPackSummary({ state, limits, sets, onStep, onRemoveAt, countLabel, eventNote, disabled = false }: {
  state: PickerState
  limits: PackLimits
  sets: readonly SetData[] | null
  onStep: (delta: number) => void
  onRemoveAt: (index: number) => void
  countLabel: string
  eventNote: string
  disabled?: boolean
}) {
  const summary = pickerSummary(state)
  const nameOf = (code: string) => sets?.find((s) => s.code === code)?.name ?? code
  const shrinkBlocked = state.count > limits.min && !canChangeCount(state, -1, limits)
  return (
    <>
      <ChaosPackFan codes={summary.ordered} empty={summary.remaining} />
      <div className="cpk-count">
        <span id="cpk-count-label">{countLabel}</span>
        <div className="cpk-stepper" role="group" aria-labelledby="cpk-count-label">
          <Button variant="icon" size="sm" aria-label="Fewer packs" disabled={disabled || !canChangeCount(state, -1, limits)} onClick={() => onStep(-1)}>−</Button>
          <output aria-live="polite">{state.count}</output>
          <Button variant="icon" size="sm" aria-label="More packs" disabled={disabled || !canChangeCount(state, 1, limits)} onClick={() => onStep(1)}>+</Button>
        </div>
      </div>
      {shrinkBlocked && <p className="cpk-note">Remove a pack below to lower the count.</p>}
      <ol className="cpk-chips" aria-label="Your packs, in opening order">
        {summary.ordered.map((code, i) => (
          <li key={`${code}-${i}`}>
            <Button className="cpk-chip" size="sm" disabled={disabled} onClick={() => onRemoveAt(i)}
              aria-label={`Remove pack ${i + 1}, ${nameOf(code)}`}>
              <img src={getPackImageUrl(code)} alt="" />
              <span>{chipLabel(code)}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </Button>
          </li>
        ))}
        {Array.from({ length: summary.remaining }, (_, i) => (
          <li key={`empty-${i}`} className="cpk-chip-empty" aria-hidden="true" />
        ))}
      </ol>
      {summary.eventPacks.length > 0 && <p className="cpk-note">{eventNote}</p>}
    </>
  )
}

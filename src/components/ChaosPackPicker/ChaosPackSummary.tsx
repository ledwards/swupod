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

type FanItem = { code: string | null; index: number; event?: boolean }

/**
 * EntryPackFan's layout (same .entry-pack-fan rules) for a mixed list of packs; open slots are
 * outlines. With `onRemoveAt`, each pack in the fan is a button that takes it out.
 */
function ChaosPackFan({ items, nameOf, onRemoveAt, disabled }: {
  items: FanItem[]
  nameOf: (code: string) => string
  onRemoveAt?: ((index: number) => void) | undefined
  disabled: boolean
}) {
  const shown = items.slice(0, FAN_MAX)
  const count = shown.length
  return (
    <div className={`entry-pack-fan${onRemoveAt ? ' cpk-fan--removable' : ''}`} aria-hidden={onRemoveAt ? undefined : true}
      role={onRemoveAt ? 'group' : undefined} aria-label={onRemoveAt ? 'Your packs, in drafting order. Tap a pack to remove it.' : undefined}>
      {shown.map((item, i) => {
        const position = count === 1 ? 0 : (i / (count - 1)) * 2 - 1
        const style = {
          left: `${50 + position * 19}%`,
          transform: `translateX(-50%) rotate(${position * 24}deg)`,
          zIndex: count - Math.round(Math.abs(position) * count),
        }
        if (!item.code) return <span key={i} className={`cpk-fan-empty${item.event ? ' cpk-fan-empty--event' : ''}`} style={style}>{item.event ? 'Event Pack' : null}</span>
        if (!onRemoveAt) return <img key={i} src={getPackImageUrl(item.code)} alt="" style={style} />
        return (
          <button key={i} type="button" className="cpk-fan-pack" style={style} disabled={disabled}
            onClick={() => onRemoveAt(item.index)} aria-label={`Remove pack ${item.index + 1}, ${nameOf(item.code)}`}>
            <img src={getPackImageUrl(item.code)} alt="" />
            <span className="cpk-fan-x" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg></span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * The summary half of the pack picker and the only place the pack count lives: the fan, the
 * count stepper (hidden when the count is fixed) and the packs in order. Packs come out either
 * by tapping them in the fan (`removeFrom="fan"`) or as chips below it. Lowering the count past
 * the packs chosen drops the last one.
 */
export default function ChaosPackSummary({ state, limits, sets, onStep, onRemoveAt, countLabel, eventNote, disabled = false, removeFrom = 'chips' }: {
  state: PickerState
  limits: PackLimits
  sets: readonly SetData[] | null
  onStep: (delta: number) => void
  onRemoveAt: (index: number) => void
  countLabel: string
  eventNote: string
  disabled?: boolean
  removeFrom?: 'fan' | 'chips'
}) {
  const summary = pickerSummary(state)
  const nameOf = (code: string) => sets?.find((s) => s.code === code)?.name ?? code
  const fixed = limits.min === limits.max
  // A single Event Pack slot (Chaos Draft) shows as its own outline after the set packs.
  const eventSlot = limits.maxEventPacks === 1
  const items: FanItem[] = [
    ...summary.setPacks.map((code, index) => ({ code, index })),
    ...Array.from({ length: summary.remaining }, () => ({ code: null, index: -1 })),
    ...summary.eventPacks.map((code, i) => ({ code, index: summary.setPacks.length + i, event: true })),
    ...(eventSlot && summary.eventPacks.length === 0 ? [{ code: null, index: -1, event: true }] : []),
  ]
  return (
    <>
      <ChaosPackFan items={items} nameOf={nameOf} onRemoveAt={removeFrom === 'fan' ? onRemoveAt : undefined} disabled={disabled} />
      {fixed
        ? <p className="cpk-count"><span>{countLabel}</span><output>{state.count}{eventSlot ? ' + 1 Event Pack' : ''}</output></p>
        : (
          <div className="cpk-count">
            <span id="cpk-count-label">{countLabel}</span>
            <div className="cpk-stepper" role="group" aria-labelledby="cpk-count-label">
              <Button variant="icon" size="sm" aria-label="Fewer packs" disabled={disabled || !canChangeCount(state, -1, limits)} onClick={() => onStep(-1)}>−</Button>
              <output aria-live="polite">{state.count}</output>
              <Button variant="icon" size="sm" aria-label="More packs" disabled={disabled || !canChangeCount(state, 1, limits)} onClick={() => onStep(1)}>+</Button>
            </div>
          </div>
        )}
      {removeFrom === 'chips' && (
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
      )}
      {summary.eventPacks.length > 0 && <p className="cpk-note">{eventNote}</p>}
    </>
  )
}

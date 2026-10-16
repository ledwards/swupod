/**
 * State for the alpha "build your packs" picker (Chaos Draft and Chaos Sealed setup).
 * Pure: the page holds a PickerState and calls these to change it.
 *
 * One source of truth: `count` is the number of set-pack slots, and `picks` is the one
 * ordered list the summary shows and the API receives. Set packs come first, Event Packs
 * after them. Event Packs augment a sealed pool / add bonus draft rounds, so they never hold
 * a slot (src/services/chaosSealedSelection.ts) and are capped at MAX_PROMO_PACKS_TOTAL.
 * Nothing here ever drops a pick to make a change fit: an add with no free slot, or a count
 * below the packs already chosen, is refused instead.
 */
import {
  MAX_PROMO_PACKS_TOTAL,
  splitSelection,
  validateChaosSealedSelection,
  packProvidesLeaders,
} from './chaosSealedSelection'

export interface PackLimits {
  readonly min: number
  readonly max: number
  readonly default: number
}

/** Chaos Draft: the solo page's 1–4 (default 4). POST /api/draft sets no cap of its own. */
export const CHAOS_DRAFT_PACK_LIMITS: PackLimits = { min: 1, max: 4, default: 4 }
/** Chaos Sealed: 1–12 (default 6), the cap POST /api/formats/chaos-sealed enforces. */
export const CHAOS_SEALED_PACK_LIMITS: PackLimits = { min: 1, max: 12, default: 6 }

export interface PickerState {
  readonly count: number
  readonly picks: readonly string[]
}

const clamp = (n: number, { min, max }: PackLimits) => Math.min(max, Math.max(min, n))

/** Set packs first, then Event Packs, each group in the order it was picked. */
function ordered(picks: readonly string[]): string[] {
  const { setPacks, promoPacks } = splitSelection(picks)
  return [...setPacks, ...promoPacks]
}

/** A picker at the default count, or restored from storage (anything malformed is ignored). */
export function createPicker(limits: PackLimits, saved?: unknown): PickerState {
  const raw = (saved && typeof saved === 'object' ? saved : {}) as { count?: unknown; picks?: unknown }
  const savedCount = typeof raw.count === 'number' && Number.isFinite(raw.count) && raw.count !== 0
    ? Math.round(raw.count)
    : limits.default
  const picks = Array.isArray(raw.picks) ? raw.picks.filter((p): p is string => typeof p === 'string') : []
  const { setPacks, promoPacks } = splitSelection(picks)
  const keptSets = setPacks.slice(0, limits.max)
  return {
    count: Math.max(clamp(savedCount, limits), keptSets.length),
    picks: [...keptSets, ...promoPacks.slice(0, MAX_PROMO_PACKS_TOTAL)],
  }
}

/** Whether tapping this pack would add it: a free slot for a set pack, room under the cap for an Event Pack. */
export function canAddPack(state: PickerState, code: string): boolean {
  const { setPacks, promoPacks } = splitSelection(state.picks)
  return packProvidesLeaders(code) ? setPacks.length < state.count : promoPacks.length < MAX_PROMO_PACKS_TOTAL
}

/** Add one pack of a set (the tile tap). Unchanged when there's no room. */
export function addPack(state: PickerState, code: string): PickerState {
  if (!canAddPack(state, code)) return state
  return { ...state, picks: ordered([...state.picks, code]) }
}

/** Remove the pack at this position in the summary (the chip tap). */
export function removePackAt(state: PickerState, index: number): PickerState {
  if (!Number.isInteger(index) || index < 0 || index >= state.picks.length) return state
  return { ...state, picks: [...state.picks.slice(0, index), ...state.picks.slice(index + 1)] }
}

/** Whether the stepper can move: inside the limits, and never below the set packs already chosen. */
export function canChangeCount(state: PickerState, delta: number, limits: PackLimits): boolean {
  const next = state.count + delta
  if (next < limits.min || next > limits.max) return false
  return next >= splitSelection(state.picks).setPacks.length
}

export function changeCount(state: PickerState, delta: number, limits: PackLimits): PickerState {
  return canChangeCount(state, delta, limits) ? { ...state, count: state.count + delta } : state
}

/** Drop picks the viewer can't choose (a locked Event Pack, a set they can't see), e.g. restored ones. */
export function keepAvailable(state: PickerState, available: ReadonlySet<string>): PickerState {
  const picks = state.picks.filter((p) => available.has(p))
  return picks.length === state.picks.length ? state : { ...state, picks }
}

export interface PickerSummary {
  readonly setPacks: string[]
  readonly eventPacks: string[]
  /** The list to submit, in summary order. */
  readonly ordered: string[]
  /** Empty set-pack slots. */
  readonly remaining: number
  /** Every slot holds a set pack and the selection is valid. */
  readonly complete: boolean
  /** User-facing reason the selection can't be used, once it's full. */
  readonly error: string | null
}

export function pickerSummary(state: PickerState): PickerSummary {
  const { setPacks, promoPacks } = splitSelection(state.picks)
  const validation = validateChaosSealedSelection(state.picks)
  const full = setPacks.length === state.count
  return {
    setPacks,
    eventPacks: promoPacks,
    ordered: [...setPacks, ...promoPacks],
    remaining: Math.max(0, state.count - setPacks.length),
    complete: full && validation.ok,
    error: full && !validation.ok ? validation.message ?? null : null,
  }
}

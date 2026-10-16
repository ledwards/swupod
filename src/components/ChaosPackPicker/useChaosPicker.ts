'use client'
import { useCallback, useEffect, useState } from 'react'
import type { SetData } from '../../utils/packSelectorSort'
import {
  addPack,
  changeCount,
  createPicker,
  keepAvailable,
  removePackAt,
  type PackLimits,
  type PickerState,
} from '../../services/chaosPackPicker'
import { selectableCodes } from './useChaosPackSets'

/**
 * Picker state for a Chaos setup, remembered per viewer (so a sign-in round trip keeps the
 * packs). Restored picks the viewer can't choose are dropped once the set list loads.
 */
export function useChaosPicker(storageKey: string, limits: PackLimits, sets: readonly SetData[] | null) {
  const [state, setState] = useState<PickerState>(() => createPicker(limits))
  const [restored, setRestored] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) setState(createPicker(limits, JSON.parse(saved)))
    } catch {
      // Unreadable storage: start fresh.
    }
    setRestored(true)
  }, [storageKey, limits])

  useEffect(() => {
    if (restored && sets) setState((s) => keepAvailable(s, selectableCodes(sets)))
  }, [restored, sets])

  useEffect(() => {
    if (!restored) return
    try { localStorage.setItem(storageKey, JSON.stringify(state)) } catch { /* storage unavailable */ }
  }, [restored, storageKey, state])

  const clear = useCallback(() => {
    try { localStorage.removeItem(storageKey) } catch { /* storage unavailable */ }
  }, [storageKey])

  return {
    state,
    add: (code: string) => setState((s) => addPack(s, code)),
    removeAt: (index: number) => setState((s) => removePackAt(s, index)),
    step: (delta: number) => setState((s) => changeCount(s, delta, limits)),
    /** Forget the saved picks (after the pod or pool is created). */
    clear,
  }
}

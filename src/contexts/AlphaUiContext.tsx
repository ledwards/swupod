'use client'
/**
 * One alpha gate for the whole client. Alpha-era UI that lives on main must be
 * invisible to beta and regular users; components ask `useAlphaUi()` and
 * alpha-only CSS is scoped under `html.ptp-alpha` (legacy CSS under
 * `html:not(.ptp-alpha)`, see scripts/scope-css.mjs).
 *
 * The check runs once (server-checked via useBetaExperience), so legacy is the
 * default while it loads — non-alpha users never see an alpha flash.
 */
import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { useBetaExperience } from '../services/entry/useBetaExperience'

const AlphaUiContext = createContext<{ enabled: boolean; loading: boolean }>({ enabled: false, loading: true })

export function AlphaUiProvider({ children }: { children: ReactNode }) {
  const value = useBetaExperience()
  useEffect(() => {
    document.documentElement.classList.toggle('ptp-alpha', value.enabled)
  }, [value.enabled])
  return <AlphaUiContext.Provider value={value}>{children}</AlphaUiContext.Provider>
}

/** `enabled` is true only for admins/alpha testers with the rollout switch on. */
export function useAlphaUi() {
  return useContext(AlphaUiContext)
}

'use client'

/**
 * Alpha testers get the reworked draft room (header leader tray, border labels,
 * paired player labels, pick-confirmation layout); everyone else keeps the
 * pre-alpha room. Same props either way.
 */
import type { ComponentProps } from 'react'
import { useAlphaUi } from '../contexts/AlphaUiContext'
import PackDraftPhaseAlpha from './PackDraftPhaseAlpha'
import PackDraftPhaseLegacy from './PackDraftPhaseLegacy'

export default function PackDraftPhase(props: ComponentProps<typeof PackDraftPhaseLegacy>) {
  const { enabled } = useAlphaUi()
  return enabled ? <PackDraftPhaseAlpha {...props} /> : <PackDraftPhaseLegacy {...props} />
}

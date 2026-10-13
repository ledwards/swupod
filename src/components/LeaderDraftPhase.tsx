'use client'

/**
 * Alpha testers get the reworked draft room (header leader tray, border labels,
 * paired player labels, pick-confirmation layout); everyone else keeps the
 * pre-alpha room. Same props either way.
 */
import type { ComponentProps } from 'react'
import { useAlphaUi } from '../contexts/AlphaUiContext'
import LeaderDraftPhaseAlpha from './LeaderDraftPhaseAlpha'
import LeaderDraftPhaseLegacy from './LeaderDraftPhaseLegacy'

export default function LeaderDraftPhase(props: ComponentProps<typeof LeaderDraftPhaseLegacy>) {
  const { enabled } = useAlphaUi()
  return enabled ? <LeaderDraftPhaseAlpha {...props} /> : <LeaderDraftPhaseLegacy {...props} />
}

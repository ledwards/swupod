'use client'

import { useAlphaUi } from '../contexts/AlphaUiContext'
import PackOpeningAnimationAlpha, { type PackOpeningAnimationProps } from './PackOpeningAnimationAlpha'
import PackOpeningAnimationLegacy from './PackOpeningAnimationLegacy'

export type { PackOpeningAnimationProps }

/** Alpha testers get the measured-viewport reveal; everyone else keeps the pre-alpha animation. */
export default function PackOpeningAnimation(props: PackOpeningAnimationProps) {
  const { enabled } = useAlphaUi()
  return enabled ? <PackOpeningAnimationAlpha {...props} /> : <PackOpeningAnimationLegacy {...props} />
}

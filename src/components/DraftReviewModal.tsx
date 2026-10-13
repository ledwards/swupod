'use client'

import { useAlphaUi } from '../contexts/AlphaUiContext'
import DraftReviewModalAlpha, { type DraftReviewModalProps } from './DraftReviewModalAlpha'
import DraftReviewModalLegacy from './DraftReviewModalLegacy'

export type { DraftReviewModalProps }

/** Alpha testers get the restyled review; everyone else keeps the pre-alpha modal. */
function DraftReviewModal(props: DraftReviewModalProps) {
  const { enabled } = useAlphaUi()
  return enabled ? <DraftReviewModalAlpha {...props} /> : <DraftReviewModalLegacy {...props} />
}

export default DraftReviewModal

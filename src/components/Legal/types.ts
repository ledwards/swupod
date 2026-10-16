import type { ReactNode } from 'react'

export interface LegalSection {
  /** Anchor for the On This Page contents. */
  id: string
  /** Numbered heading, e.g. "1. Acceptance of Terms". */
  heading: string
  /** Heading shown to alpha viewers instead, where Lee approved a change. */
  alphaHeading?: string
  body: ReactNode
}

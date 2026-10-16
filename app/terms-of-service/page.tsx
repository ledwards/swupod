import { viewerHasAlphaAccess } from '../../lib/viewerAccess'
import LegalDocument from '../../src/components/Legal/LegalDocument'
import { TERMS_SECTIONS } from '../../src/components/Legal/termsSections'
import TermsOfServiceLegacy from './TermsOfServiceLegacy'

/** Alpha testers get the themed legal page; everyone else keeps the current one. */
export default async function TermsOfServicePage() {
  if (await viewerHasAlphaAccess()) {
    // Same date the legacy page shows (the day it is viewed).
    return <LegalDocument doc="terms" title="Terms of Service" updated={new Date().toLocaleDateString()} sections={TERMS_SECTIONS} />
  }
  return <TermsOfServiceLegacy />
}

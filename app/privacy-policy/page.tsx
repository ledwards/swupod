import { viewerHasAlphaAccess } from '../../lib/viewerAccess'
import LegalDocument from '../../src/components/Legal/LegalDocument'
import { PRIVACY_INTRO, PRIVACY_SECTIONS, PRIVACY_UPDATED } from '../../src/components/Legal/privacySections'
import PrivacyPolicyLegacy from './PrivacyPolicyLegacy'

/** Alpha testers get the themed legal page; everyone else keeps the current one. */
export default async function PrivacyPolicyPage() {
  if (await viewerHasAlphaAccess()) {
    return <LegalDocument doc="privacy" title="Privacy Policy" updated={PRIVACY_UPDATED} intro={PRIVACY_INTRO} sections={PRIVACY_SECTIONS} />
  }
  return <PrivacyPolicyLegacy />
}

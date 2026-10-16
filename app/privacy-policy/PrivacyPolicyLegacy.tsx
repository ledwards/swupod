'use client'

import PrivacyPolicy from '../../src/components/PrivacyPolicy'

export default function PrivacyPolicyPage() {
  const handleBack = () => {
    window.history.pushState({}, '', '/')
    window.location.href = '/'
  }

  return <PrivacyPolicy onBack={handleBack} />
}

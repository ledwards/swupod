'use client'

import TermsOfService from '../../src/components/TermsOfService'

export default function TermsOfServicePage() {
  const handleBack = () => {
    window.history.pushState({}, '', '/')
    window.location.href = '/'
  }

  return <TermsOfService onBack={handleBack} />
}

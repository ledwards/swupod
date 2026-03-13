// @ts-nocheck
'use client'

import About from '../../src/components/About'

export default function SupportThePodPage() {
  const handleBack = () => {
    window.history.pushState({}, '', '/')
    window.location.href = '/'
  }

  return <About onBack={handleBack} />
}

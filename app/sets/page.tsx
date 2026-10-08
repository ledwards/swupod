// @ts-nocheck
'use client'

import { useState, useEffect } from 'react'
import '../../src/App.css'
import SetSelection from '../../src/components/SetSelection'
import { initializeCardCache } from '../../src/utils/cardCache'

export default function SetsPage() {
  const [selectedSet, setSelectedSet] = useState<string | null>(null)

  // Preload all cards on initial page load
  useEffect(() => {
    initializeCardCache().catch((error) => {
      console.error('Failed to load cards:', error)
    })
  }, [])

  const handleSetSelect = (setCode: string) => {
    // Navigate to create a new pool for this set
    window.location.href = `/pools/new?set=${setCode}`
  }

  const handleBack = () => {
    window.location.href = '/'
  }

  return (
    <div className="app">
      <SetSelection onSetSelect={handleSetSelect} onBack={handleBack} />
    </div>
  )
}

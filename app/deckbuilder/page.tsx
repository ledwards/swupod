// @ts-nocheck
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { initializeCardCache } from '../../src/utils/cardCache'
import SetSelection from '../../src/components/SetSelection'
import '../../src/App.css'

export default function DeckbuilderModePage() {
  const router = useRouter()

  useEffect(() => {
    initializeCardCache().catch((error) => {
      console.error('Failed to load cards:', error)
    })
  }, [])

  const handleSetSelect = (setCode: string) => {
    router.push(`/deckbuilder/build?set=${encodeURIComponent(setCode)}`)
  }

  return (
    <div className="app">
      <SetSelection
        onSetSelect={handleSetSelect}
        onBack={() => router.push('/')}
        title="Limited Deckbuilder"
      />
    </div>
  )
}

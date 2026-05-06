// @ts-nocheck
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useImportPool } from '../../hooks/useImportPool'
import Button from '../Button'
import UploadStep from './UploadStep'
import ResolveStep from './ResolveStep'
import ConfirmStep from './ConfirmStep'

/**
 * ImportPoolWizard — orchestrates Upload → Resolve → Confirm steps (U7).
 *
 * Wizard state persists in localStorage across page refresh. "Start over"
 * clears it. On success, redirects to /pool/[shareId]/deck.
 */
export default function ImportPoolWizard() {
  const router = useRouter()
  const importPool = useImportPool()
  const { state, reset } = importPool

  // On submission success, redirect to the existing sealed deckbuilder route.
  useEffect(() => {
    if (state.phase === 'done' && state.shareId) {
      router.push(`/pool/${state.shareId}/deck`)
    }
  }, [state.phase, state.shareId, router])

  const hasWork = state.images.length > 0 || state.extraction !== null
  const handleStartOver = () => {
    if (confirm('Clear all uploaded images and extracted data?')) reset()
  }

  return (
    <div className="import-pool-wizard">
      <header className="import-pool-header">
        <div className="import-pool-header__top">
          <h1>Import Pool</h1>
          {hasWork && (
            <Button variant="secondary" size="xs" onClick={handleStartOver}>
              Start over
            </Button>
          )}
        </div>
        <ol className="import-pool-steps">
          <li className={isActive('upload', state.phase) ? 'active' : ''}>1 · Upload</li>
          <li className={isActive('resolve', state.phase) ? 'active' : ''}>2 · Resolve</li>
          <li className={isActive('confirm', state.phase) ? 'active' : ''}>3 · Confirm</li>
        </ol>
      </header>

      {(state.phase === 'idle' ||
        state.phase === 'uploading' ||
        state.phase === 'extracting' ||
        state.phase === 'error') && <UploadStep importPool={importPool} />}

      {state.phase === 'resolving' && <ResolveStep importPool={importPool} />}

      {(state.phase === 'confirming' || state.phase === 'submitting' || state.phase === 'done') && (
        <ConfirmStep importPool={importPool} />
      )}
    </div>
  )
}

function isActive(stepKey: 'upload' | 'resolve' | 'confirm', phase: string): boolean {
  if (stepKey === 'upload') return ['idle', 'uploading', 'extracting'].includes(phase)
  if (stepKey === 'resolve') return phase === 'resolving'
  if (stepKey === 'confirm') return ['confirming', 'submitting', 'done'].includes(phase)
  return false
}

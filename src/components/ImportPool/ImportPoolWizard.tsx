// @ts-nocheck
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useImportPool } from '../../hooks/useImportPool'
import UploadStep from './UploadStep'
import ResolveStep from './ResolveStep'
import ConfirmStep from './ConfirmStep'

/**
 * ImportPoolWizard — orchestrates Upload → Resolve → Confirm steps (U7).
 *
 * Single-page wizard. Refresh restarts the flow (acceptable for SPIKE).
 * On success, redirects to /pool/[shareId]/deck.
 */
export default function ImportPoolWizard() {
  const router = useRouter()
  const importPool = useImportPool()
  const { state } = importPool

  // On submission success, redirect to the existing sealed deckbuilder route.
  useEffect(() => {
    if (state.phase === 'done' && state.shareId) {
      router.push(`/pool/${state.shareId}/deck`)
    }
  }, [state.phase, state.shareId, router])

  return (
    <div className="import-pool-wizard">
      <header className="import-pool-header">
        <h1>Import Pool</h1>
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

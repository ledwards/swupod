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
  const { state, reset, runExtraction } = importPool

  // On submission success, redirect to the existing sealed deckbuilder route.
  useEffect(() => {
    if (state.phase === 'done' && state.shareId) {
      router.push(`/pool/${state.shareId}/deck`)
    }
  }, [state.phase, state.shareId, router])

  const hasWork = state.images.length > 0 || state.extraction !== null
  const canReExtract = state.images.length > 0 && state.phase !== 'extracting' && state.phase !== 'submitting'
  const handleStartOver = () => {
    if (confirm('Cancel this import? All uploaded images and imported data will be discarded.')) reset()
  }
  const handleReExtract = () => {
    if (
      confirm(
        'Re-extract from the same images? Any manual edits to the resolved rows will be discarded.',
      )
    ) {
      runExtraction()
    }
  }

  return (
    <div className="import-pool-wizard">
      <header className="import-pool-header">
        <div className="import-pool-header__top">
          <h1>Import Pool</h1>
          <div className="import-pool-header__actions">
            {canReExtract && (
              <Button variant="secondary" size="sm" onClick={handleReExtract} title="Re-run extraction on the uploaded images">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10"></polyline>
                  <polyline points="1 20 1 14 7 14"></polyline>
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                </svg>
                Re-extract
              </Button>
            )}
            {hasWork && (
              <Button variant="danger" size="sm" onClick={handleStartOver}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
                Cancel Import
              </Button>
            )}
          </div>
        </div>
        <ol className="import-pool-steps">
          <li className={isActive('upload', state.phase) ? 'active' : ''}>1 · Upload</li>
          <li className={isActive('resolve', state.phase) ? 'active' : ''}>2 · Review</li>
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

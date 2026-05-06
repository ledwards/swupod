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
  const { state, reset, runExtraction, goToUpload } = importPool

  // On submission success, redirect to the existing sealed deckbuilder route.
  useEffect(() => {
    if (state.phase === 'done' && state.shareId) {
      router.push(`/pool/${state.shareId}/deck`)
    }
  }, [state.phase, state.shareId, router])

  const hasWork = state.images.length > 0 || state.extraction !== null
  const canReImport = state.images.length > 0 && state.phase !== 'extracting' && state.phase !== 'submitting'
  // Step 1 in the wizard step bar is clickable on later phases — that's the
  // back-to-upload affordance. The Re-upload header button was redundant
  // with that and got pulled.
  const canGoBackToUpload = ['resolving', 'confirming'].includes(state.phase)
  const handleStartOver = () => {
    if (confirm('Cancel this import? All uploaded images and imported data will be discarded.')) reset()
  }
  const handleReImport = () => {
    if (
      confirm(
        'Re-import the same images? Any manual edits to the resolved rows will be discarded.',
      )
    ) {
      runExtraction()
    }
  }
  const handleGoToUpload = () => {
    if (
      confirm(
        'Go back to the Upload step? Your uploaded images stay; replacing or re-importing will discard any manual edits.',
      )
    ) {
      goToUpload()
    }
  }

  return (
    <div className="import-pool-wizard">
      <div className="import-pool-header__top">
        <h1>Import Pool</h1>
        <div className="import-pool-header__actions">
          {canReImport && (
            <Button variant="secondary" size="sm" onClick={handleReImport} title="Re-import from the uploaded images">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10"></polyline>
                <polyline points="1 20 1 14 7 14"></polyline>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
              </svg>
              Re-import
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
      {/* Steps bar lives at the wizard root (not inside the header) so its
          position:sticky parent is the full wizard column rather than a
          ~60px header block — otherwise the steps stop sticking the moment
          the header itself scrolls past.
          Step 1 is clickable on later phases (same destination as the
          Re-upload button above, with the same confirm). */}
      <ol className="import-pool-steps">
        <Step
          label="1 · Upload"
          isActiveStep={isActive('upload', state.phase)}
          isClickable={canGoBackToUpload}
          onClick={handleGoToUpload}
        />
        <Step label="2 · Review" isActiveStep={isActive('resolve', state.phase)} />
        <Step label="3 · Confirm" isActiveStep={isActive('confirm', state.phase)} />
      </ol>

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

interface StepProps {
  label: string
  isActiveStep: boolean
  isClickable?: boolean
  onClick?: () => void
}

function Step({ label, isActiveStep, isClickable = false, onClick }: StepProps) {
  const cls = [
    isActiveStep ? 'active' : '',
    isClickable && !isActiveStep ? 'clickable' : '',
  ]
    .filter(Boolean)
    .join(' ')
  if (isClickable && !isActiveStep && onClick) {
    return (
      <li
        className={cls}
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onClick()
          }
        }}
      >
        {label}
      </li>
    )
  }
  return <li className={cls}>{label}</li>
}

function isActive(stepKey: 'upload' | 'resolve' | 'confirm', phase: string): boolean {
  if (stepKey === 'upload') return ['idle', 'uploading', 'extracting'].includes(phase)
  if (stepKey === 'resolve') return phase === 'resolving'
  if (stepKey === 'confirm') return ['confirming', 'submitting', 'done'].includes(phase)
  return false
}

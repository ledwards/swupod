'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '../Button'
import ConfirmModal from '../ConfirmModal'
import { useImportPool } from '../../hooks/useImportPool'
import UploadStep from '../ImportPool/UploadStep'
import ResolveStep from '../ImportPool/ResolveStep'
import ConfirmStep from '../ImportPool/ConfirmStep'
import { importStep, type ImportStepKey } from '../../services/importPool/wizardSteps'
import { TrashIcon } from '../PoolPage/PoolBuildCards'

type Pending = 'cancel' | 'reimport' | 'upload' | null

const CheckIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>
const ReimportIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>

const STEPS: Array<{ key: ImportStepKey; label: string }> = [
  { key: 'upload', label: '1 · Upload' }, { key: 'resolve', label: '2 · Review' }, { key: 'confirm', label: '3 · Confirm' },
]

/**
 * The Import Pool wizard (alpha): Upload → Review → Confirm, composing the
 * existing step components. Finished steps are chips you can go back to; the
 * Re-import and Cancel Import actions sit beside them and confirm in a dialog.
 * On success it opens the new pool in the deck builder.
 */
export default function ImportWizard() {
  const router = useRouter()
  const importPool = useImportPool()
  const { state, reset, runExtraction, goToUpload, goBack } = importPool
  const [pending, setPending] = useState<Pending>(null)

  useEffect(() => {
    if (state.phase === 'done' && state.shareId) router.push(`/pools/${state.shareId}/deck`)
  }, [state.phase, state.shareId, router])

  const step = importStep(state.phase)
  const hasWork = state.images.length > 0 || state.extraction !== null
  const canReImport = state.phase === 'resolving' && state.images.length > 0
  const backTo = (key: ImportStepKey) => {
    if (key === 'upload' && (state.phase === 'resolving' || state.phase === 'confirming')) return () => setPending('upload')
    if (key === 'resolve' && state.phase === 'confirming') return () => goBack()
    return null
  }
  const confirmPending = () => {
    if (pending === 'cancel') reset()
    if (pending === 'reimport') void runExtraction()
    if (pending === 'upload') goToUpload()
    setPending(null)
  }

  return (
    <div className="ipa-wizard">
      <div className="ipa-bar">
        <ol className="ipa-steps" aria-label="Import steps">
          {STEPS.map((s, i) => {
            const done = STEPS.findIndex(x => x.key === step) > i
            const go = backTo(s.key)
            const cls = `ipa-step${s.key === step ? ' is-active' : ''}${done ? ' is-done' : ''}`
            return <li key={s.key}>
              {go
                ? <button type="button" className={cls} onClick={go} title={`Back to ${s.label.slice(4)}`}>{done && <CheckIcon/>}{s.label}</button>
                : <span className={cls} aria-current={s.key === step ? 'step' : undefined}>{done && <CheckIcon/>}{s.label}</span>}
            </li>
          })}
        </ol>
        {(canReImport || hasWork) && (
          <div className="ipa-bar-actions">
            {canReImport && <Button size="sm" onClick={() => setPending('reimport')} title="Re-import from the uploaded images"><ReimportIcon/>Re-import</Button>}
            {hasWork && <Button variant="danger" size="sm" onClick={() => setPending('cancel')}><TrashIcon/>Cancel Import</Button>}
          </div>
        )}
      </div>

      {(state.phase === 'idle' || state.phase === 'uploading' || state.phase === 'extracting' || state.phase === 'error') && (
        <section className="ipa-panel ipa-panel--labeled" aria-label="Upload your registration sheet">
          <h2 className="ipa-panel-label">Upload Your Registration Sheet</h2>
          <UploadStep importPool={importPool}/>
        </section>
      )}
      {state.phase === 'resolving' && <ResolveStep importPool={importPool}/>}
      {(state.phase === 'confirming' || state.phase === 'submitting' || state.phase === 'done') && (
        <section className="ipa-panel ipa-panel--labeled" aria-label="Confirm and create">
          <h2 className="ipa-panel-label">Confirm and Create</h2>
          <ConfirmStep importPool={importPool}/>
        </section>
      )}

      <ConfirmModal isOpen={pending !== null} variant={pending === 'cancel' ? 'danger' : 'default'}
        title={pending === 'cancel' ? 'Cancel this import?' : pending === 'reimport' ? 'Re-import the same images?' : 'Go back to Upload?'}
        confirmLabel={pending === 'cancel' ? 'Cancel Import' : pending === 'reimport' ? 'Re-import' : 'Go to Upload'}
        cancelLabel={pending === 'cancel' ? 'Keep Importing' : 'Stay Here'}
        onConfirm={confirmPending} onCancel={() => setPending(null)}>
        <p>
          {pending === 'cancel' && 'All uploaded images and imported data will be discarded.'}
          {pending === 'reimport' && 'Any manual edits to the resolved rows will be discarded.'}
          {pending === 'upload' && 'Your uploaded images stay; replacing or re-importing will discard any manual edits.'}
        </p>
      </ConfirmModal>
    </div>
  )
}

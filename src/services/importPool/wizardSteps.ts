export type ImportStepKey = 'upload' | 'resolve' | 'confirm'

/** Which wizard step a useImportPool phase belongs to. */
export function importStep(phase: string): ImportStepKey {
  if (phase === 'resolving') return 'resolve'
  if (phase === 'confirming' || phase === 'submitting' || phase === 'done') return 'confirm'
  return 'upload'
}

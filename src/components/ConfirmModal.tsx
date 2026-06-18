import type { ReactNode } from 'react'
import Modal from './Modal'
import Button from './Button'

/**
 * ConfirmModal — a confirm / cancel dialog built on the shared Modal, so it
 * inherits the focus trap, Escape-to-close, scroll lock, and dialog ARIA.
 *
 * Replaces the bespoke `.delete-confirm-*` markup that was hand-rolled across
 * several pages (each missing those a11y behaviours and using a saturated
 * resting fill). The confirm button is the standard <Button> danger variant
 * (neutral at rest, red glow on hover) per the Light-Not-Paint rule.
 *
 * Usage:
 *   <ConfirmModal
 *     isOpen={!!pendingDelete}
 *     title="Delete this deck?"
 *     confirmLabel="Delete"
 *     confirming={isDeleting}
 *     onConfirm={handleDelete}
 *     onCancel={() => setPendingDelete(null)}
 *   >
 *     <p>This action cannot be undone.</p>
 *   </ConfirmModal>
 */
export interface ConfirmModalProps {
  isOpen: boolean
  title?: string
  children?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  onConfirm?: () => void
  onCancel?: () => void
  confirming?: boolean
  confirmDisabled?: boolean
  variant?: 'default' | 'danger'
}

export function ConfirmModal({
  isOpen,
  title = '',
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  confirming = false,
  confirmDisabled = false,
  variant = 'danger',
}: ConfirmModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={() => { if (!confirming) onCancel?.() }}
      title={title}
      variant={variant}
    >
      <Modal.Body>{children}</Modal.Body>
      <Modal.Actions>
        <Button variant="secondary" onClick={onCancel} disabled={confirming}>
          {cancelLabel}
        </Button>
        <Button
          variant={variant === 'danger' ? 'danger' : 'primary'}
          onClick={onConfirm}
          disabled={confirming || confirmDisabled}
        >
          {confirming ? `${confirmLabel}…` : confirmLabel}
        </Button>
      </Modal.Actions>
    </Modal>
  )
}

export default ConfirmModal

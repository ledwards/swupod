// @ts-nocheck
import { useEffect, useCallback, useRef, useId } from 'react'
import type { ReactNode, MouseEvent, KeyboardEvent } from 'react'
import './Modal.css'
import Button from './Button'

/**
 * Reusable Modal Component
 *
 * Usage:
 *   <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Confirm">
 *     <p>Are you sure?</p>
 *     <Modal.Actions>
 *       <button onClick={handleConfirm}>Yes</button>
 *       <button onClick={() => setShowModal(false)}>No</button>
 *     </Modal.Actions>
 *   </Modal>
 *
 * Props:
 *   - isOpen: boolean - whether modal is visible
 *   - onClose: function - called when overlay clicked or escape pressed
 *   - title: string (optional) - modal title
 *   - variant: 'default' | 'danger' | 'image' - styling variant
 *   - showCloseButton: boolean - show X button (default: false)
 *   - className: string - additional class for modal content
 *   - children: content to render inside modal
 */

type ModalVariant = 'default' | 'danger' | 'image'

export interface ModalProps {
  isOpen: boolean
  onClose?: () => void
  title?: string
  variant?: ModalVariant
  showCloseButton?: boolean
  className?: string
  children?: ReactNode
}

interface ModalActionsProps {
  children?: ReactNode
  className?: string
}

interface ModalBodyProps {
  children?: ReactNode
  className?: string
}

export function Modal({
  isOpen,
  onClose,
  title,
  variant = 'default',
  showCloseButton = false,
  className = '',
  children
}: ModalProps) {
  const contentRef = useRef<HTMLDivElement | null>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)
  const generatedTitleId = useId()
  const titleId = title ? generatedTitleId : undefined

  const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

  // Escape to close, plus a focus trap so Tab cycles within the dialog.
  const handleKeyDown = useCallback((e: globalThis.KeyboardEvent) => {
    if (e.key === 'Escape' && onClose) {
      onClose()
      return
    }
    if (e.key === 'Tab' && contentRef.current) {
      const focusables = Array.from(contentRef.current.querySelectorAll(FOCUSABLE)) as HTMLElement[]
      if (focusables.length === 0) {
        e.preventDefault()
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
  }, [onClose])

  useEffect(() => {
    if (!isOpen) return undefined
    // Remember what had focus, so we can restore it on close.
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null
    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'
    // Move focus into the dialog (first focusable, else the dialog itself).
    const raf = requestAnimationFrame(() => {
      const el = contentRef.current
      if (!el) return
      const focusable = el.querySelector(FOCUSABLE) as HTMLElement | null
      ;(focusable || el).focus?.()
    })
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
      previouslyFocusedRef.current?.focus?.()
    }
  }, [isOpen, handleKeyDown])

  if (!isOpen) return null

  const variantClass = variant !== 'default' ? `modal--${variant}` : ''

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
    >
      <div
        ref={contentRef}
        className={`modal-content ${variantClass} ${className}`}
        onClick={(e: MouseEvent) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        {showCloseButton && (
          <Button
            variant="icon"
            size="sm"
            className="modal-close"
            onClick={onClose}
            aria-label="Close modal"
          >
            &times;
          </Button>
        )}
        {title && (
          <h2 id={titleId} className={`modal-title ${variant === 'danger' ? 'modal-title--danger' : ''}`}>
            {title}
          </h2>
        )}
        {children}
      </div>
    </div>
  )
}

/**
 * Modal.Actions - container for action buttons at bottom of modal
 */
Modal.Actions = function ModalActions({ children, className = '' }: ModalActionsProps) {
  return (
    <div className={`modal-actions ${className}`}>
      {children}
    </div>
  )
}

/**
 * Modal.Body - container for modal body content with standard padding
 */
Modal.Body = function ModalBody({ children, className = '' }: ModalBodyProps) {
  return (
    <div className={`modal-body ${className}`}>
      {children}
    </div>
  )
}

export default Modal

// @ts-nocheck
import { useState, useRef, useEffect, type MouseEvent } from 'react'
import './InfoTooltip.css'

interface InfoTooltipProps {
  text: string
}

export function InfoTooltip({ text }: InfoTooltipProps) {
  const [show, setShow] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Check if we're on a touch device
  const isTouchDevice = typeof window !== 'undefined' &&
    ('ontouchstart' in window || navigator.maxTouchPoints > 0)

  const showTooltip = (e: MouseEvent) => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = null
    }

    const rect = e.currentTarget.getBoundingClientRect()
    setPosition({
      x: rect.left + rect.width / 2,
      y: rect.top
    })
    setShow(true)
  }

  const hideTooltip = () => {
    // Small delay before hiding to prevent flickering
    hideTimeoutRef.current = setTimeout(() => {
      setShow(false)
    }, 100)
  }

  const handleClick = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (show) {
      setShow(false)
    } else {
      showTooltip(e)
      // Auto-hide after 3 seconds on touch devices
      if (isTouchDevice) {
        hideTimeoutRef.current = setTimeout(() => {
          setShow(false)
        }, 3000)
      }
    }
  }

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current)
      }
    }
  }, [])

  // Close tooltip when clicking outside (for mobile)
  useEffect(() => {
    if (!show || !isTouchDevice) return

    const handleClickOutside = (e: Event) => {
      if (buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        setShow(false)
      }
    }

    document.addEventListener('touchstart', handleClickOutside)
    return () => document.removeEventListener('touchstart', handleClickOutside)
  }, [show, isTouchDevice])

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="info-tooltip-button"
        onClick={handleClick}
        onMouseEnter={!isTouchDevice ? showTooltip : undefined}
        onMouseLeave={!isTouchDevice ? hideTooltip : undefined}
        aria-label="More information"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
      </button>
      {show && (
        <div
          className="info-tooltip"
          style={{
            position: 'fixed',
            left: `${position.x}px`,
            top: `${position.y}px`,
            transform: 'translate(-50%, -100%)',
            marginTop: '-8px',
            zIndex: 10000
          }}
        >
          {text}
        </div>
      )}
    </>
  )
}

export default InfoTooltip

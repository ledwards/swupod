'use client'

/**
 * StyledSelect — a dropdown that can show a description under each option.
 *
 * A native <select> can only render flat text per option, so anything with a
 * title-plus-description shape has to be custom. This keeps the native
 * keyboard contract (Up/Down/Home/End to move, Enter/Space to choose, Escape
 * to close, click-away to dismiss) rather than reinventing it badly.
 *
 * Closed, it shows only the selected option's label — the descriptions are
 * there to help you choose, not to clutter the row afterwards.
 */
import { useEffect, useRef, useState } from 'react'
import './StyledSelect.css'

export interface StyledSelectOption {
  value: string
  label: string
  /** Optional second line, shown only in the open list. */
  description?: string
  /** Optional grouping header rendered above this option. */
  groupLabel?: string
  /** Optional avatar shown to the left, in both the trigger and the list. */
  iconUrl?: string
}

export interface StyledSelectProps {
  options: StyledSelectOption[]
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  ariaLabel?: string
  className?: string
}

export default function StyledSelect({
  options,
  value,
  onChange,
  disabled = false,
  ariaLabel,
  className,
}: StyledSelectProps) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // -1 when the value matches nothing (a pack that was revoked, or a value
  // still in flight). Fall back to the first option for what the trigger
  // SHOWS, but never claim an option is selected when it isn't — that is what
  // left the first row looking permanently chosen.
  const matchedIndex = options.findIndex(o => o.value === value)
  const selected = options[matchedIndex] ?? options[0]

  // Click-away and Escape both close. Bound only while open so a page full of
  // these does not accumulate listeners.
  useEffect(() => {
    if (!open) return
    function onDocPointerDown(e: MouseEvent | TouchEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocPointerDown)
    document.addEventListener('touchstart', onDocPointerDown)
    return () => {
      document.removeEventListener('mousedown', onDocPointerDown)
      document.removeEventListener('touchstart', onDocPointerDown)
    }
  }, [open])

  useEffect(() => {
    if (open) setActiveIndex(matchedIndex >= 0 ? matchedIndex : 0)
  }, [open, matchedIndex])

  // Keep the highlighted row in view when arrowing through a long list.
  useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex])

  function commit(index: number) {
    const option = options[index]
    if (!option) return
    onChange(option.value)
    setOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (disabled) return
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault()
        setOpen(true)
      }
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => Math.min(options.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(0, i - 1))
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActiveIndex(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setActiveIndex(options.length - 1)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      commit(activeIndex)
    }
  }

  return (
    <div
      ref={rootRef}
      className={`styled-select${open ? ' is-open' : ''}${disabled ? ' is-disabled' : ''}${className ? ` ${className}` : ''}`}
    >
      <button
        type="button"
        className="styled-select-trigger"
        onClick={() => !disabled && setOpen(o => !o)}
        onKeyDown={onKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        <span className="styled-select-selected">
          {selected?.iconUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="styled-select-icon" src={selected.iconUrl} alt="" />
          )}
          <span className="styled-select-value">{selected?.label ?? ''}</span>
        </span>
        <span className="styled-select-caret" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>

      {open && (
        <ul className="styled-select-list" role="listbox" ref={listRef} tabIndex={-1}>
          {options.map((option, index) => (
            <li key={option.value} role="presentation">
              {option.groupLabel && (
                <div className="styled-select-group" role="presentation">{option.groupLabel}</div>
              )}
              <div
                role="option"
                aria-selected={option.value === value}
                data-index={index}
                className={`styled-select-option${index === activeIndex ? ' is-active' : ''}${option.value === value ? ' is-selected' : ''}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => commit(index)}
              >
                {option.iconUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="styled-select-icon" src={option.iconUrl} alt="" />
                )}
                <span className="styled-select-option-text">
                  <span className="styled-select-option-label">{option.label}</span>
                  {option.description && (
                    <span className="styled-select-option-description">{option.description}</span>
                  )}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

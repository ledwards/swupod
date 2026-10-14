// @ts-nocheck
/**
 * SearchInput Component
 *
 * A debounced search input with clear button.
 *
 * Usage:
 *   <SearchInput
 *     value={searchQuery}
 *     onChange={setSearchQuery}
 *     placeholder="Search cards..."
 *   />
 */

import { useState, useEffect, useRef } from 'react'
import type { ChangeEvent, InputHTMLAttributes } from 'react'
import './SearchInput.css'

type InputSize = 'sm' | 'md' | 'lg'

export interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'onChange'> {
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  debounce?: number
  clearable?: boolean
  size?: InputSize
  className?: string
  autoFocus?: boolean
}

/** The search field's leading magnifier: the one search glyph, site-wide. */
export function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}

export function SearchInput({
  value = '',
  onChange,
  placeholder = 'Search...',
  debounce = 300,
  clearable = true,
  size = 'md',  // 'sm' | 'md' | 'lg'
  className = '',
  autoFocus = false,
  ...rest
}: SearchInputProps) {
  const [internalValue, setInternalValue] = useState(value)
  const debounceTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync internal value when prop changes
  useEffect(() => {
    setInternalValue(value)
  }, [value])

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setInternalValue(newValue)

    // Clear previous timeout
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current)
    }

    // Debounce the onChange callback
    if (debounce > 0) {
      debounceTimeout.current = setTimeout(() => {
        onChange?.(newValue)
      }, debounce)
    } else {
      onChange?.(newValue)
    }
  }

  const handleClear = () => {
    setInternalValue('')
    onChange?.('')
  }

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current)
      }
    }
  }, [])

  const classes = [
    'search-input',
    `search-input--${size}`,
    internalValue && 'search-input--has-value',
    className
  ].filter(Boolean).join(' ')

  return (
    <div className={classes}>
      <SearchIcon className="search-input__icon" />
      <input
        type="text"
        value={internalValue}
        onChange={handleChange}
        placeholder={placeholder}
        className="search-input__field"
        autoFocus={autoFocus}
        {...rest}
      />
      {clearable && internalValue && (
        <button
          type="button"
          className="search-input__clear"
          onClick={handleClear}
          aria-label="Clear search"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}

export default SearchInput

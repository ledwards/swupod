// @ts-nocheck
'use client'

import { useState, useRef, useEffect } from 'react'
import type { KeyboardEvent, ChangeEvent } from 'react'
import './EditableTitle.css'

export interface EditableTitleProps {
  value?: string | null
  onSave?: (value: string | null) => void
  onTitleClick?: () => void
  isEditable?: boolean
  placeholder?: string
  className?: string
  maxLength?: number
}

export default function EditableTitle({
  value,
  onSave,
  onTitleClick,
  isEditable = false,
  placeholder = 'Untitled',
  className = '',
  maxLength = 80,
}: EditableTitleProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(value || '')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setEditValue(value || '')
  }, [value])

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleStartEdit = () => {
    if (!isEditable) return
    setEditValue(value || '')
    setIsEditing(true)
  }

  const handleSave = () => {
    const trimmedValue = editValue.trim()
    if (maxLength && trimmedValue.length > maxLength) {
      setError(`Name must be ${maxLength} characters or less`)
      return
    }
    setError(null)
    setIsEditing(false)
    if (trimmedValue !== value && onSave) {
      onSave(trimmedValue || null)
    }
  }

  const handleCancel = () => {
    setIsEditing(false)
    setEditValue(value || '')
    setError(null)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleCancel()
    }
  }

  if (isEditing) {
    const isOverLimit = maxLength && editValue.trim().length > maxLength
    return (
      <div className={`editable-title editing ${className}`}>
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            setEditValue(e.target.value)
            if (error) setError(null)
          }}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`editable-title-input ${isOverLimit ? 'over-limit' : ''}`}
        />
        {(error || isOverLimit) && (
          <span className="editable-title-error">
            {error || `${editValue.trim().length}/${maxLength}`}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className={`editable-title ${isEditable ? 'hoverable' : ''} ${className}`}>
      <span
        className={`editable-title-text ${onTitleClick ? 'clickable' : ''}`}
        onClick={onTitleClick || (isEditable ? handleStartEdit : undefined)}
        style={(onTitleClick || isEditable) ? { cursor: 'pointer' } : undefined}
      >
        {value || placeholder}
      </span>
      {isEditable && (
        <button
          className="editable-title-edit-button"
          onClick={handleStartEdit}
          aria-label="Edit title"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </button>
      )}
    </div>
  )
}

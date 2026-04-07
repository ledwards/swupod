// @ts-nocheck
'use client'

import { useState, useEffect } from 'react'
import Button from './Button'
import './ReleaseNotes.css'
import { parseMarkdownToHTML } from '../utils/markdown'

function ReleaseNotes() {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    // Add cache-busting query parameter to always fetch fresh content
    fetch(`/RELEASE_NOTES.md?v=${Date.now()}`)
      .then(response => response.text())
      .then(text => {
        // Remove "How to Update Release Notes" section and the HR above it
        const howToIndex = text.indexOf('## How to Update Release Notes')
        let contentToDisplay = howToIndex !== -1 ? text.substring(0, howToIndex).replace(/\n---\s*\n*$/, '') : text
        // Remove leading whitespace/newlines
        contentToDisplay = contentToDisplay.trimStart()
        const html = parseMarkdownToHTML(contentToDisplay)
        setContent(html)
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to load release notes:', err)
        setLoading(false)
      })
  }, [])

  if (!isVisible) {
    return null
  }

  if (loading) {
    return (
      <div className="release-notes">
        <div className="release-notes-header">
          <h2>📝 Release Notes</h2>
          <Button
            variant="icon"
            size="sm"
            className="release-notes-close"
            onClick={() => setIsVisible(false)}
            aria-label="Close release notes"
          >
            ×
          </Button>
        </div>
        <div className="release-notes-content">
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="release-notes">
      <div className="release-notes-header">
        <h2>📝 Release Notes</h2>
        <Button
          variant="icon"
          size="sm"
          className="release-notes-close"
          onClick={() => setIsVisible(false)}
          aria-label="Close release notes"
        >
          ×
        </Button>
      </div>
      <div
        className="release-notes-content"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    </div>
  )
}

export default ReleaseNotes

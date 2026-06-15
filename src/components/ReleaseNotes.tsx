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
      .then(response => {
        // public/RELEASE_NOTES.md is generated at build time, so it can be
        // missing in local dev. Without this guard, response.text() returns the
        // 404/500 error page HTML and it gets rendered as the notes. Hide the
        // panel quietly rather than throwing (a throw trips the dev error overlay).
        if (!response.ok) {
          setIsVisible(false)
          setLoading(false)
          return null
        }
        return response.text()
      })
      .then(text => {
        if (text === null) return
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
        // Network failure — hide the panel. Use console.warn (not error) so a
        // non-critical fetch doesn't trip the dev error overlay.
        console.warn('Release notes failed to load:', err)
        setIsVisible(false)
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

'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import Button from './Button'
import './ReleaseNotes.css'
import { parseMarkdownToHTML } from '../utils/markdown'

const DISMISSED_COOKIE = 'ptp_release_notes_dismissed'

function ReleaseNotes() {
  const [content, setContent] = useState('')
  const [version, setVersion] = useState('')
  const [isVisible, setIsVisible] = useState(false)
  const [manuallyOpened, setManuallyOpened] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    // Add cache-busting query parameter to always fetch fresh content
    fetch(`/RELEASE_NOTES.md?v=${Date.now()}`, { signal: controller.signal })
      .then(response => {
        // public/RELEASE_NOTES.md is generated at build time, so it can be
        // missing in local dev. Without this guard, response.text() returns the
        // 404/500 error page HTML and it gets rendered as the notes. Hide the
        // panel quietly rather than throwing (a throw trips the dev error overlay).
        if (!response.ok) {
          setIsVisible(false)
          return null
        }
        return response.text()
      })
      .then(async text => {
        if (text === null) return
        // Remove "How to Update Release Notes" section and the HR above it
        const howToIndex = text.indexOf('## How to Update Release Notes')
        let contentToDisplay = howToIndex !== -1 ? text.substring(0, howToIndex).replace(/\n---\s*\n*$/, '') : text
        // Remove leading whitespace/newlines
        contentToDisplay = contentToDisplay.trimStart()
        // Hash the newest entry, including its body: additions to the same day's
        // notes should reopen the panel too. Changes to old entries should not.
        const latestEntry = contentToDisplay.split(/^## /m)[1] ?? contentToDisplay
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(latestEntry))
        if (controller.signal.aborted) return
        const currentVersion = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
        const dismissedVersion = document.cookie.split('; ').find(cookie => cookie.startsWith(`${DISMISSED_COOKIE}=`))?.slice(DISMISSED_COOKIE.length + 1)
        setVersion(currentVersion)
        setIsVisible(dismissedVersion !== currentVersion)
        const html = parseMarkdownToHTML(contentToDisplay)
        setContent(html)
      })
      .catch(err => {
        if (controller.signal.aborted) return
        // Network failure — hide the panel. Use console.warn (not error) so a
        // non-critical fetch doesn't trip the dev error overlay.
        console.warn('Release notes failed to load:', err)
        setIsVisible(false)
      })
    return () => controller.abort()
  }, [])

  if (!content) {
    return null
  }

  function dismiss() {
    document.cookie = `${DISMISSED_COOKIE}=${version}; Path=/; Max-Age=34560000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
    setIsVisible(false)
    setManuallyOpened(false)
  }

  return (
    <>
      <Button
        variant="icon"
        size="sm"
        className={`release-notes-footer-button ${isVisible ? 'release-notes-footer-button-open' : ''}`}
        aria-label="Open release notes"
        title="Release Notes"
        onClick={() => { setIsVisible(true); setManuallyOpened(true) }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M7 7h4v4H7zM14 7h3M14 11h3M7 15h10M7 18h10" />
        </svg>
      </Button>
      {isVisible && createPortal(<div className={`release-notes ${manuallyOpened ? 'release-notes-manual' : ''}`}>
      <div className="release-notes-header">
        <h2>📝 Release Notes</h2>
        <Button
          variant="icon"
          size="sm"
          className="release-notes-close"
          onClick={dismiss}
          aria-label="Close release notes"
        >
          ×
        </Button>
      </div>
      <div
        className="release-notes-content"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    </div>, document.body)}
    </>
  )
}

export default ReleaseNotes

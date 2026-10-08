'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import Button from './Button'
import './ReleaseNotes.css'
import { parseMarkdownToHTML } from '../utils/markdown'

import {releaseItems, readState, latestReadState, unreadCount, type ReleaseReadState} from '../utils/releaseNotesReadState'

const READ_COOKIE = 'ptp_release_notes_read_v1'
function saveReadState(state: ReleaseReadState) {
  document.cookie = `${READ_COOKIE}=${encodeURIComponent(JSON.stringify(state))}; Path=/; Max-Age=34560000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
}

function ReleaseNotes() {
  const [content, setContent] = useState('')
  const [latest, setLatest] = useState<ReleaseReadState | null>(null)
  const [unread, setUnread] = useState(0)
  const [isVisible, setIsVisible] = useState(false)

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
        const items = await releaseItems(contentToDisplay)
        if (controller.signal.aborted) return
        const baseline = latestReadState(items)
        const saved = readState(document.cookie.split('; ').find(cookie => cookie.startsWith(`${READ_COOKIE}=`))?.slice(READ_COOKIE.length + 1))
        setLatest(baseline)
        if (!saved) saveReadState(baseline)
        setUnread(saved ? unreadCount(items, saved) : 0)
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
    setIsVisible(false)
  }

  function open() {
    if (latest) saveReadState(latest)
    setUnread(0)
    setIsVisible(true)
  }

  return (
    createPortal(<>
      <Button
        variant="icon"
        size="sm"
        className="release-notes-launcher"
        aria-label={unread ? `Open release notes, ${unread} unread` : "Open release notes"}
        aria-expanded={isVisible}
        title="Release Notes"
        onClick={isVisible ? dismiss : open}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="M13 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8M7 8h4M7 12h2M7 16h6M14 13l-1 4 4-1 6-6-3-3zM18 9l3 3" />
        </svg>
        {unread > 0 && <span className="release-notes-unread" aria-hidden="true">{unread}</span>}
      </Button>
      {isVisible && <div className="release-notes" role="region" aria-label="Release notes">
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
    </div>}
    </>, document.body)
  )
}

export default ReleaseNotes

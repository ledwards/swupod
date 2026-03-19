// @ts-nocheck
'use client'

import { useState, useEffect } from 'react'
import Button from './Button'
import { normalizeReleaseNotesContent } from './releaseNotesContent'
import './ReleaseNotes.css'

function ReleaseNotes() {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [isVisible, setIsVisible] = useState(true)

  const parseMarkdownToHTML = (markdown: string): string => {
    let html = markdown

    // Headers
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>')
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>')
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>')

    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')

    // Code blocks
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>')

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')

    // Lists
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>')
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')

    // Horizontal rules
    html = html.replace(/^---$/gm, '<hr />')

    // Paragraphs
    html = html.split('\n').map(line => {
      if (line.trim() && !line.match(/^<[^>]+>/) && !line.match(/<\/[^>]+>$/)) {
        return `<p>${line}</p>`
      }
      return line
    }).join('\n')

    return html
  }

  useEffect(() => {
    // Add cache-busting query parameter to always fetch fresh content
    fetch(`/RELEASE_NOTES.md?v=${Date.now()}`)
      .then(response => response.text())
      .then(text => {
        // Remove "How to Update Release Notes" section and the HR above it
        const howToIndex = text.indexOf('## How to Update Release Notes')
        let contentToDisplay = howToIndex !== -1 ? text.substring(0, howToIndex).replace(/\n---\s*\n*$/, '') : text
        // Remove leading whitespace/newlines
        contentToDisplay = normalizeReleaseNotesContent(contentToDisplay.trimStart())
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

'use client'

import { useEffect, useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import Button from '@/src/components/Button'
import Modal from '@/src/components/Modal'
import ContentSkeleton from '@/src/components/ContentSkeleton'
import { DownloadIcon } from '@/src/components/DraftLog/icons'
import type { ShowcaseCardData, ShowcaseLeader } from './showcaseTable'

/**
 * Export as Image: renders the sorted collection off-screen, captures it as a
 * PNG, and shows it in a dialog with Download. Opens when `open` turns true.
 */
export default function ShowcaseExport({ open, onClose, title, username, sorted, cards }: {
  open: boolean
  onClose: () => void
  title: string
  username: string
  sorted: ShowcaseLeader[]
  cards: Record<string, ShowcaseCardData>
}) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    let made: string | null = null
    setFailed(false)
    // Let the off-screen sheet paint (and its images start) before capturing it.
    const timer = window.setTimeout(async () => {
      try {
        const canvas = await html2canvas(sheetRef.current!, { backgroundColor: null, scale: 2, useCORS: true, allowTaint: true })
        canvas.toBlob(blob => {
          if (!blob || cancelled) return
          made = URL.createObjectURL(blob)
          setUrl(made)
        }, 'image/png')
      } catch (error) {
        console.error('Export failed:', error)
        if (!cancelled) setFailed(true)
      }
    }, 100)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      if (made) URL.revokeObjectURL(made)
      setUrl(null)
    }
  }, [open])

  const download = () => {
    if (!url) return
    const link = document.createElement('a')
    link.download = 'showcase-collection.png'
    link.href = url
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <>
      {open && !url && (
        <div className="scx-sheet" ref={sheetRef} aria-hidden="true">
          <div className="scx-sheet-title">{username} {title}</div>
          <div className="scx-sheet-grid">
            {sorted.map(s => <img key={s.id} src={cards[s.cardId]?.imageUrl || undefined} alt="" crossOrigin="anonymous" />)}
          </div>
          <div className="scx-sheet-url">protectthepod.com</div>
        </div>
      )}
      <Modal isOpen={open} onClose={onClose} title={title} className="scx-dialog">
        <Modal.Body>
          {url
            ? <img className="scx-preview" src={url} alt={title} />
            : failed
              ? <p className="scx-error" role="alert">The image couldn&apos;t be made. Close this and try again.</p>
              : <div role="status" aria-label="Making the image"><ContentSkeleton kind="card" /></div>}
        </Modal.Body>
        <Modal.Actions>
          <Button variant="primary" onClick={download} disabled={!url}><DownloadIcon />Download</Button>
        </Modal.Actions>
      </Modal>
    </>
  )
}

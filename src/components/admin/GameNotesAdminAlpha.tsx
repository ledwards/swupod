'use client'

/**
 * /admin/game-notes for alpha viewers. Same data flow as GameNotesAdmin:
 * GET /api/admin/game-notes (cursor-paged, newest first), and on selection
 * GET ?id= for the saved moment and completed replay. Download Record is the
 * one primary, once a record is in hand.
 */
import { useEffect, useRef, useState } from 'react'
import Button from '@/src/components/Button'
import ContentSkeleton from '@/src/components/ContentSkeleton'
import ThemedPage, { ThemedPanel } from '@/src/components/ThemedPage/ThemedPage'
import { DownloadIcon } from '@/src/components/DraftLog/icons'
import { CheckIcon } from '@/src/components/PodHub/icons'
import './admin-alpha.css'

type Note = { id: string; match_id: string; step: number; seat: number; note: string; engine_revision: string; created_at: string }
type Bundle = { note: Note; record: unknown; recordHash: string | null }

export default function GameNotesAdminAlpha() {
  const [notes, setNotes] = useState<Note[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [pending, setPending] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Note | null>(null)
  const [bundle, setBundle] = useState<Bundle | null>(null)
  const [detailError, setDetailError] = useState('')
  const busy = useRef(false)

  async function fetchNotes(after: string | null = null) {
    if (busy.current) return
    busy.current = true
    setPending(true)
    setError('')
    try {
      const response = await fetch('/api/admin/game-notes' + (after ? '?cursor=' + encodeURIComponent(after) : ''))
      if (!response.ok) throw Error()
      const data = await response.json()
      setNotes((old) => (after ? [...new Map([...old, ...data.notes].map((n: Note) => [n.id, n])).values()] : data.notes))
      setCursor(data.nextCursor)
    } catch {
      setError('Could not fetch notes. Try again.')
    } finally {
      setPending(false)
      busy.current = false
    }
  }

  useEffect(() => {
    void fetchNotes()
  }, [])

  useEffect(() => {
    if (!selected) return
    const abort = new AbortController()
    setBundle(null)
    setDetailError('')
    void fetch('/api/admin/game-notes?id=' + selected.id, { signal: abort.signal })
      .then(async (r) => {
        if (!r.ok) throw Error()
        return r.json()
      })
      .then((data) => setBundle(data))
      .catch(() => {
        if (!abort.signal.aborted) setDetailError('Could not fetch the game record. Select the note to try again.')
      })
    return () => abort.abort()
  }, [selected])

  return (
    <ThemedPage title="Game Notes" subtitle="Notes players left on moments in online games">
      <div className="adma-notes-bar">
        <p className="tpage-muted">Newest first. Select a note to fetch its game record.</p>
        <Button size="sm" disabled={pending} onClick={() => void fetchNotes()}>Refresh</Button>
      </div>
      {error && <p className="tpage-raised tpage-status tpage-status--danger" role="alert">{error}</p>}

      <div className="adma-notes-layout">
        <ThemedPanel label={`Player Notes (${notes.length})`} aria-label="Player Notes" aria-busy={pending}>
          {pending && !notes.length ? (
            <ContentSkeleton kind="row" count={4} />
          ) : !notes.length ? (
            <p className="tpage-muted">No notes yet.</p>
          ) : (
            <div className="adma-notes-list">
              {notes.map((note) => (
                <Button
                  key={note.id}
                  variant="toggle"
                  className="adma-note-item"
                  active={selected?.id === note.id}
                  aria-pressed={selected?.id === note.id}
                  onClick={() => setSelected({ ...note })}
                >
                  <span>{note.note}</span>
                  <small>Step {note.step} · {new Date(note.created_at).toLocaleString()}</small>
                </Button>
              ))}
              {cursor && (
                <Button size="sm" disabled={pending} onClick={() => void fetchNotes(cursor)}>More Notes</Button>
              )}
            </div>
          )}
        </ThemedPanel>

        <ThemedPanel label={selected ? `Step ${selected.step}` : 'Selected Note'} aria-label="Selected Note">
          {selected ? (
            <>
              <p className="adma-note-body tpage-raised">{selected.note}</p>
              <dl className="adma-note-dl">
                <dt>Game</dt><dd>{selected.match_id}</dd>
                <dt>Seat</dt><dd>{selected.seat + 1}</dd>
                <dt>Engine</dt><dd>{selected.engine_revision}</dd>
                <dt>Added</dt><dd>{new Date(selected.created_at).toLocaleString()}</dd>
              </dl>
              <hr className="tpage-divider" />
              {detailError ? (
                <p className="tpage-status tpage-status--danger" role="alert">{detailError}</p>
              ) : !bundle ? (
                <ContentSkeleton kind="control" />
              ) : (
                <>
                  {bundle.record ? (
                    <p className="tpage-status tpage-status--success"><CheckIcon /><span>Completed replay and saved moment available.</span></p>
                  ) : (
                    <p className="tpage-muted">Saved moment available. Completed replay not yet archived.</p>
                  )}
                  <div className="adma-note-actions">
                    <a
                      className="btn btn--primary btn--md"
                      href={'/api/admin/game-notes?id=' + selected.id}
                      download={'game-note-' + selected.id + '.json'}
                    >
                      <DownloadIcon />
                      <span>Download Record</span>
                    </a>
                  </div>
                </>
              )}
            </>
          ) : (
            <p className="tpage-muted">Select a note.</p>
          )}
        </ThemedPanel>
      </div>
    </ThemedPage>
  )
}

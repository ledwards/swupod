'use client'
import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import '@/src/components/PodHub/pod-hub.css'

/**
 * Opened in a new tab by Play ↗ / Watch ↗ on the pod page (a plain link, so no
 * popup blocker). Asks for a one-use launch URL and goes straight to the table.
 */
export default function PodTableLaunch({ params }: { params: Promise<{ shareId: string; matchId: string }> }) {
  const { shareId, matchId } = use(params)
  const [error, setError] = useState('')
  const [watch, setWatch] = useState<boolean | null>(null)
  useEffect(() => {
    const watching = new URLSearchParams(location.search).get('watch') === '1'
    setWatch(watching)
    let live = true
    void fetch(`/api/draft/${encodeURIComponent(shareId)}/tournament/match/${encodeURIComponent(matchId)}/${watching ? 'watch' : 'play'}`, { method: 'POST', credentials: 'include' })
      .then(async response => {
        const body = await response.json().catch(() => null)
        if (!live) return
        if (response.ok && typeof body?.launchUrl === 'string') location.replace(body.launchUrl)
        else setError(body?.error ?? 'The table could not open.')
      })
      .catch(() => { if (live) setError('The table could not open.') })
    return () => { live = false }
  }, [shareId, matchId])
  return <section className="pod-hub pod-hub--empty" aria-label="Table">
    <h1>{watch ? 'Watch' : 'Play'}</h1>
    {error ? <><p role="alert">{error}</p><Link className="pod-sec" href={`/draft/${shareId}/pod`}>Back to the pod</Link></> : <p aria-live="polite">Opening the table…</p>}
  </section>
}

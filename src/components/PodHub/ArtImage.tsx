'use client'
import { useEffect, useRef, useState, type CSSProperties } from 'react'

/**
 * One card scan, the same rules as the Play page's ArtImage (play-home/home/bits.tsx): shown whenever the
 * browser has it, whichever came first, the load or React's listener; a failed load tries the backup copy once,
 * then hides the broken image; while hidden, the browser coming back online or the tab returning fetches the
 * official copy again. `eager` loads at once for art above the fold.
 */
export default function ArtImage({ src, backup, eager = false, style, className }: { src: string; backup?: string | null | undefined; eager?: boolean; style?: CSSProperties | undefined; className?: string | undefined }) {
  const ref = useRef<HTMLImageElement>(null)
  const [current, setCurrent] = useState(src)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const broke = () => { if (backup && current !== backup) setCurrent(backup); else setFailed(true) }
  // The scan may have settled before React listened: read the element's own state on mount.
  useEffect(() => { const image = ref.current; if (!image || !image.complete) return; if (image.naturalWidth > 0) setFailed(false); else broke() }, [current, retry]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!failed) return
    const again = () => { if (document.visibilityState === 'hidden') return; setFailed(false); setCurrent(src); setRetry(n => n + 1) }
    addEventListener('online', again); document.addEventListener('visibilitychange', again)
    return () => { removeEventListener('online', again); document.removeEventListener('visibilitychange', again) }
  }, [failed, src])
  // A new element per attempt, so the browser fetches again instead of reusing the failed load.
  return <img key={`${current}#${retry}`} ref={ref} src={current} alt="" className={className} loading={eager ? 'eager' : 'lazy'} decoding="async" style={failed ? { ...style, visibility: 'hidden' } : style} onLoad={() => setFailed(false)} onError={broke}/>
}

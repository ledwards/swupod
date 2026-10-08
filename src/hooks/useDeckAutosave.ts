import { useCallback, useEffect, useMemo, useRef } from 'react'
import { createDeckSaveQueue } from '../utils/deckSaveQueue'
import { updatePool } from '../utils/poolApi'

export function useDeckAutosave(shareId: string | null | undefined, rootShareId?: string | null) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const queue = useMemo(() => createDeckSaveQueue(async state => {
    if (!shareId) throw new Error('The deck has not loaded yet.')
    await updatePool(shareId, { deckBuilderState: state })
    window.dispatchEvent(new CustomEvent('wf:builds-changed', {
      detail: { rootShareId: rootShareId || shareId },
    }))
  }), [shareId, rootShareId])

  const schedule = useCallback((state: Record<string, unknown>) => {
    queue.set(state)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      void queue.flush().catch(error => console.error('Failed to save deck builder state:', error))
    }, 2000)
  }, [queue])

  const saveNow = useCallback(async (state: Record<string, unknown>) => {
    if (timer.current) clearTimeout(timer.current)
    queue.set(state)
    await queue.flush()
  }, [queue])

  useEffect(() => {
    const unload = () => {
      const state = queue.pending()
      if (shareId && state) navigator.sendBeacon('/api/pools/save-state', JSON.stringify({ shareId, deckBuilderState: state }))
    }
    window.addEventListener('beforeunload', unload)
    return () => {
      window.removeEventListener('beforeunload', unload)
      if (timer.current) clearTimeout(timer.current)
      void queue.flush().catch(() => {})
    }
  }, [queue, shareId])

  return { schedule, saveNow }
}

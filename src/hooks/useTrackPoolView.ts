// @ts-nocheck
import { useEffect } from 'react'

// Records a pool visit in the user's history (only for authenticated non-owners).
// Server enforces: silently skips on unauthenticated requests, on missing pools,
// and on the pool's own owner.
export function useTrackPoolView(shareId: string | null | undefined) {
  useEffect(() => {
    if (!shareId) return
    fetch(`/api/pools/${shareId}/view`, {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {})
  }, [shareId])
}

/** Only Play-origin drafts return to Play. Other draft entry points keep the deck builder. */
export function draftCompletionPath(search: string, poolShareId: string): string {
  const fallback = `/pools/${encodeURIComponent(poolShareId)}`
  const returnTo = new URLSearchParams(search).get('returnTo')
  if (!returnTo?.startsWith('/play?')) return fallback
  const target = new URL(returnTo, 'https://ptp.invalid')
  if (target.origin !== 'https://ptp.invalid' || target.pathname !== '/play') return fallback
  target.searchParams.set('draftedPool', poolShareId)
  return target.pathname + target.search
}

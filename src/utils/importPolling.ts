/** Poll short, authenticated requests while extraction runs outside the HTTP lifecycle. */
export async function awaitImportResult(
  initial: Response,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
  wait: (ms: number) => Promise<void> = ms => new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, ms)
    signal.addEventListener('abort', abort, { once: true })
  }),
): Promise<Response> {
  if (initial.status !== 202) return initial
  const payload = await initial.json()
  const jobId = payload.data?.jobId
  if (typeof jobId !== 'string' || !/^[0-9a-f-]{36}$/i.test(jobId)) throw new Error('Invalid import job response')
  const deadline = Date.now() + 40 * 60 * 1000
  let failures = 0
  while (Date.now() < deadline) {
    signal.throwIfAborted()
    await wait(3000)
    signal.throwIfAborted()
    try {
      const response = await fetcher(`/api/import/jobs/${jobId}`, {
        credentials: 'include', cache: 'no-store',
        signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
      })
      // A deploy or temporary upstream failure must not discard the durable job.
      if (response.status >= 500) {
        const body = await response.clone().json().catch(() => null)
        if (!body?.data?.code) throw new Error('Import status temporarily unavailable')
      }
      failures = 0
      if (response.status !== 202) return response
    } catch (error) {
      signal.throwIfAborted()
      if (++failures >= 5) throw error
    }
  }
  throw new Error('Import is still running. Retry to reconnect to the current import.')
}

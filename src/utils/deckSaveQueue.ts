type DeckState = Record<string, unknown>

/** One upload at a time. Edits during an upload replace the queued snapshot. */
export function createDeckSaveQueue(save: (state: DeckState) => Promise<unknown>) {
  let latest: string | null = null
  let saved: string | null = null
  let flight: Promise<void> | null = null

  const flush = (): Promise<void> => {
    if (flight) return flight
    if (latest === null || latest === saved) return Promise.resolve()
    flight = (async () => {
      while (latest !== null && latest !== saved) {
        const snapshot = latest
        // A lost response can hide a committed write. Until acknowledged,
        // even a revert to the previously saved state must remain retryable.
        saved = null
        await save(JSON.parse(snapshot) as DeckState)
        saved = snapshot
      }
    })().finally(() => { flight = null })
    return flight
  }

  return {
    set(state: DeckState) { latest = JSON.stringify(state) },
    flush,
    pending(): DeckState | null {
      return latest !== null && latest !== saved ? JSON.parse(latest) as DeckState : null
    },
  }
}

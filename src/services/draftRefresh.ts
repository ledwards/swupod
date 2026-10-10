/** One full draft read at a time. Broadcast bursts share the next read.
 * A refresh requested during a read must not reuse that older snapshot: it
 * may follow a selection mutation that the in-flight request cannot see.
 */
export function createDraftRefresh<T>(load: () => Promise<T>): () => Promise<T> {
  type Waiter = { resolve: (value: T) => void; reject: (error: unknown) => void }
  let running = false
  let queued: Waiter[] = []

  async function read(waiters: Waiter[]) {
    try {
      const value = await load()
      for (const waiter of waiters) waiter.resolve(value)
    } catch (error) {
      for (const waiter of waiters) waiter.reject(error)
    } finally {
      const next = queued
      queued = []
      if (next.length) void read(next)
      else running = false
    }
  }

  return () => new Promise<T>((resolve, reject) => {
    const waiter = { resolve, reject }
    if (running) queued.push(waiter)
    else {
      running = true
      void read([waiter])
    }
  })
}

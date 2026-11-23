/**
 * Tracks when each draft pod last had bot activity, and which bots belong to it,
 * so per-pod in-memory bot state can be dropped once a pod goes idle.
 *
 * Without this, bot behaviors and per-pod caches lived for the life of the
 * process: one entry per bot draft ever run since the last deploy.
 *
 * Evicting an idle pod is safe: a bot's strategy, mixin and commitments are
 * persisted on pod_players and rebuilt from there, which is also what happens
 * after every deploy or restart.
 */
export class PodActivity {
  private pods = new Map<string, { at: number; botIds: Set<string> }>()
  private lastSweep = 0

  constructor(
    private readonly idleMs: number,
    private readonly onEvict: (podId: string, botIds: Set<string>) => void,
    private readonly sweepEveryMs = 60_000
  ) {}

  touch(podId: string, botId: string | undefined, now: number): void {
    let entry = this.pods.get(podId)
    if (!entry) {
      entry = { at: now, botIds: new Set() }
      this.pods.set(podId, entry)
    }
    entry.at = now
    if (botId) entry.botIds.add(botId)
    if (now - this.lastSweep >= this.sweepEveryMs) this.sweep(now)
  }

  /** Evict every pod idle for at least idleMs. Returns how many were evicted. */
  sweep(now: number): number {
    this.lastSweep = now
    let evicted = 0
    for (const [podId, entry] of this.pods) {
      if (now - entry.at >= this.idleMs) {
        this.pods.delete(podId)
        this.onEvict(podId, entry.botIds)
        evicted++
      }
    }
    return evicted
  }

  clear(): void {
    this.pods.clear()
  }

  get size(): number {
    return this.pods.size
  }
}

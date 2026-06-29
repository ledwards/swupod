export interface TimerRemainingOptions {
  totalSeconds: number
  startedAt?: string | null
  pausedDurationSeconds?: number
  serverTimeOffsetMs?: number
  nowMs?: number
}

export function estimateServerTimeOffsetMs(
  serverNow: string | number | Date | null | undefined,
  clientReferenceAtMs: number = Date.now(),
): number {
  const serverNowMs = timestampMs(serverNow)
  if (serverNowMs === null || !Number.isFinite(clientReferenceAtMs)) return 0
  return serverNowMs - clientReferenceAtMs
}

export function serverSyncedNowMs(
  serverTimeOffsetMs: number = 0,
  clientNowMs: number = Date.now(),
): number {
  return clientNowMs + safeOffset(serverTimeOffsetMs)
}

export function elapsedTimerSeconds({
  startedAt,
  pausedDurationSeconds = 0,
  serverTimeOffsetMs = 0,
  nowMs = Date.now(),
}: Omit<TimerRemainingOptions, 'totalSeconds'>): number {
  const startedAtMs = timestampMs(startedAt)
  if (startedAtMs === null) return 0

  const elapsedBeforePause = Math.floor(
    (serverSyncedNowMs(serverTimeOffsetMs, nowMs) - startedAtMs) / 1000,
  )
  if (elapsedBeforePause <= 0) return 0

  // If the pause value is stale from a previous pick, preserve the existing
  // behavior and ignore it rather than producing a negative elapsed value.
  const effectivePausedDuration = pausedDurationSeconds > elapsedBeforePause
    ? 0
    : Math.max(0, pausedDurationSeconds)

  return Math.max(0, elapsedBeforePause - effectivePausedDuration)
}

export function remainingTimerSeconds({
  totalSeconds,
  startedAt,
  pausedDurationSeconds = 0,
  serverTimeOffsetMs = 0,
  nowMs = Date.now(),
}: TimerRemainingOptions): number {
  if (!startedAt) return totalSeconds
  const elapsed = elapsedTimerSeconds({
    startedAt,
    pausedDurationSeconds,
    serverTimeOffsetMs,
    nowMs,
  })
  return Math.max(0, totalSeconds - elapsed)
}

function timestampMs(value: string | number | Date | null | undefined): number | null {
  if (value instanceof Date) {
    const ms = value.getTime()
    return Number.isFinite(ms) ? ms : null
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === 'string' && value.trim()) {
    const ms = new Date(value).getTime()
    return Number.isFinite(ms) ? ms : null
  }
  return null
}

function safeOffset(value: number): number {
  return Number.isFinite(value) ? value : 0
}

export interface SharedPoolPlayOptions {
  isInfiniteMode?: boolean
  isOwner?: boolean
  shareId?: string | null
  draftShareId?: string | null
}

export function shouldCloneSharedPoolForPlay({
  isInfiniteMode = false,
  isOwner = false,
  shareId = null,
  draftShareId = null,
}: SharedPoolPlayOptions): boolean {
  return Boolean(!isInfiniteMode && !isOwner && shareId && !draftShareId)
}

export function getClonePoolName(poolName?: string | null): string | null {
  return poolName ? `${poolName} (Copy)` : null
}

export function getClonedDeckBuilderState(currentState: unknown, fallbackState: unknown): unknown {
  if (!currentState || typeof currentState !== 'object') {
    return fallbackState
  }

  const state = currentState as Record<string, unknown>
  const hasDeckState =
    'cardPositions' in state ||
    'activeLeader' in state ||
    'activeBase' in state ||
    'poolName' in state

  return hasDeckState ? currentState : fallbackState
}

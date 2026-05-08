export interface SharedPoolPlayOptions {
  isInfiniteMode?: boolean
  isOwner?: boolean
  shareId?: string | null
  draftShareId?: string | null
}

export function shouldBuildFromSharedPool({
  isInfiniteMode = false,
  isOwner = false,
  shareId = null,
  draftShareId = null,
}: SharedPoolPlayOptions): boolean {
  return Boolean(!isInfiniteMode && !isOwner && shareId && !draftShareId)
}

export function getBuildName(parentName: string | null | undefined, displayName: string | null | undefined): string | null {
  if (!parentName) return null
  return displayName ? `${parentName} – ${displayName}'s Build` : `${parentName} (Build)`
}

export function getBuildDeckBuilderState(currentState: unknown, fallbackState: unknown): unknown {
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

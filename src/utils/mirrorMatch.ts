export function normalizeMirrorLeaderName(value: unknown): string | null {
  if (value == null) return null
  const normalized = String(value).trim().toLowerCase().replace(/\s+/g, ' ')
  return normalized || null
}

export function isLeaderMirrorMatch(playerLeader: unknown, opponentLeader: unknown): boolean {
  const player = normalizeMirrorLeaderName(playerLeader)
  const opponent = normalizeMirrorLeaderName(opponentLeader)
  return Boolean(player && opponent && player === opponent)
}

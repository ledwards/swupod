// Display-name helpers for pools/pods.
// Chaos drafts/sealed have a comma-separated setCode (e.g. "SOR,JTL,LOF"),
// which should render as "Chaos Draft" / "Chaos Sealed" rather than the raw
// concatenated set codes.

function isChaosSetCode(setCode: string | null | undefined): boolean {
  return typeof setCode === 'string' && setCode.includes(',')
}

export function formatPoolLabel(
  setCode: string | null | undefined,
  poolType: 'draft' | 'sealed'
): string {
  const kind = poolType === 'draft' ? 'Draft' : 'Sealed'
  if (!setCode) return kind
  if (isChaosSetCode(setCode)) return `Chaos ${kind}`
  return `${setCode} ${kind}`
}

/**
 * A display name that is always POOL-shaped. A pool is not a game, so it must
 * never read like a match ("SEC LAW Draft vs Teddy"). Uses the stored name only
 * if it looks like a real pool name; if it reads like a matchup (contains
 * "vs"), falls back to the clean "{set} {Format}" label.
 */
export function cleanPoolName(
  name: string | null | undefined,
  setCode: string | null | undefined,
  poolType: 'draft' | 'sealed'
): string {
  const trimmed = (name || '').trim()
  if (trimmed && !/\bvs\.?\b/i.test(trimmed)) return trimmed
  return formatPoolLabel(setCode, poolType)
}

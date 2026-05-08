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

export const STANDARD_DRAFT_NEW_PATH = '/draft/new?competitive=0'
export const COMPETITIVE_DRAFT_NEW_PATH = '/draft/new?competitive=1'

export const STANDARD_SEALED_NEW_PATH = '/sealed/new?competitive=0'
export const COMPETITIVE_SEALED_NEW_PATH = '/sealed/new?competitive=1'

type SearchParamsLike = string | { get(name: string): string | null } | null | undefined

function competitiveParam(search: SearchParamsLike): string | null {
  if (!search) return null
  return typeof search === 'string'
    ? new URLSearchParams(search).get('competitive')
    : search.get('competitive')
}

export function initialDraftCompetitiveFromSearch(search: SearchParamsLike): boolean {
  return competitiveParam(search) !== '0'
}

// Sealed defaults the other way: direct /sealed/new stays a standard pod —
// only the explicit Competitive Sealed entry point (?competitive=1) opts in.
export function initialSealedCompetitiveFromSearch(search: SearchParamsLike): boolean {
  return competitiveParam(search) === '1'
}

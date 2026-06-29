export const STANDARD_DRAFT_NEW_PATH = '/draft/new?competitive=0'
export const COMPETITIVE_DRAFT_NEW_PATH = '/draft/new?competitive=1'

type SearchParamsLike = string | { get(name: string): string | null } | null | undefined

export function initialDraftCompetitiveFromSearch(search: SearchParamsLike): boolean {
  if (!search) return true

  const competitive = typeof search === 'string'
    ? new URLSearchParams(search).get('competitive')
    : search.get('competitive')

  return competitive !== '0'
}

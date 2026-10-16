/**
 * Alpha viewers use /other-formats/<sub>; everyone else keeps /formats/<sub>. These build the
 * redirect target with the incoming query intact. Local to the Chaos pages until the shared
 * lib/otherFormats.ts helper lands (then this file goes).
 */
export type SearchParams = Record<string, string | string[] | undefined>

export function withQuery(path: string, searchParams: SearchParams = {}): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    for (const v of [value ?? []].flat()) query.append(key, v)
  }
  const qs = query.toString()
  return qs ? `${path}?${qs}` : path
}

/** /formats/<sub> → /other-formats/<sub> (alpha), query kept. */
export const otherFormatsPath = (sub: string, searchParams?: SearchParams) =>
  withQuery(`/other-formats/${sub}`, searchParams)

/** /other-formats/<sub> → /formats/<sub> (everyone else), query kept. */
export const legacyFormatsPath = (sub: string, searchParams?: SearchParams) =>
  withQuery(`/formats/${sub}`, searchParams)

/**
 * The old live Chaos Draft page (/draft/chaos) was the with-other-players path, so alpha
 * viewers land on the merged setup with "With Other Players" chosen unless the link says otherwise.
 */
export const liveChaosDraftPath = (searchParams: SearchParams = {}) =>
  otherFormatsPath(
    'chaos-draft',
    searchParams['group'] === undefined ? { ...searchParams, group: 'friends' } : searchParams,
  )

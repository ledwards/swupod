/**
 * The alternate formats live at /other-formats for alpha viewers and at /formats
 * for everyone else. Each route's server page redirects the wrong audience:
 *
 *   // app/formats/<sub>/page.tsx
 *   if (await viewerHasAlphaAccess()) redirect(otherFormatsHref('<sub>', await searchParams))
 *   // app/other-formats/<sub>/page.tsx
 *   if (!(await viewerHasAlphaAccess())) redirect(legacyFormatsHref('<sub>', await searchParams))
 */

/** Next's `searchParams` record, as server pages receive it. */
export type FormatsSearchParams = Record<string, string | string[] | undefined>

export type FormatsQuery = URLSearchParams | FormatsSearchParams

const href = (base: string, sub = '', query?: FormatsQuery): string => {
  const path = sub.replace(/^\/+|\/+$/g, '')
  const q = query instanceof URLSearchParams ? new URLSearchParams(query) : new URLSearchParams()
  if (query && !(query instanceof URLSearchParams)) {
    for (const [key, value] of Object.entries(query)) for (const v of [value ?? []].flat()) q.append(key, v)
  }
  const s = q.toString()
  return `${base}${path ? `/${path}` : ''}${s ? `?${s}` : ''}`
}

/** `/other-formats[/sub][?query]`, the alpha home of an alternate format. */
export const otherFormatsHref = (sub?: string, query?: FormatsQuery): string => href('/other-formats', sub, query)

/** `/formats[/sub][?query]`, the page non-alpha viewers keep. */
export const legacyFormatsHref = (sub?: string, query?: FormatsQuery): string => href('/formats', sub, query)

/**
 * The old live Chaos Draft page (/draft/chaos) was the with-other-players path, so alpha viewers
 * land on the merged setup with "With Other Players" chosen unless the link says otherwise.
 */
export const liveChaosDraftHref = (query: FormatsSearchParams = {}): string =>
  otherFormatsHref('chaos-draft', query['group'] === undefined ? { ...query, group: 'friends' } : query)

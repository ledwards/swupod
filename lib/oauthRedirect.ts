/** Add an OAuth result without corrupting an existing query string or fragment. */
export function oauthRedirectUrl(appUrl: string, returnTo: string, key: 'auth' | 'error', value: string): string {
  const url = new URL(`${appUrl}${returnTo}`)
  url.searchParams.set(key, value)
  return url.toString()
}

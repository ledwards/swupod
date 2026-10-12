/**
 * Local development never touches a remote (production) database.
 *
 * On 2026-10-11 a local dev server ran migrations and wrote data to production because
 * the worktree's .env carried the production URL. Development now refuses any database
 * that is not on this machine unless PTP_ALLOW_REMOTE_DB=1 says so on purpose.
 */
export function isLocalDatabaseUrl(url: string): boolean {
  try {
    const u = new URL(url)
    const host = decodeURIComponent(u.hostname || u.searchParams.get('host') || '')
    return host === '' || host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1' || host.startsWith('/')
  } catch {
    // "postgresql://user@/db" (no host: the local socket) is not a valid URL to the WHATWG parser.
    return /^postgres(?:ql)?:\/\/(?:[^@/]*@)?\//.test(url)
  }
}

/** The error to raise in development for a remote database, or null when it is allowed. */
export function remoteDatabaseRefusal(url: string | undefined, env: Record<string, string | undefined> = process.env): string | null {
  if (!url || env['PTP_ALLOW_REMOTE_DB'] === '1' || isLocalDatabaseUrl(url)) return null
  let host = 'unknown host'
  try { host = new URL(url).hostname } catch { /* unparseable */ }
  return `Refusing to use a remote database (${host}) in development. Point DATABASE_URL/POSTGRES_URL at the local dev database, or set PTP_ALLOW_REMOTE_DB=1 deliberately.`
}

// @ts-nocheck
//
// Shared source/target resolution for prod -> dev copy scripts, so every script
// resolves connections and applies the same safety guard.
//
//   TARGET (dev, written to) = DATABASE_URL from .env.local — the SAME DB the
//     local Next dev server uses. Override with TARGET_DATABASE_URL.
//   SOURCE (prod, read from) = PROD_DATABASE_URL if set, else DATABASE_URL
//     from .env (your Railway/prod connection).
//
// The guard refuses to run when both sides resolve to the same host:port/db, so
// a mis-set env can never turn a copy into a write against prod.

import pg from 'pg'
import { parse } from 'dotenv'
import { readFileSync, existsSync } from 'fs'
import { resolve as resolvePath } from 'path'

const { Pool } = pg

/** Read one env file WITHOUT mutating process.env, so .env and .env.local resolve independently. */
export function readEnvFile(name: string): Record<string, string> {
  try {
    const p = resolvePath(process.cwd(), name)
    return existsSync(p) ? parse(readFileSync(p)) : {}
  } catch {
    return {}
  }
}

export function makePool(connectionString: string): pg.Pool {
  return new Pool({
    connectionString,
    ssl: connectionString?.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
  })
}

/** Normalise a connection string to host:port/db — never includes credentials. */
export function dbIdentity(url: string): string {
  try {
    const u = new URL(url)
    return `${u.hostname}:${u.port || '5432'}${u.pathname}`
  } catch {
    return url
  }
}

export interface Connections {
  sourceUrl: string
  targetUrl: string
}

/**
 * Resolve SOURCE (prod) and TARGET (dev) and exit with a clear message if
 * either is missing or if they are the same database.
 *
 * `requireSource: false` is for scripts that only inspect/repair the dev DB.
 */
export function resolveConnections(opts: { requireSource?: boolean } = {}): Connections {
  const requireSource = opts.requireSource !== false
  const envLocal = readEnvFile('.env.local')
  const envBase = readEnvFile('.env')

  const targetUrl =
    process.env.TARGET_DATABASE_URL ||
    envLocal.DATABASE_URL ||
    envLocal.POSTGRES_URL ||
    process.env.DATABASE_URL
  const sourceUrl =
    process.env.PROD_DATABASE_URL ||
    process.env.SOURCE_DATABASE_URL ||
    envBase.DATABASE_URL ||
    envBase.POSTGRES_URL

  if (!targetUrl) {
    console.error('Error: no target dev DB found. Put your local dev connection in .env.local (DATABASE_URL), or set TARGET_DATABASE_URL.')
    console.error('Note: git worktrees do not inherit .env / .env.local — run from the main checkout or symlink them in.')
    process.exit(1)
  }
  if (requireSource) {
    if (!sourceUrl) {
      console.error('Error: no source DB found. Set PROD_DATABASE_URL, or put your prod connection in .env (DATABASE_URL).')
      console.error('Note: git worktrees do not inherit .env / .env.local — run from the main checkout or symlink them in.')
      process.exit(1)
    }
    if (dbIdentity(sourceUrl) === dbIdentity(targetUrl)) {
      console.error(`Refusing to run: source and target are the SAME database (${dbIdentity(sourceUrl)}).`)
      console.error('SOURCE comes from .env (prod), TARGET from .env.local (dev) — they must differ.')
      process.exit(1)
    }
  }

  return { sourceUrl, targetUrl }
}

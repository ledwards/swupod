/**
 * SQL migration analysis for the migration runners.
 *
 * Why this exists: pg's simple-query protocol wraps a MULTI-statement query
 * string in one implicit transaction. That is exactly what we want for
 * ordinary migrations (atomic apply), but Postgres refuses to run certain
 * statements inside any transaction block — most notably
 * `CREATE INDEX CONCURRENTLY` (migration 044). Those files must be executed
 * statement-by-statement, each as its own single-statement query (its own
 * implicit transaction), so the runner needs two things:
 *
 *   1. `requiresNoTransaction(sql)` — detect files that cannot run inside a
 *      transaction block, either via the explicit first-class marker
 *      `-- migrate:no-transaction` or by recognizing the offending statements.
 *   2. `splitSqlStatements(sql)` — split a file into statements WITHOUT the
 *      naive split-on-';' that broke migration 062 (a natural-language ';'
 *      inside a comment). The tokenizer understands line comments, nested
 *      block comments, quoted strings/identifiers, and dollar-quoting.
 *
 * Consumed by scripts/run-single-migration.ts (deploy path) and
 * scripts/migrate.ts (manual path). Tested in lib/migrationSql.test.ts.
 */

/** Explicit opt-out marker: put this on its own comment line in a migration. */
export const NO_TRANSACTION_MARKER = 'migrate:no-transaction'

type TokenizerCallbacks = {
  /** Called for each character that is real SQL (not comment, not literal body). */
  onCode?: (ch: string, index: number) => void
  /** Called for top-level statement separators (';' outside any quote/comment). */
  onStatementEnd?: (index: number) => void
}

/**
 * Single tokenizer for Postgres SQL surface syntax. Tracks:
 * - line comments (`-- ...`)
 * - block comments (`/ * ... * /`, which NEST in Postgres)
 * - single-quoted strings ('' escape; backslash escapes in E'...' strings)
 * - double-quoted identifiers
 * - dollar-quoted strings ($$...$$ and $tag$...$tag$)
 */
function tokenize(sql: string, callbacks: TokenizerCallbacks): void {
  const len = sql.length
  let i = 0

  while (i < len) {
    const ch = sql.charAt(i)
    const next = sql.charAt(i + 1)

    // Line comment
    if (ch === '-' && next === '-') {
      while (i < len && sql[i] !== '\n') i++
      continue
    }

    // Block comment (nesting)
    if (ch === '/' && next === '*') {
      let depth = 1
      i += 2
      while (i < len && depth > 0) {
        if (sql[i] === '/' && sql[i + 1] === '*') {
          depth++
          i += 2
        } else if (sql[i] === '*' && sql[i + 1] === '/') {
          depth--
          i += 2
        } else {
          i++
        }
      }
      continue
    }

    // Single-quoted string. E'...' / e'...' strings honor backslash escapes.
    if (ch === "'") {
      const prev = i > 0 ? sql.charAt(i - 1) : ''
      const prevPrev = i > 1 ? sql.charAt(i - 2) : ''
      const isEscapeString =
        (prev === 'e' || prev === 'E') && !/[A-Za-z0-9_$]/.test(prevPrev)
      i++
      while (i < len) {
        if (isEscapeString && sql[i] === '\\') {
          i += 2
          continue
        }
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            i += 2 // '' escape
            continue
          }
          i++
          break
        }
        i++
      }
      continue
    }

    // Double-quoted identifier ("" escape)
    if (ch === '"') {
      i++
      while (i < len) {
        if (sql[i] === '"') {
          if (sql[i + 1] === '"') {
            i += 2
            continue
          }
          i++
          break
        }
        i++
      }
      continue
    }

    // Dollar-quoted string: $$...$$ or $tag$...$tag$
    if (ch === '$') {
      const tagMatch = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(sql.slice(i))
      if (tagMatch) {
        const tag = tagMatch[0]
        const close = sql.indexOf(tag, i + tag.length)
        i = close === -1 ? len : close + tag.length
        continue
      }
    }

    if (ch === ';') {
      callbacks.onStatementEnd?.(i)
    } else {
      callbacks.onCode?.(ch, i)
    }
    i++
  }
}

/**
 * Split a SQL file into individual statements on TOP-LEVEL semicolons only.
 * Semicolons inside comments, string literals, quoted identifiers, and
 * dollar-quoted bodies do not split (the migration-062 regression case).
 *
 * Each returned statement keeps its surrounding comments/whitespace trimmed.
 * Chunks containing no actual SQL (comment-only trailers) are dropped.
 */
export function splitSqlStatements(sql: string): string[] {
  const boundaries: number[] = []
  tokenize(sql, { onStatementEnd: (index) => boundaries.push(index) })

  const statements: string[] = []
  let start = 0
  for (const boundary of [...boundaries, sql.length - 1]) {
    const chunk = sql.slice(start, boundary + 1)
    if (hasSqlCode(chunk)) statements.push(chunk.trim())
    start = boundary + 1
  }
  return statements
}

/** True when the chunk contains any real SQL beyond comments/whitespace. */
function hasSqlCode(chunk: string): boolean {
  return /[^\s;]/.test(stripCommentsAndLiterals(chunk))
}

/**
 * Return the SQL with comments removed and literal/identifier bodies blanked,
 * so keyword detection cannot false-positive on prose in comments (the reason
 * detection is not a plain regex over the raw file).
 */
export function stripCommentsAndLiterals(sql: string): string {
  let out = ''
  tokenize(sql, {
    onCode: (ch) => {
      out += ch
    },
    onStatementEnd: () => {
      out += ';'
    },
  })
  return out
}

/**
 * Statement patterns Postgres refuses (or that misbehave) inside a
 * transaction block. Matched against comment-and-literal-stripped SQL.
 */
const NO_TRANSACTION_PATTERNS: RegExp[] = [
  /\bcreate\s+(unique\s+)?index\s+concurrently\b/i,
  /\bdrop\s+index\s+concurrently\b/i,
  /\breindex\b[^;]*\bconcurrently\b/i,
  /\balter\s+type\b[^;]*\badd\s+value\b/i,
  /\bvacuum\b/i,
  /\balter\s+system\b/i,
  /\b(create|drop)\s+database\b/i,
  /\b(create|drop)\s+tablespace\b/i,
  /\balter\s+subscription\b/i,
]

/**
 * Decide whether a migration file must run OUTSIDE a transaction block
 * (statement-by-statement). True when the file carries the explicit
 * `-- migrate:no-transaction` marker comment, or when any statement matches
 * a known non-transactional pattern (CREATE/DROP INDEX CONCURRENTLY, etc.).
 */
export function requiresNoTransaction(sql: string): boolean {
  // Explicit marker: a comment line anywhere in the file.
  if (new RegExp(`^\\s*--\\s*${NO_TRANSACTION_MARKER}\\b`, 'm').test(sql)) {
    return true
  }
  const stripped = stripCommentsAndLiterals(sql)
  return NO_TRANSACTION_PATTERNS.some((p) => p.test(stripped))
}

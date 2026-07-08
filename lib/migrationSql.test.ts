// Tests for lib/migrationSql.ts — the migration SQL splitter and
// non-transactional-migration detector used by both migration runners.
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import {
  splitSqlStatements,
  requiresNoTransaction,
  stripCommentsAndLiterals,
} from './migrationSql.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = join(__dirname, '../migrations')

describe('splitSqlStatements', () => {
  it('splits plain multi-statement SQL', () => {
    const statements = splitSqlStatements(
      'CREATE TABLE a (id INT);\nCREATE TABLE b (id INT);\n'
    )
    assert.strictEqual(statements.length, 2)
    assert.match(statements[0], /CREATE TABLE a/)
    assert.match(statements[1], /CREATE TABLE b/)
  })

  it('does not split on semicolons inside line comments (migration 062 regression)', () => {
    const sql = [
      '-- patron asks in Discord; we cross-reference their pledge state',
      'CREATE TABLE t (id INT);',
    ].join('\n')
    const statements = splitSqlStatements(sql)
    assert.strictEqual(statements.length, 1)
    assert.match(statements[0], /CREATE TABLE t/)
  })

  it('does not split on semicolons inside string literals', () => {
    const statements = splitSqlStatements(
      "INSERT INTO t (v) VALUES ('a;b');\nINSERT INTO t (v) VALUES ('it''s; fine');"
    )
    assert.strictEqual(statements.length, 2)
  })

  it('does not split on semicolons inside dollar-quoted bodies', () => {
    const sql = [
      'CREATE FUNCTION f() RETURNS void AS $$',
      'BEGIN',
      '  PERFORM 1;',
      '  PERFORM 2;',
      'END;',
      '$$ LANGUAGE plpgsql;',
      'CREATE TABLE after_fn (id INT);',
    ].join('\n')
    const statements = splitSqlStatements(sql)
    assert.strictEqual(statements.length, 2)
    assert.match(statements[0], /LANGUAGE plpgsql/)
    assert.match(statements[1], /after_fn/)
  })

  it('does not split inside nested block comments or quoted identifiers', () => {
    const sql =
      '/* outer; /* nested; */ still comment; */ CREATE TABLE "we;ird" (id INT);'
    const statements = splitSqlStatements(sql)
    assert.strictEqual(statements.length, 1)
    assert.match(statements[0], /we;ird/)
  })

  it('drops comment-only trailing chunks', () => {
    const statements = splitSqlStatements(
      'CREATE TABLE t (id INT);\n-- trailing note; with a semicolon\n'
    )
    assert.strictEqual(statements.length, 1)
  })

  it('splits the real 044 file into exactly two CONCURRENTLY statements', () => {
    const sql = readFileSync(
      join(MIGRATIONS_DIR, '044_stats_query_indexes.sql'),
      'utf-8'
    )
    const statements = splitSqlStatements(sql)
    assert.strictEqual(statements.length, 2)
    for (const stmt of statements) {
      assert.match(stripCommentsAndLiterals(stmt), /CREATE INDEX CONCURRENTLY/i)
    }
  })

  it('keeps the real 062 file (semicolon in comment) as three statements', () => {
    const sql = readFileSync(
      join(MIGRATIONS_DIR, '062_create_patreon_pledge_snapshot.sql'),
      'utf-8'
    )
    const statements = splitSqlStatements(sql)
    assert.strictEqual(statements.length, 3)
  })
})

describe('requiresNoTransaction', () => {
  it('detects CREATE INDEX CONCURRENTLY (migration 044)', () => {
    const sql = readFileSync(
      join(MIGRATIONS_DIR, '044_stats_query_indexes.sql'),
      'utf-8'
    )
    assert.strictEqual(requiresNoTransaction(sql), true)
  })

  it('detects DROP INDEX CONCURRENTLY, REINDEX CONCURRENTLY, and ALTER TYPE ADD VALUE', () => {
    assert.strictEqual(requiresNoTransaction('DROP INDEX CONCURRENTLY idx_x;'), true)
    assert.strictEqual(requiresNoTransaction('REINDEX INDEX CONCURRENTLY idx_x;'), true)
    assert.strictEqual(
      requiresNoTransaction("ALTER TYPE mood ADD VALUE 'ambivalent';"),
      true
    )
    assert.strictEqual(requiresNoTransaction('VACUUM ANALYZE t;'), true)
  })

  it('honors the explicit -- migrate:no-transaction marker', () => {
    const sql = '-- migrate:no-transaction\nUPDATE t SET x = 1;'
    assert.strictEqual(requiresNoTransaction(sql), true)
  })

  it('does NOT trigger on keywords that only appear in comments', () => {
    const sql = [
      '-- We used to CREATE INDEX CONCURRENTLY here; now we do not.',
      '/* also mentions ALTER TYPE ... ADD VALUE in prose */',
      'CREATE INDEX idx_plain ON t (a);',
    ].join('\n')
    assert.strictEqual(requiresNoTransaction(sql), false)
  })

  it('does NOT trigger on keywords inside string literals', () => {
    const sql = "INSERT INTO log (msg) VALUES ('ran create index concurrently');"
    assert.strictEqual(requiresNoTransaction(sql), false)
  })

  it('does NOT trigger on ordinary transactional migrations', () => {
    assert.strictEqual(
      requiresNoTransaction('CREATE INDEX IF NOT EXISTS idx ON t (a);'),
      false
    )
    assert.strictEqual(
      requiresNoTransaction('ALTER TABLE t ADD COLUMN v TEXT;'),
      false
    )
  })
})

describe('real migrations audit (guard)', () => {
  const sqlFiles = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  it('every .sql migration splits without throwing and yields at least one statement', () => {
    for (const file of sqlFiles) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8')
      const statements = splitSqlStatements(sql)
      assert.ok(statements.length >= 1, `${file} produced no statements`)
    }
  })

  it('044 is the only current migration requiring no-transaction execution', () => {
    // If this fails because you ADDED a legitimately non-transactional
    // migration, update the expected list — the runner handles it. If it
    // fails any other way, the detector regressed.
    const noTx = sqlFiles.filter((f) =>
      requiresNoTransaction(readFileSync(join(MIGRATIONS_DIR, f), 'utf-8'))
    )
    assert.deepStrictEqual(noTx, ['044_stats_query_indexes.sql'])
  })
})

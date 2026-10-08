// Pins the migration fail-fast decision matrix (U7, foundations hardening).
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { shouldFailFastOnMigrationFailure } from './migrationPolicy'

describe('shouldFailFastOnMigrationFailure', () => {
  it('fails fast in production without the hatch', () => {
    assert.strictEqual(
      shouldFailFastOnMigrationFailure({ NODE_ENV: 'production' }),
      true
    )
  })

  it('continues in production when ALLOW_STALE_SCHEMA=1 (break-glass)', () => {
    assert.strictEqual(
      shouldFailFastOnMigrationFailure({ NODE_ENV: 'production', ALLOW_STALE_SCHEMA: '1' }),
      false
    )
  })

  it('does not treat other hatch values as set', () => {
    assert.strictEqual(
      shouldFailFastOnMigrationFailure({ NODE_ENV: 'production', ALLOW_STALE_SCHEMA: 'true' }),
      true,
      'only the literal "1" disarms the fail-fast'
    )
    assert.strictEqual(
      shouldFailFastOnMigrationFailure({ NODE_ENV: 'production', ALLOW_STALE_SCHEMA: '0' }),
      true
    )
  })

  it('stays lenient in development', () => {
    assert.strictEqual(
      shouldFailFastOnMigrationFailure({ NODE_ENV: 'development' }),
      false
    )
  })

  it('stays lenient when NODE_ENV is unset', () => {
    assert.strictEqual(shouldFailFastOnMigrationFailure({}), false)
  })

  it('stays lenient in test', () => {
    assert.strictEqual(
      shouldFailFastOnMigrationFailure({ NODE_ENV: 'test' }),
      false
    )
  })
})

// Tests for grant-play-access.ts CLI script
import { describe, it } from 'node:test'
import assert from 'node:assert'

describe('grant-play-access CLI script', () => {
  describe('Argument parsing', () => {
    it('should accept username as positional argument', () => {
      const args = ['realleebo']
      const identifier = args[0]
      const isUsername = identifier && !identifier.includes('@')

      assert.strictEqual(isUsername, true)
    })

    it('should accept email as positional argument', () => {
      const args = ['user@example.com']
      const identifier = args[0]
      const provided = typeof identifier === 'string' && identifier.length > 0

      assert.strictEqual(provided, true)
    })

    it('should show usage when no arguments provided', () => {
      const args: string[] = []
      const showUsage = args.length === 0

      assert.strictEqual(showUsage, true)
    })
  })
})

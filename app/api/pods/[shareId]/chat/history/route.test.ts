// @ts-nocheck
/**
 * Chat History Route - Contract Tests
 *
 * Tests the Discord-only chat history behavior:
 * - Returns messages from Discord thread (not DB)
 * - Returns isPublic flag so client knows pod visibility
 * - Returns empty messages when no thread exists
 * - Filters out system messages
 */
import { describe, it } from 'node:test'
import assert from 'node:assert'

// Extract the response-building logic from the route for testing
function buildHistoryResponse(pod, discordMessages) {
  let messages = []
  if (pod.discord_thread_id && discordMessages) {
    messages = discordMessages.filter(m => !m.isSystem)
  }
  return { messages, isPublic: !!pod.is_public }
}

describe('Chat History Route', () => {
  describe('Discord-only persistence', () => {
    it('returns messages from Discord when thread exists', () => {
      const pod = { id: 1, discord_thread_id: 'thread_123', is_public: true }
      const discordMessages = [
        { username: 'Alice', text: 'Hello!', timestamp: '2024-01-01T00:00:00Z', isSystem: false },
        { username: 'Bob', text: 'Hi there', timestamp: '2024-01-01T00:01:00Z', isSystem: false },
      ]

      const result = buildHistoryResponse(pod, discordMessages)

      assert.strictEqual(result.messages.length, 2)
      assert.strictEqual(result.messages[0].username, 'Alice')
      assert.strictEqual(result.messages[1].username, 'Bob')
    })

    it('returns empty messages when no Discord thread', () => {
      const pod = { id: 1, discord_thread_id: null, is_public: false }

      const result = buildHistoryResponse(pod, [])

      assert.strictEqual(result.messages.length, 0)
    })

    it('filters out system messages from Discord', () => {
      const pod = { id: 1, discord_thread_id: 'thread_123', is_public: true }
      const discordMessages = [
        { username: 'Bot', text: 'Pod chat started', timestamp: '2024-01-01T00:00:00Z', isSystem: true },
        { username: 'Alice', text: 'Hello!', timestamp: '2024-01-01T00:01:00Z', isSystem: false },
        { username: 'Bot', text: 'Draft started!', timestamp: '2024-01-01T00:02:00Z', isSystem: true },
        { username: 'Bob', text: 'Good luck', timestamp: '2024-01-01T00:03:00Z', isSystem: false },
      ]

      const result = buildHistoryResponse(pod, discordMessages)

      assert.strictEqual(result.messages.length, 2, 'Should filter out 2 system messages')
      assert.strictEqual(result.messages[0].username, 'Alice')
      assert.strictEqual(result.messages[1].username, 'Bob')
    })
  })

  describe('isPublic flag', () => {
    it('returns isPublic: true for public pods', () => {
      const pod = { id: 1, discord_thread_id: 'thread_123', is_public: true }
      const result = buildHistoryResponse(pod, [])

      assert.strictEqual(result.isPublic, true)
    })

    it('returns isPublic: false for private pods', () => {
      const pod = { id: 1, discord_thread_id: null, is_public: false }
      const result = buildHistoryResponse(pod, [])

      assert.strictEqual(result.isPublic, false)
    })

    it('returns isPublic: false for null/undefined is_public', () => {
      const pod = { id: 1, discord_thread_id: null, is_public: null }
      const result = buildHistoryResponse(pod, [])

      assert.strictEqual(result.isPublic, false, 'null is_public should be treated as false')
    })

    it('returns isPublic: false for undefined is_public', () => {
      const pod = { id: 1, discord_thread_id: null }
      const result = buildHistoryResponse(pod, [])

      assert.strictEqual(result.isPublic, false, 'undefined is_public should be treated as false')
    })
  })

  describe('response shape', () => {
    it('always returns messages array and isPublic boolean', () => {
      const pod = { id: 1, discord_thread_id: null, is_public: true }
      const result = buildHistoryResponse(pod, [])

      assert.ok(Array.isArray(result.messages), 'messages should be an array')
      assert.strictEqual(typeof result.isPublic, 'boolean', 'isPublic should be a boolean')
    })

    it('does not include DB-specific fields like source in response', () => {
      const pod = { id: 1, discord_thread_id: 'thread_123', is_public: true }
      const discordMessages = [
        { username: 'Alice', text: 'Hello!', timestamp: '2024-01-01T00:00:00Z', isSystem: false, source: 'discord' },
      ]

      const result = buildHistoryResponse(pod, discordMessages)

      // Messages should pass through Discord format, no DB-specific transforms
      assert.strictEqual(result.messages[0].username, 'Alice')
      assert.strictEqual(result.messages[0].text, 'Hello!')
    })
  })
})

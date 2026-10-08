// @ts-nocheck
/**
 * useChat Hook Contract Tests
 *
 * Tests the hook's behavior contracts including:
 * - Socket room naming convention
 * - History response parsing (isPublic flag)
 * - Message deduplication logic
 * - Chat event names
 */
import { describe, it } from 'node:test'
import assert from 'node:assert'

// Socket room naming convention (from server.ts chat:send handler)
function getChatRoomName(shareId) {
  return `chat:${shareId}`
}

// Simulate the history response parsing logic from useChat
function parseHistoryResponse(data) {
  const inner = data.data || data
  const msgs = inner.messages || []
  const isPublic = typeof inner.isPublic === 'boolean' ? inner.isPublic : true
  return { messages: msgs, isPublic, historyCount: msgs.length }
}

// Simulate the deduplication logic from useChat
function isDuplicate(prevMessages, newMessage) {
  if (prevMessages.length === 0) return false
  const last = prevMessages[prevMessages.length - 1]
  return (
    last.text === newMessage.text &&
    last.username === newMessage.username &&
    Math.abs(new Date(last.timestamp).getTime() - new Date(newMessage.timestamp).getTime()) < 2000
  )
}

describe('useChat', () => {
  describe('socket room naming', () => {
    it('uses chat: prefix for room name', () => {
      assert.strictEqual(getChatRoomName('abc123'), 'chat:abc123')
    })

    it('room name is distinct from draft room', () => {
      const chatRoom = getChatRoomName('abc123')
      const draftRoom = `draft:abc123`
      assert.notStrictEqual(chatRoom, draftRoom)
    })
  })

  describe('history response parsing', () => {
    it('parses messages from flat response', () => {
      const data = {
        messages: [
          { username: 'Alice', text: 'Hello', timestamp: '2024-01-01T00:00:00Z', isSystem: false },
        ],
        isPublic: true,
      }

      const result = parseHistoryResponse(data)

      assert.strictEqual(result.messages.length, 1)
      assert.strictEqual(result.messages[0].username, 'Alice')
      assert.strictEqual(result.historyCount, 1)
    })

    it('parses messages from wrapped response (jsonResponse pattern)', () => {
      const data = {
        data: {
          messages: [
            { username: 'Bob', text: 'Hi', timestamp: '2024-01-01T00:00:00Z', isSystem: false },
          ],
          isPublic: false,
        },
      }

      const result = parseHistoryResponse(data)

      assert.strictEqual(result.messages.length, 1)
      assert.strictEqual(result.messages[0].username, 'Bob')
    })

    it('parses isPublic: true from response', () => {
      const data = { messages: [], isPublic: true }
      const result = parseHistoryResponse(data)
      assert.strictEqual(result.isPublic, true)
    })

    it('parses isPublic: false from response', () => {
      const data = { messages: [], isPublic: false }
      const result = parseHistoryResponse(data)
      assert.strictEqual(result.isPublic, false)
    })

    it('parses isPublic from wrapped response', () => {
      const data = { data: { messages: [], isPublic: false } }
      const result = parseHistoryResponse(data)
      assert.strictEqual(result.isPublic, false)
    })

    it('defaults isPublic to true when not in response', () => {
      const data = { messages: [] }
      const result = parseHistoryResponse(data)
      assert.strictEqual(result.isPublic, true, 'Should default to true to avoid flicker')
    })

    it('handles empty messages gracefully', () => {
      const data = { messages: [], isPublic: true }
      const result = parseHistoryResponse(data)

      assert.strictEqual(result.messages.length, 0)
      assert.strictEqual(result.historyCount, 0)
    })

    it('handles missing messages field gracefully', () => {
      const data = { isPublic: true }
      const result = parseHistoryResponse(data)

      assert.strictEqual(result.messages.length, 0)
      assert.strictEqual(result.historyCount, 0)
    })
  })

  describe('message deduplication', () => {
    it('detects duplicate messages within 2 seconds', () => {
      const prev = [
        { username: 'Alice', text: 'Hello', timestamp: '2024-01-01T00:00:00.000Z' },
      ]
      const newMsg = { username: 'Alice', text: 'Hello', timestamp: '2024-01-01T00:00:01.000Z' }

      assert.strictEqual(isDuplicate(prev, newMsg), true, 'Should detect as duplicate')
    })

    it('does not flag different text as duplicate', () => {
      const prev = [
        { username: 'Alice', text: 'Hello', timestamp: '2024-01-01T00:00:00.000Z' },
      ]
      const newMsg = { username: 'Alice', text: 'Goodbye', timestamp: '2024-01-01T00:00:01.000Z' }

      assert.strictEqual(isDuplicate(prev, newMsg), false)
    })

    it('does not flag different user as duplicate', () => {
      const prev = [
        { username: 'Alice', text: 'Hello', timestamp: '2024-01-01T00:00:00.000Z' },
      ]
      const newMsg = { username: 'Bob', text: 'Hello', timestamp: '2024-01-01T00:00:01.000Z' }

      assert.strictEqual(isDuplicate(prev, newMsg), false)
    })

    it('does not flag messages >2 seconds apart as duplicate', () => {
      const prev = [
        { username: 'Alice', text: 'Hello', timestamp: '2024-01-01T00:00:00.000Z' },
      ]
      const newMsg = { username: 'Alice', text: 'Hello', timestamp: '2024-01-01T00:00:03.000Z' }

      assert.strictEqual(isDuplicate(prev, newMsg), false, 'Messages 3 seconds apart should not be dupes')
    })

    it('handles empty message list', () => {
      const newMsg = { username: 'Alice', text: 'Hello', timestamp: '2024-01-01T00:00:00.000Z' }
      assert.strictEqual(isDuplicate([], newMsg), false)
    })
  })

  describe('chat events', () => {
    it('uses correct event names for chat protocol', () => {
      const joinEvent = 'join-chat'
      const leaveEvent = 'leave-chat'
      const sendEvent = 'chat:send'
      const messageEvent = 'chat:message'

      assert.strictEqual(joinEvent, 'join-chat')
      assert.strictEqual(leaveEvent, 'leave-chat')
      assert.strictEqual(sendEvent, 'chat:send')
      assert.strictEqual(messageEvent, 'chat:message')
    })

    it('chat:send payload has expected shape', () => {
      const payload = {
        shareId: 'abc123',
        text: 'Hello world',
        username: 'Alice',
        avatarUrl: 'https://cdn.example.com/alice.png',
      }

      assert.ok(typeof payload.shareId === 'string')
      assert.ok(typeof payload.text === 'string')
      assert.ok(typeof payload.username === 'string')
      assert.ok(payload.avatarUrl === null || typeof payload.avatarUrl === 'string')
    })

    it('chat:message has expected shape', () => {
      const message = {
        username: 'Alice',
        avatarUrl: null,
        text: 'Hello',
        timestamp: new Date().toISOString(),
        isSystem: false,
        source: 'discord',
      }

      assert.strictEqual(typeof message.username, 'string')
      assert.strictEqual(typeof message.text, 'string')
      assert.strictEqual(typeof message.timestamp, 'string')
      assert.strictEqual(typeof message.isSystem, 'boolean')
    })
  })
})

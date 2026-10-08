// @ts-nocheck
/**
 * Draft Settings Route - Discord Thread Lifecycle Tests
 *
 * Tests the logic for creating/deleting Discord threads when
 * pod visibility is toggled between public and private.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert'

// Extract the visibility toggle decision logic from the settings route
function getDiscordAction(body, pod) {
  if (typeof body.isPublic !== 'boolean') return null

  if (body.isPublic && !pod.discord_message_id) {
    return 'create' // Private → Public: create Discord thread
  }

  if (!body.isPublic && pod.discord_message_id) {
    return 'delete' // Public → Private: delete Discord thread
  }

  return null // No action needed (already in desired state)
}

// Extract the pod info builder for Discord API calls
function buildPodInfoForDiscord(pod, body) {
  return {
    id: pod.id,
    share_id: pod.share_id,
    set_code: pod.set_code,
    set_name: pod.set_name || pod.set_code,
    name: typeof body.name === 'string' ? body.name.trim().slice(0, 100) : pod.name,
    max_players: typeof body.maxPlayers === 'number' ? body.maxPlayers : pod.max_players,
    current_players: pod.current_players,
    pod_type: pod.pod_type || 'draft',
    is_public: body.isPublic,
  }
}

describe('Draft Settings - Discord Thread Lifecycle', () => {
  describe('visibility toggle decision', () => {
    it('returns "create" when going from private to public', () => {
      const body = { isPublic: true }
      const pod = { discord_message_id: null }

      assert.strictEqual(getDiscordAction(body, pod), 'create')
    })

    it('returns "delete" when going from public to private', () => {
      const body = { isPublic: false }
      const pod = { discord_message_id: 'msg_123' }

      assert.strictEqual(getDiscordAction(body, pod), 'delete')
    })

    it('returns null when already public and setting public', () => {
      const body = { isPublic: true }
      const pod = { discord_message_id: 'msg_123' }

      assert.strictEqual(getDiscordAction(body, pod), null, 'Already has Discord, no action needed')
    })

    it('returns null when already private and setting private', () => {
      const body = { isPublic: false }
      const pod = { discord_message_id: null }

      assert.strictEqual(getDiscordAction(body, pod), null, 'Already private, no action needed')
    })

    it('returns null when isPublic not in body', () => {
      const body = { name: 'New Name' }
      const pod = { discord_message_id: 'msg_123' }

      assert.strictEqual(getDiscordAction(body, pod), null, 'No visibility change requested')
    })

    it('returns null when isPublic is not a boolean', () => {
      const body = { isPublic: 'true' }
      const pod = { discord_message_id: null }

      assert.strictEqual(getDiscordAction(body, pod), null, 'String "true" is not boolean')
    })
  })

  describe('pod info builder for Discord', () => {
    const basePod = {
      id: 42,
      share_id: 'abc123',
      set_code: 'SOR',
      set_name: 'Spark of Rebellion',
      name: 'My Draft',
      max_players: 8,
      current_players: 3,
      pod_type: 'draft',
    }

    it('uses body name when provided', () => {
      const body = { isPublic: true, name: 'New Name' }
      const info = buildPodInfoForDiscord(basePod, body)

      assert.strictEqual(info.name, 'New Name')
    })

    it('falls back to pod name when body has no name', () => {
      const body = { isPublic: true }
      const info = buildPodInfoForDiscord(basePod, body)

      assert.strictEqual(info.name, 'My Draft')
    })

    it('truncates name to 100 characters', () => {
      const body = { isPublic: true, name: 'A'.repeat(200) }
      const info = buildPodInfoForDiscord(basePod, body)

      assert.strictEqual(info.name.length, 100)
    })

    it('trims whitespace from name', () => {
      const body = { isPublic: true, name: '  Trimmed  ' }
      const info = buildPodInfoForDiscord(basePod, body)

      assert.strictEqual(info.name, 'Trimmed')
    })

    it('uses body maxPlayers when provided', () => {
      const body = { isPublic: true, maxPlayers: 4 }
      const info = buildPodInfoForDiscord(basePod, body)

      assert.strictEqual(info.max_players, 4)
    })

    it('falls back to pod max_players when not in body', () => {
      const body = { isPublic: true }
      const info = buildPodInfoForDiscord(basePod, body)

      assert.strictEqual(info.max_players, 8)
    })

    it('uses set_code as fallback for set_name', () => {
      const pod = { ...basePod, set_name: null }
      const body = { isPublic: true }
      const info = buildPodInfoForDiscord(pod, body)

      assert.strictEqual(info.set_name, 'SOR')
    })

    it('defaults pod_type to draft', () => {
      const pod = { ...basePod, pod_type: undefined }
      const body = { isPublic: true }
      const info = buildPodInfoForDiscord(pod, body)

      assert.strictEqual(info.pod_type, 'draft')
    })

    it('carries through the isPublic value from body', () => {
      const body = { isPublic: false }
      const info = buildPodInfoForDiscord(basePod, body)

      assert.strictEqual(info.is_public, false)
    })
  })
})

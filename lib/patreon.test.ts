// @ts-nocheck
// Tests for the Patreon API client.
// Spec: lib/patreon.ts must request `currently_entitled_amount_cents` and
// `pledge_relationship_start` in fields[member], and parse them onto
// PatreonMember.pledgeAmountCents / pledgeStartedAt with null fallbacks.

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'

// Set required env BEFORE importing the module — the module reads at import time.
process.env['PATREON_CREATOR_ACCESS_TOKEN'] = 'test-token'
process.env['PATREON_CAMPAIGN_ID'] = 'test-campaign'

const { fetchAllPatrons } = await import('./patreon.ts')

// Helper: stub global fetch with a deterministic response.
function stubFetch(response) {
  const calls = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(response),
      json: async () => response,
    }
  }
  return {
    calls,
    restore: () => {
      globalThis.fetch = originalFetch
    },
  }
}

describe('lib/patreon — fetchAllPatrons', () => {
  describe('field selection (SPEC: U0 widens fields[member])', () => {
    it('requests currently_entitled_amount_cents and pledge_relationship_start in fields[member]', async () => {
      const stub = stubFetch({ data: [], included: [], meta: {} })
      try {
        await fetchAllPatrons()
        assert.strictEqual(stub.calls.length, 1, 'expected exactly one fetch call')
        const requestedUrl = stub.calls[0].url
        assert.ok(
          requestedUrl.includes('currently_entitled_amount_cents'),
          'URL must include currently_entitled_amount_cents',
        )
        assert.ok(
          requestedUrl.includes('pledge_relationship_start'),
          'URL must include pledge_relationship_start',
        )
      } finally {
        stub.restore()
      }
    })
  })

  describe('parsing (SPEC: new fields land on PatreonMember)', () => {
    it('NEW CODE: parses pledge amount cents and pledge start date when present', async () => {
      const stub = stubFetch({
        data: [
          {
            id: 'member-1',
            attributes: {
              full_name: 'Test Patron',
              email: 'patron@example.com',
              patron_status: 'active_patron',
              currently_entitled_amount_cents: 500,
              pledge_relationship_start: '2024-08-15T12:00:00.000+00:00',
            },
            relationships: { user: { data: { id: 'user-1' } } },
          },
        ],
        included: [
          {
            type: 'user',
            id: 'user-1',
            attributes: { social_connections: { discord: { user_id: 'discord-1' } } },
          },
        ],
        meta: {},
      })
      try {
        const members = await fetchAllPatrons()
        assert.strictEqual(members.length, 1)
        const member = members[0]
        assert.strictEqual(member.pledgeAmountCents, 500, 'pledge amount cents must match')
        assert.strictEqual(
          member.pledgeStartedAt,
          '2024-08-15T12:00:00.000+00:00',
          'pledge start date must match',
        )
        assert.strictEqual(member.discordUserId, 'discord-1')
        assert.strictEqual(member.patronStatus, 'active_patron')
      } finally {
        stub.restore()
      }
    })

    it('NEW CODE: returns null pledge fields when Patreon omits them', async () => {
      const stub = stubFetch({
        data: [
          {
            id: 'member-2',
            attributes: {
              full_name: 'Free Trial Patron',
              email: 'trial@example.com',
              patron_status: 'pay_upfront',
              // currently_entitled_amount_cents and pledge_relationship_start absent
            },
            relationships: { user: { data: { id: 'user-2' } } },
          },
        ],
        included: [],
        meta: {},
      })
      try {
        const members = await fetchAllPatrons()
        assert.strictEqual(members.length, 1)
        assert.strictEqual(members[0].pledgeAmountCents, null, 'missing pledge amount → null')
        assert.strictEqual(members[0].pledgeStartedAt, null, 'missing pledge start → null')
      } finally {
        stub.restore()
      }
    })

    it('NEW CODE: coerces non-finite pledge amount to null (defensive)', async () => {
      const stub = stubFetch({
        data: [
          {
            id: 'member-3',
            attributes: {
              full_name: 'Edge Case',
              email: 'edge@example.com',
              patron_status: 'active_patron',
              currently_entitled_amount_cents: 'not-a-number',
              pledge_relationship_start: '',
            },
            relationships: { user: { data: { id: 'user-3' } } },
          },
        ],
        included: [],
        meta: {},
      })
      try {
        const members = await fetchAllPatrons()
        assert.strictEqual(members[0].pledgeAmountCents, null, 'non-numeric pledge amount → null')
        assert.strictEqual(members[0].pledgeStartedAt, null, 'empty pledge start string → null')
      } finally {
        stub.restore()
      }
    })
  })

  describe('backward compatibility (existing PatreonMember fields preserved)', () => {
    it('still returns fullName, email, patronStatus, discordUserId on existing-shape input', async () => {
      const stub = stubFetch({
        data: [
          {
            id: 'member-4',
            attributes: {
              full_name: 'Existing Patron',
              email: 'existing@example.com',
              patron_status: 'active_patron',
            },
            relationships: { user: { data: { id: 'user-4' } } },
          },
        ],
        included: [
          {
            type: 'user',
            id: 'user-4',
            attributes: { social_connections: { discord: { user_id: 'discord-4' } } },
          },
        ],
        meta: {},
      })
      try {
        const members = await fetchAllPatrons()
        assert.strictEqual(members[0].fullName, 'Existing Patron')
        assert.strictEqual(members[0].email, 'existing@example.com')
        assert.strictEqual(members[0].patronStatus, 'active_patron')
        assert.strictEqual(members[0].discordUserId, 'discord-4')
      } finally {
        stub.restore()
      }
    })
  })
})

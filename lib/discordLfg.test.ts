// @ts-nocheck
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  POD_CHAT_WEBHOOK_NAME,
  POD_SOURCE_HOST,
  buildCancelledEmbed,
  buildPodEmbed,
  buildPodSourceDescription,
  buildStartedEmbed,
  getOrCreateChannelWebhook,
} from './discordLfg.ts'

const draftPod = {
  id: 'pod-1',
  share_id: 'abc123',
  set_code: 'LAW',
  set_name: 'Legacy of the Force',
  name: 'Limited Draft',
  max_players: 8,
  current_players: 1,
  pod_type: 'draft',
}

const sealedPod = {
  ...draftPod,
  id: 'pod-2',
  pod_type: 'sealed',
  name: 'Sealed League',
}

describe('Discord LFG pod source description', () => {
  it('names protectthepod.com in the source line', () => {
    assert.equal(buildPodSourceDescription('Draft'), `*Draft through ${POD_SOURCE_HOST}*`)
  })

  it('adds the source line to new draft embeds', () => {
    const embed = buildPodEmbed(draftPod, 'Leia', ['Leia'])

    assert.match(String(embed.description), /Draft through protectthepod\.com/)
  })

  it('adds the source line to new sealed embeds', () => {
    const embed = buildPodEmbed(sealedPod, 'Leia', ['Leia'])

    assert.match(String(embed.description), /Sealed through protectthepod\.com/)
  })

  it('keeps the source line when a pod starts', () => {
    const embed = buildStartedEmbed(draftPod, 'Leia', ['Leia', 'Han'])

    assert.match(String(embed.description), /Draft through protectthepod\.com/)
  })

  it('keeps the source line when a pod is cancelled', () => {
    const embed = buildCancelledEmbed(sealedPod, 'Leia', ['Leia'])

    assert.match(String(embed.description), /Sealed through protectthepod\.com/)
  })
})

// Discord caps channels at 15 webhooks (error 30007). These tests pin the
// find-or-create behavior that keeps us at one shared webhook per channel.
describe('getOrCreateChannelWebhook', () => {
  const realFetch = globalThis.fetch

  function stubFetch(handler) {
    const calls = []
    globalThis.fetch = async (url, init = {}) => {
      const call = { url: String(url), method: init.method || 'GET' }
      calls.push(call)
      return handler(call)
    }
    return calls
  }

  function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), { status })
  }

  it('reuses an existing webhook with a matching name instead of creating one', async (t) => {
    t.after(() => { globalThis.fetch = realFetch })
    const calls = stubFetch(() =>
      jsonResponse([
        { id: 'wh-1', name: POD_CHAT_WEBHOOK_NAME, token: 'tok-1' },
      ])
    )

    const webhook = await getOrCreateChannelWebhook('chan-reuse', POD_CHAT_WEBHOOK_NAME)

    assert.deepEqual(webhook, { id: 'wh-1', token: 'tok-1' })
    assert.equal(calls.filter(c => c.method === 'POST').length, 0)
  })

  it('never hijacks a same-named webhook without a token (created by another app or a human)', async (t) => {
    t.after(() => { globalThis.fetch = realFetch })
    const calls = stubFetch((call) => {
      if (call.method === 'GET') {
        return jsonResponse([{ id: 'wh-foreign', name: POD_CHAT_WEBHOOK_NAME }])
      }
      return jsonResponse({ id: 'wh-new', token: 'tok-new' })
    })

    const webhook = await getOrCreateChannelWebhook('chan-foreign', POD_CHAT_WEBHOOK_NAME)

    assert.deepEqual(webhook, { id: 'wh-new', token: 'tok-new' })
    assert.equal(calls.filter(c => c.method === 'POST').length, 1)
  })

  it('creates the webhook when none exists', async (t) => {
    t.after(() => { globalThis.fetch = realFetch })
    stubFetch((call) =>
      call.method === 'GET'
        ? jsonResponse([])
        : jsonResponse({ id: 'wh-created', token: 'tok-created' })
    )

    const webhook = await getOrCreateChannelWebhook('chan-create', POD_CHAT_WEBHOOK_NAME)

    assert.deepEqual(webhook, { id: 'wh-created', token: 'tok-created' })
  })

  it('caches the webhook so later sends make no Discord calls', async (t) => {
    t.after(() => { globalThis.fetch = realFetch })
    const calls = stubFetch(() =>
      jsonResponse([{ id: 'wh-cached', name: POD_CHAT_WEBHOOK_NAME, token: 'tok-cached' }])
    )

    await getOrCreateChannelWebhook('chan-cache', POD_CHAT_WEBHOOK_NAME)
    const callsAfterFirst = calls.length
    const webhook = await getOrCreateChannelWebhook('chan-cache', POD_CHAT_WEBHOOK_NAME)

    assert.deepEqual(webhook, { id: 'wh-cached', token: 'tok-cached' })
    assert.equal(calls.length, callsAfterFirst)
  })

  it('returns null (does not throw) when creation fails, e.g. the 15-webhook cap', async (t) => {
    t.after(() => { globalThis.fetch = realFetch })
    stubFetch((call) => {
      if (call.url.includes('posthog')) return jsonResponse({})
      return call.method === 'GET'
        ? jsonResponse([])
        : jsonResponse({ message: 'Maximum number of webhooks reached (15)', code: 30007 }, 400)
    })

    const webhook = await getOrCreateChannelWebhook('chan-cap', POD_CHAT_WEBHOOK_NAME)

    assert.equal(webhook, null)
  })
})

describe('Open game LFG (Lobby V1, U3)', async () => {
  const { buildOpenGameEmbed } = await import('./discordLfg.ts')
  const listing = {
    shareId: 'og-abc123',
    setCode: 'SEC',
    setName: 'Secrets of Power',
    format: 'draft',
    visibility: 'public',
  }

  it('SPEC R29: embed carries player/set/format but never deck identity', () => {
    const embed = buildOpenGameEmbed(listing, 'Leia')
    const json = JSON.stringify(embed)
    assert.match(String(embed.title), /Leia/)
    assert.match(String(embed.title), /SEC Draft/)
    assert.ok(!/leader|archetype|base/i.test(json), 'no deck identity fields in the embed')
  })

  it('SPEC R33: embed names protectthepod.com and links to the lobby', () => {
    const embed = buildOpenGameEmbed(listing, 'Leia')
    assert.match(String(embed.description), /protectthepod\.com/)
    assert.match(String(embed.description), /\/lobby\)/)
  })

  it('labels sealed listings as Sealed', () => {
    const embed = buildOpenGameEmbed({ ...listing, format: 'sealed' }, 'Han')
    assert.match(String(embed.title), /SEC Sealed/)
  })
})

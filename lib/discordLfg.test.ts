// @ts-nocheck
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  POD_SOURCE_HOST,
  buildCancelledEmbed,
  buildPodEmbed,
  buildPodSourceDescription,
  buildStartedEmbed,
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

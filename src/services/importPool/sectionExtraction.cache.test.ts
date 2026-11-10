/**
 * Prompt caching across the voting samples of one sub-table.
 *
 * SPEC (Anthropic prompt caching): a cache entry becomes readable only after
 * the first response BEGINS STREAMING. N requests sent at once with the same
 * prefix all pay full input price. So extractTableMultiSample must:
 *   1. send ONE sample first, with a cache breakpoint after the crop image,
 *   2. send the remaining samples only after that one has started streaming,
 *   3. send every sample with a byte-identical prefix (system + image + text),
 *   4. send a single sample with no breakpoint (a write nothing can read is a
 *      1.25x cost for nothing),
 *   5. still run the other samples if the first fails before it starts.
 *
 * Before 2026-11-11 all samples (5-9 per sub-table) went out in parallel with
 * no breakpoint, so every copy of the crop was billed at full price.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractTableMultiSample } from './sectionExtraction'

const CARDS = [
  { cardId: 'LAW-001', name: 'Card One', type: 'Unit', aspects: ['Vigilance'] },
  { cardId: 'LAW-002', name: 'Card Two', type: 'Event', aspects: [] },
]
const CROP = Buffer.from('fake-jpeg-bytes')

/** A fake client whose streams start on demand, so the test controls timing. */
function fakeClient({ failFirstBeforeStart = false } = {}) {
  const calls: any[] = []
  const client: any = {
    messages: {
      stream(params: any) {
        const index = calls.length
        const call: any = { params, started: false, listeners: [] as Array<(e: any) => void> }
        calls.push(call)
        let resolveFinal!: (v: any) => void
        let rejectFinal!: (e: Error) => void
        const final = new Promise<any>((res, rej) => {
          resolveFinal = res
          rejectFinal = rej
        })
        call.start = () => {
          call.started = true
          for (const cb of call.listeners) cb({ type: 'message_start' })
          resolveFinal({
            stop_reason: 'end_turn',
            usage: { input_tokens: 10, output_tokens: 5 },
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  rows: [
                    { cardNumber: 1, poolQty: 1, deckQty: 0, poolQtyConfidence: 'high', deckQtyConfidence: 'high' },
                    { cardNumber: 2, poolQty: 0, deckQty: 0, poolQtyConfidence: 'high', deckQtyConfidence: 'high' },
                  ],
                }),
              },
            ],
          })
        }
        call.fail = () => rejectFinal(new Error('bad request'))
        if (index === 0 && failFirstBeforeStart) queueMicrotask(() => call.fail())
        return {
          on(event: string, cb: (e: any) => void) {
            if (event === 'streamEvent') call.listeners.push(cb)
            return this
          },
          finalMessage: () => final,
        }
      },
    },
  }
  return { client, calls }
}

const tick = () => new Promise((r) => setTimeout(r, 0))

function imageBlock(params: any) {
  return params.messages[0].content.find((b: any) => b.type === 'image')
}

test('NEW CODE: sends one sample first and the rest only after it starts streaming', async () => {
  const { client, calls } = fakeClient()
  const run = extractTableMultiSample(client, CROP, 'Vigilance', CARDS, 'LAW', 5)
  await tick()
  assert.equal(calls.length, 1, 'SPEC: only the first sample is sent before any stream starts')
  assert.deepEqual(
    imageBlock(calls[0].params).cache_control,
    { type: 'ephemeral' },
    'SPEC: the first sample marks a cache breakpoint on the crop image',
  )
  calls[0].start()
  await tick()
  assert.equal(calls.length, 5, 'SPEC: the other 4 samples follow once the first has started')
  for (const c of calls.slice(1)) c.start()
  const result = await run
  assert.equal(result.samplesRun, 5)
})

test('NEW CODE: every sample sends a byte-identical prefix', async () => {
  const { client, calls } = fakeClient()
  const run = extractTableMultiSample(client, CROP, 'Vigilance', CARDS, 'LAW', 3)
  await tick()
  calls[0].start()
  await tick()
  for (const c of calls.slice(1)) c.start()
  await run
  const first = JSON.stringify({ system: calls[0].params.system, messages: calls[0].params.messages })
  for (const c of calls.slice(1)) {
    assert.equal(
      JSON.stringify({ system: c.params.system, messages: c.params.messages }),
      first,
      'SPEC: any byte difference in the prefix would make a sample miss the cache',
    )
  }
})

test('NEW CODE: a single sample carries no cache breakpoint', async () => {
  const { client, calls } = fakeClient()
  const run = extractTableMultiSample(client, CROP, 'Vigilance', CARDS, 'LAW', 1)
  await tick()
  calls[0].start()
  await run
  assert.equal(imageBlock(calls[0].params).cache_control, undefined)
})

test('NEW CODE: the other samples still run when the first fails before starting', async () => {
  const { client, calls } = fakeClient({ failFirstBeforeStart: true })
  const run = extractTableMultiSample(client, CROP, 'Vigilance', CARDS, 'LAW', 3)
  await tick()
  await tick()
  assert.equal(calls.length, 3, 'SPEC: a failed first sample must not stall the rest')
  for (const c of calls.slice(1)) c.start()
  const result = await run
  assert.equal(result.samplesRun, 2)
})

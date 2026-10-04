import { test } from 'node:test'
import assert from 'node:assert/strict'
import { streamPickPods } from './pickPodStream'

test('loads complete history lazily in small batches, without retaining every pack', async () => {
  const ids=Array.from({length:12},(_,i)=>String(i)), calls:string[][]=[]
  const stream=streamPickPods(ids,async batch=>{calls.push(batch);return batch.map(id=>({id}))})
  assert.deepEqual(calls,[])
  assert.deepEqual((await stream.next()).value,{id:'0'})
  assert.deepEqual(calls,[ids.slice(0,5)])
  const rest=[]; for await(const pod of stream) rest.push(pod.id)
  assert.deepEqual(rest,ids.slice(1))
  assert.deepEqual(calls,[ids.slice(0,5),ids.slice(5,10),ids.slice(10)])
})
test('a failed pack batch fails the candidate rather than silently dropping history', async () => {
  const stream=streamPickPods(['one'],async()=>{throw new Error('read failed')})
  await assert.rejects(stream.next(),/read failed/)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PodActivity } from './podActivity'

const HOUR = 60 * 60 * 1000

test('evicts a pod and its bots once idle for the limit, and keeps active pods', () => {
  const evicted: Array<[string, string[]]> = []
  const a = new PodActivity(6 * HOUR, (pod, bots) => evicted.push([pod, [...bots].sort()]), 60_000)
  a.touch('done', 'bot-1', 0)
  a.touch('done', 'bot-2', 0)
  a.touch('live', 'bot-3', 0)
  a.touch('live', 'bot-3', 5 * HOUR)
  a.touch('live', undefined, 6 * HOUR)  // sweep runs here
  assert.deepEqual(evicted, [['done', ['bot-1', 'bot-2']]])
  assert.equal(a.size, 1)
})

test('touching never evicts the pod being touched', () => {
  const evicted: string[] = []
  const a = new PodActivity(1000, pod => evicted.push(pod), 0)
  a.touch('p', 'b', 0)
  a.touch('p', 'b', 10_000)
  assert.deepEqual(evicted, [])
})

test('1000 finished drafts leave no state behind after they go idle', () => {
  const a = new PodActivity(6 * HOUR, () => {}, 60_000)
  for (let i = 0; i < 1000; i++) for (let b = 0; b < 7; b++) a.touch(`pod-${i}`, `bot-${i}-${b}`, i * 1000)
  assert.equal(a.sweep(1000 * 1000 + 6 * HOUR), 1000)
  assert.equal(a.size, 0)
})

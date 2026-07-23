// Contract tests for useOpenGamesSocket (Lobby V1, U4) — source-level
// assertions in the useWayfinderDetection.test.ts style (no DOM harness).
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'useOpenGamesSocket.ts'), 'utf8')

describe('useOpenGamesSocket contract', () => {
  it('SPEC (review finding): exposes a distinct error status, never silently empty', () => {
    assert.match(SRC, /'loading' \| 'ready' \| 'error'/)
    assert.match(SRC, /setStatus\('error'\)/)
  })

  it('joins and leaves the open-games socket room', () => {
    assert.match(SRC, /join-open-games/)
    assert.match(SRC, /leave-open-games/)
    assert.match(SRC, /open-games-update/)
  })

  it('offers a retry affordance for the error banner', () => {
    assert.match(SRC, /retry/)
  })

  it('fetches the initial board over HTTP before socket updates', () => {
    assert.match(SRC, /\/api\/open-games/)
  })
})

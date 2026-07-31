// Regression guard for usePoolBuildsSocket's transport configuration.
//
// BUG (fixed): the hook opened its socket with
//   socketIO({ transports: ['websocket', 'polling'] })
// Forcing websocket FIRST meant the socket raised
//   connect_error: websocket error
// on a permanent retry loop and never connected, so `join-pool-builds` was
// never sent. Cross-client pool-builds updates therefore did nothing at all —
// silently, because the hook has no failure surface. Every other socket hook
// in this codebase uses the default transport order (polling, upgrading to
// websocket) and connects fine, which is what made this one the outlier.
//
// SPEC: this hook must not pin a transport order. It must take socket.io's
// default (polling first, then upgrade), and it must open its own connection
// so unmount can disconnect without tearing down the socket that usePresence
// and useDraftSocket share.
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, 'usePoolBuildsSocket.ts'), 'utf8')

describe('usePoolBuildsSocket transport config', () => {
  it('does not pin a transports array (websocket-first never connects here)', () => {
    assert.ok(
      !/transports\s*:/.test(source),
      'usePoolBuildsSocket must not set `transports`: pinning websocket first ' +
        'made it loop on connect_error and never send join-pool-builds'
    )
  })

  it('opens its own connection so unmount cannot disconnect shared sockets', () => {
    assert.ok(
      /forceNew\s*:\s*true/.test(source),
      'usePoolBuildsSocket must pass forceNew: true — io() otherwise multiplexes, ' +
        'and the disconnect() on unmount would kill usePresence/useDraftSocket too'
    )
  })

  it('still subscribes and unsubscribes with the room events the server expects', () => {
    // The server room contract (src/lib/socketServer.ts): join-pool-builds /
    // leave-pool-builds, with pool-builds-update pushed back.
    assert.ok(source.includes("'join-pool-builds'"), 'must emit join-pool-builds')
    assert.ok(source.includes("'leave-pool-builds'"), 'must emit leave-pool-builds on cleanup')
    assert.ok(source.includes("'pool-builds-update'"), 'must listen for pool-builds-update')
  })
})

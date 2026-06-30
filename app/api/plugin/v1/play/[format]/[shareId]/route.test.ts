// app/api/plugin/v1/play/[format]/[shareId]/route.test.ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { getLatestReleasedSetCode } from '../../../../../../../src/utils/setConfigs/latest.js'
import { KARABAST_PUBLIC_LOBBY_NAME } from '../../../../../../../src/utils/karabastLobby.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROUTE_SRC = readFileSync(join(__dirname, 'route.ts'), 'utf8')

describe('getLatestReleasedSetCode', () => {
  it('returns LAW — the highest setNumber (7) among all released sets', () => {
    // SPEC: LAW has setNumber 7 and releaseDate 2026-03-13 (released)
    // It is the latest released set as of the current date.
    const expectedLatestSet = 'LAW'
    const code = getLatestReleasedSetCode()
    assert.equal(code, expectedLatestSet)
  })
})

describe('Karabast public lobby name', () => {
  it('brands public Karabast lobbies with protectthepod.com', () => {
    assert.equal(KARABAST_PUBLIC_LOBBY_NAME, 'Limited Draft through protectthepod.com')
  })
})

describe('GET /api/plugin/v1/play/[format]/[shareId] contract', () => {
  it('returns the launch data Wayfinder needs to open a PTP-backed Karabast game', () => {
    assert.match(ROUTE_SRC, /setCode,/)
    assert.match(ROUTE_SRC, /format,/)
    assert.match(ROUTE_SRC, /isLatestSet:/)
    assert.match(ROUTE_SRC, /cardPool:\s*getKarabastCardPool\(setCode\)/)
    assert.match(ROUTE_SRC, /competitive:\s*row\.competitive === true/)
    assert.match(ROUTE_SRC, /lobbyName:\s*KARABAST_PUBLIC_LOBBY_NAME/)
  })
})

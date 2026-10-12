import { describe, it } from 'node:test'
import assert from 'node:assert'
import { isLocalDatabaseUrl, remoteDatabaseRefusal } from './dbGuard'

describe('development database guard', () => {
  it('treats this machine as local', () => {
    for (const url of ['postgresql://lee@localhost:5432/protectthepod', 'postgresql://u:p@127.0.0.1/db', 'postgresql://u@[::1]:5432/db', 'postgresql:///protectthepod?host=/tmp', 'postgresql://lee@/protectthepod'])
      assert.equal(isLocalDatabaseUrl(url), true, url)
  })
  it('refuses a remote host unless explicitly allowed', () => {
    const prod = 'postgresql://postgres:secret@shinkansen.proxy.rlwy.net:35971/railway'
    assert.equal(isLocalDatabaseUrl(prod), false)
    const msg = remoteDatabaseRefusal(prod, {})
    assert.ok(msg && msg.includes('shinkansen.proxy.rlwy.net'))
    assert.ok(!msg!.includes('secret'), 'never prints credentials')
    assert.equal(remoteDatabaseRefusal(prod, { PTP_ALLOW_REMOTE_DB: '1' }), null)
    assert.equal(remoteDatabaseRefusal('postgresql://lee@localhost:5432/protectthepod', {}), null)
    assert.equal(remoteDatabaseRefusal(undefined, {}), null)
  })
})

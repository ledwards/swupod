import {test} from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'

test('draft presentation uses the solo rollout and fresh alpha/admin entitlement', async t => {
  const prior = {...process.env}
  Object.assign(process.env, {DATABASE_URL: 'postgresql://localhost:1/draft_table_test', POSTGRES_URL: '', JWT_SECRET: 'draft-table-unit-test', NODE_ENV: 'development', PTP_BETA_EXPERIENCE_ENABLED:'true', PTP_NATIVE_PLAY_ENABLED: 'true', PTP_NATIVE_LOCAL_TESTING: 'true', PTP_PUBLIC_ORIGIN: 'http://localhost:3000'})
  t.after(() => { for (const key of Object.keys(process.env)) if (!(key in prior)) delete process.env[key]; Object.assign(process.env, prior) })
  let version = 1
  // No database connections: only the privileged-gate lookup is allowed.
  t.mock.method(pg.Pool.prototype, 'query', async (sql: string) => {
    assert.match(sql, /^SELECT auth_version FROM users WHERE id = \$1$/)
    return {rows: [{auth_version: version}]}
  })
  const {createToken} = await import('../../../../../lib/auth')
  const {GET} = await import('./route')
  const request = (roles?: {is_alpha_tester?: boolean; is_beta_tester?: boolean; is_admin?: boolean}) => new Request('http://localhost/api/play/native/presentation', {headers: roles ? {cookie: `swupod_session=${createToken({id: 'test-user', email: 'test@example.invalid', username: 'Tester', auth_version: 1, ...roles})}`} : {}})
  const enabled = async (roles?: {is_alpha_tester?: boolean; is_beta_tester?: boolean; is_admin?: boolean}) => {
    const response = await GET(request(roles))
    assert.match(response.headers.get('cache-control')!, /no-store/)
    return (await response.json()).enabled
  }
  assert.equal(await enabled(), false)
  assert.equal(await enabled({}), false)
  assert.equal(await enabled({is_beta_tester:true}), false)
  assert.equal(await enabled({is_alpha_tester: true}), true)
  assert.equal(await enabled({is_admin: true}), true)
  version = 2
  assert.equal(await enabled({is_alpha_tester: true}), false)
  assert.equal(await enabled({is_admin: true}), false)
  version = 1
  process.env.PTP_BETA_EXPERIENCE_ENABLED = 'false'
  assert.equal(await enabled({is_alpha_tester:true}),false)
  process.env.PTP_BETA_EXPERIENCE_ENABLED = 'true'
  // Production uses the same beta gate; a local-only switch never enables it.
  process.env.NODE_ENV = 'production'
  process.env.PTP_NATIVE_LOCAL_TESTING = 'false'
  assert.equal(await enabled({is_alpha_tester:true}),true)
  delete process.env.PTP_BETA_EXPERIENCE_ENABLED
  assert.equal(await enabled({is_admin:true}),false)
})

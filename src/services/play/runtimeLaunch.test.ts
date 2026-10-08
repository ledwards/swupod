import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getRuntimeLaunchPlan, localStubLaunchAllowed } from './runtimeLaunch'

describe('PTP runtime launch plan', () => {
  it('allows the local runtime stub outside production by default', () => {
    const plan = getRuntimeLaunchPlan({ NODE_ENV: 'development' })

    assert.equal(plan.launchAllowed, true)
    assert.equal(plan.mode, 'local_stub')
    assert.equal(plan.status, 'local_stub')
  })

  it('lets local stub be explicitly disabled for real runtime checks', () => {
    assert.equal(localStubLaunchAllowed({
      NODE_ENV: 'development',
      PTP_PLAY_LOCAL_RUNTIME_STUB: '0',
    }), false)

    const plan = getRuntimeLaunchPlan({
      NODE_ENV: 'development',
      PTP_PLAY_LOCAL_RUNTIME_STUB: '0',
      PTP_PLAY_RUNTIME_ENABLED: 'false',
    })

    assert.equal(plan.launchAllowed, false)
    assert.equal(plan.status, 'disabled')
  })

  it('requires explicit runtime config in production without a stub override', () => {
    const missing = getRuntimeLaunchPlan({
      NODE_ENV: 'production',
      PTP_PLAY_RUNTIME_ENABLED: 'true',
      FORCETEKI_RUNTIME_BASE_URL: 'https://play.example',
    })

    assert.equal(missing.launchAllowed, false)
    assert.equal(missing.status, 'missing_config')

    const real = getRuntimeLaunchPlan({
      NODE_ENV: 'production',
      PTP_PLAY_RUNTIME_ENABLED: 'true',
      FORCETEKI_RUNTIME_BASE_URL: 'https://play.example/',
      FORCETEKI_LAUNCH_URL: 'https://runtime.example/api/games/',
    })

    assert.equal(real.launchAllowed, true)
    assert.equal(real.mode, 'forceteki')
    assert.equal(real.runtimeBaseUrl, 'https://play.example')
    assert.equal(real.launchUrl, 'https://runtime.example/api/games')
  })
})

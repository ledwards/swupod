import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  RuntimeUnavailableError,
  assertRuntimeLaunchAvailable,
  getRuntimeAvailability,
  isRuntimeLaunchAvailable,
} from './runtimeAvailability'

describe('PTP runtime availability', () => {
  it('SPEC: disables runtime launches by default', () => {
    const availability = getRuntimeAvailability({})

    assert.equal(availability.launchAllowed, false)
    assert.equal(availability.status, 'disabled')
    assert.equal(availability.reason, 'PTP_PLAY_RUNTIME_ENABLED is not enabled')
  })

  it('SPEC: recognizes explicit disabled kill-switch values', () => {
    for (const value of ['0', 'false', 'off', 'no', 'disabled']) {
      const availability = getRuntimeAvailability({
        PTP_PLAY_RUNTIME_ENABLED: value,
        FORCETEKI_RUNTIME_BASE_URL: 'https://play.protectthepod.com',
        FORCETEKI_LAUNCH_URL: 'https://runtime.internal/api/ptp/games',
      })

      assert.equal(availability.launchAllowed, false, value)
      assert.equal(availability.status, 'disabled', value)
    }
  })

  it('SPEC: blocks launch when enabled but runtime URLs are missing', () => {
    const availability = getRuntimeAvailability({
      PTP_PLAY_RUNTIME_ENABLED: 'true',
      FORCETEKI_RUNTIME_BASE_URL: 'https://play.protectthepod.com',
    })

    assert.equal(availability.launchAllowed, false)
    assert.equal(availability.status, 'missing_config')
    assert.match(availability.reason ?? '', /FORCETEKI_LAUNCH_URL/)
  })

  it('SPEC: allows launch only when explicitly enabled and configured', () => {
    const availability = getRuntimeAvailability({
      PTP_PLAY_RUNTIME_ENABLED: 'enabled',
      FORCETEKI_RUNTIME_BASE_URL: 'https://play.protectthepod.com/',
      FORCETEKI_LAUNCH_URL: 'https://runtime.internal/api/ptp/games/',
    })

    assert.equal(availability.launchAllowed, true)
    assert.equal(availability.status, 'available')
    assert.equal(availability.runtimeBaseUrl, 'https://play.protectthepod.com')
    assert.equal(availability.launchUrl, 'https://runtime.internal/api/ptp/games')
    assert.equal(isRuntimeLaunchAvailable(availability), true)
  })

  it('SPEC: throws a typed error when launch is unavailable', () => {
    assert.throws(
      () => assertRuntimeLaunchAvailable({ PTP_PLAY_RUNTIME_ENABLED: 'false' }),
      (error: unknown) => {
        assert.ok(error instanceof RuntimeUnavailableError)
        assert.equal(error.code, 'disabled')
        return true
      }
    )
  })
})

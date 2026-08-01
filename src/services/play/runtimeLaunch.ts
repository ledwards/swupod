import {
  getRuntimeAvailability,
  type RuntimeAvailability,
  type RuntimeAvailabilityEnv,
} from './runtimeAvailability'

export type RuntimeLaunchMode = 'local_stub' | 'forceteki'
export type RuntimeLaunchStatus = RuntimeLaunchMode | RuntimeAvailability['status']

export interface RuntimeLaunchPlan {
  launchAllowed: boolean
  mode: RuntimeLaunchMode | null
  status: RuntimeLaunchStatus
  reason: string | null
  runtimeBaseUrl: string | null
  launchUrl: string | null
}

const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on', 'enabled'])
const DISABLED_VALUES = new Set(['0', 'false', 'no', 'off', 'disabled'])

export function getRuntimeLaunchPlan(
  env: RuntimeAvailabilityEnv = process.env
): RuntimeLaunchPlan {
  if (localStubLaunchAllowed(env)) {
    return {
      launchAllowed: true,
      mode: 'local_stub',
      status: 'local_stub',
      reason: null,
      runtimeBaseUrl: null,
      launchUrl: null,
    }
  }

  const availability = getRuntimeAvailability(env)
  if (availability.launchAllowed) {
    return {
      launchAllowed: true,
      mode: 'forceteki',
      status: 'forceteki',
      reason: null,
      runtimeBaseUrl: availability.runtimeBaseUrl,
      launchUrl: availability.launchUrl,
    }
  }

  return {
    launchAllowed: false,
    mode: null,
    status: availability.status,
    reason: availability.reason,
    runtimeBaseUrl: availability.runtimeBaseUrl,
    launchUrl: availability.launchUrl,
  }
}

export function localStubLaunchAllowed(env: RuntimeAvailabilityEnv = process.env): boolean {
  const value = normalizeEnvValue(env.PTP_PLAY_LOCAL_RUNTIME_STUB)
  if (ENABLED_VALUES.has(value)) return true
  if (DISABLED_VALUES.has(value)) return false
  return env.NODE_ENV !== 'production'
}

function normalizeEnvValue(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase()
}
